# BondPay — Step-by-Step Technical Implementation Plan & Developer Guide
### Offline BLE-Based Payment System
**Document Type: Build Plan & Developer Reference | Target Hackathon MVP & Production Roadmap**

---

## 1. Introduction & Overview

This document provides a comprehensive, step-by-step developer guide for building the BondPay system. It translates the high-level architecture into concrete, actionable engineering steps, detailing exact code structures, configurations, databases, cryptographic operations, and hardware pinouts.

### Core Payment Mechanism (The QR-BLE Handshake)
Instead of streaming transaction payloads through flashing QR code carousels, the system uses a **pairing-free, ephemeral Bluetooth Low Energy (BLE) connection** assisted by a lightweight QR code:
1. **Receiver (GATT Server / Advertiser)**: Starts BLE advertising under a randomized temporary Service UUID and displays a QR containing the session parameters (Receiver ID, Session ID, BLE Service UUID, Nonce, Timestamp, Protocol Version, and Security Metadata).
2. **Sender (GATT Client / Central)**: Scans the QR, parses the session parameters, searches for the Service UUID, and automatically connects via BLE without manual pairing or PIN prompts.
3. **Data Transfer**: Sender selects bonds using a local Subset-Sum exact-change algorithm, signs the transaction offline inside the Secure Enclave, segments the transaction payload into MTU-sized chunks, and transmits them sequentially over BLE.
4. **Verification & Storage**: Receiver reassembles the chunks, verifies the server's signatures on each bond and the sender's signature on the transaction, saves the transaction to SQLite, sends a final ACK, and closes the connection.

---

## 2. Prerequisites & Environment Setup

Before starting, ensure the following developer environments are configured:

### 2.1 Developer Tools & Environments
*   **NodeJS**: Version 18.x or 20.x (LTS)
*   **Expo CLI / React Native SDK**: Expo SDK 56+ (supporting native iOS/Android builds)
*   **Arduino IDE**: Version 2.x for ESP32 hardware compilation
*   **Git**: For version control
*   **Docker** (Optional, for running Supabase local containers) or a cloud **Supabase Account**

### 2.2 Key Dependency Installation
On the mobile React Native client, install the following core packages:
```bash
# Core Expo and Navigation packages
npx expo install expo-router react-native-safe-area-context react-native-screens react-native-gesture-handler

# Database & Storage
npx expo install expo-sqlite expo-secure-store

# Bluetooth Low Energy
npm install react-native-ble-plx
npx expo install expo-dev-client

# Cryptography & Utilities
npm install @noble/ed25519 react-native-get-random-values react-native-quick-crypto
```
*Note: Because `react-native-ble-plx` and `react-native-quick-crypto` rely on native C++ bindings, you must configure a native dev client utilizing custom Expo config plugins. Avoid running the app inside the standard Expo Go client.*

---

## 3. Phase 1: Database Setup & Migration

The system operates two databases: a server-side PostgreSQL database (managed via Supabase) and a local client-side SQLite database.

### 3.1 Server-Side Supabase PostgreSQL Setup
Execute the following DDL script in the Supabase SQL editor:

