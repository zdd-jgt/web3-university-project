// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title YiDeng Token
/// @notice Fixed-supply course payment token. There is deliberately no mint function.
contract YDToken is ERC20 {
    uint256 public constant INITIAL_SUPPLY = 1_000_000 ether;

    error ZeroTreasury();

    constructor(address treasury) ERC20("YiDeng Token", "YD") {
        if (treasury == address(0)) revert ZeroTreasury();
        _mint(treasury, INITIAL_SUPPLY);
    }
}

