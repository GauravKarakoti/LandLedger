// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
// pragma solidity ^0.8.19;

/**
 * @title LandLedger
 * @notice Blockchain-Based Land Registry System with Multi-Sig Transfers, ECDSA Verification, Dispute Adjudication, and Ownership Chain History
 */
contract LandLedger {
    enum Status { Active, InDispute, Transferred, Frozen }
    enum DisputeStatus { Pending, Resolved, Dismissed }

    struct Property {
        string id;
        address currentOwner;
        string legalIdentifier;
        string metadataUri; // IPFS URI or JSON string containing coordinates, boundary survey, and physical records
        Status status;
        uint256 registeredAt;
    }

    struct OwnershipRecord {
        address previousOwner;
        address newOwner;
        uint256 timestamp;
        string note;
    }

    struct TransferRequest {
        uint256 id;
        string propertyId;
        address seller;
        address buyer;
        bool buyerApproved;
        bool authorityApproved;
        bool executed;
        uint256 createdAt;
    }

    struct Dispute {
        uint256 id;
        string propertyId;
        address claimant;
        string reason;
        DisputeStatus status;
        uint256 createdAt;
        address resolvedBy;
        uint256 resolvedAt;
    }

    address public immutable registryAuthority;
    bool public paused;
    uint256 private disputeCounter;
    uint256 private transferCounter;

    mapping(string => Property) public properties;
    mapping(bytes32 => bool) private _legalIdExists;
    mapping(uint256 => Dispute) public disputes;
    mapping(string => uint256[]) public propertyDisputes;
    mapping(string => OwnershipRecord[]) private _ownershipHistory;
    mapping(uint256 => TransferRequest) public transferRequests;
    mapping(address => bool) public adjudicators;
    mapping(address => uint256) public nonces;

    // Core Events (Exact match with Viem Indexer)
    event PropertyRegistered(string propertyId, address indexed owner, string legalIdentifier, string metadataUri);
    event PropertyTransferred(string propertyId, address indexed previousOwner, address indexed newOwner);
    event DisputeRaised(uint256 indexed disputeId, string propertyId, address indexed claimant, string reason);
    event DisputeResolved(uint256 indexed disputeId, string propertyId, DisputeStatus status);

    // Extended Events for Multi-Sig, Metadata, Freeze & Governance
    event MetadataUpdated(string propertyId, string newMetadataUri, address indexed updatedBy);
    event TransferInitiated(uint256 indexed transferId, string propertyId, address indexed seller, address indexed buyer);
    event TransferApproved(uint256 indexed transferId, string propertyId, address indexed approver, bool buyerApproved, bool authorityApproved);
    event PropertyStatusChanged(string propertyId, Status newStatus, address indexed changedBy);
    event AdjudicatorUpdated(address indexed account, bool isAuthorized);
    event EmergencyPauseToggled(bool isPaused, address indexed triggeredBy);

    modifier onlyAuthority() {
        require(msg.sender == registryAuthority, "Unauthorized: Only registry authority permitted");
        _;
    }

    modifier onlyAdjudicator() {
        require(
            msg.sender == registryAuthority || adjudicators[msg.sender],
            "Unauthorized: Only adjudicator or authority permitted"
        );
        _;
    }

    modifier onlyOwner(string memory propertyId) {
        require(properties[propertyId].currentOwner == msg.sender, "Unauthorized: Not deed holder");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    constructor() {
        registryAuthority = msg.sender;
        adjudicators[msg.sender] = true;
    }

    // =============================================================
    //                    ROLE & PAUSE MANAGEMENT
    // =============================================================

    function setAdjudicator(address account, bool authorized) external onlyAuthority {
        require(account != address(0), "Invalid adjudicator address");
        adjudicators[account] = authorized;
        emit AdjudicatorUpdated(account, authorized);
    }

    function pause() external onlyAuthority {
        paused = true;
        emit EmergencyPauseToggled(true, msg.sender);
    }

    function unpause() external onlyAuthority {
        paused = false;
        emit EmergencyPauseToggled(false, msg.sender);
    }

    function freezeProperty(string memory propertyId) external onlyAuthority {
        require(properties[propertyId].currentOwner != address(0), "Property does not exist");
        properties[propertyId].status = Status.Frozen;
        emit PropertyStatusChanged(propertyId, Status.Frozen, msg.sender);
    }

    function unfreezeProperty(string memory propertyId) external onlyAuthority {
        require(properties[propertyId].currentOwner != address(0), "Property does not exist");
        require(properties[propertyId].status == Status.Frozen, "Property is not frozen");
        properties[propertyId].status = _hasPendingDisputes(propertyId) ? Status.InDispute : Status.Active;
        emit PropertyStatusChanged(propertyId, properties[propertyId].status, msg.sender);
    }

    // =============================================================
    //                    PROPERTY REGISTRATION
    // =============================================================

    function registerProperty(
        string memory propertyId,
        address owner,
        string memory legalIdentifier,
        string memory metadataUri
    ) external onlyAuthority whenNotPaused {
        require(bytes(propertyId).length > 0, "Invalid property ID");
        require(bytes(legalIdentifier).length > 0, "Invalid legal identifier");
        require(properties[propertyId].currentOwner == address(0), "Property already registered");
        require(owner != address(0), "Invalid owner address");

        bytes32 legalHash = keccak256(abi.encodePacked(legalIdentifier));
        require(!_legalIdExists[legalHash], "Legal identifier already registered");
        _legalIdExists[legalHash] = true;

        properties[propertyId] = Property({
            id: propertyId,
            currentOwner: owner,
            legalIdentifier: legalIdentifier,
            metadataUri: metadataUri,
            status: Status.Active,
            registeredAt: block.timestamp
        });

        _ownershipHistory[propertyId].push(
            OwnershipRecord({
                previousOwner: address(0),
                newOwner: owner,
                timestamp: block.timestamp,
                note: "Initial Registration"
            })
        );

        emit PropertyRegistered(propertyId, owner, legalIdentifier, metadataUri);
    }

    function updatePropertyMetadata(
        string memory propertyId,
        string memory newMetadataUri
    ) external onlyAuthority whenNotPaused {
        require(properties[propertyId].currentOwner != address(0), "Property does not exist");
        require(bytes(newMetadataUri).length > 0, "Metadata cannot be empty");

        properties[propertyId].metadataUri = newMetadataUri;
        emit MetadataUpdated(propertyId, newMetadataUri, msg.sender);
    }

    // =============================================================
    //          TRANSFERS (DIRECT, MULTI-SIG, & ECDSA SIGNED)
    // =============================================================

    function transferProperty(
        string memory propertyId,
        address newOwner
    ) external onlyOwner(propertyId) whenNotPaused {
        _executeTransfer(propertyId, msg.sender, newOwner, "Direct Owner Transfer");
    }

    function initiateTransfer(
        string memory propertyId,
        address buyer
    ) external onlyOwner(propertyId) whenNotPaused returns (uint256) {
        require(buyer != address(0) && buyer != msg.sender, "Cannot transfer to zero or self address");
        require(properties[propertyId].status == Status.Active, "Property not eligible for transfer");

        transferCounter++;
        transferRequests[transferCounter] = TransferRequest({
            id: transferCounter,
            propertyId: propertyId,
            seller: msg.sender,
            buyer: buyer,
            buyerApproved: false,
            authorityApproved: false,
            executed: false,
            createdAt: block.timestamp
        });

        emit TransferInitiated(transferCounter, propertyId, msg.sender, buyer);
        return transferCounter;
    }

    function approveTransfer(uint256 transferId) external whenNotPaused {
        TransferRequest storage req = transferRequests[transferId];
        require(req.id != 0, "Transfer request does not exist");
        require(!req.executed, "Transfer already executed");
        require(properties[req.propertyId].status == Status.Active, "Property not eligible for transfer");
        require(properties[req.propertyId].currentOwner == req.seller, "Seller is no longer owner");

        bool updated = false;
        if (msg.sender == req.buyer && !req.buyerApproved) {
            req.buyerApproved = true;
            updated = true;
        }
        if ((msg.sender == registryAuthority || adjudicators[msg.sender]) && !req.authorityApproved) {
            req.authorityApproved = true;
            updated = true;
        }
        require(updated, "Unauthorized or already approved");

        emit TransferApproved(transferId, req.propertyId, msg.sender, req.buyerApproved, req.authorityApproved);

        if (req.buyerApproved && req.authorityApproved) {
            req.executed = true;
            _executeTransfer(req.propertyId, req.seller, req.buyer, "Multi-Signature Verified Transfer");
        }
    }

    function transferWithSignature(
        string memory propertyId,
        address newOwner,
        uint256 deadline,
        bytes memory signature
    ) external onlyAuthority whenNotPaused {
        require(block.timestamp <= deadline, "Signature expired");
        address currentOwner = properties[propertyId].currentOwner;
        require(currentOwner != address(0), "Property does not exist");

        uint256 currentNonce = nonces[currentOwner]++;
        bytes32 messageHash = keccak256(
            abi.encodePacked(address(this), block.chainid, propertyId, currentOwner, newOwner, currentNonce, deadline)
        );
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        address signer = _recoverSigner(ethSignedMessageHash, signature);
        require(signer == currentOwner, "Invalid owner signature");

        _executeTransfer(propertyId, currentOwner, newOwner, "ECDSA Signature Transfer");
    }

    function _executeTransfer(
        string memory propertyId,
        address previousOwner,
        address newOwner,
        string memory note
    ) internal {
        require(newOwner != address(0), "Cannot transfer to zero address");
        require(newOwner != previousOwner, "Cannot transfer to current owner");
        require(properties[propertyId].status == Status.Active, "Property not eligible for transfer");

        properties[propertyId].currentOwner = newOwner;

        _ownershipHistory[propertyId].push(
            OwnershipRecord({
                previousOwner: previousOwner,
                newOwner: newOwner,
                timestamp: block.timestamp,
                note: note
            })
        );

        emit PropertyTransferred(propertyId, previousOwner, newOwner);
    }

    // =============================================================
    //                    DISPUTE MANAGEMENT
    // =============================================================

    function raiseDispute(string memory propertyId, string memory reason) external whenNotPaused {
        require(properties[propertyId].currentOwner != address(0), "Property does not exist");
        require(bytes(reason).length > 0, "Dispute reason required");

        disputeCounter++;
        disputes[disputeCounter] = Dispute({
            id: disputeCounter,
            propertyId: propertyId,
            claimant: msg.sender,
            reason: reason,
            status: DisputeStatus.Pending,
            createdAt: block.timestamp,
            resolvedBy: address(0),
            resolvedAt: 0
        });

        properties[propertyId].status = Status.InDispute;
        propertyDisputes[propertyId].push(disputeCounter);

        emit DisputeRaised(disputeCounter, propertyId, msg.sender, reason);
    }

    function resolveDispute(uint256 disputeId, DisputeStatus resolution) external onlyAdjudicator whenNotPaused {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.id != 0, "Dispute does not exist");
        require(dispute.status == DisputeStatus.Pending, "Dispute already finalized");
        require(resolution != DisputeStatus.Pending, "Invalid resolution status");

        dispute.status = resolution;
        dispute.resolvedBy = msg.sender;
        dispute.resolvedAt = block.timestamp;

        if (!_hasPendingDisputes(dispute.propertyId)) {
            properties[dispute.propertyId].status = Status.Active;
        }

        emit DisputeResolved(disputeId, dispute.propertyId, resolution);
    }

    function _hasPendingDisputes(string memory propertyId) internal view returns (bool) {
        uint256[] storage ids = propertyDisputes[propertyId];
        for (uint256 i = 0; i < ids.length; i++) {
            if (disputes[ids[i]].status == DisputeStatus.Pending) {
                return true;
            }
        }
        return false;
    }

    // =============================================================
    //                VIEW & CRYPTOGRAPHIC HELPERS
    // =============================================================

    function getOwnershipHistory(string memory propertyId) external view returns (OwnershipRecord[] memory) {
        return _ownershipHistory[propertyId];
    }

    function getPropertyDisputes(string memory propertyId) external view returns (uint256[] memory) {
        return propertyDisputes[propertyId];
    }

    function _recoverSigner(bytes32 ethSignedMessageHash, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "Invalid signature v value");
        require(
            uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0,
            "Invalid signature s value"
        );
        return ecrecover(ethSignedMessageHash, v, r, s);
    }
}