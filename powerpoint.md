# BondPay — Hackathon Presentation Guide

> **Event:** NCIT TechFest 3.0  
> **Track:** Civic & Social Impact  
> **Date:** June 20–21, 2026  
> **Presentation Duration:** 10 minutes + Q&A

---

## Marking Scheme Breakdown

| Section | Marks | Slides | Focus |
|---------|-------|--------|-------|
| Problem Statement & Relevance | 15 | 1–3 | Why this matters |
| Best Idea | 15 | 4–5 | Innovation & uniqueness |
| Technical Implementation | 35 | 6–14 | Architecture, crypto, flows |
| UI/UX | 15 | 15–17 | Design quality, polish |
| Presentation & Q&A | 20 | 18–20 | Delivery, demo, answers |
| **Total** | **100** | | |

---

## SLIDE 1: Title Slide

### BondPay
**Offline-Capable Digital Payments Using Cryptographically Signed Bonds**

- Team Name: [Your Team Name]
- Members: [Names]
- Event: NCIT TechFest 3.0 — Civic & Social Impact Track
- Date: June 20–21, 2026

**Tagline:** *"Payments shouldn't stop when the internet does."*

---

## SLIDE 2: The Problem

### Nepal's Digital Payment Gap

**The hard truth:**
- Nepal has **35%+ rural communities** with unreliable or no internet connectivity
- Traditional digital wallets (eSEWA, Khalti, IME Pay) **require constant internet**
- Cash remains king in rural areas — but cash has its own problems:
  - Theft risk
  - No transaction records
  - No way to send money remotely
  - No micro-payment support

**The specific scenarios where digital payments fail:**

| Scenario | Why it fails |
|----------|-------------|
| Trekking routes (Annapurna, Everest) | No cellular coverage for days |
| Rural village shops | Sporadic internet, 2G at best |
| Public buses/transport | Moving vehicle, no stable connection |
| Disaster recovery zones | Infrastructure destroyed |
| Underground parking/basements | No signal penetration |

**Key insight:** 68% of Nepal's population lives in areas with intermittent connectivity. The remaining 32% in urban areas also experience frequent load-shedding and network congestion.

---

## SLIDE 3: Why Existing Solutions Fail

### Current Digital Payment Limitations

| App | Offline Support | Bond System | Cryptographic Verification |
|-----|----------------|-------------|---------------------------|
| eSEWA | ❌ None | ❌ | ❌ |
| Khalti | ❌ None | ❌ | ❌ |
| IME Pay | ❌ None | ❌ | ❌ |
| STC Pay | ❌ Partial | ❌ | ❌ |
| **BondPay** | **✅ Full** | **✅ Yes** | **✅ Ed25519** |

**What makes BondPay different:**
1. **True offline capability** — not just "cached data" but actual value transfer
2. **Cryptographic bond system** — each bond is a digitally signed token
3. **Settlement upon connectivity** — automatic reconciliation when online
4. **Double-spend detection** — server-side redemption ledger prevents fraud
5. **No central authority needed for offline transactions** — peer-to-peer

**Relevance to Nepal:**
- Nepal's terrain makes consistent internet impossible in many regions
- Financial inclusion requires offline-capable solutions
- BondPay bridges the gap between cash and digital payments

---

## SLIDE 4: Our Solution — Digital Bonds

### The Core Innovation

**What is a Bond?**

A bond is a **cryptographically signed digital token** representing a specific monetary value. Think of it as a digital banknote:

```
┌─────────────────────────────────────────┐
│  BOND-550e8400-e29b-41d4-a716-446655440000  │
│  Value: NPR 500                          │
│  Owner: Ramesh Sharma                    │
│  Issued: 2026-06-21                      │
│  Expires: 2026-07-21                     │
│  Server Signature: Ed25519 (64 bytes)    │
│  Key Version: v1.0                       │
└─────────────────────────────────────────┘
```

**How it works:**
1. User tops up online balance (like any wallet)
2. User "loads" bonds — converts online balance to portable digital tokens
3. Bonds are stored locally on the device (SQLite)
4. Bonds can be transferred offline via QR codes
5. When either party comes online, bonds are redeemed and settled

**Why bonds instead of just "offline balance"?**
- Bonds are **individually signed** by the server — cannot be forged
- Bonds carry **expiry dates** — prevents infinite accumulation
- Bonds have **denomination values** — like real banknotes
- Bonds can be **verified offline** — no server call needed to validate

---

## SLIDE 5: The 4 Transaction Modes

### Complete Connectivity Matrix

```
                    RECEIVER
                 Online      Offline
              ┌───────────┬───────────┐
    S    Online│  MODE 1   │  MODE 2   │
    E         │  Instant  │  Pickup   │
    N         │  Transfer │  QR Code  │
    D         ├───────────┼───────────┤
    E    Offline│  MODE 3   │  MODE 4   │
    R         │  Bond →   │  Bond →   │
              │  Sync     │  Deferred │
              └───────────┴───────────┘
```

