# BondPay — Complete Technical Documentation

> **Last updated:** June 21, 2026  
> **Version:** 1.0.0  
> **Status:** Hackathon MVP (NCIT TechFest 3.0)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Database Schema](#4-database-schema)
5. [Authentication System](#5-authentication-system)
6. [Cryptography — Ed25519 Digital Signatures](#6-cryptography)
7. [Balance Model & Cash Flow](#7-balance-model--cash-flow)
8. [Transaction Modes — Complete Cash Flow](#8-transaction-modes)
9. [Bond Issuance & Denomination Algorithm](#9-bond-issuance--denomination-algorithm)
10. [Offline Transaction Flow — Step by Step](#10-offline-transaction-flow)
11. [Synchronization Protocol](#11-synchronization-protocol)
12. [Multi-QR Protocol](#12-multi-qr-protocol)
13. [API Reference — All Endpoints](#13-api-reference)
14. [Frontend Services](#14-frontend-services)
15. [Security Model & Threat Analysis](#15-security-model)
16. [System Configuration](#16-system-configuration)
17. [Admin Console](#17-admin-console)
18. [BondPay Terminal (ESP8266)](#18-bondpay-terminal)
19. [Known Limitations](#19-known-limitations)
20. [Deployment](#20-deployment)

---

## 1. System Overview

BondPay is an **offline-capable financial platform** designed for areas with unreliable internet connectivity. It enables peer-to-peer payments using cryptographically signed digital bonds that can be transferred via QR codes without an internet connection.

### Core Problem

In Nepal, approximately 35% of rural communities lack reliable internet access. Traditional digital payment systems require constant connectivity, making them unusable in these areas. BondPay solves this by allowing users to "load" their online balance into portable digital bonds that work offline.

### Core Concept — Digital Bonds

A **bond** is a digitally signed token representing a specific monetary value. Think of it like a digital banknote:

- The **server** acts as the central bank, issuing and signing bonds
- A bond carries its value cryptographically — it cannot be forged
- Bonds can be transferred offline between users by scanning QR codes
- When any party comes online, bonds are redeemed and settled against the server ledger
- Double-spending is detected during settlement via a redemption ledger

### Payment Modes

BondPay supports 4 transaction modes based on sender/receiver connectivity:

| Mode | Sender | Receiver | Mechanism |
|------|--------|----------|-----------|
| **Mode 1** | Online | Online | Instant server transfer |
| **Mode 2** | Online | Offline | Pending pickup with QR code |
| **Mode 3** | Offline | Online | Bond transfer → immediate sync |
| **Mode 4** | Offline | Offline | Bond transfer → deferred sync |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    BondPay System                        │
│                                                         │
│  ┌──────────────┐    REST API    ┌──────────────────┐  │
│  │  React Native │◄────────────►│  Express.js API   │  │
│  │  (Expo)      │               │  Server           │  │
│  │  Mobile App  │               │  (Node.js)        │  │
│  └──────┬───────┘               └────────┬─────────┘  │
│         │                                │              │
│         │ SQLite                         │ pg (Pool)    │
│         │ (Local)                        │              │
│  ┌──────▼───────┐               ┌────────▼─────────┐  │
│  │  bonds       │               │  PostgreSQL       │  │
│  │  transactions│               │  (Supabase)       │  │
│  │  txn_bonds   │               │                   │  │
│  └──────────────┘               │  users            │  │
│                                 │  issued_bonds     │  │
│  ┌──────────────┐               │  pending_pickups  │  │
│  │  Ed25519     │               │  bond_redemptions │  │
│  │  Key Pair    │               │  transactions     │  │
│  │  (per user)  │               │  fraud_flags      │  │
│  └──────────────┘               │  sync_batches     │  │
│                                 │  system_config    │  │
│  ┌──────────────┐               └──────────────────┘  │
│  │  Admin SPA   │◄────────────►  /admin/api            │
│  │  (Dashboard) │                                       │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘
```

### Data Flow Summary

1. **User registers** → server stores bcrypt password hash, generates JWT
2. **User tops up** → server increases `online_balance`
3. **User loads bonds** → server deducts `online_balance`, creates signed bonds
4. **User sends offline** → bonds transferred via QR, locally stored as `spent`
5. **Receiver scans QR** → bonds stored locally as `received_pending_sync`
6. **Sync occurs** → server verifies signatures, checks double-spend, redeems bonds, credits receiver

---

## 3. Technology Stack

### Frontend (Mobile App)

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | React Native | Via Expo SDK 56 |
| Navigation | @react-navigation | v7 |
| State Management | Zustand | Latest |
| Camera/QR | expo-camera | Latest |
| Crypto | @noble/ed25519, @noble/hashes | Latest |
| Secure Storage | expo-secure-store | Latest |
| Biometrics | expo-local-authentication | Latest |
| Local DB | expo-sqlite | Latest |
| QR Generation | react-native-qrcode-svg | Latest |
| HTTP Client | axios | Latest |

### Backend (API Server)

| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js | Latest |
| Framework | Express.js | v5.2.1 |
| Database | PostgreSQL (Supabase) | Latest |
| Auth | JWT (jsonwebtoken) | Latest |
| Password Hashing | bcrypt | salt rounds = 10 |
| Crypto | Node.js crypto (Ed25519) | Built-in |
| DB Driver | pg (Pool) | Latest |
| UUID | uuid v4 | Latest |

### Hardware Terminal (BondPay Station)

| Component | Technology |
|-----------|-----------|
| MCU | ESP8266 (NodeMCU 1.0) |
| RFID | MFRC522 |
| Display | 16x2 I2C LCD |
| WiFi | 802.11 b/g/n (AP mode) |

---

## 4. Database Schema

### PostgreSQL (Server) — 8 Tables

#### `users`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `user_id` | UUID | PK, DEFAULT gen_random_uuid() | Unique user identifier |
| `phone_number` | TEXT | UNIQUE NOT NULL | Phone number |
| `email` | TEXT | UNIQUE NOT NULL | Email address |
| `full_name` | TEXT | NOT NULL | Display name |
| `password_hash` | TEXT | NOT NULL | bcrypt hash |
| `public_key` | TEXT | Nullable | Base64 Ed25519 public key |
| `online_balance` | BIGINT | NOT NULL DEFAULT 0 | Balance in paisa (1 NPR = 100 paisa) |
| `is_frozen` | BOOLEAN | NOT NULL DEFAULT false | Account freeze flag |
| `registered_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Registration timestamp |
| `active_device_id` | TEXT | Nullable | Single active device tracking |
| `ttl_hours` | INTEGER | DEFAULT 72 | Offline bond TTL in hours |

#### `issued_bonds`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `bond_id` | TEXT | PK | Format: `BOND-<uuid4>` |
| `value` | BIGINT | NOT NULL | Denomination in paisa |
| `owner_id` | UUID | FK → users, CASCADE | Current owner |
| `issued_at` | TIMESTAMPTZ | NOT NULL | Issue timestamp |
| `expires_at` | TIMESTAMPTZ | NOT NULL | Expiry timestamp |
| `server_key_version` | TEXT | NOT NULL | Key rotation tag |
| `server_signature` | TEXT | NOT NULL | Ed25519 signature |
| `status` | TEXT | NOT NULL DEFAULT 'active' | `active` \| `redeemed` \| `expired` \| `revoked` |

#### `pending_pickups`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `pickup_id` | TEXT | PK | Format: `PICKUP-<uuid4>` |
| `sender_id` | UUID | FK → users, CASCADE | Sender |
| `receiver_id` | UUID | FK → users, CASCADE | Receiver |
| `amount` | BIGINT | NOT NULL | Amount in paisa |
| `pickup_code` | TEXT | UNIQUE NOT NULL | 6-char hex code |
| `server_sig` | TEXT | NOT NULL | Ed25519 signature |
| `status` | TEXT | DEFAULT 'pending' | `pending` \| `claimed` \| `expired` |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation time |
| `expires_at` | TIMESTAMPTZ | NOT NULL | 48-hour expiry |
| `claimed_at` | TIMESTAMPTZ | Nullable | Claim timestamp |

#### `bond_redemptions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `bond_id` | TEXT | PK, FK → issued_bonds, CASCADE | Redeemed bond |
| `tx_id` | TEXT | NOT NULL | Associated transaction |
| `redeemed_by` | UUID | FK → users, CASCADE | Who redeemed it |
| `redeemed_from` | UUID | FK → users, SET NULL | Who it was redeemed from |
| `redeemed_at` | TIMESTAMPTZ | DEFAULT NOW() | Redemption time |
| `batch_id` | TEXT | NOT NULL | Sync batch ID |

#### `transactions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `tx_id` | TEXT | PK | Format varies by type |
| `tx_type` | TEXT | NOT NULL DEFAULT 'P2P_OFFLINE' | Transaction type |
| `sender_id` | UUID | FK → users, SET NULL | Sender |
| `receiver_id` | UUID | FK → users, SET NULL | Receiver |
| `total_amount` | BIGINT | NOT NULL | Amount in paisa |
| `tx_timestamp` | TIMESTAMPTZ | NOT NULL | Transaction time |
| `nonce` | TEXT | Nullable | Random nonce |
| `sender_signature` | TEXT | Nullable | Ed25519 signature |
| `message` | TEXT | Nullable | User message |
| `is_offline` | BOOLEAN | NOT NULL DEFAULT false | Offline flag |
| `status` | TEXT | DEFAULT 'accepted' | `accepted` \| `pending` \| `failed` \| `flagged` |
| `synced_at` | TIMESTAMPTZ | DEFAULT NOW() | Sync time |

**Transaction types (`tx_type`):**
- `P2P_OFFLINE` — Offline bond transfer
- `P2P_ONLINE` — Online peer transfer
- `P2P_PENDING` — Pending pickup
- `BOND_LOAD` — Bond issuance
- `BOND_REVERSE` — Bond reversal
- `TOPUP` — Wallet topup

#### `fraud_flags`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `flag_id` | UUID | PK | Flag identifier |
| `user_id` | UUID | FK → users, CASCADE | Flagged user |
| `tx_id` | TEXT | Nullable | Related transaction |
| `bond_id` | TEXT | Nullable | Related bond |
| `flag_type` | TEXT | NOT NULL | `DOUBLE_SPEND` \| `VELOCITY` \| `REVIEW` |
| `severity` | TEXT | NOT NULL | `LOW` \| `MEDIUM` \| `HIGH` \| `CRITICAL` |
| `details` | JSONB | Nullable | Additional details |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Flag time |
| `resolved_at` | TIMESTAMPTZ | Nullable | Resolution time |

#### `sync_batches`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `batch_id` | TEXT | PK | Batch identifier |
| `user_id` | UUID | FK → users, CASCADE | Syncing user |
| `submitted_at` | TIMESTAMPTZ | NOT NULL | Submission time |
| `processed_at` | TIMESTAMPTZ | Nullable | Processing time |
| `result` | JSONB | Nullable | Result summary |

#### `system_config`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `config_key` | TEXT | PK | Configuration key |
| `config_value` | TEXT | NOT NULL | Configuration value |
| `description` | TEXT | Nullable | Human-readable description |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update time |

### SQLite (Mobile App) — 3 Tables

#### `bonds`

| Column | Type | Description |
|--------|------|-------------|
| `bond_id` | TEXT PK | Bond identifier |
| `value` | INTEGER NOT NULL | Value in paisa |
| `owner_id` | TEXT NOT NULL | Owner user ID |
| `issued_at` | INTEGER NOT NULL | Unix timestamp |
| `expires_at` | INTEGER NOT NULL | Unix timestamp |
| `issued_by_server` | TEXT NOT NULL | Server public key |
| `server_signature` | TEXT NOT NULL | Ed25519 signature |
| `status` | TEXT DEFAULT 'available' | `available` \| `spent` \| `received_pending_sync` |
| `local_tx_id` | TEXT | FK to local transaction |
| `received_at` | INTEGER | Receive timestamp |
| `created_at` | INTEGER | Creation timestamp |

#### `transactions`

| Column | Type | Description |
|--------|------|-------------|
| `tx_id` | TEXT PK | Transaction identifier |
| `sender_id` | TEXT NOT NULL | Sender user ID |
| `receiver_id` | TEXT NOT NULL | Receiver user ID |
| `total_amount` | INTEGER NOT NULL | Amount in paisa |
| `timestamp` | INTEGER NOT NULL | Unix timestamp |
| `nonce` | TEXT NOT NULL | Random nonce |
| `sender_public_key` | TEXT NOT NULL | Sender's Ed25519 public key |
| `sender_signature` | TEXT NOT NULL | Ed25519 signature |
| `role` | TEXT NOT NULL | `sender` \| `receiver` |
| `sync_status` | TEXT DEFAULT 'pending' | `pending` \| `pending_pickup` \| `synced` \| `failed` \| `flagged` |
| `synced_at` | INTEGER | Sync timestamp |
| `rejection_reason` | TEXT | Rejection reason |
| `message` | TEXT | User message |
| `created_at` | INTEGER | Creation timestamp |

#### `transaction_bonds`

| Column | Type | Description |
|--------|------|-------------|
| `tx_id` | TEXT | Transaction ID |
| `bond_id` | TEXT | Bond ID |
| `direction` | TEXT | `outgoing` \| `incoming` |
| PRIMARY KEY | (tx_id, bond_id) | Composite key |

---

## 5. Authentication System

### Registration Flow

```
Client                              Server
  │                                   │
  │  POST /auth/register              │
  │  { phoneNumber, email,            │
  │    fullName, password,            │
  │    publicKey?, deviceId? }        │
  │                                   │
  │  ──────────────────────────────►  │
  │                                   │  1. Validate input
  │                                   │  2. bcrypt hash password (salt=10)
  │                                   │  3. INSERT INTO users
  │                                   │  4. Generate JWT (30-day expiry)
  │                                   │
  │  { userId, jwt, expiresAt }       │
  │  ◄──────────────────────────────  │
  │                                   │
  │  5. Store JWT in SecureStore      │
  │  6. Generate/load Ed25519 keypair │
  │  7. POST /auth/public-key         │
  │     { publicKey }                 │
```

### Login Flow

```
Client                              Server
  │                                   │
  │  POST /auth/login                 │
  │  { loginId, password,             │
  │    deviceId?, forceLogin? }       │
  │                                   │
  │  ──────────────────────────────►  │
  │                                   │  1. Determine if loginId is email or phone
  │                                   │  2. bcrypt verify password
  │                                   │  3. Single Device Check:
  │                                   │     - If different active_device_id:
  │                                   │       - Without forceLogin: return 409
  │                                   │       - With forceLogin: revoke all active bonds,
  │                                   │         credit value back to online_balance,
  │                                   │         update active_device_id
  │                                   │
  │  { userId, fullName, publicKey,   │
  │    jwt, onlineBalance, expiresAt }│
  │  ◄──────────────────────────────  │
```

### Single Active Device Policy

When a user logs in from a new device:
- If `forceLogin` is **not set**: Server returns 409 with `requiresForceLogin: true`
- If `forceLogin` is **true**: 
  1. All active bonds for the user are marked `revoked`
  2. Total bond value is credited back to `online_balance`
  3. `active_device_id` is updated to the new device
  4. New JWT is issued

### JWT Structure

```json
{
  "userId": "uuid",
  "phoneNumber": "+977...",
  "email": "...",
  "iat": 1234567890,
  "exp": 1237159890  // 30 days
}
```

### Request Authentication

All authenticated endpoints require:
```
Authorization: Bearer <jwt>
```

Middleware verifies:
1. JWT signature and expiration
2. User still exists in database
3. Attaches `req.user.userId` for downstream handlers

---

## 6. Cryptography

### Ed25519 Digital Signatures

BondPay uses Ed25519 elliptic curve signatures for two purposes:

1. **Server signs bonds** — proves the bond was issued by BondPay
2. **Users sign transactions** — proves the sender authorized the transfer

### Why Ed25519?

| Property | Ed25519 | RSA-2048 | ECDSA P-256 |
|----------|---------|----------|-------------|
| Signature size | 64 bytes | 256 bytes | 64 bytes |
| Public key size | 32 bytes | 256 bytes | 64 bytes |
| Speed | Very fast | Slow | Moderate |
| QR code fit | Excellent | Poor | Good |

Ed25519 produces compact 64-byte signatures that fit comfortably in QR codes.

### Key Management

**Server Keys:**
- Private key: Stored in `.env` as base64 (`SERVER_ED25519_PRIVATE_KEY`)
- Public key: Derived at server startup, served via `GET /server/public-key`
- Key version: `v1.0` (for future rotation)

**User Keys:**
- Generated on device using `@noble/ed25519` + `expo-crypto`
- Private key: Stored in device secure storage (`expo-secure-store`)
  - Alias: `bondpay_user_private_key_{userId}`
- Public key: Uploaded to server via `POST /auth/public-key`
- Temporary keys during registration: `bondpay_temp_private_key`

### Signing Process

**Bond Signature (Server):**
```
data = bondId + value + ownerId + issuedAt + expiresAt + serverKeyVersion
hash = SHA-256(data)
signature = Ed25519_Sign(hash, serverPrivateKey)
```

**Transaction Signature (User):**
```
data = txId + senderId + receiverId + totalAmount + timestamp + nonce + sortedBondIds + message
hash = SHA-256(data)
signature = Ed25519_Sign(hash, userPrivateKey)
```

### Verification Process

1. Reconstruct the signed data string from known fields
2. SHA-256 hash the data
3. Reconstruct the public key from raw base64 bytes
4. Verify the Ed25519 signature against the hash and public key

---

## 7. Balance Model & Cash Flow

### Three Balance Types

Each user has three balance components:

| Balance | Storage | Description |
|---------|---------|-------------|
| **Online Balance** | PostgreSQL `users.online_balance` | Server-backed, instantly transferable |
| **Offline Balance** | Sum of locally available bond values (SQLite) | Portable, works without internet |
| **Pending Online** | Sum of received-not-yet-synced transactions | Will become online balance after sync |

**Total Balance** = Online + Offline + Pending Online

### Cash Flow Lifecycle

```
                    TOPUP
                      │
                      ▼
              ┌───────────────┐
              │ Online Balance │◄─────────────────────┐
              │ (Server)       │                      │
              └───────┬───────┘                      │
                      │                              │
              LOAD BONDS                             │
              (deduct online)                       │
                      │                              │
                      ▼                              │
              ┌───────────────┐                      │
              │ Offline Bonds │──── REVERSE BONDS ────┘
              │ (Device)      │     (credit online)
              └───────┬───────┘
                      │
          ┌───────────┼───────────┐
          │           │           │
     SEND OFFLINE  SEND OFFLINE  SEND OFFLINE
     (Mode 3/4)   (Mode 3/4)   (Mode 3/4)
          │           │           │
          ▼           ▼           ▼
    ┌─────────┐ ┌─────────┐ ┌─────────┐
    │Receiver │ │Receiver │ │Receiver │
    │Device A │ │Device B │ │Device C │
    └────┬────┘ └────┬────┘ └────┬────┘
         │           │           │
         ▼           ▼           ▼
    ┌────────────────────────────────┐
    │         SYNC (online)          │
    │  Server verifies & redeems     │
    │  bonds → credits receiver      │
    │  online balance                │
    └────────────────────────────────┘
```

### Complete Cash Flow — Every Path

#### Path 1: Topup → Online Transfer

```
User A tops up NPR 1,000
  → online_balance += 1000 (server)
  → User A sends NPR 500 to User B (online)
  → POST /wallet/transfer-online
  → User A online_balance -= 500
  → User B online_balance += 500
```

#### Path 2: Topup → Bond Load → Offline Transfer → Sync

```
User A tops up NPR 1,000
  → online_balance += 1000

User A loads bonds worth NPR 1,000
  → POST /bonds/issue { totalAmount: 1000 }
  → online_balance -= 1000
  → Server creates bonds: [500, 500] (denomination algorithm)
  → Server signs each bond with Ed25519
  → Bonds stored locally on device

User A sends NPR 500 to User B (offline, Mode 4)
  → Sender selects bond(s) worth exactly NPR 500
  → Sender signs transaction with Ed25519
  → Bond ownership transferred via QR code
  → Local DB: bond status = 'spent'

User B receives bond (offline)
  → Bond stored with status = 'received_pending_sync'
  → Owner ID updated to User B

User B comes online and syncs
  → POST /transactions/sync
  → Server verifies:
    - Bond signatures (server Ed25519)
    - Sender's transaction signature (user Ed25519)
    - Bond ownership
    - Double-spend check (bond_redemptions table)
  → Bond status → 'redeemed'
  → User B online_balance += 500
```

#### Path 3: Online → Pending Pickup → Offline Claim

```
User A (online) sends NPR 500 to User B (offline)
  → POST /wallet/transfer-pending
  → User A online_balance -= 500
  → Server creates pickup record with 6-char code
  → Server signs pickup with Ed25519
  → QR code displayed showing pickup payload

User B (offline) scans pickup QR
  → Verifies server signature on pickup
  → Stores pickup locally with status 'pending_pickup'

User B comes online
  → POST /wallet/claim-pending { pickupId }
  → Server verifies pickup is valid and not expired
  → User B online_balance += 500
  → If expired: User A gets refund
```

#### Path 4: Bond Reverse (Offline → Online)

```
User A has NPR 1,000 in offline bonds
  → User A decides to reverse bonds back to online
  → POST /wallet/reverse-bond { bondIds: [...] }
  → Each bond verified (ownership + active status)
  → Bonds marked 'revoked'
  → User A online_balance += 1,000
```

---

## 8. Transaction Modes

### Mode 1: Online → Online

**Both sender and receiver are connected to the internet.**

```
Sender (Online)                    Server                      Receiver (Online)
     │                               │                              │
     │  Scan receiver QR             │                              │
     │  { userId, name, pubKey,      │                              │
     │    amount, mode: "online" }   │                              │
     │                               │                              │
     │  POST /wallet/transfer-online │                              │
     │  { receiverId, amount }       │                              │
     │  ──────────────────────────►  │                              │
     │                               │  SELECT ... FOR UPDATE       │
     │                               │  (lock both rows)            │
     │                               │  Deduct sender balance       │
     │                               │  Credit receiver balance     │
     │                               │  INSERT transaction          │
     │                               │                              │
     │  { onlineBalance, txId }      │                              │
     │  ◄──────────────────────────  │                              │
     │                               │                              │
     │  Success screen               │    Balance auto-updates      │
```

**Key properties:**
- Instant settlement
- Row-level locking prevents race conditions
- No bond involvement
- Transaction type: `P2P_ONLINE`

### Mode 2: Online → Offline (Pending Pickup)

**Sender is online, receiver is offline or unavailable.**

```
Sender (Online)                    Server                      Receiver (Offline)
     │                               │                              │
     │  POST /wallet/transfer-pending│                              │
     │  { receiverId, amount }       │                              │
     │  ──────────────────────────►  │                              │
     │                               │  Deduct sender balance       │
     │                               │  Create pickup record        │
     │                               │  Generate 6-char code        │
     │                               │  Sign pickup with Ed25519    │
     │                               │                              │
     │  { pickupId, pickupCode,      │                              │
     │    serverSig, expiresAt }     │                              │
     │  ◄──────────────────────────  │                              │
     │                               │                              │
     │  Display QR with pickup data  │    (later) scan QR           │
     │                               │    Verify server signature   │
     │                               │    Store locally             │
     │                               │                              │
     │                               │  POST /wallet/claim-pending  │
     │                               │  ◄─────────────────────────  │
     │                               │  Credit receiver balance     │
     │                               │  Mark pickup as claimed      │
```

**Key properties:**
- Pickup expires after 48 hours
- If expired: sender gets automatic refund
- Receiver must come online to claim
- Transaction type: `P2P_PENDING`

### Mode 3: Offline → Online

**Sender is offline, receiver is online.**

```
Sender (Offline)                                     Receiver (Online)
     │                                                     │
     │  Display receiver QR                                 │
     │  { userId, name, pubKey, amount, mode: "offline" }  │
     │                                                     │
     │  ◄────────────────────────────────────────────────  │
     │                                                     │
     │  Select bonds (exact change algorithm)               │
     │  Sign transaction with Ed25519                       │
     │  Mark bonds as 'spent' locally                       │
     │                                                     │
     │  Display multi-QR receipt                            │
     │  { txId, senderId, receiverId, amount, nonce,        │
     │    senderPubKey, sig, bonds[], message }             │
     │                                                     │
     │  ─────────────────────────────────────────────────►  │
     │                                                     │
     │                                                     │  Verify:
     │                                                     │  - Server sig on each bond
     │                                                     │  - Sender's transaction sig
     │                                                     │  - Bond expiry
     │                                                     │  - Duplicate detection
     │                                                     │  - Amount validation
     │                                                     │
     │                                                     │  Store bonds locally
     │                                                     │  status = 'received_pending_sync'
     │                                                     │
     │                                                     │  Auto-sync (POST /transactions/sync)
     │                                                     │  → Server redeems bonds
     │                                                     │  → Receiver online_balance += amount
```

**Key properties:**
- No internet required on sender's side
- Receiver verifies all cryptographic signatures locally
- Immediate sync when receiver is online
- Transaction type: `P2P_OFFLINE`

### Mode 4: Offline → Offline

**Both sender and receiver are offline.**

```
Sender (Offline)                                     Receiver (Offline)
     │                                                     │
     │  Same as Mode 3 through QR exchange                  │
     │                                                     │
     │  Receiver stores bonds locally                       │
     │  status = 'received_pending_sync'                    │
     │                                                     │
     │  (later) Either party comes online                   │
     │  → Sync occurs                                       │
     │  → Bonds redeemed on server                          │
     │  → Receiver online_balance credited                  │
```

**Key properties:**
- Fully offline transfer possible
- Settlement deferred until either party syncs
- Same verification as Mode 3

---

## 9. Bond Issuance & Denomination Algorithm

### Issuance Flow

1. User requests: `POST /bonds/issue { totalAmount }`
2. Server validates:
   - Amount is multiple of `min_denomination` (default: 5 NPR)
   - User has sufficient `online_balance`
   - Adding these bonds won't exceed `max_offline_capacity` (default: 10,000 NPR)
   - Number of bonds ≤ `max_bonds_per_request` (default: 50)
3. Server breaks amount into denominations using greedy algorithm
4. For each denomination, creates a bond with Ed25519 signature
5. Atomic database transaction: deducts balance + inserts bonds + creates transaction record

### Denomination Set

Available denominations (in paisa): `[1000, 500, 100, 50, 20, 10, 5]`

Corresponding NPR values: `[10, 5, 1, 0.50, 0.20, 0.10, 0.05]`

### Greedy Breakdown Algorithm

```
Input: totalAmount = 270 NPR (27000 paisa)

Step 1: Try 1000 paisa (10 NPR) bonds
  27000 / 1000 = 27 bonds of 10 NPR → remainder 0
  But if amount > 100 NPR, skip single-denomination for flexibility

Step 2: Try mixed denominations
  2 × 1000 (10 NPR each) = 2000
  1 × 500 (5 NPR) = 500
  2 × 100 (1 NPR) = 200
  → Total: 27000 paisa ✓

Result: [1000, 1000, 500, 100, 100] → 5 bonds
```

**Special rule:** When amount > 100 NPR, the algorithm skips the "all same denomination" path to ensure change flexibility (users receive varied denominations they can split for future payments).

### Bond Signature

For each bond:
```
data = bondId + value + ownerId + issuedAt + expiresAt + serverKeyVersion
signature = Ed25519_Sign(SHA-256(data), serverPrivateKey)
```

### Bond Lifecycle

```
  ┌─────────┐
  │  active  │ ◄── Initial state after issuance
  └────┬────┘
       │
       ├──► redeemed ── (bond used in a synced transaction)
       │
       ├──► expired ─── (past expires_at timestamp)
       │
       └──► revoked ─── (user reversed bonds back to online)
```

---

## 10. Offline Transaction Flow

### Sending Offline (Modes 3 & 4)

**Step 1: Receiver generates request QR**

```json
{
  "id": "receiver-user-id",
  "name": "Receiver Name",
  "pubKey": "base64-encoded-ed25519-public-key",
  "amount": 500,
  "mode": "offline"
}
```

**Step 2: Sender scans request QR**

The app decodes the receiver's ID, name, public key, and requested amount.

**Step 3: Sender selects bonds (exact change)**

The app uses a memoized subset-sum algorithm to find bonds that sum exactly to the requested amount:

```
Available bonds: [500, 200, 100, 100, 50, 50]
Requested amount: 500

Solution: [500] → exact match found
```

If no exact match exists, the user is shown available denominations and asked to adjust the amount.

**Step 4: Sender signs the transaction**

```
txId = TX-{random-nonce}
data = txId + senderId + receiverId + amount + timestamp + nonce + sortedBondIds + message
signature = Ed25519_Sign(SHA-256(data), senderPrivateKey)
```

**Step 5: Local database update**

```sql
-- Mark bonds as spent
UPDATE bonds SET status = 'spent', local_tx_id = ? WHERE bond_id = ?

-- Record transaction
INSERT INTO transactions (..., sync_status = 'pending', role = 'sender')

-- Link bonds to transaction
INSERT INTO transaction_bonds (tx_id, bond_id, direction = 'outgoing')
```

**Step 6: Display receipt QR**

The transaction data + bond data is encoded into a multi-QR payload and displayed as a cycling QR animation.

### Receiving Offline (Modes 3 & 4)

**Step 1: Scan sender's multi-QR receipt**

The `MultiQRScanner` component accumulates QR chunks until the full payload is received.

**Step 2: Verify server signatures on each bond**

For each bond in the receipt:
```
data = bondId + value + ownerId + issuedAt + expiresAt + issuedByServer
valid = Ed25519_Verify(SHA-256(data), bond.serverSignature, serverPublicKey)
```

**Step 3: Verify sender's transaction signature**

```
data = txId + senderId + receiverId + amount + timestamp + nonce + sortedBondIds + message
valid = Ed25519_Verify(SHA-256(data), sig, senderPubKey)
```

**Step 4: Additional validations**
- Bond expiry check
- Amount matches requested amount
- Duplicate detection (tx_id not already in local DB)
- Bond value sum matches total amount

**Step 5: Store received bonds**

```sql
INSERT OR REPLACE INTO bonds (..., owner_id = RECEIVER_USER_ID, status = 'received_pending_sync')
INSERT INTO transactions (..., role = 'receiver', sync_status = 'pending')
INSERT INTO transaction_bonds (..., direction = 'incoming')
```

---

## 11. Synchronization Protocol

### When Sync Occurs

- Pull-to-refresh on home screen
- Automatic every 10 seconds when online and authenticated
- After Mode 3 transfer (immediate sync)
- Manual sync button press

### Sync Process

```
Client                                  Server
  │                                       │
  │  1. Fetch pending local transactions  │
  │     SELECT * FROM transactions        │
  │     WHERE sync_status IN              │
  │       ('pending', 'pending_pickup')   │
  │                                       │
  │  2. Process pickup claims first       │
  │     POST /wallet/claim-pending        │
  │     { pickupId }                      │
  │     ─────────────────────────────►    │
  │     { onlineBalance }                 │
  │     ◄─────────────────────────────    │
  │                                       │
  │  3. Build batch payload               │
  │     Separate into incoming/outgoing   │
  │     Attach bond data to each tx       │
  │                                       │
  │  POST /transactions/sync              │
  │  { batchId, incoming[], outgoing[] }  │
  │  ─────────────────────────────►       │
  │                                       │  For each incoming tx:
  │                                       │    - Verify sender signature
  │                                       │    - Verify each bond's server sig
  │                                       │    - Check bond ownership
  │                                       │    - Double-spend check
  │                                       │    - If valid: redeem bonds, credit receiver
  │                                       │    - If double-spend: flag fraud
  │                                       │
  │  { accepted, rejected, flagged,       │
  │    updatedOnlineBalance }             │
  │  ◄─────────────────────────────       │
  │                                       │
  │  4. Process response locally          │
  │     Accepted: mark synced, delete     │
  │                spent bonds from local │
  │     Rejected: mark failed             │
  │     Flagged: mark flagged             │
  │                                       │
  │  5. Refresh state                     │
  │     GET /bonds/active → local bonds   │
  │     GET /auth/me → online balance     │
```

### Batch Deduplication

Each sync batch gets a unique `batchId` (UUID). The server checks `sync_batches` table:
- If `batchId` already exists → return cached result (idempotent)
- If new → process and store result

This prevents duplicate processing if the client retries.

### Bond State After Sync

| Local State | Server Action |
|-------------|---------------|
| `received_pending_sync` (incoming) | Bond redeemed, receiver credited |
| `spent` (outgoing) | Bond redeemed from sender |
| Already in `bond_redemptions` | Flagged as `DOUBLE_SPEND` |

---

## 12. Multi-QR Protocol

### Problem

A single QR code can hold ~300 characters. A bond transfer payload with multiple bonds can exceed 3000 characters.

### Solution: Animated QR Carousel

The payload is split into chunks, each displayed as a separate QR code in rapid succession (333ms per frame). The receiver's scanner accumulates chunks until the full payload is reconstructed.

### Chunk Format

```json
{
  "v": 1,              // Protocol version
  "sid": "A3F1B2",    // Session ID (links chunks)
  "i": 0,              // Chunk index (0-based)
  "t": 10,             // Total chunks
  "d": "...",          // Data fragment
  "cs": "a1b2c3d4"    // Checksum of full payload
}
```

### Encoding Process

1. Compute checksum of full payload (DJB2-like hash)
2. Generate random session ID (6-char alphanumeric)
3. Split payload into 300-char chunks
4. For each chunk: wrap in QRChunk envelope, stringify to JSON

### Decoding Process

1. Parse each scanned QR as JSON
2. Validate version, session ID, and fields
3. Place data fragment at correct index
4. Track progress (scannedCount / totalCount)
5. When all chunks received: join fragments, verify checksum
6. Pass complete payload to handler

### Fallback

If a scanned QR contains a complete payload (not a QRChunk envelope), it's passed directly to the handler. This supports single-frame transfers for small payloads.

---

## 13. API Reference

### Base URL

- Local development: `http://192.168.1.65:3000`
- Production: `https://zenithkandel.com.np/bondpay`

### Authentication

All authenticated endpoints require:
```
Authorization: Bearer <jwt_token>
```

### Endpoints

#### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | No | Register new user |
| POST | `/auth/login` | No | Login with email/phone |
| POST | `/auth/logout` | Yes | Logout (clears device) |
| GET | `/auth/me` | Yes | Get user profile + balance |
| POST | `/auth/profile` | Yes | Update profile |
| POST | `/auth/change-password` | Yes | Change password |
| POST | `/auth/public-key` | Yes | Register Ed25519 public key |

#### Bonds

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/bonds/issue` | Yes | Issue new bonds |
| GET | `/bonds/active` | Yes | Get active bonds |

#### Wallet

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/wallet/topup` | Yes | Add funds to online balance |
| POST | `/wallet/transfer-online` | Yes | Online peer transfer |
| POST | `/wallet/transfer-pending` | Yes | Create pending pickup |
| POST | `/wallet/claim-pending` | Yes | Claim a pending pickup |
| POST | `/wallet/reverse-bond` | Yes | Reverse bonds to online |
| GET | `/wallet/history` | Yes | Get transaction history |

#### Transactions

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/transactions/sync` | Yes | Sync offline transactions |

#### Server (Public)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/server/public-key` | No | Get server's Ed25519 public key |
| GET | `/server/config` | No | Get system configuration |
| GET | `/health` | No | Health check |

#### Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/admin/api/login` | No | Admin login |
| GET | `/admin/api/stats` | Yes (admin) | Dashboard statistics |
| GET/POST/PUT/DELETE | `/admin/api/users` | Yes (admin) | Users CRUD |
| GET/POST/PUT/DELETE | `/admin/api/bonds` | Yes (admin) | Bonds CRUD |
| GET/POST/PUT/DELETE | `/admin/api/transactions` | Yes (admin) | Transactions CRUD |
| GET/PUT | `/admin/api/configs` | Yes (admin) | System config |

### Request/Response Examples

#### POST /auth/register

**Request:**
```json
{
  "phoneNumber": "+9779841234567",
  "email": "user@example.com",
  "fullName": "Ramesh Sharma",
  "password": "securepass123",
  "publicKey": "base64-encoded-ed25519-public-key",
  "deviceId": "device-uuid"
}
```

**Response (201):**
```json
{
  "userId": "uuid",
  "jwt": "eyJhbGciOiJIUzI1NiIs...",
  "expiresAt": "2026-07-21T00:00:00Z"
}
```

#### POST /bonds/issue

**Request:**
```json
{
  "totalAmount": 1000
}
```

**Response (200):**
```json
{
  "bonds": [
    {
      "bondId": "BOND-uuid",
      "value": 1000,
      "ownerId": "user-uuid",
      "issuedAt": "2026-06-21T10:00:00Z",
      "expiresAt": "2026-07-21T10:00:00Z",
      "issuedByServer": "base64-server-public-key",
      "serverSignature": "base64-ed25519-signature"
    }
  ],
  "newOnlineBalance": 0
}
```

#### POST /transactions/sync

**Request:**
```json
{
  "batchId": "unique-uuid",
  "incoming": [
    {
      "transaction": {
        "txId": "TX-nonce",
        "senderId": "sender-uuid",
        "receiverId": "receiver-uuid",
        "totalAmount": 500,
        "timestamp": 1234567890,
        "nonce": "random-hex",
        "senderPublicKey": "base64",
        "senderSignature": "base64",
        "message": ""
      },
      "bonds": [
        {
          "bondId": "BOND-uuid",
          "value": 500,
          "ownerId": "sender-uuid",
          "issuedAt": "...",
          "expiresAt": "...",
          "issuedByServer": "base64",
          "serverSignature": "base64"
        }
      ]
    }
  ],
  "outgoing": []
}
```

**Response (200):**
```json
{
  "accepted": ["TX-nonce"],
  "rejected": [],
  "flagged": [],
  "updatedOnlineBalance": 500
}
```

---

## 14. Frontend Services

### SyncService (`sync.service.ts`)

Central offline-to-online reconciliation engine.

**Methods:**

| Method | Purpose |
|--------|---------|
| `sync()` | Main sync: pushes pending transactions, processes response, refreshes state |
| `fetchOnlineBalance(jwt)` | GET /auth/me → update online balance in store |
| `fetchBonds(jwt)` | GET /bonds/active → replace local bonds, recalculate offline balance |

**Sync mutex:** Module-level `isSyncing` flag prevents concurrent sync operations.

### CryptoService (`crypto.service.ts`)

Ed25519 key management and signing.

| Method | Purpose |
|--------|---------|
| `generateTempKeys()` | Generate temporary keypair for registration |
| `initializeUserKeys(userId)` | Promote temp key or create new keypair |
| `signTransaction(data, userId)` | Sign data with user's private key |
| `verifyServerBondSignature(data, sig, serverPubKey)` | Verify server signature |
| `verifySenderSignature(data, sig, senderPubKey)` | Verify sender signature |
| `generateNonce()` | Generate 16-byte random hex |

### ConfigService (`config.service.ts`)

Fetches system configuration with 3-tier fallback:
1. Live from `GET /server/config`
2. Cached in SecureStore
3. Hardcoded defaults

### MultiQRService (`multiqr.service.ts`)

QR chunk encoding/decoding for large payloads.

| Method | Purpose |
|--------|---------|
| `encode(payload, chunkSize?)` | Split payload into QR-sized chunks |
| `createAccumulator(onComplete)` | Factory for chunk collection state machine |

---

## 15. Security Model

### Threat Matrix

| ID | Threat | Severity | Mitigation |
|----|--------|----------|------------|
| T1 | Forged bonds | HIGH | Server Ed25519 signature on every bond; verified during sync |
| T2 | Double-spending | HIGH | `bond_redemptions` table checked during sync; fraud flags |
| T3 | Transaction replay | MEDIUM | 16-byte random nonce per transaction |
| T4 | Signature forgery | HIGH | Ed25519 with SHA-256 pre-hashing; 2^128 security level |
| T5 | Man-in-the-middle | MEDIUM | QR codes are physical (no network interception) |
| T6 | Private key theft | HIGH | Keys stored in device secure enclave (expo-secure-store) |
| T7 | Race conditions | MEDIUM | PostgreSQL `SELECT ... FOR UPDATE` row locks |
| T8 | Expired bonds | LOW | TTL check during sync; bonds rejected if expired |
| T9 | Batch replay | MEDIUM | Batch ID deduplication in `sync_batches` table |
| T10 | Offline forgery | HIGH | Server signature + sender signature both verified |

### Known Security Limitations

1. **Offline double-spending window:** A malicious user could theoretically transfer the same bond to multiple recipients while offline. Detection occurs during sync when the first redemption succeeds and subsequent attempts are flagged.

2. **Bond TTL bypass:** If a device clock is manipulated, expired bonds could potentially be presented. Server checks `expires_at` during sync.

3. **Single device policy bypass:** The `active_device_id` check relies on the client sending the correct `deviceId`. A modified client could potentially bypass this.

---

## 16. System Configuration

### Configuration Parameters

| Key | Default | Description |
|-----|---------|-------------|
| `min_denomination` | 5 | Minimum bond denomination in NPR |
| `max_offline_capacity` | 10,000 | Maximum offline bond capacity per user in NPR |
| `qr_switching_delay` | 333 | Delay in ms between QR frames |
| `max_bonds_per_request` | 50 | Maximum bonds per issue request |
| `bond_ttl_days` | 30 | Default bond validity in days |

### Runtime Limits (Server Config)

| Parameter | Value | Description |
|-----------|-------|-------------|
| `MAX_OFFLINE_BOND_PAISA` | 500,000 | Max offline bond value in paisa (5,000 NPR) |
| `BOND_TTL_DAYS` | 30 | Bond expiry in days |
| `MAX_BONDS_PER_REQUEST` | 50 | Max bonds per issue request |

### Configuration Sources (Priority Order)

1. Environment variables (`.env`)
2. Database `system_config` table
3. Hardcoded defaults

---

## 17. Admin Console

### Access

- URL: `GET /admin` (serves SPA)
- Login: `POST /admin/api/login` with hardcoded credentials (admin/admin)

### Features

- **Dashboard:** Total users, online balance, offline balance, active bonds, fraud flags
- **Users CRUD:** Create, read, update, delete users with search/filter
- **Bonds CRUD:** View all bonds, update status, manual issuance
- **Transactions CRUD:** View all transactions, manual ledger entries
- **System Config:** Edit configuration key-value pairs

---

## 18. BondPay Terminal

The BondPay Terminal is an ESP8266-based RFID payment station for merchant environments.

### Hardware

| Component | Specification |
|-----------|--------------|
| MCU | ESP8266 (NodeMCU 1.0) |
| RFID Reader | MFRC522 (SPI) |
| Display | 16x2 I2C LCD |
| WiFi | 802.11 b/g/n (AP mode) |
| Indicators | Green LED, Red LED, Buzzer |

### Features

- WiFi hotspot: "BondPay Station"
- Web dashboard at `http://192.168.4.1`
- Card registration and management
- Payment processing
- Transaction history
- Balance checking

### Documentation

- `BondPay_Terminal/docs/installation_guide.md` — Setup instructions
- `BondPay_Terminal/docs/user_guide.md` — End-user operations
- `BondPay_Terminal/docs/wiring_diagram.md` — Hardware connections

---

## 19. Known Limitations

1. **Offline double-spending:** Cannot be fully prevented. Detection occurs during sync.
2. **No NRB compliance:** This is a hackathon prototype, not a regulated financial system.
3. **Hardcoded API URLs:** Backend URL is hardcoded in 4 source files (see `very-important-must-read.md`).
4. **Admin credentials:** Hardcoded as admin/admin — not production-ready.
5. **No HTTPS locally:** Development uses HTTP; production uses HTTPS via cPanel.
6. **Single active device:** Only one device per user account.
7. **Bond TTL:** Default 30 days; bonds expire and become worthless after TTL.
8. **No change-making for offline:** Sender must have exact bond denominations.
9. **No persistent bond TTL on device:** TTL is checked server-side only.
10. **JWT expiry:** 30 days — acceptable for hackathon but should be shorter in production.

---

## 20. Deployment

### Local Development

```bash
# Backend
cd bondpay-server
npm install
cp .env.example .env  # Configure with local PostgreSQL
npm run dev

# Frontend
cd BondPay
npm install
npx expo start
```

### Production

- Backend hosted on cPanel at `https://zenithkandel.com.np/bondpay`
- Database hosted on Supabase (PostgreSQL)
- Frontend built as APK via EAS Build

### Files Requiring URL Changes (Local ↔ Production)

| File | Local | Production |
|------|-------|------------|
| `src/screens/ReceiveScreen.tsx` | `http://192.168.1.65:3000` | `https://zenithkandel.com.np/bondpay` |
| `src/screens/SendScreen.tsx` | `http://192.168.1.65:3000` | `https://zenithkandel.com.np/bondpay` |
| `src/navigation/AuthNavigator.tsx` | `http://192.168.1.65:3000` | `https://zenithkandel.com.np/bondpay` |
| `src/services/sync.service.ts` | `http://192.168.1.65:3000` | `https://zenithkandel.com.np/bondpay` |
| `src/screens/HomeScreen.tsx` | `http://192.168.1.65:3000` | `https://zenithkandel.com.np/bondpay` |
