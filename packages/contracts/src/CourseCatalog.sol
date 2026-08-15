// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ICourseCatalog} from "./interfaces/ICourseCatalog.sol";

/// @title Course Catalog
/// @notice Stores the minimal, purchase-critical snapshot for a course.
/// @dev Descriptions, lessons, video and comments stay offchain; metadataHash binds that data.
contract CourseCatalog is AccessControl, ICourseCatalog {
    bytes32 public constant COURSE_MANAGER_ROLE = keccak256("COURSE_MANAGER_ROLE");

    mapping(uint256 courseId => Course course) private _courses;

    error ZeroAdmin();
    error InvalidCourseId();
    error InvalidPrice();
    error ZeroPayoutWallet();
    error EmptyMetadataHash();
    error CourseNotFound(uint256 courseId);
    error CourseNotPublished(uint256 courseId);
    error InvalidStatus();
    error StatusUnchanged();

    event CourseConfigured(
        uint256 indexed courseId, uint256 priceYD, address indexed payoutWallet, bytes32 metadataHash, uint64 version
    );
    event CourseStatusChanged(
        uint256 indexed courseId, CourseStatus previousStatus, CourseStatus newStatus, uint64 version
    );

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAdmin();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(COURSE_MANAGER_ROLE, admin);
    }

    /// @notice Creates, updates or relists a course and increments its onchain version.
    function configureCourse(uint256 courseId, uint256 priceYD, address payoutWallet, bytes32 metadataHash)
        external
        onlyRole(COURSE_MANAGER_ROLE)
    {
        if (courseId == 0) revert InvalidCourseId();
        if (priceYD == 0) revert InvalidPrice();
        if (payoutWallet == address(0)) revert ZeroPayoutWallet();
        if (metadataHash == bytes32(0)) revert EmptyMetadataHash();

        Course storage course = _courses[courseId];
        course.version += 1;
        course.priceYD = priceYD;
        course.payoutWallet = payoutWallet;
        course.metadataHash = metadataHash;
        course.status = CourseStatus.Published;

        emit CourseConfigured(courseId, priceYD, payoutWallet, metadataHash, course.version);
    }

    /// @notice Delists or relists an existing course without deleting purchase history.
    function setCourseStatus(uint256 courseId, CourseStatus newStatus) external onlyRole(COURSE_MANAGER_ROLE) {
        Course storage course = _courses[courseId];
        if (course.status == CourseStatus.Unknown) revert CourseNotFound(courseId);
        if (newStatus == CourseStatus.Unknown) revert InvalidStatus();
        if (course.status == newStatus) revert StatusUnchanged();

        CourseStatus previousStatus = course.status;
        course.status = newStatus;
        course.version += 1;

        emit CourseStatusChanged(courseId, previousStatus, newStatus, course.version);
    }

    function getCourse(uint256 courseId) external view returns (Course memory) {
        Course memory course = _courses[courseId];
        if (course.status == CourseStatus.Unknown) revert CourseNotFound(courseId);
        return course;
    }

    function getPurchasableCourse(uint256 courseId) external view returns (uint256 priceYD, address payoutWallet) {
        Course memory course = _courses[courseId];
        if (course.status != CourseStatus.Published) revert CourseNotPublished(courseId);
        return (course.priceYD, course.payoutWallet);
    }
}
