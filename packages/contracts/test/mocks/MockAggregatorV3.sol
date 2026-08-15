// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AggregatorV3Interface} from "../../src/interfaces/AggregatorV3Interface.sol";

contract MockAggregatorV3 is AggregatorV3Interface {
    uint8 public immutable override decimals;
    uint80 public roundId;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public answeredInRound;

    constructor(uint8 feedDecimals) {
        decimals = feedDecimals;
    }

    function setRoundData(
        uint80 newRoundId,
        int256 newAnswer,
        uint256 newStartedAt,
        uint256 newUpdatedAt,
        uint80 newAnsweredInRound
    ) external {
        roundId = newRoundId;
        answer = newAnswer;
        startedAt = newStartedAt;
        updatedAt = newUpdatedAt;
        answeredInRound = newAnsweredInRound;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 currentRoundId,
            int256 currentAnswer,
            uint256 currentStartedAt,
            uint256 currentUpdatedAt,
            uint80 currentAnsweredInRound
        )
    {
        return (roundId, answer, startedAt, updatedAt, answeredInRound);
    }
}