```sql
-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Users Table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    public_key TEXT,
    online_balance BIGINT NOT NULL DEFAULT 0 CHECK (online_balance >= 0),
    is_frozen BOOLEAN NOT NULL DEFAULT false,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active_device_id TEXT,
    ttl_hours INTEGER DEFAULT 72,
    encrypted_key_backup TEXT,
    key_backup_salt TEXT
);

-- 3. Create Issued Bonds Table
CREATE TABLE issued_bonds (
    bond_id TEXT PRIMARY KEY,
    value BIGINT NOT NULL CHECK (value > 0),
    owner_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    issued_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    server_key_version TEXT NOT NULL,
    server_signature TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'expired', 'revoked'))
);

CREATE INDEX idx_issued_bonds_owner ON issued_bonds(owner_id);
CREATE INDEX idx_issued_bonds_status ON issued_bonds(status);

-- 4. Create Pending Pickups Table (Mode 2 transfers)
CREATE TABLE pending_pickups (
    pickup_id TEXT PRIMARY KEY,
    sender_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    amount BIGINT NOT NULL CHECK (amount > 0),
    pickup_code TEXT UNIQUE NOT NULL,
    server_sig TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'expired')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    claimed_at TIMESTAMPTZ
);

-- 5. Create Transactions Audit Table
CREATE TABLE transactions (
    tx_id TEXT PRIMARY KEY,
    tx_type TEXT NOT NULL DEFAULT 'P2P_OFFLINE' CHECK (tx_type IN ('P2P_OFFLINE', 'P2P_ONLINE', 'P2P_PENDING', 'BOND_LOAD', 'BOND_REVERSE', 'TOPUP', 'BOND_REFUND')),
    sender_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    receiver_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    total_amount BIGINT NOT NULL CHECK (total_amount > 0),
    tx_timestamp TIMESTAMPTZ NOT NULL,
    nonce TEXT,
    sender_signature TEXT,
    message TEXT,
    is_offline BOOLEAN NOT NULL DEFAULT false,
    status TEXT DEFAULT 'accepted' CHECK (status IN ('accepted', 'pending', 'failed', 'flagged')),
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Create Bond Redemptions Table
CREATE TABLE bond_redemptions (
    bond_id TEXT PRIMARY KEY REFERENCES issued_bonds(bond_id) ON DELETE CASCADE,
    tx_id TEXT NOT NULL REFERENCES transactions(tx_id) ON DELETE CASCADE,
    redeemed_by UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    redeemed_from UUID REFERENCES users(user_id) ON DELETE SET NULL,
    redeemed_at TIMESTAMPTZ DEFAULT NOW(),
    batch_id TEXT NOT NULL
);

-- 7. Create Fraud Flags Table
CREATE TABLE fraud_flags (
    flag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    tx_id TEXT REFERENCES transactions(tx_id) ON DELETE CASCADE,
    bond_id TEXT REFERENCES issued_bonds(bond_id) ON DELETE CASCADE,
    flag_type TEXT NOT NULL CHECK (flag_type IN ('DOUBLE_SPEND', 'VELOCITY', 'REVIEW')),
    severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- 8. Create Sync Batches Tracking Table
CREATE TABLE sync_batches (
    batch_id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    submitted_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ,
    result JSONB
);

-- 9. Create System Config Table
CREATE TABLE system_config (
    config_key TEXT PRIMARY KEY,
    config_value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed System configurations
INSERT INTO system_config (config_key, config_value, description) VALUES
('min_denomination', '5', 'Minimum bond denomination in NPR'),
('max_offline_capacity', '10000', 'Maximum offline bond capacity in NPR per user'),
('qr_switching_delay', '333', 'Delay in milliseconds between switching QR frames in multi-QR carousel'),
('max_bonds_per_request', '50', 'Maximum number of bonds that can be generated in a single issue request'),
('bond_ttl_days', '30', 'Default bond validity duration in days')
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  description = EXCLUDED.description;
```

### 3.2 Client-Side SQLite Schema
On app initialization, verify the existence of the following SQLite tables using the `expo-sqlite` service:

```typescript
import * as SQLite from 'expo-sqlite';

export async function initializeLocalDatabase() {
  const db = await SQLite.openDatabaseAsync('bondpay.db');
  
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS bonds (
      bond_id           TEXT PRIMARY KEY,
      value             INTEGER NOT NULL,
      owner_id          TEXT NOT NULL,
      issued_at         INTEGER NOT NULL,
      expires_at        INTEGER NOT NULL,
      issued_by_server  TEXT NOT NULL,
      server_signature  TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'available',
      local_tx_id       TEXT,
      received_at       INTEGER,
      created_at        INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_bonds_status ON bonds(status);
    CREATE INDEX IF NOT EXISTS idx_bonds_owner ON bonds(owner_id);

    CREATE TABLE IF NOT EXISTS transactions (
      tx_id              TEXT PRIMARY KEY,
      sender_id          TEXT NOT NULL,
      receiver_id        TEXT NOT NULL,
      total_amount       INTEGER NOT NULL,
      timestamp          INTEGER NOT NULL,
      nonce              TEXT NOT NULL,
      sender_public_key  TEXT NOT NULL,
      sender_signature   TEXT NOT NULL,
      role               TEXT NOT NULL,
      sync_status        TEXT NOT NULL DEFAULT 'pending',
      synced_at          INTEGER,
      rejection_reason   TEXT,
      message            TEXT,
      created_at         INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tx_sync_status ON transactions(sync_status);

    CREATE TABLE IF NOT EXISTS transaction_bonds (
      tx_id     TEXT NOT NULL,
      bond_id   TEXT NOT NULL,
      direction TEXT NOT NULL,
      PRIMARY KEY (tx_id, bond_id)
    );
  `);
}
```

---

## 4. Phase 2: Cryptographic Infrastructure

All trust validation relies on application-layer asymmetric signatures. Bluetooth is merely a vehicle.

### 4.1 Client Key-Pair Generation
Upon user registration, execute key generation in the background. Derive the public key to store on the server.

```typescript
import * as ed from '@noble/ed25519';
import * as SecureStore from 'expo-secure-store';

