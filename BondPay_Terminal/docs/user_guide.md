# BondPay Terminal: User Guide

Welcome to the BondPay Terminal! This guide will walk you through how to operate the offline RFID payment station, manage user cards, and process transactions.

## 1. Initial Setup and Power On

1. **Power the Device**: Connect the BondPay Terminal (ESP8266) to a power source (like a USB power bank or wall adapter).
2. **Boot Sequence**: The device will initialize its hardware. You will hear a double beep, and the LCD screen will display:
   ```text
   BondPay Station
   Ready (IP:192.168.4.1)
   ```
3. The terminal is now fully operational and ready to process transactions or accept configuration commands.

---

## 2. Connecting to the Terminal

To manage cards and initiate payments, you need to access the terminal's Web Dashboard.

1. **Connect to WiFi**: On your smartphone, tablet, or laptop, open your WiFi settings and connect to the terminal's hotspot:
   - **Network Name (SSID)**: `BondPay Station`
   - **Password**: `bondpay123`
2. **Open the Dashboard**: Once connected, open a web browser and go to the following address:
   - **`http://192.168.4.1`**
   
*Note: Since the terminal operates entirely offline, your device may warn you that the network has "No Internet Connection". This is completely normal; stay connected to it.*

---

## 3. Using the Web Dashboard

The BondPay Dashboard is your control center. It has four main sections:

### Dashboard (Overview)
- View the **Total Balance** across all users, the number of **Active Cards**, and the total number of **Transactions**.
- **Initiate Payment**: This is where merchants can request a payment from a customer.

### Cards (Management)
- View all registered RFID cards along with their owner's name and current balance.
- **Register New Card**: Click the "Register New Card" button. You will need the physical card's UID (which you can find by scanning an unregistered card on the terminal), the user's name, and an initial deposit balance (in NPR).
- **Delete Card**: Remove users who no longer use the system.

### Transactions
- View a detailed history of all offline payments made on this terminal. It shows the Transaction ID, Card UID, User Name, Amount Deducted, and the Remaining Balance.

### Settings
- View terminal information such as Station Name, IP Address, and Firmware version.

---

## 4. Processing a Payment (Merchant Guide)

To accept a payment from a customer using their BondPay RFID card:

1. **Initiate Payment**: On the Web Dashboard, go to the **Dashboard** tab.
2. Enter the required amount in the **Initiate Payment** box (e.g., `150` for NPR 150) and click **Start Payment**.
3. **Terminal Prompts**: The LCD screen on the terminal will change to:
   ```text
   Payment Mode
   Amount: NPR 150
   ```
   *The terminal will beep once to indicate it is waiting for a card.*
4. **Customer Scans Card**: The customer taps their RFID card on the reader.
5. **Outcome**:
   - **Success**: If the customer has enough funds, the Green LED flashes, the buzzer double-beeps, and the screen displays `Payment Success` along with their remaining balance. The amount is securely deducted.
   - **Insufficient Balance**: The Red LED flashes, the buzzer emits a long beep, and the screen warns `Insuff. Balance` with their current funds.
   - **Unregistered Card**: The Red LED flashes and the screen shows `Unregistered Card`.

After a few seconds, the terminal will automatically reset to the "Ready" state.

---

## 5. Checking Balance (Customer Guide)

Customers can easily check their balance at the terminal without initiating a payment:

1. Ensure the terminal's LCD says **Ready**.
2. Tap the BondPay RFID card on the reader.
3. The terminal will beep once, the Green LED will flash, and the LCD will display the user's Name and Current Balance for 2 seconds.
   ```text
   John Doe
   Bal: NPR 500
   ```

---

## Troubleshooting

- **Web Dashboard won't load**: Ensure your mobile device hasn't automatically disconnected from `BondPay Station` to look for a network with internet. Turn off mobile data temporarily if your phone refuses to connect to the terminal's IP.
- **Card not reading**: Ensure the card is held completely flat against the MFRC522 RFID reader for about 1 second.
- **Unregistered Card**: If you tap a card and it says unregistered, you can see the card's UID printed in the Serial Monitor (if connected to a PC) to easily copy it for registration in the Web Dashboard.
