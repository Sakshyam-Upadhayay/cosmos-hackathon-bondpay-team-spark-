> **Note:** For the most up-to-date and accurate documentation, see [new-documentation.md](new-documentation.md)

# BondPay Revamp Implementation Plan

This plan outlines the complete restructuring of the BondPay system based on the new user requirements, integrating the previously established cryptographic security models (offline Ed25519 signed bond tokens) with the requested UX and workflow.

## Goal Description
Revamp the BondPay application to support a robust, offline-capable digital wallet. Users can sign up, log in (session preserved for offline), view comprehensive balances, perform online topups/reversals, and engage in both online and offline sending/receiving flows utilizing a 2-step QR code handshake for offline verification.

## Proposed Changes

### 1. Database & Backend Refactoring
We need to expand the Supabase schema and backend APIs to support the new data points and features.

#### Supabase Schema Adjustments
- **Users Table**: Update to require `full_name`, `phone_number`, `email`, and `password_hash`. Ensure unique constraints on both phone and email.
- **Transactions Table**: Support new types: `topup`, `bond_load`, `bond_reverse`, `send_online`, `receive_online`, `send_offline`, `receive_offline`.

#### Backend API Endpoints
- **Auth APIs**: `/auth/signup` and `/auth/login` supporting phone/email + password.
- **Wallet APIs**: 
  - `/wallet/topup`: Mock endpoint to add online balance.
  - `/wallet/reverse-bond`: Invalidates unused bonds and credits the online balance.
  - `/wallet/transfer-online`: Directly transfer online balances between users.
- **Bond APIs**: `/bonds/issue` (Max limit 3000 NPR).
- **Sync APIs**: Update `/transactions/sync` to handle the new offline transaction schemas.

---

### 2. Frontend Foundation & Auth
- **Auth Flow**: 
  - Signup screen: Full Name, Phone, Email, Password.
  - Login screen: Email/Phone + Password. 
  - **Offline Session**: Persist the JWT and user profile using `expo-secure-store` or `AsyncStorage` so the app skips login if a valid session exists.

---

### 3. Main Navigation & UX Structure
- Implement a Bottom Navigation Bar:
  - **Home**: The central hub for balances, network status, and quick actions.
  - **Account**: Profile management, UUID visibility.
  - **History**: Comprehensive transaction logs with search, sort, and filter (online vs offline, topups, reversals).
  - **Settings**: Theme preferences, app configs.
  - **Support**: Basic static page with info, contact details, and an inquiry form.

---

### 4. Home Screen Implementation
- **Network Status Banner**: Use `expo-network` to detect offline, WiFi, or Cellular states in real-time.
- **Balance Cards**: Display Total Balance, Online Balance, and Offline (Bond) Balance.
- **Action Grid**:
  - **Topup Online Balance**: Opens modal -> Input amount -> Mock success -> Updates online balance. (Requires Internet)
  - **Load Bond Money**: Shows balances -> Input amount (<= Online Balance & <= 3000 NPR) -> Fetches signed bonds from backend -> Updates offline/online balances. (Requires Internet)
  - **Reverse Bond**: Sends all unspent local bonds to the server to invalidate them and credit the online balance, clearing local SQLite bonds. (Requires Internet)
  - **Sync Button**: Shows badge with number of pending offline transactions. Triggers the `/transactions/sync` API. (Requires Internet)
- **Primary Actions**: Massive side-by-side **Send** and **Receive** buttons.

---

### 5. Send & Receive Transaction Flows

#### Send Flow
- **Online (Receiver also online)**: Opens camera -> Scans Receiver's Request QR (mode: 'online') -> Shows requested amount -> Sender confirms/edits -> Submits API call to `/wallet/transfer-online` -> Success screen.
- **Offline / Hybrid**: 
  1. Opens camera -> Scans Receiver's Request QR. 
  2. If the receiver's QR payload has `mode: 'offline'`, the sender **must** use the offline flow, *even if the sender is online*.
  3. Sender confirms/edits -> App selects required offline bonds and signs them.
  4. App generates and displays a **Payment Confirmation QR**.
  5. Sits in "Waiting for Receiver" state until receiver scans it. Logged locally.

#### Receive Flow
- **Online**: 
  1. User inputs requested amount -> Generates Request QR (contains user ID, amount, and `mode: 'online'`).
  2. Waits for push notification / WebSocket event or polls server -> On success, shows Toast and returns to Home.
  3. **Universal Fallback**: A "Verify Payment" button is permanently available to scan offline sender's Payment QR, ensuring online receivers can still accept money from offline senders.
- **Offline**:
  1. User inputs requested amount -> Generates Request QR (contains `mode: 'offline'`).
  2. Receiver shows this to Sender.
  3. UI features a prominent "Verify Payment" button below the QR.
  4. Receiver taps "Verify Payment" -> Opens camera -> Scans Sender's Payment Confirmation QR.
  5. Cryptographically verifies signatures on the bonds and transaction offline.
  6. Saves to local SQLite, showing success. Transaction is queued for Sync.

---

### 6. Supporting Screens
- **History Screen**: Build a unified feed from both online backend history and local SQLite offline history. Add filters (Status: Pending Sync, Completed; Type: Send, Receive, Load, Reverse).
- **Account Screen**: Edit profile fields, show technical UUID.
- **Settings Screen**: Theme toggles (Dark/Light globally applied). Access to Developer Logs.
- **Support Screen**: Basic static page with info, contact details, and a form (UI only or simple email intent).
- **Logs Screen (New)**: Centralized developer logging UI providing color-coded logs (INFO/WARN/ERROR) of background operations and cryptographic signature details. Logs can be copied to the clipboard for support debugging.

## Verification Plan
1. **Auth**: Verify users can register and login with either phone or email, and that restarting the app without internet keeps them logged in.
2. **Network Detection**: Toggle Wi-Fi and mobile data to see the network indicator on the Home screen update correctly.
3. **Wallet Operations**: Topup balance, convert to bonds (respecting the 3000 NPR limit), and reverse bonds back to online balance.
4. **Online Transfer**: Complete a transfer with both devices online.
5. **Offline Transfer**: Turn off internet on both devices. Receiver creates request -> Sender scans and generates confirmation QR -> Receiver scans confirmation QR -> Balances update locally. 
6. **Sync**: Turn internet back on, tap Sync, and verify backend balances align and history updates.

---

### 7. Security & Cryptographic Handshake Audit (Completed)
During the implementation phase, an extensive security audit uncovered severe cryptographic flaws in the original sync logic. The following critical vulnerabilities have been patched:
- **Unverified Sender Signatures**: The backend `syncTransactions` endpoint previously failed to verify the sender's cryptographic signature. The backend now rigorously enforces `CryptoService.verifySignature` against the sender's public key.
- **Unbound Transaction Payloads**: The cryptographic signature on the QR code did not originally include the Bond IDs. This allowed attackers to maliciously swap bonds. Both frontend and backend signature protocols now include `bondIdsString` to strongly bind the bonds to the transaction.
- **Bond Value Forgery**: The backend now strictly validates that `sum(bond.value) == transaction.totalAmount` to prevent forged bond values during sync.
- **Bond Ownership Spoofing**: The backend now queries `issued_bonds` to enforce `owner_id === transaction.senderId`, ensuring users cannot steal and spend bonds belonging to others.
- **Database Consistency**: The backend Postgres schema `transactions` table has been updated to include the `is_offline` flag to match the frontend SQLite schema.
