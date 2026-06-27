> **Note:** For the most up-to-date and accurate documentation, see [new-documentation.md](new-documentation.md)

# Project Name: BondPay
## Subtitle: Offline Bond Based Payment System

In every monetary transaction, there are 2 parties i.e. sender and receiver. Money gets deducted from the sender's account while money gets added to the receiver's account. In normal online banking/digital wallets, the amount of money owned by an individual is stored on the online servers on the cloud and every time any transaction occurs, the balance in the cloud gets modified. In such type of system the one who is sending the money (sender) must be connected to the internet for the transaction to occur. 

**CASE 1:** In Nepal, we have places where we have no internet or cellular connection. In such places people are mostly dependent on hard cash. Tourists who come to Nepal might or might not have cash on them or they have a necessity to carry cash around with them which can be unreliable. Despite having their money on their online wallet, they cant use it. 

**CASE 2:** In Nepal, we don't have free internet everywhere around. Even in huge cities like Kathmandu and Pokhara, the availability of free internet is not reliable and even if it is available, the security issues are really concerning. If we have to pay just Rs.20 for something and we don't have cash on ourselves, we either have to risk our privacy and digital security by using the suspicious Free Internet or use Cellular Internet which in case of our Providers is really expensive. To pay Rs.20 we might even spend 10rs in cellular internet. 

BondPay is our solution for both the cases. In BondPay, once you have some money in your online wallet, you have the option to create an offline bond, which is an offline wallet which works without any internet connection. While you are online, you can allocate a certain amount from your online balance as your offline bond. Once you have loaded your offline bond, you are ready to do transactions offline. 

Now if you have to do any monetary transaction, you can scan the QR code of the receiver which contains the following data:
- Receiver's Unique ID
- timestamp
- amount of money to be received
- other security parameters

And once the sender scans that QR code, they will be shown a confirmation option where we can see to whom are you paying how much and as soon as you press the confirmation button, your bond money will get decreased and a QR code will appear in your screen which contains the following data:
- Sender's Unique ID
- timestamp
- amount of money sent
- Receiver's Unique ID
- other security parameters

And then as you will do the payment, the receiver can scan that new QR code from your mobile which will then increase their bond value by the amount that the sender sent.

Now comes the syncing part. Now as soon as either one of the parties come online, that transaction will be recorded in the online server and the net amount for both the parties will be calculated and verified if any data tampering has been done or not. This syncing method only requires one of the party to get online to sync the transaction to the cloud and the transaction is recorded online. By implementing this system, the sender can not just not come online or uninstall the app because the receiver also can come online to validate the transaction.

This is how our BondPay system works and we can do monetary transaction even without sketchy free internet.


---

# BondPay Project Analysis & Security Report

## 1. Executive Summary
BondPay is an innovative, hybrid online/offline digital payment system built specifically for regions with unreliable internet connectivity. The application allows users to convert online balances into cryptographically secure offline "bond tokens," which act analogously to physical cash. These bonds can be transferred face-to-face via QR codes without active internet. When internet connectivity is restored, the application syncs these offline transactions with a central server to finalize settlement and detect any attempted double-spending.

## 2. Project Architecture & Workflow
The system consists of a **React Native (Expo)** mobile application and a **Node.js/Express** backend utilizing **Supabase (PostgreSQL)** for the database.

### 2.1 Standard Workflow
1. **Registration/Login**: Users register via the mobile app with a phone number or email. The app generates an Ed25519 cryptographic key pair locally. The private key is secured locally, while the public key is registered with the backend.
2. **Loading Bonds (Online)**: A user deducts from their online balance to generate offline bonds. The backend generates unique bonds with specific denominations and signs them using its private key, acting as an unforgeable "watermark."
3. **Offline Payment Flow**:
   - The **Receiver** generates a QR code requesting payment.
   - The **Sender** scans the QR, selects offline bonds matching the amount, and constructs a transaction payload. The payload is hashed (SHA-256) and signed with the sender's local private key. The app displays a Payment QR code.
   - The **Receiver** scans the Payment QR code, verifying the server's signature on the bonds, checking the bond values, and verifying the sender's signature on the transaction offline.
   - The transaction is saved locally to SQLite as `pending_sync`.
4. **Synchronization (Online)**:
   - When either device regains internet, it hits the `/transactions/sync` endpoint, uploading pending transactions.
   - The server comprehensively re-verifies all signatures, checks for double-spends, credits the receiver's balance, and invalidates the bonds.

## 3. Database Architecture
### 3.1 Backend (PostgreSQL via Supabase)
- **`users`**: Stores user profiles, `password_hash` (bcrypt), `public_key` (for verifying sender transactions), and `online_balance`.
- **`issued_bonds`**: Authoritative record of active and spent bonds. Tracks `owner_id` to prevent spending stolen bonds.
- **`transactions`**: The central ledger recording offline P2P transfers.
- **`bond_redemptions`**: Tracks which bonds have been spent, preventing double-spending by associating `bond_id` with `tx_id`.
- **`sync_batches`**: Records sync operations for idempotency.
- **`fraud_flags`**: An audit trail table logging malicious activities, like detected double-spends.

