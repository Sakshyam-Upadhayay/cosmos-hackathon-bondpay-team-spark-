# BondPay Station Wiring Diagram

This document explains the hardware connections for the BondPay Offline RFID Payment Terminal.

## Components Required
- 1x ESP8266 (NodeMCU V3 or similar)
- 1x MFRC522 RFID Reader
- 1x 16x2 LCD Display with I2C Backpack
- 1x Active Buzzer
- 1x Green LED (Success)
- 1x Red LED (Error/Insufficient Balance)
- 2x 220 Ohm Resistors (for LEDs)
- Jumper Wires
- Breadboard

## Wiring Connections

### 1. MFRC522 RFID Reader (SPI)
| MFRC522 Pin | ESP8266 Pin | Notes |
|-------------|-------------|-------|
| 3.3V        | 3.3V        | DO NOT connect to 5V (It will fry the reader) |
| RST         | D3 (GPIO 0) | Reset Pin |
| GND         | GND         | Ground |
| MISO        | D6 (GPIO 12)| SPI MISO |
| MOSI        | D7 (GPIO 13)| SPI MOSI |
| SCK         | D5 (GPIO 14)| SPI Clock |
| SDA (SS)    | D8 (GPIO 15)| Slave Select |

### 2. 16x2 I2C LCD Display (I2C)
| I2C Module Pin | ESP8266 Pin | Notes |
|----------------|-------------|-------|
| VCC            | VU / 5V     | LCD works best with 5V logic |
| GND            | GND         | Ground |
| SDA            | D2 (GPIO 4) | I2C Data |
| SCL            | D1 (GPIO 5) | I2C Clock |

*(Note: Default I2C address is usually 0x27 or 0x3F. Modify `LiquidCrystal_I2C lcd(0x27, 16, 2);` in `Hardware.h` if needed).*

### 3. LEDs & Buzzer
| Component | ESP8266 Pin | Notes |
|-----------|-------------|-------|
| Green LED (Anode) | D4 (GPIO 2) | Add 220Ω resistor in series to GND |
| Red LED (Anode)   | D0 (GPIO 16)| Add 220Ω resistor in series to GND |
| Buzzer (Positive) | D9 (RX) / SD2 | Connect negative pin to GND |

## Troubleshooting
- **RFID Not Reading**: Double check SPI connections. Ensure MFRC522 gets exactly 3.3V.
- **LCD Not Displaying / Showing Black Boxes**: Adjust the potentiometer on the back of the I2C module using a small screwdriver. Also, double-check the I2C address.
- **ESP8266 Keeps Restarting**: Ensure your power supply (USB cable) can provide at least 500mA. The ESP8266 can draw significant current when using WiFi.