**Mode 1: Online → Online (Instant)**
- Both parties connected
- Server deducts/credits instantly
- Like any regular digital payment
- Settlement: Immediate

**Mode 2: Online → Offline (Pending Pickup)**
- Sender online, receiver offline/unavailable
- Creates a "pickup" with 6-character code
- Sender displays QR with pickup data
- Receiver claims when they come online
- Expiry: 48 hours (auto-refund if unclaimed)

**Mode 3: Offline → Online (Bond Transfer + Sync)**
- Sender offline, receiver online
- Bonds transferred via multi-QR animation
- Receiver verifies cryptographically
- Receiver auto-syncs to settle on server
- Settlement: Immediate upon receiver sync

**Mode 4: Offline → Offline (Bond Transfer + Deferred)**
- Both parties offline
- Same as Mode 3 but settlement deferred
- Either party can trigger sync later
- Maximum flexibility for remote areas

---

## SLIDE 6: System Architecture

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      BondPay System                           │
│                                                              │
│  ┌──────────────────┐         ┌──────────────────────────┐  │
│  │   Mobile App      │  REST   │    Express.js Server      │  │
│  │   (React Native   │◄──────►│    (Node.js + TypeScript) │  │
│  │    + Expo)        │  API   │                           │  │
│  │                   │         │  ┌─────────────────────┐ │  │
│  │  ┌─────────────┐  │         │  │  Ed25519 Crypto     │ │  │
│  │  │ SQLite       │  │         │  │  (Bond Signing)     │ │  │
│  │  │ (Local DB)   │  │         │  └─────────────────────┘ │  │
│  │  └─────────────┘  │         │                           │  │
│  │                   │         │  ┌─────────────────────┐ │  │
│  │  ┌─────────────┐  │         │  │  JWT Auth            │ │  │
│  │  │ Ed25519      │  │         │  │  (30-day tokens)    │ │  │
│  │  │ (User Keys)  │  │         │  └─────────────────────┘ │  │
│  │  └─────────────┘  │         │                           │  │
│  │                   │         │  ┌─────────────────────┐ │  │
│  │  ┌─────────────┐  │         │  │  PostgreSQL          │ │  │
│  │  │ Multi-QR     │  │         │  │  (Supabase)         │ │  │
│  │  │ Encoder      │  │         │  │  8 tables           │ │  │
│  │  └─────────────┘  │         │  └─────────────────────┘ │  │
│  └──────────────────┘         └──────────────────────────┘  │
│                                                              │
│  ┌──────────────────┐         ┌──────────────────────────┐  │
│  │   Admin Dashboard │  REST   │    BondPay Terminal       │  │
│  │   (SPA)           │◄──────►│    (ESP8266 + RFID)       │  │
│  └──────────────────┘         └──────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Tech Stack:**
- **Mobile:** React Native + Expo SDK 56, Zustand, expo-sqlite, expo-secure-store
- **Server:** Node.js + Express.js v5, PostgreSQL (Supabase)
- **Crypto:** Ed25519 (@noble/ed25519), SHA-256
- **Auth:** JWT (30-day expiry), bcrypt (salt=10)
- **Admin:** Single-page app with CRUD operations
- **Terminal:** ESP8266 + MFRC522 RFID + LCD

---

## SLIDE 7: Cryptographic Foundation

### Ed25519 Digital Signatures

**Why Ed25519 over RSA or ECDSA?**

| Property | Ed25519 | RSA-2048 | ECDSA P-256 |
|----------|---------|----------|-------------|
| Signature size | **64 bytes** | 256 bytes | 64 bytes |
| Public key size | **32 bytes** | 256 bytes | 64 bytes |
| Signing speed | **~87,000/s** | ~1,500/s | ~30,000/s |
| Verification speed | **~38,000/s** | ~40,000/s | ~12,000/s |
| Security level | 128-bit | 112-bit | 128-bit |
| QR code fit | **Excellent** | Poor | Good |

**Ed25519 produces compact 64-byte signatures that fit in a single QR code frame.**

### Two Key Pairs

**Server Key Pair:**
- Private key: Stored in `.env` (base64)
- Purpose: Signs every bond issued
- Public key: Served via `GET /server/public-key`
- Key version: `v1.0` (supports future rotation)

**User Key Pair:**
- Generated on device using `@noble/ed25519` + `expo-crypto`
- Private key: Stored in device secure enclave (expo-secure-store)
- Purpose: Signs transactions when sending offline
- Public key: Uploaded to server during registration

### SHA-256 Pre-Hashing

Before signing, data is SHA-256 hashed to prevent length-extension attacks:

```
data = "BOND-uuid500user12316873344001687334400v1.0"
hash = SHA-256(data)  →  32-byte digest
signature = Ed25519_Sign(hash, privateKey)  →  64-byte signature
```

---

## SLIDE 8: Bond Issuance Flow

### How Bonds Are Created