export async function generateUserKeyPair(userId: string): Promise<string> {
  // 1. Generate 32-byte secure private key
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);

  const privateKeyHex = Buffer.from(privateKey).toString('hex');
  const publicKeyHex = Buffer.from(publicKey).toString('hex');

  // 2. Store Private Key securely in Enclave Keystore
  await SecureStore.setItemAsync(`bondpay_private_key_${userId}`, privateKeyHex, {
    keychainService: 'bondpay_secure_keychain',
    requireAuthentication: true, // Requires TouchID/FaceID/Device PIN
  });

  return publicKeyHex;
}
```

### 4.2 Local Key Storage & Future Onboarding Backup
In the current MVP implementation, private keys are generated and stored exclusively within the local hardware Secure Keystore (`expo-secure-store`). This prevents access to the raw key material from outside the application context.

*   **Production Enhancement Note (Onboarding Recovery)**: Remote password-based key backup (using **PBKDF2** key stretching with 100,000 iterations to derive an `AES-256-GCM` encryption key) is planned for the production roadmap to facilitate recovery if a device is lost or damaged. Currently, raw backup functions are omitted to maintain maximum compatibility with core React Native environments.

---

## 5. Phase 3: BLE Transmission Protocol Implementation

The BLE transmission is designed as a custom GATT service with structured characteristics handling the handshake, sequence control, and fragment streaming.

### 5.1 BLE Service & Characteristic Definitions
Assign the following UUID configurations:
*   **BondPay Service UUID**: `E3F1C990-2B3A-4D78-95D9-23CE6305C001`
*   **Control Characteristic UUID** (Write/Indicate): `E3F1C990-2B3A-4D78-95D9-23CE6305C002` (Handles Stage transitions: HANDSHAKE, METADATA, SIGNATURE, ACK)
*   **Data Stream Characteristic UUID** (WriteWithoutResponse): `E3F1C990-2B3A-4D78-95D9-23CE6305C003` (Streams MTU-bounded binary fragments)

### 5.2 Transmission Steps Flowchart
```
  Sender (Central / Scan QR)                Receiver (Peripheral / GATT)
       │                                                 │
       │  -- Control: Write "STAGE:HANDSHAKE" -->        │
       │  <-- Indicate: ACK "HANDSHAKE" ---------        │
       │                                                 │
       │  -- Control: Write Metadata JSON -------->      │
       │     { totalChunks, checksum, sessionId }        │
       │  <-- Indicate: ACK "METADATA" ----------        │
       │                                                 │
       │  -- Data Stream: Stream raw packets ---->       │
       │     Packet Header: [SeqNo: 2B][Length: 2B]      │
       │     Packet Body: [Byte Data]                    │
       │  <-- Indicate: ACK "CHUNKS_COMPLETE" ---        │
       │                                                 │
       │  -- Control: Write Transaction Signatures ->    │
       │  <-- Indicate: ACK "TX_VERIFIED" -------        │
       │                                                 │
       │  -- Control: Write "STAGE:DISCONNECT" ->        │
       │  (Disconnect link automatically)                │
```

### 5.3 Fragment Stream Packet Parser
Below is the code configuration for fragment packing and validation during streaming.

```typescript
export interface BLEPacketHeader {
  sequenceNo: number;
  dataLength: number;
}

export function buildBLEPacket(header: BLEPacketHeader, data: Uint8Array): Uint8Array {
  const packet = new Uint8Array(4 + data.length);
  // Pack sequence number (2 bytes, big-endian)
  packet[0] = (header.sequenceNo >> 8) & 0xff;
  packet[1] = header.sequenceNo & 0xff;
  // Pack length (2 bytes, big-endian)
  packet[2] = (header.dataLength >> 8) & 0xff;
  packet[3] = header.dataLength & 0xff;
  // Copy data payload
  packet.set(data, 4);
  return packet;
}

