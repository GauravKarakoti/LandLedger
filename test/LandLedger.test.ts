import "@nomicfoundation/hardhat-ethers";

import { expect } from "chai";
import hre from "hardhat";

describe("LandLedger Smart Contract", function () {
  const PropertyStatus = { Active: 0, InDispute: 1, Transferred: 2, Frozen: 3 };
  const DisputeStatus = { Pending: 0, Resolved: 1, Dismissed: 2 };

  let landLedger: any, authority: any, owner1: any, owner2: any, randomCitizen: any;

  // Declare ethers + connection at the suite level so all tests can access it
  let ethers: any;
  let connection: any;

  // Hardhat 3: ethers lives on a network connection, not on `hre` directly
  before(async function () {
    connection = await hre.network.connect();
    ethers = connection.ethers;
  });

  beforeEach(async function () {
    [authority, owner1, owner2, randomCitizen] = await ethers.getSigners();
    const LandLedger = await ethers.getContractFactory("LandLedger");
    landLedger = await LandLedger.deploy();
  });

  describe("Deployment", function () {
    it("Should set the right registry authority", async function () {
      expect(await landLedger.registryAuthority()).to.equal(authority.address);
    });
  });

  describe("Property Registration", function () {
    const propertyId = "PROP-001";
    const legalId = "UP/GZB/118";
    const metadata = '{"location":"Delhi","area":50}';

    it("Should allow the authority to register a new property", async function () {
      await landLedger.registerProperty(propertyId, owner1.address, legalId, metadata);
      
      const property = await landLedger.properties(propertyId);
      expect(property.currentOwner).to.equal(owner1.address);
      expect(property.legalIdentifier).to.equal(legalId);
      expect(property.status).to.equal(PropertyStatus.Active);
    });

    it("Should revert if a non-authority tries to register", async function () {
      let failed = false;
      try {
        await landLedger.connect(randomCitizen).registerProperty(propertyId, owner1.address, legalId, metadata);
      } catch (error: any) {
        failed = true;
        expect(error.message).to.include("Unauthorized");
      }
      expect(failed).to.be.true;
    });

    it("Should revert if trying to register an existing property ID", async function () {
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

    it("Should revert if the owner address is the zero address", async function () {
      let failed = false;
      try {
        await landLedger.registerProperty(propertyId, ethers.ZeroAddress, legalId, metadata);
      } catch (error: any) {
        failed = true;
        expect(error.message).to.include("Invalid owner address");
      }
      expect(failed).to.be.true;
    });
  });

  describe("Property Transfers", function () {
    const propertyId = "PROP-002";
    
    beforeEach(async function () {
      await landLedger.registerProperty(propertyId, owner1.address, "LEGAL-002", "{}");
    });

    it("Should allow the current owner to transfer the property", async function () {
      await landLedger.connect(owner1).transferProperty(propertyId, owner2.address);
      
      const property = await landLedger.properties(propertyId);
      expect(property.currentOwner).to.equal(owner2.address);
    });

    it("Should revert if someone other than the owner tries to transfer", async function () {
      let failed = false;
      try {
        await landLedger.connect(randomCitizen).transferProperty(propertyId, owner2.address);
      } catch (error: any) {
        failed = true;
        expect(error.message).to.include("Not deed holder");
      }
      expect(failed).to.be.true;
    });
  });

  describe("Dispute Management", function () {
    const propertyId = "PROP-003";

    beforeEach(async function () {
      await landLedger.registerProperty(propertyId, owner1.address, "LEGAL-003", "{}");
    });

    it("Should allow anyone to raise a dispute and freeze transfers", async function () {
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

    it("Should allow the authority to resolve a pending dispute", async function () {
      await landLedger.connect(randomCitizen).raiseDispute(propertyId, "Boundary overlap");
      
      await landLedger.resolveDispute(1, DisputeStatus.Resolved);
      
      const dispute = await landLedger.disputes(1);
      expect(dispute.status).to.equal(DisputeStatus.Resolved);

      const property = await landLedger.properties(propertyId);
      expect(property.status).to.equal(PropertyStatus.Active);
    });
  });
});