```
User App                           Server
  │                                  │
  │  POST /bonds/issue               │
  │  { totalAmount: 1000,            │
  │    ttlDays: 30 }                 │
  │  ─────────────────────────────►  │
  │                                  │
  │  1. Validate:                    │
  │     - Amount % min_denom == 0    │
  │     - online_balance >= amount   │
  │     - offline_total + amount     │
  │       <= max_capacity (10,000)   │
  │                                  │
  │  2. FOR UPDATE lock:             │
  │     Lock user's balance row      │
  │     (prevents race conditions)   │
  │                                  │
  │  3. Denomination breakdown:      │
  │     1000 NPR → [500, 500]        │
  │     (greedy algorithm)           │
  │                                  │
  │  4. For each denomination:       │
  │     - Generate BOND-<uuid>       │
  │     - Sign: SHA256(bondId +      │
  │       value + ownerId + issuedAt │
  │       + expiresAt + keyVersion)  │
  │     - Ed25519 sign with          │
  │       server private key         │
  │                                  │
  │  5. Atomic transaction:          │
  │     BEGIN                        │
  │     UPDATE users SET             │
  │       online_balance -= amount   │
  │     INSERT INTO issued_bonds     │
  │     INSERT INTO transactions     │
  │     COMMIT                       │
  │                                  │
  │  { bonds: [...],                 │
  │    newOnlineBalance }            │
  │  ◄─────────────────────────────  │
  │                                  │
  │  6. Store bonds in local SQLite  │
  │     status = 'available'         │
```

### Denomination Algorithm

Available denominations (in paisa): `[1000, 500, 100, 50, 20, 10, 5]`

```
Input: 2700 NPR (270000 paisa)

Algorithm (greedy, flexibility-optimized):
  - If amount > 100 NPR, skip single-denomination matches
  - Break down from largest to smallest

Result: [1000, 1000, 500, 100, 100] → 5 bonds
         10NPR  10NPR  5NPR  1NPR  1NPR
```

This ensures users receive varied denominations they can split for future payments.

### Bond Expiry (TTL)

Users can select bond validity: **1, 3, 7, 14, or 30 days**

- Server accepts custom `ttlDays` parameter (clamped to 1–90 days)
- Default: 30 days from system config
- Bonds expire automatically — checked during sync
- Expired bonds are rejected and become worthless

---

## SLIDE 9: The 4 Transaction Flows (Deep Dive)

### Mode 1: Online → Online

```
Sender (Online)                Server                   Receiver (Online)
     │                           │                          │
     │  Scan QR: {userId,        │                          │
     │  name, pubKey, amount,    │                          │
     │  mode:"online"}           │                          │
     │                           │                          │
     │  POST /wallet/            │                          │
     │    transfer-online        │                          │
     │  {receiverId, amount}     │                          │
     │  ──────────────────────►  │                          │
     │                           │  SELECT FOR UPDATE       │
     │                           │  (lock both user rows)   │
     │                           │  Deduct sender balance   │
     │                           │  Credit receiver balance │
     │                           │  INSERT P2P_ONLINE tx    │
     │  {onlineBalance, txId}    │                          │
     │  ◄──────────────────────  │                          │
     │                           │    Balance auto-updates  │
```

**Security:** Row-level locking prevents double-spend race conditions.

### Mode 2: Online → Offline (Pending Pickup)

```
Sender (Online)                Server                   Receiver (Offline)
     │                           │                          │
     │  POST /wallet/            │                          │
     │    transfer-pending       │                          │
     │  {receiverId, amount}     │                          │
     │  ──────────────────────►  │                          │
     │                           │  Deduct sender balance   │
     │                           │  Create pickup record    │
     │                           │  Generate 6-char code    │
     │                           │  Sign pickup (Ed25519)   │
     │  {pickupId, pickupCode,   │                          │
     │   serverSig, expiresAt}   │                          │
     │  ◄──────────────────────  │                          │
     │                           │                          │
     │  Display Multi-QR         │     (later) scan QR      │
     │  with pickup payload      │     Verify server sig    │
     │                           │     Store locally        │
     │                           │                          │
     │                           │  POST /wallet/           │
     │                           │    claim-pending         │
     │                           │  ◄─────────────────────  │
     │                           │  Verify pickup valid     │
     │                           │  Credit receiver balance │
```

**Security:** Pickup expires after 48 hours. Auto-refund if unclaimed.

### Mode 3: Offline → Online

```
Sender (Offline)                                    Receiver (Online)
     │                                                     │
     │  Display receiver QR:                               │
     │  {userId, name, pubKey, amount, mode:"offline"}     │
     │                                                     │
     │  ◄────────────────────────────────────────────────  │
     │                                                     │
     │  1. Select bonds (exact change algorithm)           │
     │  2. Sign transaction with Ed25519                   │
     │  3. Mark bonds as 'spent' locally                   │
     │                                                     │
     │  Display Multi-QR receipt:                          │
     │  {txId, senderId, receiverId, amount, nonce,        │
     │   senderPubKey, sig, bonds[], message}              │
     │                                                     │
     │  ─────────────────────────────────────────────────►  │
     │                                                     │
     │  4. Verify:                                         │
     │     - Server sig on EACH bond                       │
     │     - Sender's transaction sig                      │
     │     - Bond expiry check                             │
     │     - Duplicate detection                           │
     │     - Amount validation                             │
     │                                                     │
     │  5. Store bonds locally                             │
     │     status = 'received_pending_sync'                │
     │                                                     │
     │  6. Auto-sync (POST /transactions/sync)             │
     │     → Server redeems bonds                          │
     │     → Receiver online_balance += amount             │
```