export function parseIncomingPacket(rawBytes: Uint8Array): { header: BLEPacketHeader; payload: Uint8Array } {
  const sequenceNo = (rawBytes[0] << 8) | rawBytes[1];
  const dataLength = (rawBytes[2] << 8) | rawBytes[3];
  const payload = rawBytes.slice(4, 4 + dataLength);
  return {
    header: { sequenceNo, dataLength },
    payload
  };
}
```

---

## 6. Phase 4: Core Transaction & Denomination Algorithms

### 6.1 Server-Side Denomination Issuer
During online load operations (`/bonds/issue`), the server divides the request amount using a greedy combination algorithm, balancing denominations to allow offline flexibility.

```typescript
const STANDARD_DENOMINATIONS = [1000, 500, 100, 50, 20, 10, 5]; // In Paisa (NPR 10 -> NPR 0.05)

export function breakDenominations(amount: number): number[] {
  const result: number[] = [];
  let remaining = amount;

  // Enforce structural starter pack for payments greater than NPR 100
  if (amount >= 10000) {
    const starterPack = [1000, 500, 100, 100, 50, 50, 20, 20, 10, 10, 5, 5];
    for (const val of starterPack) {
      if (remaining >= val) {
        result.push(val);
        remaining -= val;
      }
    }
  }

  // Greedy breakdown of remaining balance
  for (const denom of STANDARD_DENOMINATIONS) {
    while (remaining >= denom) {
      result.push(denom);
      remaining -= denom;
    }
  }

  return result;
}
```

### 6.2 Client-Side Subset-Sum Exact Change Solver
When an offline payment of target $T$ is initiated, the client runs a backtracking subset-sum solver with memoization to find an exact combination of bonds in SQLite, which will then be marked as `spent`.

```typescript
interface BondModel {
  bond_id: string;
  value: number;
}

export function findExactChange(bondsList: BondModel[], target: number): BondModel[] | null {
  const memo = new Map<string, BondModel[] | null>();
  
  const search = (index: number, currentTarget: number): BondModel[] | null => {
    if (currentTarget === 0) return [];
    if (index >= bondsList.length || currentTarget < 0) return null;
    
    const key = `${index}-${currentTarget}`;
    if (memo.has(key)) return memo.get(key)!;
    
    const withCurrent = search(index + 1, currentTarget - bondsList[index].value);
    if (withCurrent !== null) {
      const result = [bondsList[index], ...withCurrent];
      memo.set(key, result);
      return result;
    }
    
    const withoutCurrent = search(index + 1, currentTarget);
    memo.set(key, withoutCurrent);
    return withoutCurrent;
  };
  
  return search(0, target);
}
```

---

## 7. Phase 5: Client-Side BLE Services

### 7.1 Peripheral / Advertising Service (Receiver)
The receiver starts advertising a session and registers callbacks to handle connection state changes and process incoming data segments.

```typescript
import { BLEService, BLEReceiverCallbacks } from './ble.service';

export class ReceiveScreen {
  // Initiating the session when QR is generated:
  async setupBLEAdvertiser(sessionId: string) {
    await BLEService.startPeripheralSession(sessionId, {
      onStateChange: (state: string, percent: number) => {
        // Update local progress indicators
        this.setState({ bleState: state, blePercent: percent });
      },
      onPayloadReceived: async (payload: string) => {
        // Validate payload, verify signatures, execute SQLite transaction
        return await this.handlePaymentReceived(payload);
      }
    });
  }
}
```

---

## 8. Phase 6: Hardware Terminal (ESP32 BLE & RFID)

The **BondPay Station** hardware terminal is built on the ESP32 platform to utilize native dual-mode BLE and SPI controllers.

```
       ESP32 NodeMCU Development Board
      ┌──────────────────────────────┐
      │  3.3V   ───────────────► 3.3V (MFRC522)
      │  GND    ───────────────► GND  (MFRC522)
      │  GPIO22 (RST)  ────────► RST  (MFRC522)
      │  GPIO19 (MISO) ────────► MISO (MFRC522)
      │  GPIO23 (MOSI) ────────► MOSI (MFRC522)
      │  GPIO18 (SCK)  ────────► SCK  (MFRC522)
      │  GPIO5  (SDA)  ────────► SDA  (MFRC522)
      │                              │
      │  GPIO21 (SDA)  ────────► SDA  (LCD 16x2 I2C)
      │  GPIO22 (SCL)  ────────► SCL  (LCD 16x2 I2C)
      │  5V     ───────────────► VCC  (LCD 16x2 I2C)
      │                              │
      │  GPIO2  ───────────────► Green LED Anode
      │  GPIO4  ───────────────► Red LED Anode
      │  GPIO25 ───────────────► Buzzer (+)
      └──────────────────────────────┘