### 3.2 Frontend (SQLite)
- **Local Ledger**: The React Native app utilizes SQLite to store `bonds` and `transactions` to persist offline wallet state and provide a transaction history without an active connection.

## 4. User Interface (UI)
The frontend uses React Native and Expo. Key screens include:
- **Home Screen**: Displays Network Status (Online/Offline) and Balance Cards (Online/Offline/Total). It features massive "Send" and "Receive" buttons to initiate QR code flows.
- **Account & History Screens**: Manages profile, developer logs, and aggregates online/offline history.
- **Camera & QR Views**: The app uses the camera to scan standard Request QRs and high-density JSON payload Payment QRs. 
- **Developer Logs Screen**: An integrated color-coded logging UI tailored for debugging background crypto operations.

## 5. Security Implementation (Deep Dive)
Security is the most critical component of BondPay. Unlike traditional systems that rely entirely on TLS and server validation at runtime, BondPay executes a sophisticated cryptographic handshake entirely offline. Below is an analysis of how security is *actually implemented* in the codebase.

### 5.1 Ed25519 Cryptography & Digital Signatures
The system utilizes Ed25519 elliptic curve cryptography, chosen for its small signature size (64 bytes) which is crucial for embedding within QR codes.
- **Backend Bond Signing (`crypto.service.ts`)**: The backend loads its DER-encoded private key via Node's `crypto` module. When issuing bonds, it creates a SHA-256 hash of `bondId + value + ownerId + issuedAt + expiresAt + issuedByServer` and signs it. This signature guarantees bond authenticity offline.
- **Frontend Transaction Signing (`BondPay/src/services/crypto.service.ts`)**: The mobile app utilizes the `@noble/ed25519` library. During a payment, the app hashes the transaction payload (including `txId`, `bondIds`, `senderId`, `receiverId`, `totalAmount`, `timestamp`, `nonce`) using SHA-256 and signs it.

### 5.2 Key Management & Secure Enclave
- **Backend Keys**: The server private key is loaded from `.env` (`config.serverPrivateKeyBase64`) into memory.
- **Frontend Keys**: The user's private key is stored using `expo-secure-store` (`bondpay_user_private_key`). On modern mobile devices, this is backed by hardware security modules (Android Keystore / iOS Keychain), meaning the private key cannot be extracted by malicious apps or even root users.

### 5.3 Offline Fraud Mitigation (Verification)
The `verifySenderSignature` and `verifyServerBondSignature` methods are invoked by the receiver offline. The receiver mathematically proves that:
1. The server issued the bonds.
2. The sender intended to transfer those specific bonds to this specific receiver.

### 5.4 Backend Sync Defenses (`transactions.controller.ts`)
The true defense against double-spending and forgery happens during the sync phase. The `syncTransactions` controller implements several rigorous checks:
- **Value Forgery Check**: `totalBondValue !== transaction.totalAmount`. This ensures a malicious user doesn't alter the stated value of the transaction versus the actual bonds provided.
- **Strong Binding**: The signature payload string includes `${bondIdsString}`. This prevents an attacker from swapping bonds out of an already-signed transaction.
- **Sender Validation**: The backend fetches the sender's public key from the database and re-verifies the transaction signature (`CryptoService.verifySignature`).
- **Bond Authenticity Check**: The backend re-verifies its own server signature on the bond to prevent fabricated tokens.
- **Ownership Check**: The backend queries `issued_bonds` to verify `owner_id === transaction.senderId`. This stops users from stealing and spending another user's valid offline bonds.
- **Double-Spend Detection**: The backend checks the `bond_redemptions` table. If the `bond_id` exists, the transaction is rejected, and a `DOUBLE_SPEND` flag is aggressively logged into the `fraud_flags` table with `HIGH` severity.

### 5.5 Authentication & Web Security
- **JWT Authorization**: All online APIs (Topup, Issue Bonds, Sync) are protected by a JWT bearer token generated in `auth.controller.ts` with a 30-day expiration, providing a persistent session.
- **Password Hashing**: User passwords are not stored in plaintext. They are hashed using `bcrypt` with a work factor of 10 (`bcrypt.hash(password, 10)`).
- **Replay Protection**: The `crypto.service.ts` generates a 16-byte random hex `nonce` for every transaction. Because the transaction ID is a SHA-256 hash containing this `nonce` and the `timestamp`, an attacker cannot intercept a QR code and replay it to drain funds multiple times.