**Security:** Every bond is individually verified against the server's Ed25519 public key.

### Mode 4: Offline → Offline

Same as Mode 3 for the transfer, but settlement is **deferred** until either party comes online and syncs. Maximum flexibility for fully disconnected environments.

---

## SLIDE 10: Offline Transaction Security

### The Verification Chain

When a receiver gets bonds offline, they verify:

```
┌─────────────────────────────────────────────────────────┐
│                 VERIFICATION CHAIN                       │
│                                                         │
│  1. Server Signature on Each Bond                       │
│     ┌─────────────────────────────────────────────┐     │
│     │ data = bondId + value + ownerId +           │     │
│     │        issuedAt + expiresAt + keyVersion    │     │
│     │ hash = SHA-256(data)                        │     │
│     │ valid = Ed25519_Verify(hash, sig, serverPK) │     │
│     └─────────────────────────────────────────────┘     │
│                                                         │
│  2. Sender's Transaction Signature                      │
│     ┌─────────────────────────────────────────────┐     │
│     │ data = txId + senderId + receiverId +       │     │
│     │        amount + timestamp + nonce +          │     │
│     │        sortedBondIds + message               │     │
│     │ hash = SHA-256(data)                        │     │
│     │ valid = Ed25519_Verify(hash, sig, senderPK) │     │
│     └─────────────────────────────────────────────┘     │
│                                                         │
│  3. Bond Expiry Check                                   │
│     ┌─────────────────────────────────────────────┐     │
│     │ if (bond.expiresAt <= now) → REJECT         │     │
│     └─────────────────────────────────────────────┘     │
│                                                         │
│  4. Duplicate Detection                                 │
│     ┌─────────────────────────────────────────────┐     │
│     │ SELECT tx_id FROM transactions              │     │
│     │ WHERE tx_id = ? → if exists → REJECT       │     │
│     └─────────────────────────────────────────────┘     │
│                                                         │
│  5. Amount Validation                                   │
│     ┌─────────────────────────────────────────────┐     │
│     │ sum(bond.values) == transaction.amount      │     │
│     │ if mismatch → REJECT                        │     │
│     └─────────────────────────────────────────────┘     │
│                                                         │
│  ALL CHECKS MUST PASS → Accept bond                     │
│  ANY CHECK FAILS → Reject bond                          │
└─────────────────────────────────────────────────────────┘
```

### Exact Change Algorithm (Subset-Sum)

When sending offline, the sender must select bonds that sum **exactly** to the requested amount:

```
Available bonds: [500, 200, 100, 100, 50, 50]
Requested amount: 500

Memoized backtracking solver:
  - Try 500 → exact match found ✓
  - Result: [500]

Available bonds: [1000, 500, 200, 100]
Requested amount: 800

Solver:
  - Try 1000 → exceeds target, skip
  - Try 500 → remaining 300
    - Try 200 → remaining 100
      - Try 100 → exact match ✓
  - Result: [500, 200, 100]
```

If no exact match exists, the user is shown available denominations and asked to adjust the amount.

---

## SLIDE 11: Synchronization Protocol

### How Offline Transactions Settle

```
Client                                    Server
  │                                         │
  │  1. Fetch pending transactions          │
  │     SELECT * FROM transactions          │
  │     WHERE sync_status IN                │
  │       ('pending', 'pending_pickup')     │
  │                                         │
  │  2. Process pickup claims first         │
  │     POST /wallet/claim-pending          │
  │     { pickupId }                        │
  │     ────────────────────────────────►   │
  │     { onlineBalance }                   │
  │     ◄────────────────────────────────   │
  │                                         │
  │  3. Build batch payload                 │
  │     Separate: incoming vs outgoing      │
  │     Attach full bond data to each tx    │
  │                                         │
  │  POST /transactions/sync                │
  │  { batchId, incoming[], outgoing[] }    │
  │  ────────────────────────────────►      │
  │                                         │  For each transaction:
  │                                         │    - Verify sender signature
  │                                         │    - Verify each bond's server sig
  │                                         │    - Check bond ownership
  │                                         │    - Double-spend check
  │                                         │      (bond_redemptions table)
  │                                         │    - If valid: redeem + credit
  │                                         │    - If double-spend: FLAG fraud
  │                                         │
  │  { accepted[], rejected[], flagged[],   │
  │    updatedOnlineBalance }               │
  │  ◄────────────────────────────────      │
  │                                         │
  │  4. Process response locally            │
  │     Accepted: mark synced, delete bonds │
  │     Rejected: mark failed               │
  │     Flagged: mark flagged + fraud alert │
  │                                         │
  │  5. Refresh state                       │
  │     GET /bonds/active → local bonds     │
  │     GET /auth/me → online balance       │
```

