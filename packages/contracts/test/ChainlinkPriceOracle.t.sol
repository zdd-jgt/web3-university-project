// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ChainlinkPriceOracle} from "../src/ChainlinkPriceOracle.sol";
import {MockAggregatorV3} from "./mocks/MockAggregatorV3.sol";

contract ChainlinkPriceOracleTest is Test {
    MockAggregatorV3 private feed;
    ChainlinkPriceOracle private oracle;
    address private admin = makeAddr("admin");

    function setUp() external {
        vm.warp(10_000);
        feed = new MockAggregatorV3(8);
        oracle = new ChainlinkPriceOracle(address(feed), 1 hours, admin);
        feed.setRoundData(10, 3_500e8, block.timestamp - 10, block.timestamp - 10, 10);
    }

    function test_ReturnsFreshPositivePrice() external view {
        (uint256 price, uint8 decimals, uint256 updatedAt) = oracle.latestPrice();
        assertEq(price, 3_500e8);
        assertEq(decimals, 8);
        assertEq(updatedAt, block.timestamp - 10);
    }

    function test_RevertsForStalePrice() external {
        feed.setRoundData(10, 3_500e8, 1, block.timestamp - 1 hours - 1, 10);
        vm.expectRevert(
            abi.encodeWithSelector(
                ChainlinkPriceOracle.StalePrice.selector, block.timestamp - 1 hours - 1, block.timestamp, 1 hours
            )
        );
        oracle.latestPrice();
    }

    function test_RevertsForNonPositivePrice() external {
        feed.setRoundData(10, 0, block.timestamp, block.timestamp, 10);
        vm.expectRevert(abi.encodeWithSelector(ChainlinkPriceOracle.InvalidPrice.selector, 0));
        oracle.latestPrice();
    }

    function test_RevertsForIncompleteRound() external {
        feed.setRoundData(10, 3_500e8, block.timestamp, block.timestamp, 9);
        vm.expectRevert(abi.encodeWithSelector(ChainlinkPriceOracle.IncompleteRound.selector, 10, 9));
        oracle.latestPrice();
    }

    function test_RevertsForFutureTimestamp() external {
        feed.setRoundData(10, 3_500e8, block.timestamp, block.timestamp + 1, 10);
        vm.expectRevert(
            abi.encodeWithSelector(ChainlinkPriceOracle.InvalidTimestamp.selector, block.timestamp + 1, block.timestamp)
        );
        oracle.latestPrice();
    }

    function test_OnlyOwnerCanUpdateMaxAge() external {
        vm.prank(admin);
        oracle.setMaxAge(2 hours);
        assertEq(oracle.maxAge(), 2 hours);

        vm.expectRevert(ChainlinkPriceOracle.InvalidMaxAge.selector);
        vm.prank(admin);
        oracle.setMaxAge(0);
    }
}

