> **Note:** For the most up-to-date and accurate documentation, see [new-documentation.md](new-documentation.md)

# BondPay — Complete Project Plan
### Offline Bond-Based Payment System
**Stack: React Native + Node.js | Version: 1.0 | Scope: Hackathon MVP + Production Roadmap**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Solution Overview](#3-solution-overview)
4. [Glossary of Core Terms](#4-glossary-of-core-terms)
5. [System Architecture](#5-system-architecture)
6. [Cryptographic Foundation](#6-cryptographic-foundation)
7. [Data Structures](#7-data-structures)
8. [Core Algorithms](#8-core-algorithms)
9. [Offline Transaction Flow](#9-offline-transaction-flow)
10. [QR Code Protocol](#10-qr-code-protocol)
11. [Local Storage — SQLite Schema](#11-local-storage--sqlite-schema)
12. [Backend API Design](#12-backend-api-design)
13. [Synchronization Protocol](#13-synchronization-protocol)
14. [Double-Spending — The Honest Section](#14-double-spending--the-honest-section)
15. [Security Threat Model](#15-security-threat-model)
16. [Tech Stack](#16-tech-stack)
17. [React Native App Architecture](#17-react-native-app-architecture)
18. [Backend Architecture](#18-backend-architecture)
19. [Hackathon MVP Build Plan](#19-hackathon-mvp-build-plan)
20. [Production Roadmap](#20-production-roadmap)
21. [Known Limitations](#21-known-limitations)
22. [Comparison with Existing Systems](#22-comparison-with-existing-systems)
23. [Open Research Problems](#23-open-research-problems)
24. [Conclusion](#24-conclusion)

---

## 1. Executive Summary

BondPay is an offline-capable digital payment system for regions with unreliable internet connectivity. Users convert part of their online wallet balance into cryptographically signed "bond tokens" while connected. These tokens can then be transferred between two devices face-to-face using QR codes, with no internet required at the time of payment. When either party reconnects, the transaction is uploaded and verified by the server.

The core innovation is that authenticity is guaranteed offline through digital signatures, while fraud detection and double-spend resolution happen post-sync. The system explicitly accepts a bounded fraud window — identical in principle to how EMV chip cards approve offline transactions up to a floor limit — rather than pretending the problem doesn't exist.

**Hackathon goal:** Functional prototype demonstrating offline issuance, transfer, and sync with signed bond tokens.

**Production goal:** A deployable payment network with fraud detection, velocity limits, and KYC integration, suitable for Nepal's rural and semi-urban payment landscape.

---

## 2. Problem Statement

### 2.1 The Nepal Context

Nepal's digital payment infrastructure has grown significantly, but it has grown unevenly. The following are real, documented pain points that BondPay targets:

**Problem A — Remote and Tourist Areas**
Trekking routes (Annapurna Circuit, Everest Base Camp trail, Upper Mustang) pass through villages where mobile connectivity is absent or severely limited to a single bar of 2G on a good day. Tourists carry sufficient funds in eSewa, Khalti, or international wallets but cannot spend them. Vendors cannot accept them. Everyone reverts to cash.

**Problem B — Mobile Data Cost of Micro-Transactions**
Even in Kathmandu and Pokhara, free public WiFi is rare and often insecure. A user who wants to pay Rs.20 for tea must spend mobile data to initiate the transaction. The ratio of data cost to transaction value can be disproportionate, especially for low-income daily users.

**Problem C — Connectivity Intermittence, Not Absence**
The more common scenario is not "no internet ever" but "internet sometimes." A vendor gets connectivity for two hours a day. A trekker has signal at a lodge every third night. A small shop in a hill town syncs transactions at the end of the week. BondPay is designed around this intermittent model.

### 2.2 What Existing Solutions Miss

| Solution | Problem |
|---|---|
| eSewa / Khalti / IME Pay | Require internet at transaction time |
| Physical cash | No transaction record, no fraud protection, hard to carry |
| QR-based offline modes | Usually only work for small amounts on trusted hardware (POS terminals) |
| Crypto wallets | Too complex, require device ownership, not viable for tea-shop transactions |

### 2.3 The Core Design Question

Can we build a digital payment system that:
- Requires internet only to *load* money and to *settle* transactions — not to *spend* money?
- Provides cryptographic proof of authenticity without an internet connection?
- Bounds the fraud window to an acceptable level rather than pretending to eliminate it?

BondPay's answer to all three is: yes, with well-understood trade-offs.

---

## 3. Solution Overview

### 3.1 The Big Picture

```
[ONLINE PHASE]
User is connected to internet
    → User requests bond issuance from server
    → Server creates N signed bond tokens
    → Tokens stored locally on device

[OFFLINE PHASE]
User is disconnected
    → Sender selects bonds to transfer
    → Sender generates signed transaction QR
    → Receiver scans QR
    → Receiver verifies bond signature + sender signature locally
    → Receiver stores transaction record

[SYNC PHASE]
Either party reconnects
    → Uploads transaction bundle to server
    → Server checks: is this bond redeemed already?
    → If first redemption: accepted, receiver balance updated
    → If duplicate: flagged, fraud protocol triggered
```

### 3.2 The Bond Token Mental Model

Think of a bond token as a banknote — not a balance, but a discrete object.

- A banknote has a denomination (Rs.100)
- A banknote has a serial number (unique)
- A banknote has security features (watermark, thread) — in BondPay, this is the server's cryptographic signature
- A banknote can be handed from person to person
- A banknote can be counterfeited — but a good counterfeit will be detected when it reaches the bank

BondPay replaces physical security features with mathematical ones. The server's Ed25519 signature on a bond token serves exactly the role of a watermark. Anyone can verify it. Nobody except the server can forge it.

### 3.3 What BondPay Guarantees Offline

| Guarantee | Mechanism | Available Offline? |
|---|---|---|
| Bond is genuinely server-issued | Ed25519 signature on bond, verified with server public key | ✅ Yes |
| Bond data hasn't been tampered with | Signature covers all bond fields | ✅ Yes |
| Sender authorized this payment | Ed25519 signature on transaction, verified with sender public key | ✅ Yes |
| Transaction data wasn't modified | Signature covers all transaction fields | ✅ Yes |
| This bond hasn't been spent before | Requires server-side redemption ledger lookup | ❌ No |

The last row is the honest limitation. Everything else is cryptographically guaranteed without internet.

---

## 4. Glossary of Core Terms

| Term | Definition |
|---|---|
| **Bond Token** | A discrete, server-signed digital object representing a fixed monetary value. Analogous to a physical banknote. |
| **Bond ID** | A unique identifier for a specific bond token. Format: `BOND-<uuid>` |
| **Bond Value** | The denomination of a bond. Fixed at issuance. Cannot be partially spent. |
| **Server Private Key** | The cryptographic key, held only by the server, used to sign bond tokens. |
| **Server Public Key** | The public counterpart, distributed to all apps, used to verify bond signatures. |
| **User Private Key** | The cryptographic key, held only on a user's device (in the OS Keystore), used to sign transactions. |
| **User Public Key** | Stored on the server and shared. Used to verify that a sender signed a transaction. |
| **Ed25519** | The elliptic curve digital signature algorithm used for all signing in BondPay. Chosen for speed, small signature size, and mobile suitability. |
| **SHA-256** | A cryptographic hash function. Used to create a fixed-length fingerprint of transaction data before signing. |
| **Nonce** | A random 128-bit value, generated fresh for each transaction. Prevents replay attacks. |
| **Signature** | The output of signing a hash with a private key. Mathematically linked to the data and key. |
| **QR Payload** | The JSON-serialized data encoded into a QR code for device-to-device transfer. |
| **Sync Batch** | A bundle of transactions uploaded to the server when connectivity is restored. |
| **Redemption** | The act of the server recording that a bond has been spent. Each bond can be redeemed only once. |
| **Double-Spend** | Attempting to spend the same bond token more than once before server sync. |
| **Floor Limit** | The maximum total value of offline bonds a user can hold without being forced to sync. |
| **TTL (Time-to-Live)** | A validity period embedded in a bond token. Bonds expire after this period. |
| **Android Keystore** | A hardware-backed secure storage system in Android for cryptographic keys. Private keys stored here cannot be extracted by apps. |
| **iOS Keychain** | The iOS equivalent of the Android Keystore. |
| **Replay Attack** | Resubmitting a previously valid transaction to fraudulently repeat a payment. Prevented by nonces and transaction IDs. |

---

## 5. System Architecture

### 5.1 High-Level Component Map

```
┌─────────────────────────────────────────────────────────────┐
│                     REACT NATIVE APP                        │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  UI Layer    │  │  Crypto Layer│  │  Storage Layer   │  │
│  │  (Screens,   │  │  (Ed25519,   │  │  (SQLite:        │  │
│  │   Navigation)│  │   SHA-256,   │  │   bonds, txns,   │  │
│  │              │  │   Keystore)  │  │   user data)     │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │  QR Layer    │  │  Sync Layer  │                         │
│  │  (Camera,    │  │  (HTTP,      │                         │
│  │   Generator) │  │   Queue)     │                         │
│  └──────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
                              │
               Internet (when available)
                              │
┌─────────────────────────────────────────────────────────────┐
│                     BACKEND (Node.js)                       │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Auth API    │  │  Bond API    │  │  Transaction API │  │
│  │  (JWT,       │  │  (Issuance,  │  │  (Sync, Verify,  │  │
│  │   KYC-lite)  │  │   Revocation)│  │   Fraud flags)   │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │  Fraud Engine│  │  Ledger      │                         │
│  │  (Velocity,  │  │  (PostgreSQL │                         │
│  │   Dup detect)│  │   via Supabase)                        │
│  └──────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Data Flow: Bond Issuance

```
App (online) → POST /bonds/issue {amount, denomination, userId}
             ← Server creates N bond tokens
             ← Signs each with Server Private Key
             ← Returns signed bond array
App stores bonds in local SQLite
App deducts amount from online wallet balance
```

### 5.3 Data Flow: Offline Payment

```
Receiver App → Generates receiver QR {receiverId, timestamp, amount, requestNonce}
Sender App   → Scans receiver QR
             → Selects bonds matching amount
             → Creates transaction object
             → Signs transaction with User Private Key
             → Generates payment QR {transaction, bonds, senderPublicKey, senderSignature}
Receiver App → Scans payment QR
             → Verifies each bond's server signature (offline)
             → Verifies sender's transaction signature (offline)
             → Stores transaction in local SQLite
             → Marks bonds as "received, pending sync"
```

### 5.4 Data Flow: Sync

```
Either party online → POST /transactions/sync {transactions[], bonds[]}
Server              → For each bond: check redemption ledger
                    → If not redeemed: accept, mark redeemed, credit receiver
                    → If already redeemed: flag, trigger fraud protocol
                    → Return sync result {accepted[], rejected[], flagged[]}
App                 → Update local state based on result
```

---

## 6. Cryptographic Foundation

### 6.1 Why Ed25519?

Ed25519 was chosen over RSA and ECDSA for the following reasons:

| Property | Ed25519 | RSA-2048 | ECDSA-P256 |
|---|---|---|---|
| Signature size | 64 bytes | 256 bytes | ~72 bytes |
| Public key size | 32 bytes | 256+ bytes | 64 bytes |
| Signing speed (mobile) | Very fast | Slow | Medium |
| Verification speed | Very fast | Fast | Medium |
| Resistance to side-channel attacks | High (by design) | Low without countermeasures | Medium |
| Implementation simplicity | High | Medium | Medium |
| QR code impact | Minimal | Large signature bloats QR | Small |

The signature size matters especially because bond tokens and transaction signatures must fit inside a QR code payload. Ed25519's 64-byte signatures keep QR codes scannable.

### 6.2 The Two Key Pairs

**Pair 1: Server Keys**
- The server has a single Ed25519 key pair.
- The private key never leaves the server. It is used only to sign bond tokens at issuance.
- The public key is hardcoded into every app build and used by devices to verify bonds offline.
- If the server's private key is ever compromised, all bonds become untrustworthy and the key must be rotated. This is a catastrophic event — treat it accordingly.

**Pair 2: User Keys**
- Every registered user has an Ed25519 key pair.
- The private key is generated on the device and stored in the Android Keystore / iOS Keychain. It never leaves the device and cannot be extracted.
- The public key is uploaded to the server during registration.
- User private keys are used to sign transactions (proving the sender authorized payment).
- Receivers verify sender signatures using the sender's public key, retrieved from the transaction payload.

### 6.3 SHA-256 Hashing

Before signing any data, the data is hashed first. This is standard practice. The reason:

- Ed25519 works over a fixed-size input internally, but signing a hash of the data is the standard pattern.
- Even tiny changes to the data produce a completely different hash, making tampering immediately detectable.
- Hashing before signing is computationally cheaper than signing raw data directly.

**What gets hashed for a bond token (at issuance):**

```
bondHash = SHA256(
  bondId +
  value +
  ownerId +
  issuedAt +
  expiresAt +
  serverNonce
)
bondSignature = Ed25519Sign(bondHash, serverPrivateKey)
```

**What gets hashed for a transaction (at payment time):**

```
txHash = SHA256(
  txId +
  bondIds[] +        // all bond IDs being transferred
  senderId +
  receiverId +
  totalAmount +
  timestamp +
  nonce             // fresh random value per transaction
)
txSignature = Ed25519Sign(txHash, senderPrivateKey)
```

### 6.4 Nonce Generation

A nonce (number-used-once) is a fresh random value generated for every transaction. Its purpose is to make each transaction unique even if all other fields are identical — preventing replay attacks where an old transaction is resubmitted.

**Do not derive the nonce from:**
- Timestamp alone — two transactions in the same millisecond collide
- Device ID — not unique per transaction
- User ID — not unique per transaction
- Any combination of predictable values — an attacker can precompute them

**Correct approach:**

```
nonce = cryptographic_secure_random(128 bits)
// In React Native: crypto.getRandomValues() or react-native-crypto
// Produces something like: "a7f3b2d91c8e4f62"
```

For the transaction ID itself (a derived value, not the nonce):

```
txId = SHA256(senderId + receiverId + totalAmount + timestamp + nonce)
// This is deterministic given the same inputs — used as an identifier
// The nonce inside it provides uniqueness
```

### 6.5 Android Keystore and iOS Keychain

The user's private key must never exist in app storage (SQLite, AsyncStorage, SecureStore, etc.) in an extractable form. It must live in the OS-level hardware-backed secure storage.

**Android Keystore:**
- Private keys are stored in a hardware security module (on devices that support it) or in an isolated software environment.
- The app never retrieves the raw key material. Instead, it asks the Keystore to "sign this data" and the Keystore returns the signature.
- Even a rooted device cannot extract the raw private key from a hardware-backed Keystore.

**iOS Keychain:**
- Similar model. Keys stored with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` cannot be extracted or backed up to iCloud.

**In React Native:**

Use the `react-native-keychain` library for storing credentials, and `react-native-quick-crypto` or `@noble/ed25519` combined with Keystore APIs for signing operations. On Android, the `react-native-keystore` package can wrap Keystore signing directly.

**Pseudocode for key generation on first launch:**

```
FUNCTION initializeUserKeys():
  IF keystoreHasKey("bondpay_user_private_key"):
    RETURN  // Already initialized
  
  keypair = Ed25519.generateKeyPair()
  
  Keystore.store("bondpay_user_private_key", keypair.privateKey)
  // ↑ This key never leaves the Keystore
  
  SQLite.store("user_public_key", keypair.publicKey)
  // ↑ Public key can live in regular storage
  
  API.post("/users/register-key", { publicKey: keypair.publicKey })
  // ↑ Server now knows this user's public key
```

---

## 7. Data Structures

All data structures are defined in pseudocode / JSON schema format. These directly translate to TypeScript interfaces in the React Native app.

### 7.1 Bond Token

The core unit of value in BondPay. Created by the server, verified everywhere.

```json
BondToken {
  bondId:          string,     // "BOND-550e8400-e29b-41d4-a716-446655440000"
  value:           integer,    // In lowest denomination (paisa). 10000 = Rs.100
  ownerId:         string,     // User ID of current owner (changes on transfer)
  issuedAt:        integer,    // Unix timestamp (seconds)
  expiresAt:       integer,    // Unix timestamp. Bond invalid after this.
  issuedByServer:  string,     // Server version / key ID for rotation tracking
  serverSignature: string,     // Base64-encoded Ed25519 signature (64 bytes → ~88 chars)
  
  // Fields below are local only, NOT part of the signed data
  status:          enum,       // "available" | "spent" | "received_pending_sync" | "expired"
  receivedAt:      integer,    // When this bond arrived on this device (local time)
  localTxId:       string,     // Which local transaction brought this bond in
}
```

**Critical:** `serverSignature` covers `bondId + value + ownerId + issuedAt + expiresAt + issuedByServer`. Everything else (status, receivedAt, localTxId) is local metadata not covered by the server signature — that's fine because tampering with local metadata doesn't make a bond more valuable.

### 7.2 Transaction Record

Created at payment time. Signed by the sender.

```json
Transaction {
  txId:             string,    // SHA256(senderId+receiverId+amount+timestamp+nonce)
  bonds:            BondRef[], // Array of {bondId, value} for each bond transferred
  senderId:         string,    // Sender's user ID
  receiverId:       string,    // Receiver's user ID
  totalAmount:      integer,   // Sum of all bond values (in paisa)
  timestamp:        integer,   // Unix timestamp
  nonce:            string,    // 128-bit random hex string
  senderPublicKey:  string,    // Base64 Ed25519 public key (32 bytes → ~44 chars)
  senderSignature:  string,    // Base64 Ed25519 signature over txHash (64 bytes → ~88 chars)
  
  // Local status tracking (not signed)
  syncStatus:       enum,      // "pending" | "synced" | "rejected" | "flagged"
  syncedAt:         integer,   // Unix timestamp when server confirmed
}

BondRef {
  bondId:   string,
  value:    integer
}
```

### 7.3 QR Payload — Receiver Request QR

The first QR code. Generated by the receiver to initiate a payment.

```json
ReceiverQR {
  type:           "BONDPAY_REQUEST",
  version:        "1.0",
  receiverId:     string,    // Receiver's user ID
  receiverName:   string,    // Display name (for sender confirmation UI)
  requestedAmount: integer,  // Amount being requested, in paisa (0 = any amount)
  requestNonce:   string,    // Random value. Prevents request replay.
  timestamp:      integer,   // When this QR was generated
  expiresAt:      integer,   // Timestamp after which QR is invalid (e.g., +5 minutes)
}
```

### 7.4 QR Payload — Sender Payment QR

The second QR code. Generated by the sender after confirming payment.

```json
PaymentQR {
  type:           "BONDPAY_PAYMENT",
  version:        "1.0",
  transaction:    Transaction,    // Full transaction object (see 7.2)
  bonds:          BondToken[],    // Full bond token objects being transferred
  
  // Size optimization note:
  // For large amounts with many bonds, this QR can get large.
  // Mitigation: use high-density QR (version 40), compress JSON,
  // or split across multiple QR codes with a sequence indicator.
}
```

### 7.5 Sync Batch

What gets uploaded to the server when connectivity is restored.

```json
SyncBatch {
  userId:         string,
  deviceId:       string,
  batchId:        string,    // UUID for this sync batch
  submittedAt:    integer,   // Client timestamp
  
  outgoing: [               // Payments this user made
    {
      transaction:  Transaction,
      bonds:        BondToken[]
    }
  ],
  
  incoming: [               // Payments this user received
    {
      transaction:  Transaction,
      bonds:        BondToken[]
    }
  ]
}
```

### 7.6 Server Bond Redemption Ledger (Backend)

The authoritative record of which bonds have been spent. Lives only on the server.

```json
RedemptionRecord {
  bondId:         string,    // PRIMARY KEY
  txId:           string,    // Which transaction redeemed this bond
  redeemedBy:     string,    // Receiver user ID
  redeemedFrom:   string,    // Sender user ID
  redeemedAt:     integer,   // Server-side timestamp (authoritative)
  syncBatchId:    string,    // Which sync batch confirmed this
}
```

---

## 8. Core Algorithms

### 8.1 Bond Issuance (Server-Side)

Called when a user requests to convert online balance into offline bonds.

```
FUNCTION issueBonds(userId, totalAmount, denomination):
  
  // Input validation
  IF denomination NOT IN [5, 10, 20, 50, 100, 500, 1000]:
    RETURN error("Invalid denomination")
  
  IF totalAmount % denomination != 0:
    RETURN error("Amount must be exact multiple of denomination")
  
  count = totalAmount / denomination
  
  IF count > MAX_BONDS_PER_REQUEST (e.g., 50):
    RETURN error("Too many bonds at once")
  
  // Check user's available online balance
  userBalance = DB.getBalance(userId)
  IF userBalance < totalAmount:
    RETURN error("Insufficient balance")
  
  bonds = []
  
  FOR i = 1 to count:
    bond = {
      bondId:         "BOND-" + generateUUID(),
      value:          denomination,
      ownerId:        userId,
      issuedAt:       currentUnixTimestamp(),
      expiresAt:      currentUnixTimestamp() + BOND_TTL_SECONDS, // e.g., 30 days
      issuedByServer: SERVER_KEY_VERSION
    }
    
    // Sign the bond
    dataToSign = bond.bondId + bond.value + bond.ownerId + 
                 bond.issuedAt + bond.expiresAt + bond.issuedByServer
    
    bond.serverSignature = Ed25519.sign(SHA256(dataToSign), SERVER_PRIVATE_KEY)
    
    bonds.append(bond)
  
  // Deduct from online balance atomically
  DB.transaction():
    DB.deductBalance(userId, totalAmount)
    DB.insertBonds(bonds)  // Server keeps record of issued bonds too
  
  RETURN bonds
```

### 8.2 Bond Signature Verification (Device-Side, Offline)

Called when a receiver gets bonds via QR. No internet needed.

```
FUNCTION verifyBondSignature(bond):
  
  // Reconstruct the data that was signed at issuance
  dataToVerify = bond.bondId + bond.value + bond.ownerId +
                 bond.issuedAt + bond.expiresAt + bond.issuedByServer
  
  expectedHash = SHA256(dataToVerify)
  
  // Verify using the server's public key (hardcoded in app)
  isValid = Ed25519.verify(
    signature: bond.serverSignature,
    message:   expectedHash,
    publicKey: SERVER_PUBLIC_KEY  // Hardcoded — never changes without app update
  )
  
  IF NOT isValid:
    RETURN { valid: false, reason: "INVALID_SERVER_SIGNATURE" }
  
  // Check expiry
  IF currentTimestamp() > bond.expiresAt:
    RETURN { valid: false, reason: "BOND_EXPIRED" }
  
  RETURN { valid: true }
```

### 8.3 Transaction Creation (Sender Device)

Called when the sender confirms a payment.

```
FUNCTION createTransaction(sender, receiverQR, selectedBonds):
  
  // Validate selected bonds
  FOR each bond in selectedBonds:
    result = verifyBondSignature(bond)
    IF NOT result.valid:
      RETURN error("Bond invalid: " + result.reason)
    IF bond.status != "available":
      RETURN error("Bond already spent")
  
  totalAmount = SUM(bond.value FOR bond in selectedBonds)
  
  IF totalAmount != receiverQR.requestedAmount AND receiverQR.requestedAmount != 0:
    RETURN error("Amount mismatch")
  
  // Build transaction
  nonce = crypto.getRandomValues(128 bits)
  
  txId = SHA256(
    sender.userId +
    receiverQR.receiverId +
    totalAmount.toString() +
    currentTimestamp().toString() +
    nonce
  )
  
  transaction = {
    txId:            txId,
    bonds:           [{bondId: b.bondId, value: b.value} FOR b in selectedBonds],
    senderId:        sender.userId,
    receiverId:      receiverQR.receiverId,
    totalAmount:     totalAmount,
    timestamp:       currentTimestamp(),
    nonce:           nonce,
    senderPublicKey: sender.publicKey,
    syncStatus:      "pending"
  }
  
  // Sign the transaction
  txHash = SHA256(
    txId + 
    transaction.bonds.map(b => b.bondId).join(",") +
    senderId + receiverId + totalAmount + timestamp + nonce
  )
  
  transaction.senderSignature = Keystore.sign(txHash, "bondpay_user_private_key")
  // ↑ Private key never leaves the Keystore. Keystore returns only the signature.
  
  // Mark bonds as spent locally (optimistic — server confirms later)
  FOR each bond in selectedBonds:
    SQLite.updateBondStatus(bond.bondId, "spent", txId)
  
  // Store transaction
  SQLite.insertTransaction(transaction)
  SQLite.insertOutgoingTransferBonds(txId, selectedBonds)
  
  RETURN {
    transaction: transaction,
    bonds: selectedBonds  // Full bond objects for receiver verification
  }
```

### 8.4 Transaction Verification (Receiver Device, Offline)

Called when the receiver scans the sender's payment QR.

```
FUNCTION verifyAndAcceptPayment(paymentQR):
  
  { transaction, bonds } = paymentQR
  
  // Step 1: Verify each bond's server signature
  FOR each bond in bonds:
    result = verifyBondSignature(bond)
    IF NOT result.valid:
      RETURN error("Bond " + bond.bondId + " failed verification: " + result.reason)
  
  // Step 2: Verify bond values match transaction claims
  claimedTotal = SUM(b.value FOR b in transaction.bonds)
  actualTotal  = SUM(b.value FOR b in bonds)
  IF claimedTotal != actualTotal:
    RETURN error("Bond value mismatch in transaction")
  
  IF actualTotal != transaction.totalAmount:
    RETURN error("Transaction total mismatch")
  
  // Step 3: Verify sender's transaction signature
  txHash = SHA256(
    transaction.txId +
    transaction.bonds.map(b => b.bondId).join(",") +
    transaction.senderId + transaction.receiverId +
    transaction.totalAmount + transaction.timestamp + transaction.nonce
  )
  
  isSignatureValid = Ed25519.verify(
    signature: transaction.senderSignature,
    message:   txHash,
    publicKey: transaction.senderPublicKey
  )
  
  IF NOT isSignatureValid:
    RETURN error("Sender signature invalid — transaction may be tampered")
  
  // Step 4: Basic sanity checks
  IF transaction.timestamp > currentTimestamp() + CLOCK_SKEW_TOLERANCE:
    RETURN error("Transaction timestamp is in the future")
  
  IF currentTimestamp() - transaction.timestamp > MAX_TRANSACTION_AGE:
    RETURN error("Transaction too old to accept")
  
  // Step 5: Check for duplicate transaction (has receiver seen this txId before?)
  IF SQLite.transactionExists(transaction.txId):
    RETURN error("Duplicate transaction — already received")
  
  // Step 6: Accept and store
  FOR each bond in bonds:
    bond.status = "received_pending_sync"
    bond.receivedAt = currentTimestamp()
    bond.localTxId = transaction.txId
    SQLite.upsertBond(bond)
  
  transaction.syncStatus = "pending"
  SQLite.insertTransaction(transaction)
  SQLite.insertIncomingTransferBonds(transaction.txId, bonds)
  
  RETURN { accepted: true, amount: transaction.totalAmount }
```

### 8.5 Sync Algorithm (Client-Side)

Called when the device detects internet connectivity.

```
FUNCTION syncWithServer():
  
  IF NOT isConnected():
    RETURN  // Try again later
  
  // Gather all pending outgoing transactions
  pendingOutgoing = SQLite.getTransactions(
    userId: currentUser.id,
    role: "sender",
    syncStatus: "pending"
  )
  
  // Gather all pending incoming transactions
  pendingIncoming = SQLite.getTransactions(
    userId: currentUser.id,
    role: "receiver",
    syncStatus: "pending"
  )
  
  IF pendingOutgoing.isEmpty() AND pendingIncoming.isEmpty():
    RETURN  // Nothing to sync
  
  batch = {
    userId:      currentUser.id,
    deviceId:    deviceId,
    batchId:     generateUUID(),
    submittedAt: currentTimestamp(),
    outgoing:    pendingOutgoing.map(tx => ({
                   transaction: tx,
                   bonds: SQLite.getBondsForTx(tx.txId, "outgoing")
                 })),
    incoming:    pendingIncoming.map(tx => ({
                   transaction: tx,
                   bonds: SQLite.getBondsForTx(tx.txId, "incoming")
                 }))
  }
  
  response = API.post("/transactions/sync", batch)
  
  // Process results
  FOR each result in response.accepted:
    SQLite.updateTransactionSyncStatus(result.txId, "synced")
    SQLite.updateBondsSyncStatus(result.bondIds, "synced")
  
  FOR each result in response.rejected:
    SQLite.updateTransactionSyncStatus(result.txId, "rejected")
    SQLite.updateBondsSyncStatus(result.bondIds, "rejected")
    showAlert("Payment rejected: " + result.reason)
  
  FOR each result in response.flagged:
    SQLite.updateTransactionSyncStatus(result.txId, "flagged")
    // Freeze bonds involved
    SQLite.updateBondsSyncStatus(result.bondIds, "frozen")
    notifyUser("Transaction under review")
  
  // Update local balance display
  updateBalanceFromServer(response.updatedBalance)
```

### 8.6 Double-Spend Detection (Server-Side)

Called for each bond during sync processing.

```
FUNCTION processIncomingBond(bond, transaction, receiverId):
  
  // Verify server signature (server re-verifies even though device already did)
  result = verifyBondSignature(bond)
  IF NOT result.valid:
    RETURN { status: "rejected", reason: result.reason }
  
  // Check if bond is in the server's issued-bonds ledger
  issuedBond = DB.getBond(bond.bondId)
  IF issuedBond IS NULL:
    RETURN { status: "rejected", reason: "BOND_NOT_ISSUED" }
  
  // Check if bond has already been redeemed
  redemption = DB.getRedemption(bond.bondId)
  
  IF redemption IS NOT NULL:
    // DOUBLE SPEND DETECTED
    
    // Flag both transactions for investigation
    DB.flagTransaction(redemption.txId, "DOUBLE_SPEND_ORIGINAL")
    DB.flagTransaction(transaction.txId, "DOUBLE_SPEND_DUPLICATE")
    
    // Alert fraud engine
    FraudEngine.report({
      type:         "DOUBLE_SPEND",
      bondId:       bond.bondId,
      originalTxId: redemption.txId,
      duplicateTxId: transaction.txId,
      suspectedSender: transaction.senderId,
      severity:     "HIGH"
    })
    
    RETURN { status: "flagged", reason: "DOUBLE_SPEND_DETECTED" }
  
  // Bond not yet redeemed — accept it
  DB.transaction():
    DB.insertRedemption({
      bondId:      bond.bondId,
      txId:        transaction.txId,
      redeemedBy:  receiverId,
      redeemedFrom: transaction.senderId,
      redeemedAt:  currentTimestamp()
    })
    DB.creditUser(receiverId, bond.value)
  
  RETURN { status: "accepted" }
```

---

## 9. Offline Transaction Flow

This section gives the complete step-by-step narrative of what happens during a face-to-face payment, from the moment the two parties meet to the moment both phones show confirmation.

### 9.1 Pre-Conditions

Before any offline payment can happen:
- Both Sender and Receiver have installed BondPay and registered (requires internet, one-time)
- Sender has loaded at least one bond (requires internet, done in advance)
- Both devices have the Server Public Key (bundled in the app at build time)

### 9.2 Step-by-Step Flow

**Step 1 — Receiver opens "Receive" screen**
- Receiver taps "Receive Payment"
- App asks for the requested amount (optional — can leave blank for "any amount")
- App generates a `ReceiverQR` with receiverId, receiverName, requestedAmount, fresh requestNonce, timestamp, and expiry (+5 minutes)
- QR code is displayed on screen

**Step 2 — Sender scans receiver's QR**
- Sender taps "Send Payment"
- Camera opens
- Sender scans Receiver's QR
- App parses and validates: is this a BONDPAY_REQUEST? Is it expired? 

**Step 3 — Sender reviews and selects bonds**
- App displays: "Paying [ReceiverName] — Rs.[Amount]"
- App automatically selects the minimum set of bonds to cover the amount
  - Example: Rs.500 request → selects BOND-A (Rs.200) + BOND-B (Rs.200) + BOND-C (Rs.100)
- Sender can see which bonds will be transferred
- Sender taps "Confirm Payment"

**Step 4 — Sender's app creates and signs the transaction**
- App generates nonce
- App builds Transaction object
- App computes txHash = SHA256(all transaction fields)
- App calls Keystore.sign(txHash) → gets senderSignature
- App marks selected bonds as "spent" in local SQLite
- App builds `PaymentQR` containing the full transaction + full bond objects

**Step 5 — Sender's QR is displayed**
- App displays the PaymentQR on screen
- Sender holds phone toward receiver

**Step 6 — Receiver scans sender's QR**
- Receiver's camera scans the PaymentQR
- App parses the full payload

**Step 7 — Receiver's app verifies (offline)**
- For each bond: verify server signature using hardcoded SERVER_PUBLIC_KEY
- Verify bond values sum to transaction total
- Verify sender's transaction signature using senderPublicKey from payload
- Check transaction timestamp is reasonable
- Check for duplicate txId in local DB
- All checks pass?

**Step 8 — Receiver accepts**
- Receiver's app stores all bonds in SQLite with status "received_pending_sync"
- Receiver's app stores transaction with syncStatus "pending"
- Receiver's UI shows: "✅ Rs.500 received from [SenderName]"
- Sender's UI already shows: "✅ Rs.500 sent to [ReceiverName]"

**Step 9 — Both parties go their way**
- No internet required for any of Steps 1–8
- Transaction is "morally complete" — receiver has cryptographic proof of payment

**Step 10 — Sync (whenever either party gets internet)**
- Either device uploads the transaction to the server
- Server verifies, records redemption, credits receiver's online balance
- Sender's online balance was already debited at bond issuance time
- Both devices receive sync confirmation

### 9.3 Clock Skew Handling

Since devices aren't syncing time during offline transactions, there may be clock differences between sender and receiver devices. The receiver should apply a tolerance window:

```
CLOCK_SKEW_TOLERANCE = 300 seconds (5 minutes)
MAX_TRANSACTION_AGE  = 86400 seconds (24 hours)

// Accept transaction if:
timestamp >= (currentTime - MAX_TRANSACTION_AGE)
AND
timestamp <= (currentTime + CLOCK_SKEW_TOLERANCE)
```

---

## 10. QR Code Protocol

### 10.1 QR Size Considerations

The payment QR is the largest payload in the system. Its size depends on how many bonds are being transferred:

| Bonds in payment | Approx. JSON size | QR Version needed | Scannable? |
|---|---|---|---|
| 1 bond | ~1.2 KB | QR v30 | ✅ Yes |
| 3 bonds | ~2.5 KB | QR v40 | ✅ Yes (barely) |
| 5 bonds | ~4.0 KB | Exceeds standard QR | ⚠️ Split needed |
| 10+ bonds | >7 KB | Not possible in single QR | ❌ Split required |

### 10.2 Mitigation: Chunked QR Transfer

For large payloads (>3 bonds), implement a multi-QR handshake:

```
PaymentQR_Part1 {
  type:       "BONDPAY_PAYMENT_CHUNK",
  chunkIndex: 1,
  totalChunks: 3,
  sessionId:  "abc123",
  data:       "...compressed chunk 1..."
}
```

Receiver's UI shows a progress indicator: "Scanning 2 of 3..."

For hackathon MVP: limit bonds per transaction to 3. Document this as a known limitation.

### 10.3 QR Display Requirements

- Use high-contrast display: black QR on white background
- Minimum screen brightness prompt when displaying
- QR should auto-refresh if expiry is approaching (ReceiverQR expires in 5 minutes)
- Add a visual timer countdown on the ReceiverQR screen

### 10.4 JSON Serialization

Before encoding to QR:
- Minimize JSON (no whitespace)
- Consider base64-encoding signature fields to reduce character set complexity
- Consider gzip compression for multi-bond payloads (QR handles binary with binary mode)

### 10.5 Error States

| Error | Display |
|---|---|
| QR not recognized | "Not a BondPay QR code" |
| QR expired | "This payment request has expired. Ask receiver to generate a new one." |
| Bond signature invalid | "⚠️ Bond verification failed. Do not accept this payment." |
| Sender signature invalid | "⚠️ Transaction signature failed. Data may have been tampered." |
| Duplicate transaction | "This payment has already been received." |
| Clock too far off | "Transaction timestamp is suspicious. Please verify your device clock." |

---

## 11. Local Storage — SQLite Schema

All SQLite tables live in an encrypted database using `react-native-sqlite-storage` or `op-sqlite`. In production, consider SQLCipher for database-level encryption.

### 11.1 Table: `bonds`

```sql
CREATE TABLE bonds (
  bond_id           TEXT PRIMARY KEY,
  value             INTEGER NOT NULL,            -- In paisa
  owner_id          TEXT NOT NULL,               -- User ID (may change on receive)
  issued_at         INTEGER NOT NULL,            -- Unix timestamp
  expires_at        INTEGER NOT NULL,            -- Unix timestamp
  issued_by_server  TEXT NOT NULL,               -- Server key version
  server_signature  TEXT NOT NULL,               -- Base64 Ed25519 signature
  
  status            TEXT NOT NULL DEFAULT 'available',
                    -- 'available' | 'spent' | 'received_pending_sync' 
                    -- | 'synced' | 'expired' | 'frozen'
  local_tx_id       TEXT,                        -- FK to transactions
  received_at       INTEGER,                     -- When device received this bond
  
  created_at        INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX idx_bonds_status ON bonds(status);
CREATE INDEX idx_bonds_owner ON bonds(owner_id);
```

### 11.2 Table: `transactions`

```sql
CREATE TABLE transactions (
  tx_id              TEXT PRIMARY KEY,
  sender_id          TEXT NOT NULL,
  receiver_id        TEXT NOT NULL,
  total_amount       INTEGER NOT NULL,           -- In paisa
  timestamp          INTEGER NOT NULL,
  nonce              TEXT NOT NULL,
  sender_public_key  TEXT NOT NULL,              -- Base64 Ed25519 public key
  sender_signature   TEXT NOT NULL,              -- Base64 Ed25519 signature
  
  role               TEXT NOT NULL,              -- 'sender' | 'receiver'
  sync_status        TEXT NOT NULL DEFAULT 'pending',
                     -- 'pending' | 'synced' | 'rejected' | 'flagged'
  synced_at          INTEGER,
  rejection_reason   TEXT,
  
  created_at         INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX idx_tx_sync_status ON transactions(sync_status);
CREATE INDEX idx_tx_sender ON transactions(sender_id);
CREATE INDEX idx_tx_receiver ON transactions(receiver_id);
```

### 11.3 Table: `transaction_bonds`

Many-to-many join: which bonds were part of which transaction.

```sql
CREATE TABLE transaction_bonds (
  tx_id     TEXT NOT NULL REFERENCES transactions(tx_id),
  bond_id   TEXT NOT NULL REFERENCES bonds(bond_id),
  direction TEXT NOT NULL,    -- 'outgoing' | 'incoming'
  PRIMARY KEY (tx_id, bond_id)
);
```

### 11.4 Table: `user`

```sql
CREATE TABLE user (
  user_id       TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  public_key    TEXT NOT NULL,       -- Base64 Ed25519 public key
  -- Private key is in OS Keystore, NOT stored here
  registered_at INTEGER NOT NULL,
  
  online_balance INTEGER,            -- Cached from last server sync (in paisa)
  balance_synced_at INTEGER          -- When online_balance was last updated
);
```

### 11.5 Table: `sync_log`

For debugging and tracking sync history.

```sql
CREATE TABLE sync_log (
  batch_id      TEXT PRIMARY KEY,
  submitted_at  INTEGER NOT NULL,
  status        TEXT NOT NULL,       -- 'submitted' | 'success' | 'partial' | 'failed'
  tx_count      INTEGER NOT NULL,
  accepted      INTEGER,
  rejected      INTEGER,
  flagged       INTEGER,
  error_message TEXT
);
```

---

## 12. Backend API Design

### 12.1 Authentication

All endpoints (except /auth) require a JWT bearer token. JWTs are issued on login and expire after 30 days.

```
Authorization: Bearer <jwt_token>
```

### 12.2 Endpoints

**POST /auth/register**
```
Request:
{
  phoneNumber:  string,    // Nepal: "+977-XXXXXXXXXX"
  email:        string,
  fullName:     string,
  password:     string,    // bcrypt hashed on server
  publicKey:    string     // Base64 Ed25519 public key
}

Response 201:
{
  userId:   string,
  jwt:      string,
  expiresAt: integer
}
```

**POST /auth/login**
```
Request:
{
  loginId:     string,    // email or phone number
  password:    string
}

Response 200:
{
  userId:    string,
  jwt:       string,
  expiresAt: integer
}
```

**GET /users/me**
```
Response 200:
{
  userId:        string,
  displayName:   string,
  onlineBalance: integer,   // In paisa
  publicKey:     string
}
```

**POST /bonds/issue**
```
Request:
{
  totalAmount:  integer,   // In paisa
  denomination: integer    // 10000 = Rs.100, 50000 = Rs.500, etc.
}

Response 200:
{
  bonds:          BondToken[],
  newOnlineBalance: integer
}

Response 400:
{
  error: "INSUFFICIENT_BALANCE" | "INVALID_DENOMINATION" | "FLOOR_LIMIT_EXCEEDED"
}
```

**GET /bonds/active**
```
Response 200:
{
  bonds: BondToken[]    // All bonds currently issued to this user (server's view)
}
```

**POST /transactions/sync**
```
Request: SyncBatch

Response 200:
{
  accepted: [{ txId, bondIds }],
  rejected: [{ txId, bondIds, reason }],
  flagged:  [{ txId, bondIds, reason }],
  updatedOnlineBalance: integer
}
```

**GET /server/public-key**
```
Response 200:
{
  publicKey:  string,    // Base64 current server public key
  keyVersion: string,
  validFrom:  integer,
  validUntil: integer
}
```

### 12.3 Error Codes

| Code | HTTP Status | Meaning |
|---|---|---|
| INSUFFICIENT_BALANCE | 400 | Not enough online balance to issue bonds |
| INVALID_DENOMINATION | 400 | Denomination not in allowed list |
| FLOOR_LIMIT_EXCEEDED | 400 | User's offline bond holdings would exceed limit |
| BOND_NOT_FOUND | 404 | Bond ID not in server ledger |
| BOND_EXPIRED | 400 | Bond TTL has passed |
| INVALID_SIGNATURE | 400 | Cryptographic verification failed |
| DOUBLE_SPEND | 409 | Bond already redeemed in a previous transaction |
| TRANSACTION_TOO_OLD | 400 | Transaction timestamp too far in the past |
| FRAUD_FLAGGED | 403 | Account under fraud review |

---

## 13. Synchronization Protocol

### 13.1 When Sync Happens

Sync is triggered by:
- App coming to foreground + internet detected
- User manually taps "Sync Now"
- Background task (every 15 minutes when connected and pending transactions exist)
- Immediately after loading new bonds

### 13.2 What Gets Synced

Both sides of every transaction must be syncable independently. The sender syncs their outgoing records; the receiver syncs their incoming records. The server accepts from either.

```
Sender syncs first:
  Server records redemption, does NOT credit receiver yet
  Reason: receiver hasn't confirmed receipt signature yet

Receiver syncs (could happen before or after sender):
  Server receives full transaction including bonds
  Server verifies everything
  Server checks redemption ledger
  If first legitimate redemption → credits receiver

IMPORTANT: Server credits receiver only — it does NOT re-debit sender.
Sender was debited at bond issuance time. Bond issuance is the debit event.
```

### 13.3 Conflict Scenarios

**Scenario A: Receiver syncs before sender**
- Receiver uploads transaction + bonds
- Server validates: bond signatures OK, sender signature OK
- Server checks ledger: bond not yet marked redeemed
- Server marks redeemed, credits receiver
- Later when sender syncs: server sees bond already redeemed, records sender's sync as "acknowledged"
- ✅ No conflict

**Scenario B: Sender syncs, then receiver syncs**
- Same outcome, different order
- ✅ No conflict

**Scenario C: Receiver never syncs**
- Sender syncs, server records redemption candidate
- Receiver never uploads → receiver's online balance never increases
- Their local SQLite shows "received_pending_sync"
- When receiver eventually syncs → normal flow
- ✅ Eventually consistent

**Scenario D: Neither party syncs for a long time**
- Transaction sits in SQLite on both devices
- If bond expires (TTL passes) before sync → server may reject
- Mitigation: warn user when bond expiry is approaching and they have unsynced transactions

**Scenario E: Double spend caught at sync**
- Sender paid both Shop A and Shop B with same bond
- Shop A syncs first → bond marked redeemed, Shop A credited
- Shop B syncs later → bond already redeemed → DOUBLE_SPEND error returned
- Shop B notified: "Transaction flagged for review"
- Fraud engine triggered
- See Section 14 for resolution protocol

### 13.4 Idempotency

Every sync endpoint must be idempotent. If a sync batch is submitted twice (network retry, app crash/restart), the server must detect the duplicate batchId and return the same result without double-crediting.

```
Server maintains: SET of processed batchIds
IF batchId already processed:
  RETURN cached result for that batchId
```

---

## 14. Double-Spending — The Honest Section

This section is the most important in the document. Read it completely.

### 14.1 The Fundamental Problem

Offline digital cash cannot fully prevent double-spending without either:
- Internet access at transaction time, OR
- Trusted hardware (TEE, secure chip) that enforces a "mark as spent" state before allowing transfer

BondPay has neither during the offline period. This is not a flaw in the design — it is the inherent nature of offline digital cash. Physical cash has the same property: a good counterfeiter can spend one fake note at ten shops before the bank detects it.

**What BondPay can guarantee offline:**
- A bond is genuine (server issued it and signed it)
- A sender authorized the specific transfer (sender's signature)
- The data wasn't tampered with (signing makes tampering detectable)

**What BondPay cannot guarantee offline:**
- The bond wasn't already transferred to someone else five minutes ago

### 14.2 The Accepted Risk Model

BondPay mitigates double-spending through bounded exposure, not elimination. This is the same model used by:

- **EMV chip cards:** Banks approve offline transactions up to a "floor limit" (typically $50–100). Fraud above that limit is expected to be caught at the next online auth. Banks budget for it.
- **Physical cash:** Counterfeit detection happens at banks, not at every transaction.

BondPay's mitigation controls:

**Control 1: Bond Floor Limit**
Each user can hold at most a configurable maximum value in offline bonds (e.g., Rs.5,000). This caps the maximum fraud exposure per account.

```
MAX_OFFLINE_BOND_VALUE = 1000000 paisa (Rs.10,000)  // per user
```

**Control 2: Bond Denomination Limits**
Denominations are capped (e.g., max Rs.500 per bond). This limits the "unit damage" of one successful double-spend.

**Control 3: Bond TTL (Time-to-Live)**
Bonds expire after a set period (e.g., 30 days). This forces eventual online interaction and bounds the offline window.

```
BOND_TTL = 30 days  // Hackathon: 7 days
```

**Control 4: Transaction Velocity Limits**
The server flags accounts that submit more transactions per sync batch than a normal usage pattern would suggest.

```
MAX_TRANSACTIONS_PER_SYNC_BATCH = 20
// More than 20 unsynced transactions → flag for review
```

**Control 5: Receiver Risk Education**
For high-value offline payments, the app should warn receivers:

```
"⚠️ You're about to accept Rs.2,000 offline. 
This payment cannot be fully verified until you sync. 
Do you trust this sender?"
```

### 14.3 Post-Sync Fraud Detection

When a double-spend is detected at sync time:

```
FRAUD PROTOCOL:

Step 1: Both involved transactions flagged in DB
Step 2: Both sender's and receiver's accounts temporarily frozen
Step 3: Fraud review ticket created in admin queue
Step 4: Sender's account investigated:
  - Is this the first double-spend from this user?
  - What is the user's account history?
  - Were both receivers legitimate merchants?
Step 5: If fraud confirmed:
  - Sender's online balance debited for the fraudulent second transaction
  - If insufficient balance: debt recorded, account suspended
  - First-in-time receiver is made whole (credited)
  - Second receiver receives a partial or full refund from fraud reserve
Step 6: If innocent (app bug, sync error):
  - Investigation clears user
  - Correct receiver credited
  - Account unfrozen
```

### 14.4 The Receiver's Risk

The receiver bears a residual risk: they might accept a bond that was already spent elsewhere. This risk:
- Is bounded by the floor limit (max Rs.10,000 in the worst case)
- Is mitigated by the fraud restitution protocol
- Is comparable to the risk of accepting a forged banknote

For the hackathon: frame this explicitly. Judges who understand payment systems will be impressed by honest risk accounting far more than by claims of "impossible to double-spend."

### 14.5 What To Say To Judges

"BondPay can guarantee offline that a bond is genuine and that the sender authorized the transfer. What it cannot guarantee offline is exclusive ownership — the same bond could theoretically be presented to multiple receivers before sync. We mitigate this through per-user offline limits, bond TTLs, and post-sync fraud detection with restitution from a fraud reserve. This is the same model EMV chip cards use for offline floor-limit transactions, and it is the industry-accepted approach to offline payment risk."

---

## 15. Security Threat Model

### 15.1 Threat Matrix

| # | Threat | Attack Vector | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| T1 | Fake bond creation | Attacker invents bond JSON | High intent | High | Server signature verification (cryptographically impossible to forge) |
| T2 | Bond data tampering | Attacker modifies value field in bond JSON | High intent | High | Server signature covers all fields; tampering invalidates signature |
| T3 | Replay attack | Old transaction QR resubmitted | Medium | Medium | Nonce + txId uniqueness; receiver checks for duplicate txId |
| T4 | Stolen QR replay | Attacker photographs a PaymentQR | Medium | Medium | QR expires after ~5 minutes (transaction timestamp check) |
| T5 | Double-spending | Same bond QR shown to multiple receivers | High intent | Medium | Floor limits + post-sync detection (see Section 14) |
| T6 | Rooted device / key extraction | Attacker roots phone, reads private key | Low | Very high | Android Keystore / iOS Keychain — hardware-backed; raw key not extractable |
| T7 | APK modification | Attacker decompiles app, changes logic | Low-Medium | Medium | Server never trusts client-side values; crypto verification happens on server too |
| T8 | SQLite manipulation | Attacker edits local SQLite | Medium | Low | Local DB manipulation doesn't forge server signatures; server rejects unverified bonds |
| T9 | Man-in-the-middle on sync | Network attacker intercepts sync data | Medium | Medium | HTTPS / TLS on all sync communication; certificate pinning |
| T10 | Server private key compromise | Attacker obtains server signing key | Very low | Catastrophic | Key stored in server HSM (production); rotation protocol; all bonds must be re-signed |

### 15.2 Threat Detail: T1 — Fake Bond Creation

**Attack:** Attacker creates bond JSON with legitimate-looking structure but without a valid server signature.

**Why it fails:** The receiver's app runs `verifyBondSignature()` offline. This calls Ed25519.verify() with the hardcoded SERVER_PUBLIC_KEY. A forged or missing signature returns `false`. The bond is rejected before any value is transferred.

**What the attacker would need:** The server's private key. This is computationally infeasible to derive from the public key (elliptic curve discrete logarithm problem).

### 15.3 Threat Detail: T2 — Bond Tampering

**Attack:** Attacker receives a genuine bond worth Rs.100, changes the `value` field to Rs.10,000, and presents it.

**Why it fails:** The server signature was computed over the original `value = 10000 paisa` field. Changing it to `100000 paisa` produces a different data fingerprint. Signature verification fails.

### 15.4 Threat Detail: T3 — Replay Attack

**Attack:** Receiver records the PaymentQR the sender showed. Later, receiver re-presents that same QR to the sender or a third party to collect payment again.

**Why it fails:**
- The `nonce` in every transaction is a fresh random 128-bit value generated per transaction.
- The `txId` is a hash of all fields including the nonce, making it unique per transaction.
- The receiver's app checks SQLite for existing `txId` before accepting. A replayed QR has the same txId and is rejected as "already received."
- The server also checks txId uniqueness during sync.

### 15.5 Threat Detail: T6 — Rooted Device

**Attack:** Attacker roots their Android device and attempts to extract the user's private key from storage.

**Why it (mostly) fails:** The private key is never stored in app-accessible storage. It is stored in the Android Keystore's hardware-backed store (available on all Android devices with a Trusted Execution Environment, which covers most Android 6+ devices from 2015 onward). The Keystore will perform signing operations but will not return the raw private key to any application, including with root access on most devices.

**Residual risk:** On devices without hardware-backed Keystore (older or very cheap devices), the key is stored in software isolation which can be bypassed with root. Mitigation: during key generation, check `KeyInfo.isInsideSecureHardware()` and warn user if hardware backing is unavailable.

### 15.6 Threat Detail: T8 — SQLite Manipulation

**Attack:** Attacker uses an SQLite browser tool (many exist on Android with root) to change their bond balance in the local DB.

**Why it doesn't help them:** Changing local DB values does not create valid server-signed bond tokens. When these manipulated "bonds" are presented to a receiver, signature verification fails immediately. The bonds don't exist in the server's issuance ledger either, so sync will reject them.

**What they could do:** Mark a bond as "available" again after spending it locally, and try to spend it a second time (double-spend). This is T5 — handled by post-sync fraud detection.

---

## 16. Tech Stack

### 16.1 Hackathon MVP Stack

| Layer | Technology | Reason |
|---|---|---|
| Mobile App Framework | React Native 0.73+ | Shared JS skills, fast MVP, large ecosystem |
| App Build Tool | Expo SDK 56 (managed workflow) | Eliminates native build configuration friction |
| Navigation | React Navigation 6 | Industry standard, well-documented |
| State Management | Zustand | Simpler than Redux, sufficient for MVP |
| Local Database | expo-sqlite | Built into Expo, no native setup needed |
| Cryptography | @noble/ed25519 + expo-crypto | Pure JS Ed25519 implementation, works in Expo |
| Secure Key Storage | expo-secure-store | Wraps iOS Keychain / Android Keystore |
| QR Code Generation | react-native-qrcode-svg | SVG-based, scalable, no native setup |
| QR Code Scanning | expo-camera | Built into Expo |
| HTTP Client | axios | Standard, reliable |
| Backend Runtime | Node.js 20 LTS | Same language as frontend |
| Backend Framework | Express 4 | Minimal, fast to set up |
| Database | Supabase (managed PostgreSQL) | Free tier, instant setup, REST API, auth built in |
| JWT Auth | jsonwebtoken + bcrypt | Standard |
| Backend Crypto | @noble/ed25519 (Node.js) | Same library, consistent behavior |
| Hosting (backend) | Railway or Render | Free tier, instant deploy from GitHub |

### 16.2 Production Stack (Additions / Replacements)

| Layer | Hackathon | Production Upgrade | Reason |
|---|---|---|---|
| Mobile Crypto | @noble/ed25519 (pure JS) | react-native-quick-crypto (C++ binding) | 10–100x faster, uses OS crypto APIs |
| Key Storage | expo-secure-store | react-native-keychain + hardware attestation check | Explicit hardware backing verification |
| SQLite | expo-sqlite | op-sqlite (C++ binding) + SQLCipher encryption | Encrypted database, faster queries |
| Offline Storage | Basic SQLite | WatermelonDB (reactive, optimized for large datasets) | Better query performance at scale |
| QR Scanner | expo-camera | react-native-vision-camera (frame processors) | Real-time processing, better low-light |
| State Management | Zustand | Zustand + React Query | Server state management for sync layer |
| Backend Framework | Express | Express + TypeScript | Type safety, fewer runtime bugs |
| Database | Supabase (managed) | Supabase + read replicas + connection pooling | Handle concurrent syncs |
| Auth | Simple JWT | Auth with refresh tokens + device fingerprinting | Better session security |
| Backend Crypto | @noble/ed25519 | node:crypto (built-in) with Ed25519 support (Node 16+) | Standard library, no dependency |
| Observability | None | Sentry (errors) + Datadog (metrics) | Monitor fraud patterns, sync failures |
| CI/CD | Manual | GitHub Actions + EAS Build (Expo) | Automated builds, OTA updates |
| Secret Management | .env file | AWS Secrets Manager or HashiCorp Vault | Proper server private key management |

---

## 17. React Native App Architecture

### 17.1 Screen Map

```
App Launch
  ├── Onboarding Flow (first launch only)
  │   ├── Welcome Screen
  │   ├── Phone Number Entry
  │   ├── OTP Verification
  │   ├── Display Name Entry
  │   └── Key Generation (background, shows progress)
  │
  └── Main App (authenticated)
      ├── Home Screen
      │   ├── Online Balance (from last sync)
      │   ├── Offline Bond Balance
      │   ├── Recent Transactions List
      │   ├── "Load Bonds" button
      │   ├── "Sync" button (with pending count badge)
      │   └── "Send" / "Receive" buttons
      │
      ├── Send Payment Flow
      │   ├── Scan Receiver QR (camera)
      │   ├── Confirm Payment Screen (bond selection)
      │   └── Payment QR Display Screen (with timer)
      │
      ├── Receive Payment Flow
      │   ├── Amount Entry Screen
      │   ├── Receiver QR Display (with expiry countdown)
      │   └── Scan Sender QR (camera)
      │       └── Payment Result Screen (success/failure)
      │
      ├── Load Bonds Screen
      │   ├── Amount Entry
      │   ├── Denomination Selector
      │   └── Confirmation
      │
      ├── Transaction History Screen
      │   ├── Filter: All / Sent / Received / Pending
      │   └── Transaction Detail Screen
      │         ├── Bond details
      │         ├── Signature verification status
      │         └── Sync status
      │
      └── Settings Screen
          ├── Profile
          ├── Security (view public key, regenerate keys)
          ├── Manual Sync
          └── About / Version
```

### 17.2 Navigation Structure

```javascript
// Root navigator
RootNavigator
  ├── AuthNavigator (Stack)      // When not logged in
  │   └── OnboardingStack
  │
  └── AppNavigator (Tab)         // When logged in
      ├── HomeTab (Stack)
      │   ├── HomeScreen
      │   ├── TransactionDetailScreen
      │   └── LoadBondsScreen
      │
      ├── SendTab (Stack)
      │   ├── ScanReceiverQRScreen
      │   ├── ConfirmPaymentScreen
      │   └── ShowPaymentQRScreen
      │
      ├── ReceiveTab (Stack)
      │   ├── EnterAmountScreen
      │   ├── ShowReceiverQRScreen
      │   └── ScanPaymentQRScreen → PaymentResultScreen
      │
      └── SettingsTab (Stack)
          └── SettingsScreen
```

### 17.3 State Structure (Zustand)

```javascript
// Global store shape
AppStore {
  // User
  user: {
    userId:         string | null,
    displayName:    string | null,
    publicKey:      string | null,
    isAuthenticated: boolean
  },
  
  // Balances
  balance: {
    online:         number,   // In paisa, from last server sync
    offline:        number,   // Sum of available local bonds
    lastSyncedAt:   number | null
  },
  
  // Bonds (loaded from SQLite on app start)
  bonds: {
    available:      BondToken[],
    pendingSync:    BondToken[]
  },
  
  // Transactions
  transactions: {
    recent:         Transaction[],   // Last 50, loaded from SQLite
    pendingSync:    Transaction[]
  },
  
  // Sync state
  sync: {
    isSyncing:      boolean,
    lastError:      string | null,
    pendingCount:   number
  },
  
  // Active payment session
  activePayment: {
    receiverQR:     ReceiverQR | null,
    selectedBonds:  BondToken[],
    paymentQR:      PaymentQR | null
  }
}
```

### 17.4 Key Libraries and Installation

```bash
# Core framework
npx create-expo-app BondPay --template blank-typescript

# Navigation
npm install @react-navigation/native @react-navigation/stack @react-navigation/bottom-tabs
npx expo install react-native-screens react-native-safe-area-context

# State management
npm install zustand

# Database
npx expo install expo-sqlite

# Crypto
npm install @noble/ed25519
npx expo install expo-crypto expo-secure-store

# QR
npm install react-native-qrcode-svg react-native-svg
npx expo install expo-camera

# Networking
npm install axios

# Utilities
npm install date-fns uuid
```

### 17.5 File Structure

```
/BondPay
  /src
    /components
      BondCard.tsx
      QRDisplay.tsx
      QRScanner.tsx
      TransactionItem.tsx
      BalanceCard.tsx
      SyncStatusBadge.tsx
    /screens
      HomeScreen.tsx
      ScanReceiverQRScreen.tsx
      ConfirmPaymentScreen.tsx
      ShowPaymentQRScreen.tsx
      EnterAmountScreen.tsx
      ShowReceiverQRScreen.tsx
      ScanPaymentQRScreen.tsx
      PaymentResultScreen.tsx
      LoadBondsScreen.tsx
      TransactionHistoryScreen.tsx
      TransactionDetailScreen.tsx
      SettingsScreen.tsx
      (auth screens)
    /navigation
      RootNavigator.tsx
      AuthNavigator.tsx
      AppNavigator.tsx
    /store
      useAppStore.ts
      useBalanceStore.ts
    /services
      crypto.service.ts       // Ed25519 signing/verification
      bond.service.ts         // Bond issuance, verification logic
      transaction.service.ts  // Transaction creation, verification
      qr.service.ts           // QR encoding/decoding
      sync.service.ts         // Sync queue management
      api.service.ts          // HTTP client + endpoints
    /database
      schema.ts               // SQLite table definitions
      bonds.db.ts             // Bond CRUD operations
      transactions.db.ts      // Transaction CRUD operations
    /constants
      config.ts               // SERVER_PUBLIC_KEY, API URLs, limits
      algorithms.ts           // Hash functions, constants
    /utils
      validation.ts
      formatting.ts
  App.tsx
  app.json
```

---

## 18. Backend Architecture

### 18.1 File Structure

```
/bondpay-server
  /src
    /routes
      auth.routes.ts
      bonds.routes.ts
      transactions.routes.ts
      users.routes.ts
    /controllers
      auth.controller.ts
      bonds.controller.ts
      transactions.controller.ts
    /services
      crypto.service.ts      // Ed25519 signing with server key
      bond.service.ts        // Bond creation logic
      sync.service.ts        // Sync processing, double-spend detection
      fraud.service.ts       // Fraud scoring and flagging
    /middleware
      auth.middleware.ts     // JWT verification
      rateLimit.middleware.ts
      validate.middleware.ts  // Request schema validation
    /database
      supabase.ts            // Supabase client init
      bonds.repo.ts
      transactions.repo.ts
      users.repo.ts
    /config
      keys.ts                // Server key loading (from env)
      limits.ts              // Floor limits, TTLs, rate limits
  server.ts
  .env                       // Server private key, Supabase URL, JWT secret
```

### 18.2 Database Schema (PostgreSQL / Supabase)

```sql
-- Users
CREATE TABLE users (
  user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number  TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  public_key    TEXT NOT NULL,              -- Base64 Ed25519 public key
  online_balance BIGINT NOT NULL DEFAULT 0, -- In paisa
  is_frozen     BOOLEAN NOT NULL DEFAULT false,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Server-issued bonds (authoritative ledger)
CREATE TABLE issued_bonds (
  bond_id           TEXT PRIMARY KEY,
  value             BIGINT NOT NULL,
  owner_id          UUID NOT NULL REFERENCES users(user_id),
  issued_at         TIMESTAMPTZ NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  server_key_version TEXT NOT NULL,
  server_signature  TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active'
                    -- 'active' | 'redeemed' | 'expired' | 'revoked'
);

CREATE INDEX idx_issued_bonds_owner ON issued_bonds(owner_id);
CREATE INDEX idx_issued_bonds_status ON issued_bonds(status);

-- Redemption ledger (one row per redeemed bond — authoritative double-spend check)
CREATE TABLE bond_redemptions (
  bond_id       TEXT PRIMARY KEY REFERENCES issued_bonds(bond_id),
  tx_id         TEXT NOT NULL,
  redeemed_by   UUID NOT NULL REFERENCES users(user_id),
  redeemed_from UUID NOT NULL REFERENCES users(user_id),
  redeemed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  batch_id      TEXT NOT NULL
);

-- Transactions (server's record)
CREATE TABLE transactions (
  tx_id              TEXT PRIMARY KEY,
  sender_id          UUID NOT NULL REFERENCES users(user_id),
  receiver_id        UUID NOT NULL REFERENCES users(user_id),
  total_amount       BIGINT NOT NULL,
  tx_timestamp       TIMESTAMPTZ NOT NULL,
  nonce              TEXT NOT NULL,
  sender_signature   TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'accepted'
                     -- 'accepted' | 'rejected' | 'flagged'
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fraud flags
CREATE TABLE fraud_flags (
  flag_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(user_id),
  tx_id       TEXT,
  bond_id     TEXT,
  flag_type   TEXT NOT NULL,  -- 'DOUBLE_SPEND' | 'VELOCITY' | 'REVIEW'
  severity    TEXT NOT NULL,  -- 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Sync batch log
CREATE TABLE sync_batches (
  batch_id    TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(user_id),
  submitted_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  result      JSONB
);
```

### 18.3 Environment Variables

```
# .env (NEVER commit to git)
SERVER_ED25519_PRIVATE_KEY=base64_encoded_64_byte_private_key
SERVER_KEY_VERSION=v1.0
JWT_SECRET=256_bit_random_string
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=your_service_key
PORT=3000
NODE_ENV=production
MAX_OFFLINE_BOND_PAISA=500000
BOND_TTL_DAYS=30
MAX_BONDS_PER_REQUEST=50
```

---

## 19. Hackathon MVP Build Plan

### 19.1 What to Build (Must-Have)

| Feature | Screen(s) | Backend Required? |
|---|---|---|
| User registration + OTP | OnboardingStack | Yes (OTP, key storage) |
| Key pair generation | Background on register | No |
| Load bonds (convert balance) | LoadBondsScreen | Yes (/bonds/issue) |
| Display bond balance | HomeScreen | No (reads SQLite) |
| Generate receiver QR | ShowReceiverQRScreen | No |
| Scan receiver QR | ScanReceiverQRScreen | No |
| Confirm and sign payment | ConfirmPaymentScreen | No |
| Display payment QR | ShowPaymentQRScreen | No |
| Scan payment QR + verify | ScanPaymentQRScreen | No |
| Accept payment | PaymentResultScreen | No |
| Transaction history | TransactionHistoryScreen | No (reads SQLite) |
| Sync with server | Background/Manual | Yes (/transactions/sync) |
| Double-spend detection | (server-side) | Yes |

### 19.2 What to Cut (Nice-to-Have, Skip for Hackathon)

| Feature | Why Cut |
|---|---|
| OTP via real SMS | Use a hardcoded OTP (e.g., "123456") for demo |
| Chunked QR for large payloads | Limit to max 3 bonds per transaction |
| Bond TTL expiry warnings | Mention in demo, don't implement |
| Fraud freeze + investigation UI | Mention the protocol, don't build admin panel |
| Background sync | Manual sync button is enough |
| Transaction limits enforcement | State it as a feature, implement one limit |
| Device attestation | Mention as future work |
| SQLite encryption | Use unencrypted SQLite for MVP |

### 19.3 Recommended 48-Hour Timeline

**Hours 0–4: Setup**
- Create Expo project
- Set up navigation skeleton
- Initialize Supabase project + create tables
- Set up Express server + connect to Supabase
- Generate server key pair, hardcode public key in app

**Hours 4–10: Auth + Key Generation**
- Registration screens
- OTP flow (hardcoded for demo)
- Ed25519 key pair generation on device
- Store public key in Supabase
- JWT issuance

**Hours 10–18: Bond Issuance**
- LoadBondsScreen UI
- POST /bonds/issue backend endpoint
- Bond signing on server
- Bond storage in SQLite on device
- HomeScreen balance display

**Hours 18–28: Offline Transaction (The Core)**
- ReceiverQR generation
- QR display screen
- QR scanner screen
- Transaction creation + signing
- PaymentQR generation
- PaymentQR scanning
- Bond + transaction signature verification (offline)
- Local SQLite storage of received bonds
- Payment result screen

**Hours 28–36: Sync**
- POST /transactions/sync backend endpoint
- Client sync service
- Double-spend detection
- Sync result handling in app
- Manual sync button on HomeScreen

**Hours 36–44: Polish + Demo Prep**
- Error states and messages
- Loading indicators
- Transaction history screen
- UI cleanup
- Test the full flow end-to-end on two physical devices
- Prepare offline demo (disable WiFi, run through full payment)

**Hours 44–48: Buffer**
- Bug fixes
- Demo rehearsal
- Prepare answers for judge questions

### 19.4 Demo Script

```
DEMO SETUP:
- Two physical Android phones
- One acts as "Seller" (tea shop)
- One acts as "Buyer" (trekker)
- Demo starts with internet available

STEP 1 (Internet): Show Buyer loading Rs.500 into offline bonds
  → Tap "Load Bonds" → Select Rs.500 → Confirm
  → Show bonds appearing in wallet

STEP 2: Disable WiFi and mobile data on BOTH phones
  → "We're now completely offline"

STEP 3 (Offline): Seller opens "Receive" → Enters Rs.100 → QR appears

STEP 4 (Offline): Buyer scans Seller's QR → Confirms payment → Payment QR appears

STEP 5 (Offline): Seller scans Buyer's QR → Shows "Rs.100 Received" ✅

STEP 6: Re-enable internet on Seller's phone only
  → Tap "Sync" → Show transaction confirmed

STEP 7 (Double-spend demo, if time):
  → Show a SECOND phone attempting to use the same bond
  → Show sync rejection with "DOUBLE_SPEND_DETECTED" error
```

### 19.5 Anticipated Judge Questions + Answers

**Q: What stops someone from spending the same bond twice?**
A: Offline, nothing. That's honest. Each bond is server-signed and cryptographically unique — you can't forge a bond. But you can copy it and present it to two different receivers before syncing. We handle this like EMV chip cards handle offline transactions: accept bounded risk, detect fraud at sync, and compensate affected parties from a fraud reserve. Our floor limit of Rs.10,000 offline per user caps the maximum exposure.

**Q: What if someone modifies the bond value in the JSON before sending the QR?**
A: The server signature covers every field. Change even one character — the signature verification fails instantly on the receiver's device. The bond is rejected before any value transfers.

**Q: What if the receiver's phone is offline and hasn't downloaded the new bond the sender created today?**
A: The receiver doesn't need to have seen the bond before. They only need the server's public key, which is bundled in the app. Every bond carries its own server signature. Verification is purely local — the receiver checks the signature against the hardcoded public key, with zero internet.

**Q: How do you stop someone from extracting the private key off their phone?**
A: The user's private key never exists in app-accessible storage. It lives in the Android Keystore's hardware-backed secure enclave. The app asks the Keystore to "sign this data" and gets back only the signature — never the raw key material.

**Q: Is this really different from just sending money via WhatsApp or NFC?**
A: Yes. WhatsApp requires both parties to be online. NFC payment terminals require online authorization. BondPay requires internet only at bond load time and at sync time — the actual transfer is fully offline, and the transferred value is cryptographically verified without any network call.

---

## 20. Production Roadmap

### 20.1 Phase 1 — Core Stability (Months 1–3)

**Goal:** Make the MVP production-ready for 1,000 real users.

- Replace hardcoded OTP with real SMS gateway (Sparrow SMS for Nepal / Twilio)
- Replace expo-crypto with react-native-quick-crypto (C++ binding, 50x faster)
- Add `KeyInfo.isInsideSecureHardware()` check — warn users on vulnerable devices
- Add SQLCipher database encryption
- Implement bond TTL expiry warnings ("Your bond expires in 3 days — sync soon")
- Add proper rate limiting on all API endpoints
- Add request signing (HMAC) on sync requests to prevent replay on the API level
- Implement idempotent sync (batchId deduplication on server)
- Set up Sentry for error tracking
- Write integration test suite covering full send/receive/sync flow
- Penetration test: hire a third party to attempt: fake bonds, replay attacks, SQLite manipulation
- Set up automated builds with EAS Build (Expo Application Services)
- Launch on Google Play as a closed beta

### 20.2 Phase 2 — Fraud Detection (Months 4–6)

**Goal:** Make double-spend fraud economically unattractive.

- Build fraud scoring engine:
  - Score each account on: sync frequency, transaction velocity, geography anomalies, amount patterns
  - Flag accounts that never sync but keep spending (sign of intentional offline fraud)
- Implement automatic account freeze on double-spend detection
- Build admin review dashboard (web app) for fraud investigation
- Implement fraud restitution protocol (first-in-time receiver gets made whole)
- Add receiver risk warnings for transactions above a configurable threshold (Rs.1,000)
- Implement velocity limits: if a user submits more than N transactions per batch, require manual review
- Add device ID to transaction metadata (detect same device submitting conflicting transactions)
- Enable bond revocation: if fraud confirmed, revoke outstanding bonds from the fraudulent user's account
- Build audit trail: every bond issuance, transfer, and redemption immutably logged in PostgreSQL

### 20.3 Phase 3 — Scale (Months 7–12)

**Goal:** Handle 100,000 users and the concurrency that comes with them.

- Add read replicas to Supabase / PostgreSQL for bond verification queries
- Add Redis caching for frequently-read server public key endpoint
- Implement sync queue with Bull/BullMQ to handle sync batches asynchronously (prevent blocking on large uploads)
- Move bond issuance to an async worker queue (issue bonds in background, notify via push)
- Add Prometheus + Grafana for operational metrics: sync latency, fraud rate, double-spend attempts per hour
- Add push notifications (Expo Notifications) for sync results and fraud alerts
- iOS App Store submission (requires XCode setup, Apple Developer account)
- Load test: simulate 10,000 concurrent sync requests
- Consider horizontal scaling: Express behind a load balancer with sticky sessions

### 20.4 Phase 4 — Regulatory and KYC (Months 12–18)

**Goal:** Become compliant with Nepal Rastra Bank (NRB) regulations for digital payment providers.

- KYC integration: collect government ID, verify via Nagarik App (Nepal's digital identity) or manual verification
- KYC-based limits: unverified users limited to Rs.1,000 offline holdings; verified users up to Rs.10,000
- AML (Anti-Money Laundering): flag large transactions, maintain transaction records for regulatory reporting
- RBI-style transaction limits: align with NRB's digital wallet regulations (currently max Rs.50,000 per wallet)
- Interoperability: implement ConnectIPS or NCHL integration to allow loading from any Nepal bank account
- Partner onboarding: allow registered merchants to accept BondPay with a merchant QR (different from personal QR)
- Merchant dashboard: web portal for merchants to view offline payments received, sync status, daily reconciliation

---

## 21. Known Limitations

These are documented honestly. Each is a real constraint, not a failure of ambition.

**Limitation 1: Double-spending cannot be fully prevented offline.**
This is the fundamental limitation. It is mitigated through floor limits, TTLs, and fraud detection, but not eliminated. See Section 14 for the full treatment.

**Limitation 2: Bond denomination rigidity.**
Bonds are fixed denominations. To pay Rs.150 exactly, you need Rs.100 + Rs.50, not a Rs.200 bond. If the user only has Rs.200 bonds, they either overpay (giving two Rs.100 bonds for a Rs.100 item and hoping for change) or cannot pay. Solution (future): allow "split" bonds — but this requires a more complex multi-step protocol.

**Limitation 3: QR size limits the number of bonds per payment.**
A payment QR can only hold so much data. Practical limit is ~3 bonds per transaction before QR density becomes a scanning problem in variable-light conditions. Mitigated by chunked QR (Section 10.2).

**Limitation 4: Receiver must have the app.**
Unlike physical cash or a bank transfer, the receiver must have BondPay installed. The network effect problem: BondPay is useless until both parties have it.

**Limitation 5: Clock skew dependency.**
Transaction validity checks use device timestamps. If a device's clock is significantly wrong, legitimate transactions may be rejected. Mitigation: tolerate ±5 minutes and warn users with drastically wrong clocks.

**Limitation 6: Bond expiry risk.**
If a user receives bonds in an offline area and stays offline past the bond TTL (30 days), those bonds expire. This is actually desirable (it forces eventual sync and bounds the fraud window), but it means a trekker who stays in the mountains for 31 days loses their bonds. Mitigation: choose TTL conservatively (30 days is generous), add expiry warnings.

**Limitation 7: Server private key is a single point of catastrophic failure.**
If the server's private key is ever compromised, every bond ever issued can be forged. This makes proper key management — stored in a secrets manager, rotated periodically, never in version control — absolutely non-negotiable. Key rotation also requires all existing bonds to be re-issued, which is operationally complex.

**Limitation 8: No change-making.**
Digital cash denominations, unlike physical notes, can't be broken into smaller denominations offline. Rs.500 can't become Rs.200 + Rs.300 without a server round-trip.

---

## 22. Comparison with Existing Systems

| Property | BondPay | Physical Cash | EMV Card | eSewa/Khalti | Cryptocurrency |
|---|---|---|---|---|---|
| Offline payment | ✅ Yes | ✅ Yes | ⚠️ Floor limit only | ❌ No | ❌ No (Lightning: partial) |
| No internet at transaction time | ✅ Yes | ✅ Yes | ⚠️ Limited | ❌ No | ❌ No |
| Transaction record / receipt | ✅ Digital | ❌ None | ✅ Yes | ✅ Yes | ✅ Yes |
| Fraud detection | ✅ Post-sync | ❌ Extremely difficult | ✅ Yes | ✅ Yes | ❌ Difficult |
| Receiver risk | ⚠️ Bounded | ⚠️ Counterfeit risk | ⚠️ Chargebacks possible | ✅ Low | ❌ Irreversible |
| Device-to-device transfer | ✅ QR | ✅ Hand-to-hand | ❌ Requires terminal | ❌ No | ⚠️ Requires app + chain |
| No special hardware needed | ✅ Yes | ✅ Yes | ❌ Requires POS terminal | ✅ Yes | ✅ Yes |
| Works in rural Nepal | ✅ Yes | ✅ Yes | ⚠️ Needs terminal | ❌ No | ❌ No |
| Easy for low-tech users | ✅ (QR UX) | ✅ | ✅ (tap to pay) | ⚠️ Need smartphone | ❌ Very difficult |

BondPay's unique position: it is the only option that provides digital payment records and fraud detection while also working completely offline with commodity smartphones and no special hardware.

---

## 23. Open Research Problems

These are genuine unsolved problems in offline digital cash that BondPay doesn't fully answer. Mentioning them to judges shows awareness of the state of the field.

**Problem 1: Offline double-spend prevention without trusted hardware.**
The fundamental challenge. Solutions include Trusted Execution Environments (TEEs), which exist on most modern smartphones as ARM TrustZone but are difficult to use from application code. Some academic work proposes using TEE-backed spend counters, but cross-platform TEE programming is not yet accessible to typical developers.

**Problem 2: Synchronization conflict resolution in multi-party chains.**
If A pays B offline, and B pays C offline (with the same bonds), and then all three sync — who gets credited? The chain needs to be reconstructed. BondPay's current model assumes one transfer per bond before sync. Multi-hop chains complicate the redemption ledger significantly.

**Problem 3: Bond denomination fragmentation.**
As bonds move through a community offline, the available denominations become unpredictable. Two Rs.50 bonds don't automatically merge into Rs.100. Managing denomination distribution is an operational challenge.

**Problem 4: Revocation propagation.**
If the server discovers a bond is fraudulent and revokes it, how does this propagate offline? Devices that have never synced will still believe the bond is valid. Current solution: TTLs force eventual sync. But revocation before TTL expiry is hard to enforce offline.

**Problem 5: Anonymity vs. accountability.**
BondPay is fully traceable (every transaction linked to phone numbers). This is desirable for fraud prevention but may reduce adoption among users who value financial privacy. Designing a system that is private but still fraud-resistant is an active research area (zero-knowledge proofs are one direction, but currently impractical on mobile hardware for this use case).

---

## 24. Conclusion

BondPay is a technically feasible, architecturally honest solution to a real problem. Its core properties:

**What it solves:** Enables digital payments where digital payments currently can't go — offline, with commodity hardware, using cryptography that has been battle-tested by the world's most security-critical systems.

**What it honestly doesn't solve:** Double-spending before synchronization. This limitation is shared by every offline payment system including EMV chips, and is managed — not eliminated — through bounded exposure and post-sync fraud detection.

**What makes it interesting:** The architecture forces a confrontation with the theoretical limits of offline digital cash. The answer BondPay reaches — bounded risk acceptance with cryptographic authenticity — is the same answer that banks and payment networks have reached independently, and it is the right answer given the current state of mobile hardware.

**For the hackathon:** The story is compelling and the demo is clean. Two phones, no internet, a scan and a confirmation, and Rs.100 moves. That's the pitch. The security architecture supports it. The honest limitations strengthen it.

**For production:** The path is clear. Real SMS, real KYC, encrypted storage, fraud engine, NRB compliance. None of these are research problems — they are engineering problems with known solutions.

BondPay is not a moonshot. It is a careful engineering solution to a well-defined problem. That, in the long run, is what actually gets deployed.

---

*Document version: 1.0 | Last updated: June 2026 | Project: BondPay*

*Stack: React Native + Expo | Node.js + Express | Supabase/PostgreSQL | Ed25519 + SHA-256*