### Batch Deduplication

Each sync batch gets a unique `batchId` (UUID). The server checks the `sync_batches` table:
- If `batchId` already exists → return cached result (idempotent)
- If new → process and store result

This prevents duplicate processing if the client retries due to network issues.

### Double-Spend Detection

The `bond_redemptions` table is the authoritative ledger:

```sql
-- During sync, for each bond:
SELECT bond_id FROM bond_redemptions WHERE bond_id = ?

-- If exists: DOUBLE_SPEND detected!
-- → Create fraud_flags entry
-- → Reject transaction
-- → Flag severity: HIGH
```

---

## SLIDE 12: Multi-QR Protocol

### Solving the QR Code Size Limit

**Problem:** A single QR code holds ~300 characters. A bond transfer payload with multiple bonds can exceed 3,000 characters.

**Solution:** Animated QR Carousel — split payload into chunks, display in rapid succession.

### Chunk Format

```json
{
  "v": 1,              // Protocol version
  "sid": "A3F1B2",    // Session ID (links all chunks)
  "i": 0,              // Chunk index (0-based)
  "t": 10,             // Total number of chunks
  "d": "...",          // Data fragment (300 chars)
  "cs": "a1b2c3d4"    // Checksum of FULL payload
}
```

### Encoding Process

```
Full Payload (3000 chars)
  │
  ├── Compute checksum (DJB2 hash)
  ├── Generate session ID (6-char alphanumeric)
  ├── Split into 300-char chunks
  │
  ├── Chunk 0: { v:1, sid:"A3F1B2", i:0, t:10, d:"...", cs:"..." }
  ├── Chunk 1: { v:1, sid:"A3F1B2", i:1, t:10, d:"...", cs:"..." }
  ├── ...
  └── Chunk 9: { v:1, sid:"A3F1B2", i:9, t:10, d:"...", cs:"..." }
  
  Display: QR codes cycle at 333ms per frame
```

### Decoding Process

```
QR Scanner receives chunks
  │
  ├── Parse each as JSON
  ├── Validate: version, session ID, fields
  ├── Place data fragment at correct index
  ├── Track progress (scannedCount / totalCount)
  │
  └── When all chunks received:
      ├── Join all fragments
      ├── Verify checksum
      ├── If match → pass to handler
      └── If mismatch → request re-send
```

### Fallback

If a scanned QR contains a complete payload (not a QRChunk envelope), it's passed directly to the handler. Supports single-frame transfers for small payloads.

---

## SLIDE 13: Security Measures

### Comprehensive Security Architecture

**1. Cryptographic Bond Verification**
- Every bond signed by server with Ed25519
- 64-byte signatures fit in QR codes
- Verified offline without server call
- SHA-256 pre-hashing prevents length-extension attacks

**2. Transaction Signing**
- Users sign transactions with their Ed25519 private key
- Prevents unauthorized bond transfers
- Signature includes: txId, sender, receiver, amount, timestamp, nonce, bond IDs

**3. Double-Spend Prevention**
- `bond_redemptions` table tracks all redeemed bonds
- During sync, each bond is checked against redemption ledger
- Duplicate detection before credit
- Fraud flags created for attempted double-spends

**4. Race Condition Prevention**
- PostgreSQL `SELECT ... FOR UPDATE` row locks
- Atomic database transactions (BEGIN/COMMIT/ROLLBACK)
- Prevents concurrent balance manipulation

**5. Replay Attack Prevention**
- 16-byte random nonce per transaction
- Batch ID deduplication
- Timestamp validation

**6. Private Key Protection**
- Keys stored in device secure enclave (expo-secure-store)
- Never transmitted over network
- Per-user key isolation

**7. Single Active Device**
- Only one device per account
- Force login revokes all active bonds
- Prevents account sharing fraud

**8. Bond Expiry (TTL)**
- Configurable: 1, 3, 7, 14, 30 days
- Prevents infinite bond accumulation
- Expired bonds rejected during sync

**9. Offline Floor Limits**
- Maximum 10,000 NPR offline per user
- Server-side enforcement with row locks
- Prevents large-scale offline fraud

**10. Fraud Flagging System**
- Automatic detection during sync
- Severity levels: LOW, MEDIUM, HIGH, CRITICAL
- Types: DOUBLE_SPEND, VELOCITY, REVIEW
- Admin dashboard for monitoring

---

## SLIDE 14: Database Design

### Server Database (PostgreSQL) — 8 Tables

