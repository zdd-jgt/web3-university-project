// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ICourseMarket} from "./interfaces/ICourseMarket.sol";

/// @title Course Completion Certificate
/// @notice A non-transferable ERC-721 certificate (soulbound token).
contract CertificateSBT is ERC721, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    ICourseMarket public immutable courseMarket;
    uint256 private _nextTokenId = 1;
    mapping(address student => mapping(uint256 courseId => uint256 tokenId)) private _certificateByCourse;
    mapping(uint256 tokenId => uint256 courseId) public courseOf;
    mapping(uint256 tokenId => string uri) private _tokenURIs;

    error ZeroAddress();
    error InvalidCourseId();
    error EmptyTokenURI();
    error CourseNotPurchased(address student, uint256 courseId);
    error CertificateAlreadyExists(address student, uint256 courseId, uint256 tokenId);
    error CertificateLocked();

    event CertificateMinted(
        address indexed student, uint256 indexed courseId, uint256 indexed tokenId, string tokenURI
    );
    /// @dev ERC-5192 compatible event. Every token issued by this contract is locked.
    event Locked(uint256 tokenId);

    constructor(address market, address admin, address initialMinter) ERC721("YiDeng Course Certificate", "YD-CERT") {
        if (market == address(0) || admin == address(0) || initialMinter == address(0)) {
            revert ZeroAddress();
        }
        courseMarket = ICourseMarket(market);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, initialMinter);
    }

    function mintCertificate(address student, uint256 courseId, string calldata metadataURI)
        external
        onlyRole(MINTER_ROLE)
        returns (uint256 tokenId)
    {
        if (student == address(0)) revert ZeroAddress();
        if (courseId == 0) revert InvalidCourseId();
        if (bytes(metadataURI).length == 0) revert EmptyTokenURI();
        if (!courseMarket.hasPurchased(student, courseId)) {
            revert CourseNotPurchased(student, courseId);
        }

        uint256 existingTokenId = _certificateByCourse[student][courseId];
        if (existingTokenId != 0) {
            revert CertificateAlreadyExists(student, courseId, existingTokenId);
        }

        tokenId = _nextTokenId++;
        _certificateByCourse[student][courseId] = tokenId;
        courseOf[tokenId] = courseId;
        _tokenURIs[tokenId] = metadataURI;
        _safeMint(student, tokenId);

        emit Locked(tokenId);
        emit CertificateMinted(student, courseId, tokenId, metadataURI);
    }

    function certificateOf(address student, uint256 courseId) external view returns (uint256) {
        return _certificateByCourse[student][courseId];
    }

    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenURIs[tokenId];
    }

    function approve(address, uint256) public pure override {
        revert CertificateLocked();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert CertificateLocked();
    }

    /// @dev OZ v5 routes mint and transfer through _update. Only minting is allowed.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = _ownerOf(tokenId);
        if (from != address(0)) revert CertificateLocked();
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        // ERC-5192 Minimal Soulbound NFTs interface id.
        return interfaceId == 0xb45a3c0e || super.supportsInterface(interfaceId);
    }
}
