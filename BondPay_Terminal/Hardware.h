#ifndef HARDWARE_H
#define HARDWARE_H

#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// Pin Definitions
#define RST_PIN         D3
#define SS_PIN          D8
#define BUZZER_PIN      D9  // or RX depending on board
#define LED_GREEN_PIN   D4
#define LED_RED_PIN     D0

// Instances
MFRC522 mfrc522(SS_PIN, RST_PIN);
LiquidCrystal_I2C lcd(0x27, 16, 2); // Change 0x27 to 0x3F if LCD doesn't work

// Non-blocking Hardware State Variables
unsigned long greenLedOffTime = 0;
unsigned long redLedOffTime = 0;

// Buzzer State Machine
int beepCount = 0;
int beepDuration = 0;
unsigned long nextBeepActionTime = 0;
bool buzzerActiveState = false;

// LCD State Machine
unsigned long lcdRevertTime = 0;
bool lcdNeedsRevert = false;
String lcdDefaultLine1 = "BondPay Station";
String lcdDefaultLine2 = "Ready";

void initHardware() {
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_RED_PIN, OUTPUT);
  
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_GREEN_PIN, LOW);
  digitalWrite(LED_RED_PIN, LOW);

  SPI.begin();
  mfrc522.PCD_Init();
  
  Wire.begin(D2, D1); // SDA=D2, SCL=D1
  lcd.init();
  lcd.backlight();
  
  lcd.setCursor(0, 0);
  lcd.print("BondPay Station");
  lcd.setCursor(0, 1);
  lcd.print("Initializing...");
  delay(1000);
}

// Low-level write
void updateLCDDirect(String line1, String line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);
}

// Set the baseline/idle display message
void setLCDDefaultState(String line1, String line2) {
  lcdDefaultLine1 = line1;
  lcdDefaultLine2 = line2;
  if (!lcdNeedsRevert) {
    updateLCDDirect(lcdDefaultLine1, lcdDefaultLine2);
  }
}

// Temporary message write with automatic reversion
void updateLCDNonBlocking(String line1, String line2, unsigned long durationMs) {
  updateLCDDirect(line1, line2);
  lcdRevertTime = millis() + durationMs;
  lcdNeedsRevert = true;
}

// Keep legacy symbol for compatibility, behaves non-blocking now
void updateLCD(String line1, String line2) {
  setLCDDefaultState(line1, line2);
}

// Non-blocking status LEDs
void showStatusLEDNonBlocking(bool success, unsigned long durationMs = 1500) {
  if (success) {
    digitalWrite(LED_GREEN_PIN, HIGH);
    digitalWrite(LED_RED_PIN, LOW);
    greenLedOffTime = millis() + durationMs;
    redLedOffTime = 0;
  } else {
    digitalWrite(LED_RED_PIN, HIGH);
    digitalWrite(LED_GREEN_PIN, LOW);
    redLedOffTime = millis() + durationMs;
    greenLedOffTime = 0;
  }
}

// Legacy symbol wrapper
void showStatusLED(bool success) {
  showStatusLEDNonBlocking(success, 1500);
}

// Non-blocking beep generator
void beepNonBlocking(int duration, int count = 1) {
  if (count <= 0 || duration <= 0) return;
  beepDuration = duration;
  beepCount = count;
  digitalWrite(BUZZER_PIN, HIGH);
  buzzerActiveState = true;
  nextBeepActionTime = millis() + duration;
}

// Legacy symbol wrapper
void beep(int duration, int count = 1) {
  beepNonBlocking(duration, count);
}

// Hardware update tick function (call at top of loop)
void updateHardwareNonBlocking() {
  unsigned long now = millis();

  // 1. Manage status LEDs
  if (greenLedOffTime > 0 && now >= greenLedOffTime) {
    digitalWrite(LED_GREEN_PIN, LOW);
    greenLedOffTime = 0;
  }
  if (redLedOffTime > 0 && now >= redLedOffTime) {
    digitalWrite(LED_RED_PIN, LOW);
    redLedOffTime = 0;
  }

  // 2. Manage Buzzer/Beeps
  if (beepCount > 0 && now >= nextBeepActionTime) {
    if (buzzerActiveState) {
      digitalWrite(BUZZER_PIN, LOW);
      buzzerActiveState = false;
      beepCount--;
      if (beepCount > 0) {
        nextBeepActionTime = now + 100; // 100ms pause between beeps
      }
    } else {
      digitalWrite(BUZZER_PIN, HIGH);
      buzzerActiveState = true;
      nextBeepActionTime = now + beepDuration;
    }
  }

  // 3. Manage LCD Reversion
  if (lcdNeedsRevert && now >= lcdRevertTime) {
    lcdNeedsRevert = false;
    updateLCDDirect(lcdDefaultLine1, lcdDefaultLine2);
  }
}

String readRFID() {
  if ( ! mfrc522.PICC_IsNewCardPresent() || ! mfrc522.PICC_ReadCardSerial() ) {
    return "";
  }
  
  String uid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if(mfrc522.uid.uidByte[i] < 0x10) {
      uid += "0";
    }
    uid += String(mfrc522.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  mfrc522.PICC_HaltA();
  return uid;
}

#endif
