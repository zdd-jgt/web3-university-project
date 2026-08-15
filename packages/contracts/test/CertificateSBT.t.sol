// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {YDToken} from "../src/YDToken.sol";
import {CourseCatalog} from "../src/CourseCatalog.sol";
import {CourseMarket} from "../src/CourseMarket.sol";
import {CertificateSBT} from "../src/CertificateSBT.sol";

contract CertificateSBTTest is Test {
    YDToken private token;
    CourseCatalog private catalog;
    CourseMarket private market;
    CertificateSBT private certificate;

    address private admin = makeAddr("admin");
    address private treasury = makeAddr("treasury");
    address private teacher = makeAddr("teacher");
    address private worker = makeAddr("worker");
    address private buyer = makeAddr("buyer");
    address private other = makeAddr("other");

    uint256 private constant COURSE_ID = 1;
    uint256 private constant PRICE = 4 ether;
    string private constant METADATA_URI = "ipfs://bafy-course-certificate";

    function setUp() external {
        token = new YDToken(treasury);
        catalog = new CourseCatalog(admin);
        market = new CourseMarket(address(token), address(catalog), treasury, admin);
        certificate = new CertificateSBT(address(market), admin, worker);

        vm.prank(admin);
        catalog.configureCourse(COURSE_ID, PRICE, teacher, keccak256("course-v1"));
        vm.prank(treasury);
        assertTrue(token.transfer(buyer, PRICE));
        vm.startPrank(buyer);
        token.approve(address(market), PRICE);
        market.buyCourse(COURSE_ID, PRICE, block.timestamp + 1);
        vm.stopPrank();
    }

    function test_WorkerMintsPurchasedCourseCertificate() external {
        vm.prank(worker);
        uint256 tokenId = certificate.mintCertificate(buyer, COURSE_ID, METADATA_URI);

        assertEq(tokenId, 1);
        assertEq(certificate.ownerOf(tokenId), buyer);
        assertEq(certificate.certificateOf(buyer, COURSE_ID), tokenId);
        assertEq(certificate.courseOf(tokenId), COURSE_ID);
        assertEq(certificate.tokenURI(tokenId), METADATA_URI);
        assertTrue(certificate.locked(tokenId));
        assertTrue(certificate.supportsInterface(0xb45a3c0e));
    }

    function test_NonWorkerCannotMint() external {
        bytes32 minterRole = certificate.MINTER_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, other, minterRole)
        );
        vm.prank(other);
        certificate.mintCertificate(buyer, COURSE_ID, METADATA_URI);
    }

    function test_CannotMintForNonBuyer() external {
        vm.prank(worker);
        vm.expectRevert(abi.encodeWithSelector(CertificateSBT.CourseNotPurchased.selector, other, COURSE_ID));
        certificate.mintCertificate(other, COURSE_ID, METADATA_URI);
    }

    function test_CannotMintDuplicateCertificate() external {
        vm.startPrank(worker);
        certificate.mintCertificate(buyer, COURSE_ID, METADATA_URI);
        vm.expectRevert(abi.encodeWithSelector(CertificateSBT.CertificateAlreadyExists.selector, buyer, COURSE_ID, 1));
        certificate.mintCertificate(buyer, COURSE_ID, METADATA_URI);
        vm.stopPrank();
    }

    function test_CertificateCannotBeTransferredOrApproved() external {
        vm.prank(worker);
        uint256 tokenId = certificate.mintCertificate(buyer, COURSE_ID, METADATA_URI);

        vm.startPrank(buyer);
        vm.expectRevert(CertificateSBT.CertificateLocked.selector);
        certificate.transferFrom(buyer, other, tokenId);

        vm.expectRevert(CertificateSBT.CertificateLocked.selector);
        certificate.approve(other, tokenId);

        vm.expectRevert(CertificateSBT.CertificateLocked.selector);
        certificate.setApprovalForAll(other, true);
        vm.stopPrank();
    }
}
