# Land Trust Chain

Create a Minimum Viable Product (MVP) for LandLedger - A Blockchain-Based Land Registry System. 

I need practical, functional code and architecture for a first review presentation.

PROJECT CONTEXT:

- Project: LandLedger (Blockchain Land Registry System)

- Team: Gaurav Karakoti, Bhumika Singh, Nandini Mathur

- Mentor: Dr. Sakshi Singh

- Tech Stack: Solidity (Smart Contracts), Node.js/Express (Backend), React (Frontend), PostgreSQL

DELIVERABLES NEEDED:

1. SMART CONTRACT CODE (Solidity)

   - Basic LandRegistry.sol with core functions:

     * registerProperty(propertyID, ownerAddress)

     * initiateTransfer(propertyID, newOwnerAddress)

     * completeTransfer(propertyID, signatures)

     * flagDispute(propertyID, reason)

     * queryOwnershipChain(propertyID)

   - Include access control modifiers (registrar, owner, adjudicator)

   - Add event logging for all state changes

   - Make it testable with Hardhat

2. BACKEND API STRUCTURE

   - Express.js REST API endpoints:

     * POST /api/properties/register

     * GET /api/properties/:id

     * POST /api/transfers/initiate

     * POST /api/transfers/complete

     * GET /api/properties/:id/history

     * POST /api/disputes/flag

   - Include request/response schemas

   - Add basic authentication/authorization

   - Error handling and validation

3. DATABASE SCHEMA

   - PostgreSQL tables:

     * properties (id, legal_identifier, current_owner, registered_date)

     * transfers (id, property_id, from_address, to_address, status, timestamp)

     * encumbrances (id, property_id, creditor, amount, type)

     * disputes (id, property_id, reason, status, created_date)

   - Include indexes and relationships

4. FRONTEND COMPONENTS (React)

   - Property Dashboard (display owned properties)

   - Property Verification Portal (search and view any property)

   - Transfer Initiator (form to start property transfer)

   - Dispute Flagging Interface

   - Ownership History Timeline

   - Use React hooks and functional components

5. SYSTEM ARCHITECTURE DOCUMENT

   - Three-layer architecture diagram (Blockchain/Smart Contract/Application layers)

   - Data flow diagram showing property registration to transfer flow

   - Security architecture overview

   - Deployment topology

6. TESTING & DEPLOYMENT

   - Hardhat test file with 10+ unit tests for smart contracts

   - Jest tests for API endpoints (3-5 basic tests)

   - Docker setup for local development

   - .env configuration template

7. README WITH:

   - Project overview (2-3 paragraphs)

   - Quick start guide (5-7 steps)

   - Architecture diagram link

   - API documentation

   - Known limitations & future work

REQUIREMENTS:

- Code should be production-ready but simplified for MVP

- Include comments explaining key logic

- Provide example data/test cases

- Make everything easily deployable locally

- Focus on core functionality (property registration, transfer, history)

- Omit advanced features (advanced dispute resolution, oracle integration, layer-2 scaling) for MVP

FORMAT:

- Organize code by folder structure

- Provide file names and complete, runnable code

- Include setup instructions

- Add example curl commands for API testing

PURPOSE:

This MVP will be presented at the Micro Project First Review on 28-29 September 2026.

The presentation should demonstrate working proof-of-concept with live demo capability.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9da41303-733b-43fc-b698-6c2efb02f113).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