```

### 8.1 ESP32 BLE GATT Code Setup
Flash the following code to the ESP32 chip using the Arduino IDE:

```cpp
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <ArduinoJson.h>

#define SERVICE_UUID        "E3F1C990-2B3A-4D78-95D9-23CE6305C001"
#define CONTROL_CHAR_UUID   "E3F1C990-2B3A-4D78-95D9-23CE6305C002"
#define DATA_CHAR_UUID      "E3F1C990-2B3A-4D78-95D9-23CE6305C003"

BLECharacteristic *pControlCharacteristic;
BLECharacteristic *pDataCharacteristic;
bool deviceConnected = false;

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
    };
    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      pServer->getAdvertising()->start(); // Restart advertising
    }
};

class ControlCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      std::string value = pCharacteristic->getValue();
      if (value.length() > 0) {
        // Handle STAGE handshake transitions here
        // If message is COMPLETE -> fire Buzzer beep and flash Green LED
      }
    }
};

void setupBLE() {
  BLEDevice::init("BondPay-Terminal");
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pControlCharacteristic = pService->createCharacteristic(
                             CONTROL_CHAR_UUID,
                             BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_INDICATE
                           );
  pControlCharacteristic->setCallbacks(new ControlCallbacks());

  pDataCharacteristic = pService->createCharacteristic(
                          DATA_CHAR_UUID,
                          BLECharacteristic::PROPERTY_WRITE_NR // Write without response
                        );

  pService->start();
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->start();
}
```

---
## 9. Security Audit & Hardening Checklist

During implementation, enforce the following security rules:

1. **BLE Payload Validation**: Never trust BLE inputs directly.
   * Verify Ed25519 signatures of the payload before applying database adjustments.
   * Ensure that the `receiverId` in the transaction matching indices is exactly the current device's user ID.
2. **PostgreSQL Row-level Locks**: Enforce balance checks using `SELECT ... FOR UPDATE` transactions during issuance or sync clearing to block concurrent transaction race attacks.
3. **Replay Protection Database Unique Constraint**: Verify that SQLite and Supabase PostgreSQL set the `tx_id` as the UNIQUE primary key. Any transaction containing matching transaction hashes or recycled nonces will trigger a SQL exception and fail.
4. **Keystore Access Controls**: Require biometric validation (`expo-secure-store` authentication constraint) for every signature call on Characteristic writes to prevent unauthorized spending on lost/stolen unlocked devices.
5. **No BLE Auto-Pairing**: Configure BLE connections as ephemeral central-peripheral connections. Do not call bonding or key exchange APIs on the mobile OS Bluetooth stack to bypass pairing popups and vulnerabilities.

---

## 10. Verification & Local Testing Plan

Verify system performance offline using the following test scripts:

### 10.1 Simulating BLE Link Failures
*   **Test Case**: Disconnect Bluetooth during data stream characteristic transfers.
*   **Expected Result**:
    *   Receiver waits for connection timeout (3000ms), discards the partial buffer, and reverts state.
    *   Sender aborts transmission, rolls back database states, and keeps bonds marked as `available`.

### 10.2 Double-Spend Verification Script
*   **Test Case**: Attempt to broadcast the same transaction payload over BLE to two different merchant devices offline.
*   **Expected Result**:
    *   Both merchant devices verify signatures offline, accept payments, and record them as `received_pending_sync`.
    *   Once merchants sync online, the first transaction is cleared. The second sync fails due to the `bond_redemptions` UNIQUE primary key check, flagging the sender account for review (`DOUBLE_SPEND` in `fraud_flags` table).

### 10.3 MTU Negotiation Checks
*   **Test Case**: Force the app to connect using a minimal 23-byte MTU vs. a negotiated 512-byte MTU.
*   **Expected Result**:
    *   Chunk allocation scales automatically.
    *   Sequence header numbers increment correctly, ensuring correct buffer assembly regardless of individual packet sizes.