## Conclusion
BondPay implements a robust, mathematically sound offline transaction model. By leveraging Ed25519 signatures, secure hardware storage for keys, and a strict server-side reconciliation protocol upon synchronization, it successfully mitigates offline spoofing and handles double-spending through post-facto fraud detection, exactly as designed in its architecture plan.

---

# BondPay: Exhaustive Architecture, Security, and Implementation Analysis Report

## 1. Comprehensive Executive Summary

BondPay represents a paradigm shift in decentralized, offline-first digital payment systems, meticulously engineered to solve the persistent challenge of conducting verifiable monetary transactions in environments lacking internet connectivity. Designed primarily for regions with intermittent or absent network infrastructure—such as rural trekking routes in Nepal or geographically isolated vendor locations—BondPay bypasses the requirement for real-time synchronization with a centralized ledger. Instead, it implements a highly sophisticated cryptographic handshake utilizing Ed25519 digital signatures to mathematically guarantee transaction authenticity offline, deferring settlement to an asynchronous synchronization phase.

This document serves as an exhaustive, line-by-line, architectural deep dive into the BondPay ecosystem. It scrutinizes the mathematical foundations of its cryptographic token model, the granular implementation of its React Native (Expo) frontend, the robust Node.js/Express backend, the intricate Supabase (PostgreSQL) and SQLite database schemas, and the precise state machine that governs the lifecycle of a digital "bond." Furthermore, it rigorously analyzes the threat model, specifically detailing how the system actively mitigates forgery, double-spending, replay attacks, and ownership spoofing.

---

## 2. Original Vision and Workflow Mapping

The architecture and implementation of BondPay rigorously follow the original UX workflow specifications defined for the project. Below is a detailed mapping of the requested user journey to its concrete technical implementation:

### 2.1 Authentication and Persistent Sessions
- **Vision**: Users sign up with phone/email, full name, and password (online only). Login sessions must persist so the app remains usable offline.
- **Implementation**: Handled by `bondpay-server/src/controllers/auth.controller.ts` (Signup/Login endpoints). The server issues a 30-day JWT. Crucially, the frontend React Native app saves this JWT and the user profile to local storage. On subsequent launches without internet, the app detects the cached session and bypasses the login screen, allowing full access to offline features.

### 2.2 The Dashboard and Navigation
- **Vision**: The Home page displays Total, Online, and Offline balances alongside real-time network status (Wi-Fi/Mobile Data/Offline). A bottom navigation bar provides access to Home, Account, History, and Settings.
- **Implementation**: 
  - `HomeScreen.tsx` utilizes `expo-network` to continuously poll and render the device's exact connectivity state. It pulls cached balances from the local SQLite database and Zustand store (`useAppStore.ts`).
  - `RootNavigator.tsx` implements the bottom tab navigation. 
  - `AccountScreen.tsx` surfaces the user's cryptographic UUID and profile edit forms.
  - `TransactionHistoryScreen.tsx` aggregates a unified ledger by fetching remote PostgreSQL history and merging it with local SQLite `pending_sync` records, supporting full sorting and filtering.
  - `SettingsScreen.tsx` manages theme toggles and developer configurations.

### 2.3 Core Financial Operations (Home Screen Actions)
The home screen exposes four primary buttons, all strictly requiring active internet connectivity as they interact with the central ledger:
- **Topup Online Balance**: Implemented via `wallet.controller.ts` (`/wallet/topup`), allowing users to inject fiat into their online PostgreSQL ledger.
- **Load Bond Money**: Handled by `bonds.controller.ts` (`/bonds/issue`). Implements the strict velocity limit (max 3000 NPR). The server mathematically divides the requested amount into signed Ed25519 tokens, assigns ownership to the user's UUID, and deducts the online balance. The app saves these to the SQLite `bonds` table.
- **Sync Button**: Triggers `SyncService.sync()`. It uploads all locally cached transactions to the server for double-spend verification and cryptographic settlement.
- **Reverse Bond**: Implemented via `wallet.controller.ts` (`/wallet/reverse-bond`). Finds all unused, active bonds in the user's local database, invalidates them on the server (`status = 'revoked'`), and credits the sum back to the user's `online_balance`.

### 2.4 The Send and Receive Flows
The massive Send and Receive buttons dynamically alter their behavior based on the `expo-network` state.

- **Send (Online)**: Opens the camera, scans the receiver's QR, and immediately calls the `/wallet/transfer-online` API. The server performs an atomic PostgreSQL transaction moving the `online_balance`.
- **Send (Offline)**: Opens the camera, parses the request QR, and algorithmically selects available local bonds totaling the requested amount. It constructs a massive payload, signs it with the user's hardware-backed private key (`CryptoService.signTransaction`), and renders a "Payment Confirmation QR" for the receiver to scan.
- **Receive (Online)**: The user inputs an amount, generating a standard Request QR. Upon the sender scanning and paying online, the app receives confirmation and displays a toast notification.
- **Receive (Offline)**: Generates an offline Request QR. Below the QR is a prominent "Verify Payment" button. Once the sender generates their Confirmation QR, the receiver taps "Verify Payment," opening the camera to scan it. The app mathematically verifies the server's signature on the bonds and the sender's signature on the transaction completely offline. If valid, it records the payment in SQLite as `pending_sync`.

