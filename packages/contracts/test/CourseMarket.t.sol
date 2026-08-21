// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {YDToken} from "../src/YDToken.sol";
import {CourseCatalog} from "../src/CourseCatalog.sol";
import {CourseMarket} from "../src/CourseMarket.sol";
import {ICourseCatalog} from "../src/interfaces/ICourseCatalog.sol";

contract CourseMarketTest is Test {
    YDToken private token;
    CourseCatalog private catalog;
    CourseMarket private market;

    address private admin = makeAddr("admin");
    address private treasury = makeAddr("treasury");
    address private teacher = makeAddr("teacher");
    address private buyer = makeAddr("buyer");

    uint256 private constant COURSE_ID = 1;
    uint256 private constant PRICE = 4 ether;

    function setUp() external {
        token = new YDToken(treasury);
        catalog = new CourseCatalog(admin);
        market = new CourseMarket(address(token), address(catalog), treasury, admin);

        vm.prank(admin);
        catalog.configureCourse(COURSE_ID, PRICE, teacher, keccak256("course-v1"));

        vm.prank(treasury);
        assertTrue(token.transfer(buyer, 100 ether));
    }

    function test_ApproveThenBuyPaysThreeToOneAndRecordsPurchase() external {
        uint256 treasuryBefore = token.balanceOf(treasury);

        vm.startPrank(buyer);
        token.approve(address(market), PRICE);
        market.buyCourse(COURSE_ID, PRICE, block.timestamp + 15 minutes);
        vm.stopPrank();

        assertEq(token.balanceOf(teacher), 3 ether);
        assertEq(token.balanceOf(treasury) - treasuryBefore, 1 ether);
        assertEq(token.balanceOf(buyer), 96 ether);
        assertTrue(market.hasPurchased(buyer, COURSE_ID));
        assertEq(market.purchaseTimestamps(buyer, COURSE_ID), block.timestamp);
    }

    function test_RevertsWithoutApproval() external {
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(market), 0, 3 ether)
        );
        vm.prank(buyer);
        market.buyCourse(COURSE_ID, PRICE, block.timestamp + 1);
    }

    function test_RevertsDuplicatePurchase() external {
        vm.startPrank(buyer);
        token.approve(address(market), PRICE * 2);
        market.buyCourse(COURSE_ID, PRICE, block.timestamp + 1);

        vm.expectRevert(abi.encodeWithSelector(CourseMarket.AlreadyPurchased.selector, buyer, COURSE_ID));
        market.buyCourse(COURSE_ID, PRICE, block.timestamp + 1);
        vm.stopPrank();
    }

    function test_RevertsWhenQuotedPriceChanged() external {
        vm.prank(admin);
        catalog.configureCourse(COURSE_ID, 5 ether, teacher, keccak256("course-v2"));

        vm.startPrank(buyer);
        token.approve(address(market), 5 ether);
        vm.expectRevert(abi.encodeWithSelector(CourseMarket.PriceChanged.selector, PRICE, 5 ether));
        market.buyCourse(COURSE_ID, PRICE, block.timestamp + 1);
        vm.stopPrank();
    }

    function test_RevertsAfterDeadline() external {
        vm.warp(2 days);
        vm.startPrank(buyer);
        token.approve(address(market), PRICE);
        vm.expectRevert(abi.encodeWithSelector(CourseMarket.PurchaseExpired.selector, 1 days, 2 days));
        market.buyCourse(COURSE_ID, PRICE, 1 days);
        vm.stopPrank();
    }

    function test_RevertsWhenCourseDelisted() external {
        vm.prank(admin);
        catalog.setCourseStatus(COURSE_ID, ICourseCatalog.CourseStatus.Delisted);

        vm.startPrank(buyer);
        token.approve(address(market), PRICE);
        vm.expectRevert(abi.encodeWithSelector(CourseCatalog.CourseNotPublished.selector, COURSE_ID));
        market.buyCourse(COURSE_ID, PRICE, block.timestamp + 1);
        vm.stopPrank();
    }

    function test_OwnerCanPausePurchases() external {
        vm.prank(admin);
        market.pause();

        vm.startPrank(buyer);
        token.approve(address(market), PRICE);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        market.buyCourse(COURSE_ID, PRICE, block.timestamp + 1);
        vm.stopPrank();
    }

    function testFuzz_SplitAlwaysTransfersEntirePrice(uint96 rawPrice) external {
        uint256 fuzzPrice = bound(uint256(rawPrice), 1, 100_000 ether);
        uint256 fuzzCourseId = 2;

        vm.prank(admin);
        catalog.configureCourse(fuzzCourseId, fuzzPrice, teacher, keccak256("fuzz-course"));
        vm.prank(treasury);
        assertTrue(token.transfer(buyer, fuzzPrice));

        uint256 teacherBefore = token.balanceOf(teacher);
        uint256 treasuryBefore = token.balanceOf(treasury);

        vm.startPrank(buyer);
        token.approve(address(market), fuzzPrice);
        market.buyCourse(fuzzCourseId, fuzzPrice, block.timestamp + 1);
        vm.stopPrank();

        uint256 paidTeacher = token.balanceOf(teacher) - teacherBefore;
        uint256 paidTreasury = token.balanceOf(treasury) - treasuryBefore;
        assertEq(paidTeacher + paidTreasury, fuzzPrice);
        assertEq(paidTeacher, (fuzzPrice * 7_500) / 10_000);
        assertEq(token.totalSupply(), 80_000_000 ether);
    }
}
