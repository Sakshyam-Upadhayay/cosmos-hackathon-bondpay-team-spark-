# BondPay Station Installation Guide

Follow these steps to compile, flash, and run the BondPay Terminal on your ESP8266.

## 1. Prerequisites
- **Arduino IDE**: Install the latest version from [arduino.cc](https://www.arduino.cc/en/software).
- **ESP8266 Board Package**: 
  1. Open Arduino IDE -> File -> Preferences.
  2. Add `http://arduino.esp8266.com/stable/package_esp8266com_index.json` to Additional Boards Manager URLs.
  3. Go to Tools -> Board -> Boards Manager, search for `esp8266` and install.
- **LittleFS Data Upload Plugin**: 
  Download and install the [ESP8266 LittleFS Data Upload plugin](https://github.com/earlephilhower/arduino-esp8266littlefs-plugin) for Arduino IDE.

## 2. Required Libraries
Install these libraries via the **Library Manager** (Sketch -> Include Library -> Manage Libraries):
1. **MFRC522** by GithubCommunity (for the RFID Reader)
2. **LiquidCrystal I2C** by Frank de Brabander (for the 16x2 LCD)
3. **ArduinoJson** by Benoit Blanchon (Version 6.x or 7.x)
4. **ESPAsyncTCP** by me-no-dev (Needs manual installation from [GitHub](https://github.com/me-no-dev/ESPAsyncTCP))
5. **ESPAsyncWebServer** by me-no-dev (Needs manual installation from [GitHub](https://github.com/me-no-dev/ESPAsyncWebServer))

## 3. Flashing the Firmware
1. Open `BondPay_Terminal.ino` in the Arduino IDE.
2. Select your board: **Tools -> Board -> NodeMCU 1.0 (ESP-12E Module)**.
3. Select the correct **Port**.
4. Set **Flash Size** to `4MB (FS:2MB OTA:~1019KB)`. This allocates 2MB for our web files.
5. Click **Upload** to flash the C++ firmware.

## 4. Uploading the Web Dashboard (LittleFS)
1. Ensure the `data` folder is located in the same directory as `BondPay_Terminal.ino`.
2. Ensure the Serial Monitor is closed (it locks the port).
3. In Arduino IDE, click **Tools -> ESP8266 LittleFS Data Upload**.
4. Wait for it to format the filesystem and upload `index.html`, `styles.css`, and `app.js`.

## 5. Usage Instructions
1. After flashing, the ESP8266 will boot and initialize the hardware.
2. Connect your phone or laptop to the WiFi network:
   - **SSID**: `BondPay Station`
   - **Password**: `bondpay123`
3. Open a web browser and go to `http://192.168.4.1`.
4. You should now see the Premium BondPay Dashboard!
5. Register a new RFID card from the "Cards" tab.
6. Enter an amount on the Dashboard and click "Start Payment" to test the hardware flow.
