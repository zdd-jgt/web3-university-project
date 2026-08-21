// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {DeployYDSepolia} from "../script/DeployYDSepolia.s.sol";
import {YDToken} from "../src/YDToken.sol";

contract DeployYDSepoliaHarness is DeployYDSepolia {
    function validateTreasury(address treasury) external pure {
        _validateTreasury(treasury);
    }
}

contract DeployYDSepoliaTest is Test {
    address private treasury = makeAddr("sepolia-treasury");

    function test_RejectsNonSepoliaChain() external {
        DeployYDSepolia deploymentScript = new DeployYDSepolia();
        vm.chainId(31_337);

        vm.expectRevert(abi.encodeWithSelector(DeployYDSepolia.SepoliaOnly.selector, 31_337));
        deploymentScript.run();
    }

    function test_RejectsZeroTreasury() external {
        DeployYDSepoliaHarness deploymentScript = new DeployYDSepoliaHarness();

        vm.expectRevert(DeployYDSepolia.ZeroTreasury.selector);
        deploymentScript.validateTreasury(address(0));
    }

    function test_DeploysEntireFixedSupplyToTreasuryOnSepolia() external {
        DeployYDSepolia deploymentScript = new DeployYDSepolia();
        vm.chainId(deploymentScript.SEPOLIA_CHAIN_ID());
        vm.setEnv("TREASURY_ADDRESS", vm.toString(treasury));

        YDToken token = deploymentScript.run();

        assertEq(token.name(), "YiDeng Token");
        assertEq(token.symbol(), "YD");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), 80_000_000 ether);
        assertEq(token.balanceOf(treasury), token.totalSupply());
    }
}
