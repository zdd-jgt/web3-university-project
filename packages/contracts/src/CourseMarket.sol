// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICourseCatalog} from "./interfaces/ICourseCatalog.sol";
import {ICourseMarket} from "./interfaces/ICourseMarket.sol";

/// @title Course Market
/// @notice Accepts YD only and atomically pays 75% to the teacher and 25% to the platform.
contract CourseMarket is Ownable2Step, Pausable, ReentrancyGuard, ICourseMarket {
    using SafeERC20 for IERC20;

    uint256 public constant TEACHER_SHARE_BPS = 7_500;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    IERC20 public immutable ydToken;
    ICourseCatalog public immutable courseCatalog;
    address public treasury;

    mapping(address buyer => mapping(uint256 courseId => uint64 purchasedAt)) public purchaseTimestamps;

    error ZeroAddress();
    error InvalidDeadline();
    error PurchaseExpired(uint256 deadline, uint256 currentTimestamp);
    error PriceChanged(uint256 expectedPrice, uint256 actualPrice);
    error AlreadyPurchased(address buyer, uint256 courseId);

    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event CoursePurchased(
        address indexed buyer,
        uint256 indexed courseId,
        uint256 priceYD,
        address indexed payoutWallet,
        uint256 teacherAmount,
        address treasury,
        uint256 platformAmount,
        uint64 purchasedAt
    );

    constructor(address token, address catalog, address initialTreasury, address initialOwner) Ownable(initialOwner) {
        if (token == address(0) || catalog == address(0) || initialTreasury == address(0) || initialOwner == address(0))
        {
            revert ZeroAddress();
        }
        ydToken = IERC20(token);
        courseCatalog = ICourseCatalog(catalog);
        treasury = initialTreasury;
    }

    /// @notice Purchases a course at the exact UI-quoted price before the supplied deadline.
    /// @dev The caller must approve at least expectedPrice YD before calling this function.
    function buyCourse(uint256 courseId, uint256 expectedPrice, uint256 deadline) external whenNotPaused nonReentrant {
        if (deadline == 0) revert InvalidDeadline();
        // A validator can skew time by seconds, which is acceptable for a user-selected quote deadline.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert PurchaseExpired(deadline, block.timestamp);
        if (purchaseTimestamps[msg.sender][courseId] != 0) {
            revert AlreadyPurchased(msg.sender, courseId);
        }

        (uint256 actualPrice, address payoutWallet) = courseCatalog.getPurchasableCourse(courseId);
        if (actualPrice != expectedPrice) revert PriceChanged(expectedPrice, actualPrice);

        uint64 purchasedAt = uint64(block.timestamp);
        purchaseTimestamps[msg.sender][courseId] = purchasedAt;

        uint256 teacherAmount = (actualPrice * TEACHER_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 platformAmount = actualPrice - teacherAmount;

        ydToken.safeTransferFrom(msg.sender, payoutWallet, teacherAmount);
        ydToken.safeTransferFrom(msg.sender, treasury, platformAmount);

        emit CoursePurchased(
            msg.sender, courseId, actualPrice, payoutWallet, teacherAmount, treasury, platformAmount, purchasedAt
        );
    }

    function hasPurchased(address buyer, uint256 courseId) external view returns (bool) {
        return purchaseTimestamps[buyer][courseId] != 0;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        address previousTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(previousTreasury, newTreasury);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
