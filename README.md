# Confidential On-chain Property Deed Registry

The **Confidential On-chain Property Deed Registry** is a revolutionary smart contract system that allows for the tokenization and secure registration of real estate deeds on the blockchain. Leveraging **Zama's Fully Homomorphic Encryption technology**, this project ensures that the identities of property owners and the transaction history of properties remain encrypted, only to be decrypted when authorized, such as during a bank loan process. 

## Why This Matters: A Critical Problem

In the traditional real estate market, the registration and transfer of property deeds often involve cumbersome processes that compromise owners' privacy and expose sensitive information. Property transactions require a secure solution that protects the identities of buyers and sellers while maintaining the integrity and legal standing of the deeds. The lack of efficient systems can lead to fraud, disputes, and a general lack of trust in the real estate market.

## The FHE Solution: Keeping Data Confidential

Our solution utilizes **Zama's Fully Homomorphic Encryption** (FHE) to safeguard sensitive information related to property ownership. By incorporating Zama's open-source libraries, such as **Concrete** and **TFHE-rs**, we enable seamless encryption and decryption of data without exposing it to unauthorized parties. This means that even while on-chain, the details of property ownership and transaction history remain confidential. Only users with the proper permissions can access or modify these records, offering unparalleled privacy and security in property dealings.

## Key Features

- **Encrypted Owner Identity:** Property owner's identity is securely encrypted, protecting their personal information from unauthorized access.
- **Optional Encrypted Transaction History:** Transaction histories can also be encrypted, allowing for selective disclosure.
- **Enhanced Liquidity for Tokenized Assets:** Tokenization allows for easier trading and transfer of assets while maintaining privacy.
- **Efficiency and Security in Real Estate Transactions:** The registry streamlines the process while ensuring compliance and security within the real estate sector.

## Technology Stack

- **Solidity:** For smart contract development.
- **Node.js:** To handle backend processes.
- **Hardhat/Foundry:** For testing and deploying the smart contracts.
- **Zama FHE SDK (Concrete, TFHE-rs):** For implementing Fully Homomorphic Encryption. 
- **Web3.js:** To interact with Ethereum-based applications.

## Directory Structure

```
Deed_Registry_FHE/
│
├── contracts/
│   └── Deed_Registry_FHE.sol
│
├── scripts/
│   └── deploy.js
│
├── test/
│   └── Deed_Registry_FHE.test.js
│
├── package.json
└── hardhat.config.js
```

## Installation Instructions

To set up the **Confidential On-chain Property Deed Registry**, follow these steps:

1. Ensure you have **Node.js** installed on your machine.
2. Install **Hardhat** or **Foundry** as required for your development setup.
3. Download the project files (do not use `git clone` or any URLs).
4. Navigate to the project directory in your terminal.
5. Run the command:

   ```bash
   npm install
   ```

This command will fetch all necessary dependencies, including the Zama FHE libraries required for encryption functionalities.

## Build & Run Guide

To compile, test, and deploy your smart contract, follow these commands:

1. **Compile the Smart Contracts:**

   ```bash
   npx hardhat compile
   ```

2. **Run the Tests:**

   ```bash
   npx hardhat test
   ```

3. **Deploy the Contracts:**

   ```bash
   npx hardhat run scripts/deploy.js
   ```

## Example Usage

Below is a simple example demonstrating how to create and register a property deed using our smart contract:

```javascript
const { ethers } = require("hardhat");

async function main() {
    const DeedRegistry = await ethers.getContractFactory("Deed_Registry_FHE");
    const deedRegistry = await DeedRegistry.deploy();

    await deedRegistry.deployed();

    console.log("Deed Registry deployed to:", deedRegistry.address);

    // Example of creating a new deed
    const ownerId = "owner_123";
    const propertyDetails = "123 Main St, Anytown, USA";
    const transactionHistory = [/* encrypted history data */];

    await deedRegistry.registerDeed(ownerId, propertyDetails, transactionHistory);
    console.log("Deed registered successfully!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
```

## Acknowledgements

### Powered by Zama

We extend our sincere gratitude to the Zama team for their pioneering contributions to Fully Homomorphic Encryption technology. Their open-source tools and support make it feasible to build confidential blockchain applications, ensuring security and privacy for sensitive data in the real estate sector and beyond.

---

With the **Confidential On-chain Property Deed Registry**, we are redefining how property transactions are conducted in a secure and efficient manner while embracing the privacy of users through advanced cryptographic techniques. Join us in leading the charge toward a safer, more secure real estate market!