### 2.5 Support and Logging
- **Vision**: A Support page for contact details and an inquiry form.
- **Implementation**: Handled by `SupportScreen.tsx`. Additionally, the developers introduced `LogsScreen.tsx` to surface color-coded (INFO/WARN/ERROR) traces from the underlying cryptographic engine, aiding in real-time debugging of the dual QR handshake.

---

## 3. The Core Problem Statement and the BondPay Proposition

### 3.1 The Limitations of Traditional E-Wallets
Traditional digital wallets (e.g., Apple Pay, Google Pay, eSewa, Khalti) operate on an account-based ledger model. In an account-based system, the "truth" of a user's balance exists exclusively on a centralized server. When Alice wishes to pay Bob, her device must contact the server, the server deducts from Alice's ledger entry, credits Bob's ledger entry, and confirms the transaction. This architecture inherently demands real-time, synchronous internet connectivity. If Alice is offline, she cannot prove she has the funds, nor can the server authorize the deduction. 

### 3.2 The Offline Context
In remote regions, mobile data is either unavailable, prohibitively expensive, or highly unreliable. Even in urban environments, public Wi-Fi is scarce. When connectivity drops, traditional digital wallets cease to function, forcing users to revert to physical cash. Physical cash, however, is prone to theft, lacks an audit trail, and requires physical logistics to distribute and manage.

### 3.3 The BondPay Paradigm: Digital Banknotes
BondPay solves this by shifting from an account-based model to a token-based model for offline transactions. Rather than viewing a balance as a single mutable integer on a server, BondPay allows users to "mint" discrete, cryptographically secured tokens—referred to as "Bonds." 

A BondPay "Bond" is mathematically analogous to a physical banknote. 
- It has a fixed denomination (e.g., 100, 500, 1000).
- It possesses a unique serial number (`bond_id`).
- It carries unforgeable security features (a server-generated Ed25519 digital signature).
- It can be physically handed from person to person (via QR code transmission).

By treating money as discrete, signed cryptographic objects, BondPay allows devices to mathematically verify the authenticity of the funds without ever contacting the server.

---

## 4. Mathematical and Cryptographic Foundations

The absolute core of BondPay's security relies on modern, elliptic-curve cryptography. Unlike systems that rely on symmetric secrets or purely TLS-based transport security, BondPay implements an application-layer cryptographic protocol.

### 4.1 Why Ed25519?
The system explicitly selected **Ed25519** (Edwards-curve Digital Signature Algorithm) over older standards like RSA or ECDSA (Elliptic Curve Digital Signature Algorithm). This decision, documented in the architecture, is driven by the strict constraints of offline QR code transfers.
- **Signature Size**: Ed25519 produces a deterministic 64-byte signature. RSA-2048 produces a 256-byte signature. In a system where multiple bonds must be serialized into a single QR code payload, a 256-byte overhead per token would render the QR code too dense to scan reliably with a low-end smartphone camera.
- **Performance**: Ed25519 is exceptionally fast for both signing and verification, crucial for battery-constrained mobile devices running React Native JavaScript threads.
- **Side-Channel Resistance**: Ed25519 is designed to be immune to timing attacks, whereas ECDSA requires perfect random number generation per signature to avoid catastrophic private key leakage.

### 4.2 The Dual Key-Pair Architecture
BondPay employs two distinct sets of cryptographic key pairs to secure the network.

#### 4.2.1 The Server Key Pair
The Node.js backend maintains a singular, highly guarded Ed25519 key pair.
- **Private Key**: Loaded into memory via `config.serverPrivateKeyBase64`. This key never leaves the server environment. It is utilized exclusively within `bondpay-server/src/services/crypto.service.ts` to execute `crypto.sign()`.
- **Public Key**: The server's public key is widely distributed and hardcoded into the mobile application (`ED25519_PUBLIC_DER_PREFIX`). 
- **Purpose**: The server uses its private key to sign bonds during issuance. Any mobile device can use the public key to instantly verify that a bond is a genuine construct of the BondPay server.

