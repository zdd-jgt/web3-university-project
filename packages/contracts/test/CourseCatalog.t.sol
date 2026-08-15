// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {CourseCatalog} from "../src/CourseCatalog.sol";
import {ICourseCatalog} from "../src/interfaces/ICourseCatalog.sol";

contract CourseCatalogTest is Test {
    CourseCatalog private catalog;
    address private admin = makeAddr("admin");
    address private stranger = makeAddr("stranger");
    address private teacher = makeAddr("teacher");
    bytes32 private constant METADATA_HASH = keccak256("course-metadata-v1");

    function setUp() external {
        catalog = new CourseCatalog(admin);
    }

    function test_AdminCanConfigureUpdateAndDelistCourse() external {
        vm.prank(admin);
        catalog.configureCourse(1, 4 ether, teacher, METADATA_HASH);

        ICourseCatalog.Course memory configured = catalog.getCourse(1);
        assertEq(configured.priceYD, 4 ether);
        assertEq(configured.payoutWallet, teacher);
        assertEq(configured.metadataHash, METADATA_HASH);
        assertEq(configured.version, 1);
        assertEq(uint8(configured.status), uint8(ICourseCatalog.CourseStatus.Published));

        vm.prank(admin);
        catalog.configureCourse(1, 6 ether, teacher, keccak256("course-metadata-v2"));
        assertEq(catalog.getCourse(1).version, 2);

        vm.prank(admin);
        catalog.setCourseStatus(1, ICourseCatalog.CourseStatus.Delisted);
        ICourseCatalog.Course memory delisted = catalog.getCourse(1);
        assertEq(delisted.version, 3);
        assertEq(uint8(delisted.status), uint8(ICourseCatalog.CourseStatus.Delisted));

        vm.expectRevert(abi.encodeWithSelector(CourseCatalog.CourseNotPublished.selector, 1));
        catalog.getPurchasableCourse(1);
    }

    function test_NonManagerCannotConfigureCourse() external {
        bytes32 managerRole = catalog.COURSE_MANAGER_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, managerRole)
        );
        vm.prank(stranger);
        catalog.configureCourse(1, 4 ether, teacher, METADATA_HASH);
    }

    function test_InvalidCourseConfigurationReverts() external {
        vm.startPrank(admin);

        vm.expectRevert(CourseCatalog.InvalidCourseId.selector);
        catalog.configureCourse(0, 4 ether, teacher, METADATA_HASH);

        vm.expectRevert(CourseCatalog.InvalidPrice.selector);
        catalog.configureCourse(1, 0, teacher, METADATA_HASH);

        vm.expectRevert(CourseCatalog.ZeroPayoutWallet.selector);
        catalog.configureCourse(1, 4 ether, address(0), METADATA_HASH);

        vm.expectRevert(CourseCatalog.EmptyMetadataHash.selector);
        catalog.configureCourse(1, 4 ether, teacher, bytes32(0));

        vm.stopPrank();
    }
}
