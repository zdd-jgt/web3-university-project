// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {DeployLocal} from "../script/DeployLocal.s.sol";

contract DeployLocalTest is Test {
    function test_RejectsSepoliaChainId() external {
        DeployLocal deploymentScript = new DeployLocal();
        vm.chainId(11_155_111);

        vm.expectRevert(abi.encodeWithSelector(DeployLocal.LocalChainOnly.selector, 11_155_111));
        deploymentScript.run();
    }
}