#### 4.2.2 The User Key Pairs
Every individual user device generates its own distinct Ed25519 key pair.
- **Generation**: Triggered in `BondPay/src/services/crypto.service.ts` via `Crypto.getRandomBytesAsync(32)`. 
- **Private Key Storage**: The raw private key bytes are stored exclusively in `expo-secure-store` under the alias `bondpay_user_private_key`. This utilizes the hardware-backed secure enclave (Android Keystore / Apple Secure Enclave). The private key cannot be extracted, even on rooted devices.
- **Public Key Distribution**: The user's public key is transmitted to the server during the `/auth/signup` process and stored in the `users` PostgreSQL table.
- **Purpose**: When a user initiates a payment, their device uses the local private key to sign the transaction payload. This proves non-repudiation; only the genuine owner of the device could have authorized the transfer.

### 4.3 Hashing and Payload Binding
Before any data is signed, it is rigorously hashed using **SHA-256**.
Hashing serves two purposes:
1. It reduces an arbitrary-length payload (like a JSON transaction object) into a fixed 32-byte digest, which the Ed25519 algorithm then signs.
2. It prevents length-extension attacks.

In `bondpay-server/src/services/crypto.service.ts`:
```typescript
const dataHash = crypto.createHash('sha256').update(dataString, 'utf8').digest();
const signature = crypto.sign(null, dataHash, this.privateKey);
```

In `BondPay/src/services/crypto.service.ts`:
```typescript
const dataHash = sha256(new TextEncoder().encode(dataString));
const signature = await signAsync(dataHash, privKey);
```

---

## 5. Backend Architecture: Node.js, Express, and PostgreSQL

The server acts as the central authority. While it is not involved during an offline payment, it dictates the rules of issuance and settlement.

### 5.1 Database Schema (Supabase/PostgreSQL)
The backend leverages PostgreSQL, relying heavily on ACID transactions to prevent race conditions during balance updates. The `bondpay-server/src/database/schema.sql` defines the critical tables:

1. **`users` Table**:
   - `user_id`: UUID (Primary Key).
   - `phone_number` / `email`: Unique constraints for login.
   - `password_hash`: Bcrypt hashed passwords.
   - `public_key`: The user's Ed25519 public key.
   - `online_balance`: An integer representing the user's synchronous fiat balance, stored in minimum denominations (paisa) to avoid floating-point arithmetic errors.

2. **`issued_bonds` Table (The Authoritative Ledger)**:
   - `bond_id`: Unique identifier (e.g., `BOND-uuid`).
   - `value`: Denomination.
   - `owner_id`: A foreign key linking to `users.user_id`. This is critical. By tracking the `owner_id` on the server, the system inherently prevents "bond theft." If Alice steals Bob's offline bond payload, Alice cannot sync it because the server knows Bob owns it.
   - `server_signature`: The cryptographic proof.
   - `status`: Transitions from `active` to `redeemed` or `revoked`.

3. **`transactions` Table**:
   - The central log of all movements, including `TOPUP`, `BOND_LOAD`, `P2P_ONLINE`, and the critical `P2P_OFFLINE` syncs.
   - Records the `sender_signature` and `nonce` for auditability.

4. **`bond_redemptions` Table (Double-Spend Defense)**:
   - Contains a strictly enforced constraint where `bond_id` is the Primary Key. 
   - When a bond is synced, a row is inserted here. If an attacker attempts to sync the same bond twice (a double-spend), the database throws a unique constraint violation, blocking the transaction.

5. **`fraud_flags` Table**:
   - Acts as an immutable audit log. If a double-spend or signature forgery is detected during sync, it is recorded here with a `severity` rating (e.g., `HIGH`).

### 5.2 The Controllers and Business Logic

#### 5.2.1 `auth.controller.ts`
Manages user onboarding. Passwords are securely hashed using `bcrypt.hash(password, 10)` before insertion. The authentication state is managed via JSON Web Tokens (JWT) signed with a secure `jwtSecret`. The JWT encapsulates the `userId` and maintains a 30-day session, allowing users to remain logged in while offline.

#### 5.2.2 `wallet.controller.ts`
Handles traditional synchronous ledger operations.
- `topup`: Increments the user's `online_balance`.
- `transferOnline`: Directly shifts balances between users using PostgreSQL `FOR UPDATE` row locks to prevent race conditions during concurrent transfers.
- `reverseBonds`: Allows users to convert unused, active offline bonds back into an online balance. It explicitly checks that `bond.status === 'active'` and `bond.owner_id === userId` before revoking the bond and crediting the user.

#### 5.2.3 `bonds.controller.ts` - The Issuance Protocol
The `issueBonds` function is where fiat becomes cryptographic tokens.
1. Validates the requested denominations (10, 20, 50, 100, etc.).
2. Enforces a strict velocity limit (e.g., maximum 3000 NPR load).
3. Verifies the user has sufficient `online_balance`.
4. Executes a cryptographic loop. For each required bond, it constructs a unique string: `${bond.bondId}${bond.value}${bond.ownerId}${bond.issuedAt}${bond.expiresAt}${bond.issuedByServer}`.
5. It passes this string to `CryptoService.signBond()`, which hashes and signs it.
6. Under a strict PostgreSQL transaction (`BEGIN` ... `COMMIT`), it deducts the `online_balance` and inserts the newly minted, fully signed bonds into `issued_bonds`.

