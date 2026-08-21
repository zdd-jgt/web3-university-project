// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {YDToken} from "../src/YDToken.sol";

contract YDTokenTest is Test {
    address private treasury = makeAddr("treasury");

    function test_MintsEntireFixedSupplyToTreasury() external {
        YDToken token = new YDToken(treasury);

        assertEq(token.name(), "YiDeng Token");
        assertEq(token.symbol(), "YD");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), 80_000_000 ether);
        assertEq(token.balanceOf(treasury), token.INITIAL_SUPPLY());
    }

    function test_RevertsForZeroTreasury() external {
        vm.expectRevert(YDToken.ZeroTreasury.selector);
        new YDToken(address(0));
    }
}
