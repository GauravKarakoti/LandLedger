// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract LandLedger {
    enum Status { Active, InDispute, Transferred, Frozen }
    enum DisputeStatus { Pending, Resolved, Dismissed }

    struct Property {
        string id;
        address currentOwner;
        string legalIdentifier;
        string metadataUri; // IPFS URI containing coordinates, boundary survey, and physical records
        Status status;
        uint256 registeredAt;
    }

    struct Dispute {
        uint256 id;
        string propertyId;
        address claimant;
        string reason;
        DisputeStatus status;
        uint256 createdAt;
    }

    address public immutable registryAuthority;
    uint256 private disputeCounter;

    mapping(string => Property) public properties;
    mapping(uint256 => Dispute) public disputes;
    mapping(string => uint256[]) public propertyDisputes;

    event PropertyRegistered(string propertyId, address indexed owner, string legalIdentifier, string metadataUri);
    event PropertyTransferred(string propertyId, address indexed previousOwner, address indexed newOwner);
    event DisputeRaised(uint256 indexed disputeId, string propertyId, address indexed claimant, string reason);
    event DisputeResolved(uint256 indexed disputeId, string propertyId, DisputeStatus status);

    modifier onlyAuthority() {
        require(msg.sender == registryAuthority, "Unauthorized: Only registry authority permitted");
        _;
    }

    modifier onlyOwner(string memory propertyId) {
        require(properties[propertyId].currentOwner == msg.sender, "Unauthorized: Not deed holder");
        _;
    }

    constructor() {
        registryAuthority = msg.sender;
    }

    function registerProperty(
        string memory propertyId,
        address owner,
        string memory legalIdentifier,
        string memory metadataUri
    ) external onlyAuthority {
        require(properties[propertyId].currentOwner == address(0), "Property already registered");
        require(owner != address(0), "Invalid owner address");

        properties[propertyId] = Property({
            id: propertyId,
            currentOwner: owner,
            legalIdentifier: legalIdentifier,
            metadataUri: metadataUri,
            status: Status.Active,
            registeredAt: block.timestamp
        });

        emit PropertyRegistered(propertyId, owner, legalIdentifier, metadataUri);
    }

    function transferProperty(string memory propertyId, address newOwner) external onlyOwner(propertyId) {
        require(newOwner != address(0), "Cannot transfer to zero address");
        require(properties[propertyId].status == Status.Active, "Property not eligible for transfer");

        address previousOwner = properties[propertyId].currentOwner;
        properties[propertyId].currentOwner = newOwner;

        emit PropertyTransferred(propertyId, previousOwner, newOwner);
    }

    function raiseDispute(string memory propertyId, string memory reason) external {
        require(properties[propertyId].currentOwner != address(0), "Property does not exist");
        
        disputeCounter++;
        disputes[disputeCounter] = Dispute({
            id: disputeCounter,
            propertyId: propertyId,
            claimant: msg.sender,
            reason: reason,
            status: DisputeStatus.Pending,
            createdAt: block.timestamp
        });

        properties[propertyId].status = Status.InDispute;
        propertyDisputes[propertyId].push(disputeCounter);

        emit DisputeRaised(disputeCounter, propertyId, msg.sender, reason);
    }

    function resolveDispute(uint256 disputeId, DisputeStatus resolution) external onlyAuthority {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.status == DisputeStatus.Pending, "Dispute already finalized");

        dispute.status = resolution;
        
        // Return property to active status if no other disputes pending
        properties[dispute.propertyId].status = Status.Active;

        emit DisputeResolved(disputeId, dispute.propertyId, resolution);
    }
}