#### 5.2.4 `transactions.controller.ts` - The Settlement Engine
The `syncTransactions` function is the most complex and critical security checkpoint in the entire codebase. When devices reconnect to the internet, they submit arrays of offline transactions here. The server trusts absolutely nothing. It re-validates the entire cryptographic chain:
1. **Bond Value Validation**: It iterates over the submitted bonds and ensures `sum(bonds.value) === transaction.totalAmount`. This mathematically prevents a sender from modifying the transaction total to appear larger than the underlying bonds.
2. **Sender Signature Verification**: It queries the sender's registered `public_key`. It reconstructs the transaction data payload exactly as it was constructed on the device: `${transaction.txId}${transaction.senderId}${userId}${transaction.totalAmount}${transaction.timestamp}${transaction.nonce}${bondIdsString}`. Notice the inclusion of `bondIdsString`. This strongly binds the specific bonds to the signature, preventing bond-swapping attacks. It then runs `CryptoService.verifySignature()`.
3. **Bond Authenticity & Ownership**: For every single bond, it re-verifies its own server signature to prevent counterfeit tokens. It then queries `issued_bonds` to verify that `owner_id === transaction.senderId`.
4. **Double-Spend Check**: It queries `bond_redemptions`. If the bond exists, the loop halts, rejects the transaction, and writes to `fraud_flags`.
5. **Atomic Settlement**: If all cryptographic proofs hold, the server atomically marks the bonds as redeemed, inserts the transaction log, and increments the receiver's `online_balance`.

---

## 6. Frontend Architecture: React Native & SQLite

The mobile app is built with React Native and Expo, architected to function entirely independently of the backend once bonds are loaded.

### 6.1 Local Storage (SQLite)
The app maintains its own ledger using `expo-sqlite`, defined in `BondPay/src/database/db.ts`.
- **`bonds` Table**: Stores the cryptographic objects. Fields include `bond_id`, `value`, `server_signature`, and a critical `status` column (`available`, `spent`, `received_pending_sync`). 
- **`transactions` Table**: Stores the localized transaction history with a `sync_status` (`pending`, `synced`, `failed`).
- **`transaction_bonds` Table**: A junction table linking bonds to transactions.

### 6.2 State Management
The application utilizes Zustand (`useAppStore.ts` and `useLogStore.ts`) for global state management.
- `useAppStore` maintains the JWT, user profile, and cached balances.
- `useLogStore` is a specialized developer tool that captures granular cryptographic events (hashing processes, signature successes/failures) and renders them in the UI for deep debugging of the offline handshake.

### 6.3 The User Interface and Navigation Flow
The UX is designed around a bottom tab navigator (`RootNavigator.tsx`), providing access to:
1. **Home Screen (`HomeScreen.tsx`)**: The central dashboard. It leverages `expo-network` to continuously poll network availability, dynamically updating UI indicators. It displays the split balances (Online vs. Offline) and features massive, accessible "Send" and "Receive" buttons.
2. **Send Screen (`SendScreen.tsx`)**: Controls the camera using `expo-camera`. It is responsible for scanning the receiver's QR code.
3. **Receive Screen (`ReceiveScreen.tsx`)**: Generates the initial request QR code utilizing `react-native-qrcode-svg`.
4. **History Screen (`TransactionHistoryScreen.tsx`)**: Merges the backend online history API data with the local SQLite offline history data to present a unified ledger to the user.
5. **Logs Screen (`LogsScreen.tsx`)**: Surfaces the `useLogStore` data, color-coding INFO, WARN, and ERROR traces from the `CryptoService`.

### 6.4 The Offline Payment Protocol (The Dual QR Handshake)
Because devices cannot communicate directly via IP over the internet, BondPay establishes an asynchronous data transport layer using optical QR codes. This requires a two-step handshake.

#### Phase 1: The Request
1. The **Receiver** opens the app and enters an amount (e.g., 500 NPR).
2. The `ReceiveScreen` generates a JSON payload containing: `{ receiverId: "uuid", amount: 500, nonce: "random123", type: "BONDPAY_REQUEST" }`.
3. This payload is encoded into a high-density QR code and displayed on the Receiver's screen.

#### Phase 2: The Proof of Payment
1. The **Sender** opens the `SendScreen` and scans the Receiver's QR code.
2. The Sender's app parses the JSON and queries its local SQLite database: `SELECT * FROM bonds WHERE status = 'available'`.
3. It algorithmically selects a subset of bonds that sum perfectly to the requested amount (500 NPR).
4. The Sender's app generates a unique `nonce` using `Crypto.getRandomBytes()`.
5. It computes the `txId` by hashing the combined metadata.
6. It invokes `CryptoService.signTransaction()`, which accesses the hardware Keystore, hashes the payload (crucially including the serialized `bondIds`), and signs it.
7. The local bonds are optimistically updated to `status = 'spent'` in SQLite.
8. The Sender's app constructs a massive Payment Payload containing the full `Transaction` object (with signatures) and the full array of `BondToken` objects (with server signatures).
9. This data is rendered as a complex QR code on the Sender's screen.

