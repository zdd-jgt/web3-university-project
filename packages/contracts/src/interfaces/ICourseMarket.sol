// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface ICourseMarket {
    function hasPurchased(address buyer, uint256 courseId) external view returns (bool);
}

