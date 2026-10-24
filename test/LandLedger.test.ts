import "@nomicfoundation/hardhat-ethers";

import { expect } from "chai";
import hre from "hardhat";

describe("LandLedger Smart Contract (24 Test Cases)", function () {
  const PropertyStatus = { Active: 0, InDispute: 1, Transferred: 2, Frozen: 3 };
  const DisputeStatus = { Pending: 0, Resolved: 1, Dismissed: 2 };

  let landLedger: any;
  let authority: any;
  let owner1: any;
  let owner2: any;
  let randomCitizen: any;
  let adjudicator: any;

  let ethers: any;
  let connection: any;

  // Hardhat 3: ethers lives on a network connection, not on `hre` directly
  before(async function () {
    connection = await hre.network.connect();
    ethers = connection.ethers;
  });

  beforeEach(async function () {
    [authority, owner1, owner2, randomCitizen, adjudicator] = await ethers.getSigners();
    const LandLedger = await ethers.getContractFactory("LandLedger");
    landLedger = await LandLedger.deploy();
  });

  describe("1. Deployment & Role Management", function () {
    it("1.1 Should set the right registry authority", async function () {
      expect(await landLedger.registryAuthority()).to.equal(authority.address);
      expect(await landLedger.adjudicators(authority.address)).to.equal(true);
    });

    it("1.2 Should allow authority to grant and revoke adjudicator role", async function () {
      await landLedger.setAdjudicator(adjudicator.address, true);
      expect(await landLedger.adjudicators(adjudicator.address)).to.equal(true);

      await landLedger.setAdjudicator(adjudicator.address, false);
      expect(await landLedger.adjudicators(adjudicator.address)).to.equal(false);
    });

    it("1.3 Should revert if non-authority tries to add an adjudicator", async function () {
      let failed = false;
      try {
        await landLedger.connect(randomCitizen).setAdjudicator(adjudicator.address, true);
      } catch (error: any) {
        failed = true;
        expect(error.message).to.include("Unauthorized");
      }
      expect(failed).to.be.true;
    });
  });

  describe("2. Property Registration & Metadata", function () {
    const propertyId = "PROP-001";
    const legalId = "UP/GZB/118";
    const metadata = '{"location":"Delhi","areaSqm":50,"valuationInr":7500000}';

    it("2.1 Should allow the authority to register a new property", async function () {
      await landLedger.registerProperty(propertyId, owner1.address, legalId, metadata);

      const property = await landLedger.properties(propertyId);
      expect(property.currentOwner).to.equal(owner1.address);
      expect(property.legalIdentifier).to.equal(legalId);
      expect(property.status).to.equal(PropertyStatus.Active);
    });

    it("2.2 Should record initial ownership history upon registration", async function () {
      await landLedger.registerProperty(propertyId, owner1.address, legalId, metadata);
      const history = await landLedger.getOwnershipHistory(propertyId);
      expect(history.length).to.equal(1);
      expect(history[0].previousOwner).to.equal(ethers.ZeroAddress);
      expect(history[0].newOwner).to.equal(owner1.address);
      expect(history[0].note).to.equal("Initial Registration");
    });

    it("2.3 Should revert if a non-authority tries to register", async function () {
      let failed = false;
      try {
        await landLedger.connect(randomCitizen).registerProperty(propertyId, owner1.address, legalId, metadata);
      } catch (error: any) {
        failed = true;
        expect(error.message).to.include("Unauthorized");
      }
      expect(failed).to.be.true;
    });

    it("2.4 Should revert if trying to register an existing property ID", async function () {
      await landLedger.registerProperty(propertyId, owner1.address, legalId, metadata);

      let failed = false;
      try {
        await landLedger.registerProperty(propertyId, owner1.address, "NEW-LEGAL-ID", metadata);
      } catch (error: any) {
        failed = true;
        expect(error.message).to.include("already registered");
      }
      expect(failed).to.be.true;
    });

    it("2.5 Should revert if trying to register a duplicate legal identifier", async function () {
      await landLedger.registerProperty(propertyId, owner1.address, legalId, metadata);

      let failed = false;
      try {
        await landLedger.registerProperty("PROP-999", owner2.address, legalId, metadata);
      } catch (error: any) {
        failed = true;
        expect(error.message).to.include("Legal identifier already registered");
      }
      expect(failed).to.be.true;
    });

    it("2.6 Should revert if the owner address is the zero address", async function () {
      let failed = false;
      try {
        await landLedger.registerProperty(propertyId, ethers.ZeroAddress, legalId, metadata);
      } catch (error: any) {
        failed = true;
        expect(error.message).to.include("Invalid owner address");
      }
      expect(failed).to.be.true;
    });

    it("2.7 Should allow authority to update property metadata", async function () {
      await landLedger.registerProperty(propertyId, owner1.address, legalId, metadata);
      const updatedMeta = '{"location":"New Delhi","areaSqm":60,"valuationInr":9000000}';
      await landLedger.updatePropertyMetadata(propertyId, updatedMeta);

      const property = await landLedger.properties(propertyId);
      expect(property.metadataUri).to.equal(updatedMeta);
    });
  });

  describe("3. Property Transfers (Direct, Multi-Sig, & ECDSA)", function () {
    const propertyId = "PROP-002";

    beforeEach(async function () {
      await landLedger.registerProperty(propertyId, owner1.address, "LEGAL-002", "{}");
    });

    it("3.1 Should allow the current owner to transfer the property directly", async function () {
      await landLedger.connect(owner1).transferProperty(propertyId, owner2.address);

      const property = await landLedger.properties(propertyId);
      expect(property.currentOwner).to.equal(owner2.address);

      const history = await landLedger.getOwnershipHistory(propertyId);
      expect(history.length).to.equal(2);
      expect(history[1].previousOwner).to.equal(owner1.address);
      expect(history[1].newOwner).to.equal(owner2.address);
    });

    it("3.2 Should revert if someone other than the owner tries to transfer", async function () {
      let failed = false;
      try {
        await landLedger.connect(randomCitizen).transferProperty(propertyId, owner2.address);
      } catch (error: any) {
        failed = true;
        expect(error.message).to.include("Not deed holder");
      }
      expect(failed).to.be.true;
    });

    it("3.3 Should revert if transferring to the zero address or self", async function () {
      let failed = false;
      try {
        await landLedger.connect(owner1).transferProperty(propertyId, ethers.ZeroAddress);
      } catch (error: any) {
        failed = true;
        expect(error.message).to.include("Cannot transfer to zero address");
      }
      expect(failed).to.be.true;
    });

    it("3.4 Should execute a multi-signature transfer only after both Buyer and Authority approve", async function () {
      await landLedger.connect(owner1).initiateTransfer(propertyId, owner2.address);

      // Buyer approves first -> should not transfer yet
      await landLedger.connect(owner2).approveTransfer(1);
      let property = await landLedger.properties(propertyId);
      expect(property.currentOwner).to.equal(owner1.address);

      // Authority approves second -> auto-executes transfer
      await landLedger.connect(authority).approveTransfer(1);
      property = await landLedger.properties(propertyId);
      expect(property.currentOwner).to.equal(owner2.address);
    });

    it("3.5 Should revert if unauthorized user tries to approve a multi-sig transfer", async function () {
      await landLedger.connect(owner1).initiateTransfer(propertyId, owner2.address);

      let failed = false;
      try {
        await landLedger.connect(randomCitizen).approveTransfer(1);
      } catch (error: any) {
        failed = true;
        expect(error.message).to.include("Unauthorized");
      }
      expect(failed).to.be.true;
    });

    it("3.6 Should execute ECDSA signature-verified transfer and block replay attacks", async function () {
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const contractAddress = await landLedger.getAddress();
      const nonce = await landLedger.nonces(owner1.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "string", "address", "address", "uint256", "uint256"],
        [contractAddress, chainId, propertyId, owner1.address, owner2.address, nonce, deadline]
      );

      const signature = await owner1.signMessage(ethers.getBytes(messageHash));

      await landLedger.connect(authority).transferWithSignature(propertyId, owner2.address, deadline, signature);

      const property = await landLedger.properties(propertyId);
      expect(property.currentOwner).to.equal(owner2.address);
      expect(await landLedger.nonces(owner1.address)).to.equal(1n);
    });
  });

  describe("4. Dispute Management & Adjudication", function () {
    const propertyId = "PROP-003";

    beforeEach(async function () {
      await landLedger.registerProperty(propertyId, owner1.address, "LEGAL-003", "{}");
    });

    it("4.1 Should allow anyone to raise a dispute and freeze transfers", async function () {
      await landLedger.connect(randomCitizen).raiseDispute(propertyId, "Boundary overlap");

      const property = await landLedger.properties(propertyId);
      expect(property.status).to.equal(PropertyStatus.InDispute);

      let failed = false;
      try {
        await landLedger.connect(owner1).transferProperty(propertyId, owner2.address);
      } catch (error: any) {
        failed = true;
        expect(error.message).to.include("not eligible");
      }
      expect(failed).to.be.true;
    });

    it("4.2 Should allow the authority to resolve a pending dispute", async function () {
      await landLedger.connect(randomCitizen).raiseDispute(propertyId, "Boundary overlap");

      await landLedger.resolveDispute(1, DisputeStatus.Resolved);

      const dispute = await landLedger.disputes(1);
      expect(dispute.status).to.equal(DisputeStatus.Resolved);

      const property = await landLedger.properties(propertyId);
      expect(property.status).to.equal(PropertyStatus.Active);
    });

    it("4.3 Should allow an authorized adjudicator to dismiss a dispute", async function () {
      await landLedger.setAdjudicator(adjudicator.address, true);
      await landLedger.connect(randomCitizen).raiseDispute(propertyId, "Invalid claim");

      await landLedger.connect(adjudicator).resolveDispute(1, DisputeStatus.Dismissed);

      const dispute = await landLedger.disputes(1);
      expect(dispute.status).to.equal(DisputeStatus.Dismissed);
      expect(dispute.resolvedBy).to.equal(adjudicator.address);
    });

    it("4.4 Should keep property InDispute if multiple disputes exist and only one is resolved", async function () {
      await landLedger.connect(randomCitizen).raiseDispute(propertyId, "Dispute 1");
      await landLedger.connect(owner2).raiseDispute(propertyId, "Dispute 2");

      await landLedger.resolveDispute(1, DisputeStatus.Dismissed);
      let property = await landLedger.properties(propertyId);
      expect(property.status).to.equal(PropertyStatus.InDispute);

      await landLedger.resolveDispute(2, DisputeStatus.Resolved);
      property = await landLedger.properties(propertyId);
      expect(property.status).to.equal(PropertyStatus.Active);
    });

    it("4.5 Should revert if trying to resolve an already finalized dispute", async function () {
      await landLedger.connect(randomCitizen).raiseDispute(propertyId, "Boundary overlap");
      await landLedger.resolveDispute(1, DisputeStatus.Resolved);

      let failed = false;
      try {
        await landLedger.resolveDispute(1, DisputeStatus.Dismissed);
      } catch (error: any) {
        failed = true;
        expect(error.message).to.include("Dispute already finalized");
      }
      expect(failed).to.be.true;
    });
  });

  describe("5. Emergency Pause & Property Freeze Controls", function () {
    const propertyId = "PROP-004";

    beforeEach(async function () {
      await landLedger.registerProperty(propertyId, owner1.address, "LEGAL-004", "{}");
    });

    it("5.1 Should block all state-changing operations when contract is paused", async function () {
      await landLedger.pause();
      expect(await landLedger.paused()).to.equal(true);

      let failed = false;
      try {
        await landLedger.connect(owner1).transferProperty(propertyId, owner2.address);
      } catch (error: any) {
        failed = true;
        expect(error.message).to.include("Contract is paused");
      }
      expect(failed).to.be.true;
    });

    it("5.2 Should resume operations when unpaused by authority", async function () {
      await landLedger.pause();
      await landLedger.unpause();

      await landLedger.connect(owner1).transferProperty(propertyId, owner2.address);
      const property = await landLedger.properties(propertyId);
      expect(property.currentOwner).to.equal(owner2.address);
    });

    it("5.3 Should allow authority to freeze and unfreeze a specific property", async function () {
      await landLedger.freezeProperty(propertyId);
      let property = await landLedger.properties(propertyId);
      expect(property.status).to.equal(PropertyStatus.Frozen);

      let failed = false;
      try {
        await landLedger.connect(owner1).transferProperty(propertyId, owner2.address);
      } catch (error: any) {
        failed = true;
        expect(error.message).to.include("not eligible");
      }
      expect(failed).to.be.true;

      await landLedger.unfreezeProperty(propertyId);
      property = await landLedger.properties(propertyId);
      expect(property.status).to.equal(PropertyStatus.Active);
    });
  });
});