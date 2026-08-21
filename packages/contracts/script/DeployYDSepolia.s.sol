// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {YDToken} from "../src/YDToken.sol";

/// @notice Deploys only YDToken and refuses every chain except Ethereum Sepolia.
/// @dev The signer is supplied by Forge CLI (prefer --account); no private key is read here.
contract DeployYDSepolia is Script {
    uint256 public constant SEPOLIA_CHAIN_ID = 11_155_111;

    error SepoliaOnly(uint256 actualChainId);
    error ZeroTreasury();
    error DeploymentInvariant(bytes32 check);

    function run() external returns (YDToken token) {
        if (block.chainid != SEPOLIA_CHAIN_ID) revert SepoliaOnly(block.chainid);

        address treasury = vm.envAddress("TREASURY_ADDRESS");
        _validateTreasury(treasury);

        vm.startBroadcast();
        token = new YDToken(treasury);
        vm.stopBroadcast();

        _verifyDeployment(token, treasury);
        console2.log("YDToken deployed at", address(token));
        console2.log("YD treasury", treasury);
    }

    function _validateTreasury(address treasury) internal pure {
        if (treasury == address(0)) revert ZeroTreasury();
    }

    function _verifyDeployment(YDToken token, address treasury) private view {
        if (keccak256(bytes(token.name())) != keccak256("YiDeng Token")) {
            revert DeploymentInvariant(bytes32("TOKEN_NAME"));
        }
        if (keccak256(bytes(token.symbol())) != keccak256("YD")) {
            revert DeploymentInvariant(bytes32("TOKEN_SYMBOL"));
        }
        if (token.decimals() != 18) revert DeploymentInvariant(bytes32("TOKEN_DECIMALS"));
        if (token.totalSupply() != 80_000_000 ether) {
            revert DeploymentInvariant(bytes32("TOTAL_SUPPLY"));
        }
        if (token.balanceOf(treasury) != token.totalSupply()) {
            revert DeploymentInvariant(bytes32("TREASURY_BALANCE"));
        }
    }
}