```
┌─────────────────┐     ┌──────────────────┐
│     users        │     │   issued_bonds    │
│─────────────────│     │──────────────────│
│ user_id (PK)    │◄────│ owner_id (FK)    │
│ phone_number    │     │ bond_id (PK)     │
│ email           │     │ value            │
│ full_name       │     │ server_signature │
│ password_hash   │     │ status           │
│ public_key      │     │ expires_at       │
│ online_balance  │     └──────────────────┘
│ active_device_id│
│ ttl_hours       │     ┌──────────────────┐
└─────────────────┘     │ pending_pickups   │
                        │──────────────────│
┌─────────────────┐     │ pickup_id (PK)   │
│  transactions   │     │ sender_id (FK)   │
│─────────────────│     │ receiver_id (FK) │
│ tx_id (PK)      │     │ pickup_code      │
│ tx_type         │     │ server_sig       │
│ sender_id (FK)  │     │ status           │
│ receiver_id(FK) │     │ expires_at       │
│ total_amount    │     └──────────────────┘
│ sender_signature│
│ status          │     ┌──────────────────┐
└─────────────────┘     │ bond_redemptions  │
                        │──────────────────│
┌─────────────────┐     │ bond_id (PK,FK)  │
│  fraud_flags    │     │ tx_id            │
│─────────────────│     │ redeemed_by      │
│ flag_id (PK)    │     │ redeemed_at      │
│ user_id (FK)    │     │ batch_id         │
│ flag_type       │     └──────────────────┘
│ severity        │
│ details (JSONB) │     ┌──────────────────┐
└─────────────────┘     │  sync_batches    │
                        │──────────────────│
┌─────────────────┐     │ batch_id (PK)    │
│ system_config   │     │ user_id (FK)     │
│─────────────────│     │ result (JSONB)   │
│ config_key (PK) │     └──────────────────┘
│ config_value    │
│ updated_at      │
└─────────────────┘
```

### Mobile Database (SQLite) — 3 Tables

```
┌─────────────────┐     ┌──────────────────┐
│     bonds        │     │   transactions   │
│─────────────────│     │──────────────────│
│ bond_id (PK)    │     │ tx_id (PK)       │
│ value           │     │ sender_id        │
│ owner_id        │     │ receiver_id      │
│ server_signature│     │ total_amount     │
│ status          │     │ sender_signature │
│ local_tx_id     │     │ sync_status      │
└─────────────────┘     │ role             │
                        └──────────────────┘
┌─────────────────────────┐
│    transaction_bonds     │
│─────────────────────────│
│ tx_id + bond_id (PK)    │
│ direction (in/outgoing) │
└─────────────────────────┘
```

---

## SLIDE 15: UI/UX Design

### Design Philosophy

BondPay follows **premium fintech aesthetics**:

- **Trust:** Clean, professional appearance
- **Clarity:** Strong visual hierarchy
- **Simplicity:** Minimal cognitive load
- **Confidence:** Premium banking-app feel

### Home Screen Layout

```
┌─────────────────────────────┐
│ ● ONLINE (WiFi)             │  ← Connectivity banner
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ [AV] Hi, Ramesh         │ │  ← Dashboard card
│ │      Welcome to BondPay │ │    (unified container)
│ │                         │ │
│ │ Total Balance           │ │
│ │ रू 10,000          [👁] │ │  ← Balance with toggle
│ │                         │ │
│ │ ████████░░░░░░░░░░░░░░ │ │  ← Progress bar
│ │ ●Online  ●Pending ●Off  │ │
│ └─────────────────────────┘ │
│                             │
│ QUICK ACTIONS               │
│ ┌─────┐ ┌─────┐ ┌─────┐   │
│ │Send │ │Recv │ │Topup│   │  ← Lightweight actions
│ └─────┘ └─────┘ └─────┘   │
│ ┌─────┐ ┌─────┐ ┌─────┐   │
│ │Load │ │Revrs│ │Sync │   │
│ └─────┘ └─────┘ └─────┘   │
│                             │
│ RECENT PAYMENTS             │
│ ┌─────────────────────────┐ │
│ │ John S.  +रू 500  2h ago│ │  ← Transaction list
│ │ Mary K.  -रू 200  5h ago│ │
│ └─────────────────────────┘ │
│                             │
├─────────────────────────────┤
│ 🏠    🕐    [📷]    👤    •••│  ← Bottom nav + scan FAB
└─────────────────────────────┘
```

### Key UI Features

1. **Connectivity Banner** — Always visible at top, color-coded:
   - Green = Online (WiFi)
   - Orange = Online (Cellular)
   - Red = Offline
   - Grey = Checking

2. **Unified Dashboard Card** — Single visual container with:
   - Avatar (48dp circular)
   - Greeting + welcome text
   - Settings + logout icons (white on blue)
   - Large balance display (38sp)
   - Balance visibility toggle (eye icon)
   - Progress bar (online/pending/offline)
   - Balance breakdown with color dots

3. **Lightweight Quick Actions** — 6 icon buttons in 3×2 grid:
   - Send (blue), Receive (green), Topup (orange)
   - Load Bond (blue), Reverse (red), Sync (purple)

4. **Recent Payments** — Transaction list with:
   - Avatar initials, name, amount, timestamp
   - Status badge (completed/pending)
   - Empty state with icon

5. **Bottom Navigation** — 4 tabs + center scan FAB:
   - Home, History, [SCAN], Account, More
   - Scan button: raised circular, navigates to Send

