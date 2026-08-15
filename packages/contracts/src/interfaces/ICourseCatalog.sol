// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface ICourseCatalog {
    enum CourseStatus {
        Unknown,
        Published,
        Delisted
    }

    struct Course {
        uint256 priceYD;
        address payoutWallet;
        bytes32 metadataHash;
        uint64 version;
        CourseStatus status;
    }

    function getCourse(uint256 courseId) external view returns (Course memory);

    function getPurchasableCourse(uint256 courseId) external view returns (uint256 priceYD, address payoutWallet);
}

