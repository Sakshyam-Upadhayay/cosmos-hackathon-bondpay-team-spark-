import re
import sys

path = 'c:/xampp/htdocs/ncit-hack-26/problem/implementation-plan.md'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update User Review Required
content = re.sub(
    r'> \[!IMPORTANT\]\s*> \*\*Key Recovery via Server-Side Encrypted Backup\*\*.*?\(e\.g\., recovery seed phrase, social recovery\)\.',
    '> [!IMPORTANT]\n> **Lost Phone Mitigation (Single Active Instance & Configurable TTL)**: To handle stolen devices, the system enforces a single active device per user. Logging into a new device instantly invalidates the old device. To prevent a thief from spending bonds offline before sync, offline sending requires **Biometric Authentication** (Fingerprint/FaceID) and offline bonds will have a **User-Configurable Expiry (TTL)** ranging from 1 hour to 5 days. Expired bonds automatically refund to the online balance upon next server sync.',
    content,
    flags=re.DOTALL
)

content = re.sub(
    r'> \[!WARNING\]\s*> \*\*Breaking Change — Ownership Chain Model\*\*.*?migration\.',
    '> [!WARNING]\n> **A→B→C Relay Fix — Direct to Pending Online Balance**: Offline-to-offline transfers will no longer result in reusable offline bonds for the receiver. Received offline funds instantly become **Pending Online Balance** (Orange UI). They cannot be re-spent offline. Once the receiver goes online, they sync and become Actual Online Balance (Green UI). This completely solves the A→B→C double-spend issue.',
    content,
    flags=re.DOTALL
)

# 2. Update Open Questions
content = re.sub(
    r'> 3\. \*\*Key recovery password\*\*.*?> 4\. \*\*Transaction expiry in offline-offline mode\*\*: How long should a pending-settlement offline-to-offline transaction remain valid before it\'s considered stale\? Proposed: 30 days \(matching bond TTL\)\.',
    '> 3. **Offline Bond Default TTL**: What should be the default expiry time before the user configures it? (Between 1 hour and 5 days).\n> 4. **Biometric Fallback**: If a user\'s device lacks biometric hardware, should we enforce a mandatory PIN code for offline sends?',
    content,
    flags=re.DOTALL
)

# 3. Update Phase 1
phase1_old = r'### Phase 1: Core Data Model Overhaul — Ownership Chain & Key Recovery.*?### Phase 2: Multi-QR Animated Carousel Protocol'
phase1_new = r'''### Phase 1: Core Data Model Overhaul — Single Active Instance & Direct-to-Online Balance

This phase restructures the foundation. Everything else depends on it.

---

#### 1.1 Direct-to-Online Balance (A→B→C Fix)

The complex transfer chain is removed. Received offline bonds are immediately converted into a "Pending Online Balance" local state and cannot be re-spent.

##### [MODIFY] schema.sql & db.ts
- Add `active_device_id TEXT` column to `users` table.
- Remove any existing `transfer_chain` concepts.
- Add `ttl_hours INTEGER DEFAULT 24` to `users` to store their preferred bond expiry.

##### [MODIFY] BondPay/src/screens/HomeScreen.tsx
- Implement the 3-tier progress bar / wallet balance UI:
  1. **Actual Online Balance (Green)**: Verified by server.
  2. **Pending Online Balance (Orange)**: Received offline from others, waiting to be synced to the server.
  3. **Actual Offline Bond (Blue)**: Money loaded onto the device, available to spend offline.

---

#### 1.2 Single Active Instance & Biometrics (Lost Phone Fix)

##### [MODIFY] auth.controller.ts
- **Login Endpoint**: Check if `active_device_id` exists and is different. Return `requires_force_login: true`.
- **Force Login**: Update `active_device_id`, invalidate old device's offline bonds, credit value back to user's online balance.
- **Logout Endpoint**: Auto-sync local offline bonds back to server (converting to online balance), clear `active_device_id`.

##### [MODIFY] BondPay/src/screens/AccountScreen.tsx
- Add a setting for "Offline Bond Expiry Time". User can select between 1 hour and 5 days (120 hours).
- Save this preference to the server and local storage.

##### [MODIFY] BondPay/src/screens/SendScreen.tsx
- Implement `expo-local-authentication`.
- Prompt for Biometrics (Fingerprint/FaceID) or Device PIN *before* generating the offline payment QR.

### Phase 2: Multi-QR Animated Carousel Protocol'''

content = re.sub(phase1_old, phase1_new, content, flags=re.DOTALL)

# 4. Update Phase 3.5
phase35_old = r'#### 3\.5 Mode 4: Sender Offline, Receiver Offline.*?### Phase 4: Smart Bond Denomination System'
phase35_new = r'''#### 3.5 Mode 4: Sender Offline, Receiver Offline

##### [MODIFY] SendScreen.tsx
**Fixes needed:**
1. Check if bonds have expired based on their configurable TTL.
2. Require Biometric Authentication before continuing.
3. Sign the transfer with sender's private key.
4. Mark bonds as spent locally with `status = 'transferred_out'`.

##### [MODIFY] ReceiveScreen.tsx
**Fixes needed:**
1. **Add server bond signature verification** (Bug #6 fix).
2. Verify the sender's signature.
3. Store received bonds with `status = 'received_pending_sync'`.
4. Update the **Pending Online Balance (Orange)** in the UI.
5. **CRITICAL**: The receiver CANNOT re-spend these bonds. They are locked until sync.

---

### Phase 4: Smart Bond Denomination System'''

content = re.sub(phase35_old, phase35_new, content, flags=re.DOTALL)

# 5. Update Phase 6
phase6_old = r'### Phase 6: Sync Protocol Overhaul with Chain Resolution.*?### Phase 7: Immediate Sync for Hybrid Modes'
phase6_new = r'''### Phase 6: Sync Protocol Overhaul

The sync protocol must be redesigned to handle the new pending online balance model.

---

##### [MODIFY] transactions.controller.ts
**New sync algorithm:**
1. For each incoming synced offline transaction:
   - Verify sender's signature and bond validity.
   - Verify the sender's device was the `active_device_id` at the time of the transaction.
   - If valid, deduct the original sender's offline balance and immediately credit the receiver's **Online Balance**.
   - If the sender's device was invalidated (e.g., lost phone logged out), reject the transaction (acts like a bounced cheque).

##### [MODIFY] sync.service.ts (client)
- Upload all `received_pending_sync` bonds.
- On successful sync, delete them locally and increase the Actual Online Balance.

---

### Phase 7: Immediate Sync for Hybrid Modes'''

content = re.sub(phase6_old, phase6_new, content, flags=re.DOTALL)

# 6. Remove Bug #2 from Table and fix tests
content = re.sub(r'\| 2   \| \*\*Bug #2\*\*: A→B→C relay.*?\|', '', content, flags=re.DOTALL)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Update completed successfully.")