#### Phase 3: The Verification
1. The **Receiver** taps "Verify Payment" and scans the Sender's massive Payment QR code.
2. The Receiver's app breaks down the payload.
3. **Offline Verification Step 1**: It iterates over every bond and calls `verifyServerBondSignature()`, checking the server's public key against the bond data. If an attacker tried to fake a 500 NPR bond, the mathematics of Ed25519 guarantee that this function will return `false`.
4. **Offline Verification Step 2**: It verifies that the sum of the bonds equals the transaction total.
5. **Offline Verification Step 3**: It reconstructs the transaction hash and calls `verifySenderSignature()`, utilizing the Sender's public key (included in the payload). This proves the sender explicitly authorized the transfer of *these specific bonds* to *this specific receiver*.
6. If all checks pass, the Receiver's app inserts the transaction and bonds into its local SQLite database with `sync_status = 'pending'`. The UI glows green. The offline transaction is final.

### 6.5 Synchronization (`sync.service.ts`)
The `SyncService` operates aggressively in the background. When `expo-network` detects internet connectivity, it triggers `SyncService.sync()`.
1. It queries SQLite for all `pending` transactions.
2. It joins the `transactions` table with the `bonds` table to reconstruct the exact payloads.
3. It bundles everything into a `SyncBatch` and POSTs it to `/transactions/sync`.
4. It awaits the server's response (`accepted`, `rejected`, `flagged`).
5. Based on the response, it executes a local SQLite transaction. Accepted transactions update to `synced`, and the underlying spent bonds are violently `DELETE`d from the local database to free up storage. Failed or flagged transactions are updated to reflect their errors.
6. Finally, it fetches the fresh authoritative online balance and active bond list from the server to guarantee consistency.

---

## 7. Comprehensive Threat Model and Security Matrix

BondPay explicitly accepts that operating offline introduces vectors that cannot exist in purely online systems. The system is designed not to eliminate these vectors magically, but to cryptographically restrict them and defer punishment.

### 7.1 Attack Vector: Counterfeit Bonds (The "Printing Press" Attack)
- **Scenario**: A malicious user writes a script to generate JSON objects that look exactly like bonds, assigning them values of 1,000,000 NPR, and attempts to spend them via QR code.
- **Mitigation**: The Receiver's device possesses the hardcoded Ed25519 Server Public Key. During the QR scan phase, the Receiver's device hashes the fake bond data and verifies the signature. Because the attacker does not possess the Server Private Key, the `verifyServerBondSignature()` function will universally fail. The receiver's app immediately rejects the QR code. The attack is thwarted offline.

### 7.2 Attack Vector: Bond Tampering (The "Zero-Adding" Attack)
- **Scenario**: A user possesses a valid 10 NPR bond. They modify the local SQLite database to change the `value` field from 10 to 10,000. They then attempt to send this bond.
- **Mitigation**: The server's signature was generated over the hash of the original data (`bondId + 10 + ownerId...`). By changing the value to 10000, the underlying hash changes completely. When the receiver verifies the signature against the altered data, the signature is mathematically invalid. The attack is thwarted offline.

### 7.3 Attack Vector: Transaction Forgery
- **Scenario**: An attacker intercepts a transaction payload and attempts to change the `receiverId` to themselves.
- **Mitigation**: The transaction payload is hashed and signed by the Sender's Private Key. Any modification to the `receiverId` invalidates the signature. The server (and the offline receiver) will drop the transaction due to an `INVALID_SENDER_SIGNATURE` error.

### 7.4 Attack Vector: Bond Swapping
- **Scenario**: An attacker captures a valid transaction signature, but swaps out the attached 10 NPR bonds with previously spent 100 NPR bonds.
- **Mitigation**: Both the frontend and backend signature generation functions explicitly include `bondIdsString` (a concatenated list of the specific bonds involved) inside the hashing payload. Therefore, the Sender's signature is inexorably bound to the exact bonds provided. Swapping bonds invalidates the transaction signature.

### 7.5 Attack Vector: Replay Attacks
- **Scenario**: Alice pays Bob 500 NPR. Bob saves a screenshot of the QR code. The next day, Bob attempts to scan the exact same QR code into his app to force Alice to pay him another 500 NPR.
- **Mitigation**: The transaction ID is a SHA-256 hash that includes a randomly generated 128-bit `nonce` and a `timestamp`. 
  - Locally: The Receiver's app enforces unique constraint checks on `tx_id`. It will recognize it has already processed this transaction.
  - Remotely: The server's `bond_redemptions` table enforces a unique constraint on `bond_id`. Even if the local device was bypassed, the server would flag this as a double-spend of the same bonds.

