// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";

/// @title Chainlink ETH/USD Price Demo
/// @notice Demonstrates positive-price and freshness checks only.
/// @dev This contract is not used for course progress, YD pricing, swaps or certificate minting.
contract ChainlinkPriceOracle is Ownable2Step {
    AggregatorV3Interface public immutable priceFeed;
    uint256 public maxAge;

    error ZeroAddress();
    error InvalidMaxAge();
    error InvalidPrice(int256 answer);
    error IncompleteRound(uint80 roundId, uint80 answeredInRound);
    error InvalidTimestamp(uint256 updatedAt, uint256 currentTimestamp);
    error StalePrice(uint256 updatedAt, uint256 currentTimestamp, uint256 maxAge);

    event MaxAgeUpdated(uint256 previousMaxAge, uint256 newMaxAge);

    constructor(address feed, uint256 initialMaxAge, address initialOwner) Ownable(initialOwner) {
        if (feed == address(0) || initialOwner == address(0)) revert ZeroAddress();
        if (initialMaxAge == 0) revert InvalidMaxAge();
        priceFeed = AggregatorV3Interface(feed);
        maxAge = initialMaxAge;
    }

    function latestPrice() external view returns (uint256 price, uint8 decimals, uint256 updatedAt) {
        (uint80 roundId, int256 answer,, uint256 feedUpdatedAt, uint80 answeredInRound) = priceFeed.latestRoundData();
        if (answer <= 0) revert InvalidPrice(answer);
        if (answeredInRound < roundId) revert IncompleteRound(roundId, answeredInRound);
        // Block time is the canonical clock for Chainlink freshness; seconds of skew do not bypass maxAge.
        // forge-lint: disable-next-line(block-timestamp)
        if (feedUpdatedAt == 0 || feedUpdatedAt > block.timestamp) {
            revert InvalidTimestamp(feedUpdatedAt, block.timestamp);
        }
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp - feedUpdatedAt > maxAge) {
            revert StalePrice(feedUpdatedAt, block.timestamp, maxAge);
        }
        // Safe after the explicit answer > 0 guard above.
        // forge-lint: disable-next-line(unsafe-typecast)
        return (uint256(answer), priceFeed.decimals(), feedUpdatedAt);
    }

    function setMaxAge(uint256 newMaxAge) external onlyOwner {
        if (newMaxAge == 0) revert InvalidMaxAge();
        uint256 previousMaxAge = maxAge;
        maxAge = newMaxAge;
        emit MaxAgeUpdated(previousMaxAge, newMaxAge);
    }
}