6. **More Menu** — Bottom sheet with:
   - Settings, Help & Support, App Logs
   - Cancel button to dismiss

### Dark Mode

Full dark mode support across all screens:
- Background: `#0D0D0D`
- Cards: `#1A1A1A`
- Text: `#FFF` / `#AAA`
- Accent: `#4D66D9`

---

## SLIDE 16: BondPay Terminal

### ESP8266-Based RFID Payment Station

**Hardware Components:**
- ESP8266 (NodeMCU 1.0) — WiFi MCU
- MFRC522 — RFID card reader
- 16x2 I2C LCD — status display
- Green LED — success indicator
- Red LED — error indicator
- Buzzer — audio feedback

**Use Case:** Merchant environments where customers tap RFID cards to pay.

**How it works:**
1. Terminal creates WiFi hotspot ("BondPay Station")
2. Merchant accesses web dashboard at `192.168.4.1`
3. Customer taps RFID card
4. Terminal displays balance and processes payment
5. Transaction history stored locally

**Documentation:**
- Installation guide
- User guide
- Wiring diagram

---

## SLIDE 17: Admin Console

### Server Management Dashboard

**Access:** `GET /admin` (SPA served by Express)

**Features:**

| Tab | Functionality |
|-----|--------------|
| Dashboard | Total users, balances, bonds, fraud flags |
| Users | CRUD with search/filter |
| Bonds | View all, update status, manual issuance |
| Transactions | View all, manual ledger entries |
| Config | Edit system parameters |

**Security:** Admin JWT authentication with `isAdmin: true` claim.

---

## SLIDE 18: Demo Script

### Live Demo Flow (5 minutes)

**Setup:**
1. Two phones with BondPay installed
2. Phone A: User "Ramesh" with NPR 5,000 online balance
3. Phone B: User "Sita" (fresh account)

**Demo Steps:**

**Step 1: Topup (30 seconds)**
- Phone A: Open → Topup → Enter 5,000 → Confirm
- Show balance updated

**Step 2: Load Bonds (30 seconds)**
- Phone A: Load Bond → Enter 3,000 → Select 7-day expiry → Load
- Show bonds created, balance split

**Step 3: Mode 1 — Online Transfer (1 minute)**
- Phone B: Receive → Show QR
- Phone A: Send → Scan QR → Enter 500 → Confirm
- Show instant balance update on both phones

**Step 4: Mode 4 — Offline Transfer (2 minutes)**
- Enable Airplane mode on Phone A
- Phone B: Receive → Show QR → Select "Offline" mode
- Phone A: Send → Scan QR → Select bonds → Confirm
- Show multi-QR animation on Phone A
- Phone B: Scan multi-QR → Verify bonds received
- Show offline balance on Phone B

**Step 5: Sync (1 minute)**
- Disable Airplane mode on Phone A
- Phone A: Pull to refresh → Sync
- Show bonds redeemed, balances updated on server
- Verify on Phone B: balance reflects the transfer

**Key points to emphasize:**
- Cryptographic verification happened offline
- No server was needed during the offline transfer
- Settlement happened automatically upon connectivity
- Double-spend was checked and prevented

---

## SLIDE 19: Presentation Script

### 3-Speaker Format

**Speaker 1 — The Visionary (3 minutes)**
- Open with the problem: Nepal's connectivity gap
- Paint the picture: trekking routes, rural villages, disaster zones
- Introduce BondPay: "What if your money worked even when the internet didn't?"
- Explain the bond concept: digital banknotes
- Show the 4 transaction modes
- End with impact: financial inclusion for 35% of Nepal

**Speaker 2 — The Hacker (5 minutes)**
- Walk through architecture diagram
- Explain Ed25519 cryptography (keep it accessible)
- Show the bond issuance flow
- Demo the offline transfer (live or video)
- Explain the security measures
- Show the admin dashboard
- Emphasize: "Every bond is cryptographically verified, even offline"

**Speaker 3 — The Strategist (2 minutes)**
- Show the UI/UX design
- Walk through the home screen
- Show the bottom navigation with scan FAB
- Explain the connectivity banner
- Show dark mode support
- Discuss the BondPay Terminal
- End with future vision: NRB compliance, production deployment

### Key Phrases to Use

- "Payments shouldn't stop when the internet does"
- "Digital banknotes for the offline world"
- "Cryptographically verified, even without a connection"
- "From topup to bond to transfer to settlement — a complete cash flow"
- "Zero trust, full verification"
- "Financial inclusion through cryptographic innovation"

---

## SLIDE 20: Q&A Preparation

### Anticipated Judge Questions & Answers

**Q1: How do you prevent double-spending offline?**
A: "We can't fully prevent it offline — just like cash. But we detect it during sync via the `bond_redemptions` ledger. When a bond is redeemed, it's recorded. If someone tries to spend the same bond twice, the second attempt is flagged as `DOUBLE_SPEND` with `HIGH` severity. The fraud is caught within seconds of coming online."

