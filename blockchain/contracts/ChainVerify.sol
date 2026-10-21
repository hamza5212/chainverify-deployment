// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ChainVerify {
    address public owner;
    
    struct ArticleRecord {
        string contentHash;
        string watermarkId;
        address registeredBy;
        uint256 timestamp;
    }

    mapping(string => ArticleRecord) public records;
    string[] public allArticleIds;

    // Restrict functions to the contract owner (backend admin)
    modifier onlyOwner() {
        require(msg.sender == owner, "Only admin can register/verify");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    event ArticleRegistered(
        string articleId,
        string contentHash,
        string watermarkId,
        address indexed registeredBy,
        uint256 timestamp
    );

    event ArticleVerified(
        string articleId,
        address indexed verifier,
        uint256 timestamp
    );

    // Added onlyOwner modifier
    function registerArticle(
        string memory articleId,
        string memory contentHash,
        string memory watermarkId
    ) public onlyOwner {
        require(bytes(records[articleId].contentHash).length == 0, "Article already registered");
        require(bytes(contentHash).length > 0, "Hash cannot be empty");

        records[articleId] = ArticleRecord({
            contentHash: contentHash,
            watermarkId: watermarkId,
            registeredBy: msg.sender,
            timestamp: block.timestamp
        });

        allArticleIds.push(articleId);
        emit ArticleRegistered(articleId, contentHash, watermarkId, msg.sender, block.timestamp);
    }

    // Added check to ensure article exists before logging verification
    function recordVerification(string memory articleId) public onlyOwner {
        require(bytes(records[articleId].contentHash).length > 0, "Article not registered");
        emit ArticleVerified(articleId, msg.sender, block.timestamp);
    }

    function getArticle(string memory articleId) public view returns (ArticleRecord memory) {
        return records[articleId];
    }

    function getArticleCount() public view returns (uint256) {
        return allArticleIds.length;
    }
}