### 7.6 Attack Vector: Bond Theft and Spoofing
- **Scenario**: Eve steals Alice's phone, extracts the SQLite database containing active bonds, transfers them to her own phone, and attempts to spend them.
- **Mitigation**: Every bond is structurally bound to its `owner_id` at the time of issuance by the server. When Eve attempts to send Alice's bonds, Eve's app must sign the transaction with Eve's private key. During server sync, the backend queries the `issued_bonds` table, retrieves the bond, and checks `if (bond.owner_id !== transaction.senderId)`. Since the bond belongs to Alice but was sent by Eve, the server rejects it with a `BOND_OWNERSHIP_MISMATCH` error. The bonds cannot be spent by anyone other than the entity who minted them.

### 7.7 Attack Vector: The True Double-Spend
- **Scenario**: This is the fundamental vulnerability of offline systems. Alice possesses a valid 500 NPR bond. She turns on airplane mode. She buys coffee from Bob using the bond. Bob is offline. She then runs to Charlie's shop, still in airplane mode. Because the central server is unaware of the transaction with Bob, Alice's phone allows her to generate a second, perfectly valid transaction for the *same* 500 NPR bond and give it to Charlie.
- **Mitigation (The Honest Tradeoff)**: Cryptography cannot solve physical relativity. Because neither Bob nor Charlie can query the central ledger, both will mathematically verify the bond and accept the payment. 
- **The Resolution**: This is where the BondPay `syncTransactions` controller and the `bond_redemptions` table activate. 
  - When Bob connects to the internet, his app syncs the transaction. The server verifies it and credits Bob 500 NPR. The bond is marked as redeemed.
  - When Charlie subsequently connects to the internet, his app attempts to sync. The server detects that the `bond_id` already exists in `bond_redemptions`. The server rejects Charlie's transaction. 
  - The server immediately writes to the `fraud_flags` table, assigning Alice a `CRITICAL` severity `DOUBLE_SPEND` violation. 
- **System Design Principle**: BondPay manages this not through prevention, but through strict velocity limits (e.g., users can only load 3000 NPR at a time) and post-facto punishment (suspending accounts, KYC enforcement, legal recourse). This mirrors the real-world operational security of EMV Credit Card offline floor limits. The system assumes a bounded, acceptable level of localized fraud window in exchange for the massive utility of offline operability.

---

## 8. Advanced Protocol Intricacies

### 8.1 Idempotency in Synchronization
Network connections in remote areas are prone to dropping mid-request. If a mobile device sends a sync payload and the connection dies before receiving the HTTP 200 OK, the device will assume failure and retry later. If the server processed the first request, the retry would look like a double-spend.
To prevent this, the `SyncService` generates a unique `batchId`. The backend `transactions.controller.ts` intercepts requests and queries:
```typescript
const batchCheck = await query('SELECT result FROM sync_batches WHERE batch_id = $1', [batchId]);
if (batchCheck.rows.length > 0) {
  res.status(200).json(batchCheck.rows[0].result);
  return;
}
```
This guarantees strict idempotency. If the server already processed the batch, it simply returns the cached JSON result without altering the database state.

### 8.2 Database Race Conditions and Concurrency
In the `wallet.controller.ts`, handling standard synchronous transfers (`transferOnline`), multiple rapid requests could theoretically exploit Time-Of-Check to Time-Of-Use (TOCTOU) bugs to spend funds faster than the database updates. 
BondPay mitigates this using standard PostgreSQL pessimistic locking:
```typescript
const senderRes = await query('SELECT online_balance FROM users WHERE user_id = $1 FOR UPDATE', [senderId]);
```
The `FOR UPDATE` clause explicitly locks the row during the `BEGIN ... COMMIT` transaction window, forcing concurrent requests for the same user to queue sequentially, mathematically guaranteeing ledger integrity.

---

## 9. Conclusion

The BondPay architecture is a masterclass in applying localized, asymmetric cryptography to solve real-world infrastructure deficits. By shifting the paradigm from centralized account mutability to decentralized cryptographic token transfer, it achieves the seemingly impossible: mathematically provable, secure, offline financial transactions.

Every line of the implementation—from the `expo-secure-store` Keystore integration to the SHA-256 payload binding, to the robust PostgreSQL ACID transaction handlers—demonstrates a rigorous adherence to the initial design document (`plan.md` and `project-details.md`). The system acknowledges the fundamental reality of the double-spend problem in disconnected environments and constructs a sophisticated, automated backend detection and flagging mechanism to enforce accountability post-sync. 