**Q2: What if someone forges a bond?**
A: "Every bond is signed by the server's Ed25519 private key. The receiver verifies this signature offline using the server's public key. Forging a bond would require breaking Ed25519, which has 128-bit security — equivalent to 2^128 operations. That's computationally infeasible."

**Q3: What happens if the server goes down?**
A: "Offline transfers continue working. Bonds are verified locally. When the server comes back, sync resumes. The system is designed for intermittent connectivity — the server is only needed for issuance and settlement, not for transfers."

**Q4: How is this different from just sending screenshots of QR codes?**
A: "QR codes contain cryptographically signed data, not just images. Each bond has a unique ID, is signed by the server, and is tracked in the redemption ledger. Copying a QR code is like photocopying cash — the serial number is already spent."

**Q5: What about the 10,000 NPR offline limit?**
A: "The server enforces a per-user maximum of 10,000 NPR in offline bonds. This is checked with row-level locking to prevent race conditions. The client also refreshes balances from the server before each load to prevent stale-state bypass."

**Q6: How do you handle bond expiry?**
A: "Users select bond validity when loading: 1, 3, 7, 14, or 30 days. The expiry is embedded in the bond data and signed by the server. During sync, expired bonds are rejected. This prevents infinite accumulation and encourages regular settlement."

**Q7: What about the exact change problem?**
A: "Our denomination algorithm breaks amounts into flexible denominations: [10, 5, 1, 0.50, 0.20, 0.10, 0.05] NPR. When sending offline, a memoized subset-sum solver finds the exact combination. If no exact match exists, the user is shown available denominations."

**Q8: Can this scale to millions of users?**
A: "As a hackathon prototype, it's designed for correctness over scale. For production, we'd add: Redis caching, connection pooling, read replicas, and potentially a blockchain layer for the redemption ledger. The current PostgreSQL architecture supports thousands of concurrent users."

**Q9: What about regulatory compliance?**
A: "This is a hackathon prototype, not a production financial system. For real deployment, we'd need NRB (Nepal Rastra Bank) licensing, KYC/AML compliance, and audit trails. The system architecture supports these additions."

**Q10: What's the business model?**
A: "For the hackathon, we focused on the technology. Potential models: transaction fees (1-2%), merchant terminal licensing, white-label solution for banks, or government financial inclusion programs."

**Q11: How does the Multi-QR protocol work?**
A: "Large payloads are split into 300-character chunks, each wrapped in a JSON envelope with session ID, index, and checksum. These cycle at 333ms per frame as animated QR codes. The receiver accumulates chunks until complete, then verifies the checksum. It's like streaming data through visual frames."

**Q12: What about the single active device policy?**
A: "When a user logs in from a new device, the server detects the device ID mismatch. Without force-login, it returns 409. With force-login, all active bonds are revoked and their value returned to online balance. This prevents account sharing and limits fraud surface."

---

## Appendix: File Structure

```
BondPay/
├── src/
│   ├── screens/
│   │   ├── HomeScreen.tsx          (1,184 lines — redesigned dashboard)
│   │   ├── SendScreen.tsx          (590 lines — 4-mode send flow)
│   │   ├── ReceiveScreen.tsx       (454 lines — receive + verification)
│   │   ├── AccountScreen.tsx
│   │   ├── SettingsScreen.tsx
│   │   ├── SupportScreen.tsx
│   │   ├── TransactionHistoryScreen.tsx
│   │   └── LogsScreen.tsx
│   ├── components/
│   │   ├── CustomTabBar.tsx        (bottom nav + scan FAB)
│   │   ├── MoreMenu.tsx            (settings/support sheet)
│   │   ├── MultiQRDisplay.tsx      (QR animation)
│   │   └── MultiQRScanner.tsx      (QR accumulation)
│   ├── services/
│   │   ├── sync.service.ts         (offline-to-online reconciliation)
│   │   ├── crypto.service.ts       (Ed25519 key management)
│   │   ├── config.service.ts       (system config)
│   │   └── multiqr.service.ts      (QR chunk encoding)
│   ├── store/
│   │   └── useAppStore.ts          (Zustand state)
│   ├── database/
│   │   └── db.ts                   (SQLite schema)
│   └── navigation/
│       ├── AppNavigator.tsx        (tabs + stack)
│       └── RootNavigator.tsx       (auth routing)

bondpay-server/
├── src/
│   ├── controllers/
│   │   ├── auth.controller.ts      (register, login, logout)
│   │   ├── bonds.controller.ts     (issue, active bonds)
│   │   ├── wallet.controller.ts    (topup, transfer, reverse)
│   │   ├── transactions.controller.ts (sync)
│   │   └── admin.controller.ts     (CRUD)
│   ├── middleware/
│   │   ├── auth.middleware.ts       (JWT verification)
│   │   └── admin.middleware.ts      (admin check)
│   ├── services/
│   │   ├── crypto.service.ts       (Ed25519 server-side)
│   │   └── config.service.ts       (dynamic config)
│   ├── database/
│   │   ├── db.ts                   (PostgreSQL pool)
│   │   └── schema.sql              (8 tables)
│   └── server.ts                   (Express entry)
```
