/*
 * BondPay Station - ESP32 BLE GATT Terminal Firmware
 * 
 * Hardware: ESP32 NodeMCU + MFRC522 RFID + LCD 16x2 I2C
 * 
 * Pin Connections:
 * MFRC522 -> ESP32:
 *   3.3V -> 3.3V, GND -> GND, RST -> GPIO22, MISO -> GPIO19,
 *   MOSI -> GPIO23, SCK -> GPIO18, SDA -> GPIO5
 * 
 * LCD I2C -> ESP32:
 *   VCC -> 5V, GND -> GND, SDA -> GPIO21, SCL -> GPIO22
 * 
 * LEDs & Buzzer:
 *   Green LED Anode -> GPIO2, Red LED Anode -> GPIO4, Buzzer(+) -> GPIO25
 */

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <ArduinoJson.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#define SERVICE_UUID        "E3F1C990-2B3A-4D78-95D9-23CE6305C001"
#define CONTROL_CHAR_UUID   "E3F1C990-2B3A-4D78-95D9-23CE6305C002"
#define DATA_CHAR_UUID      "E3F1C990-2B3A-4D78-95D9-23CE6305C003"

#define SS_PIN    5
#define RST_PIN   22
#define GREEN_LED 2
#define RED_LED   4
#define BUZZER    25

BLECharacteristic *pControlCharacteristic;
BLECharacteristic *pDataCharacteristic;
bool deviceConnected = false;
String currentSessionId = "";

MFRC522 rfid(SS_PIN, RST_PIN);
LiquidCrystal_I2C lcd(0x27, 16, 2);

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("Client connected");
      lcd.clear();
      lcd.print("Device Connected");
    }

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("Client disconnected");
      pServer->getAdvertising()->start();
      lcd.clear();
      lcd.print("BondPay Station");
      lcd.setCursor(0, 1);
      lcd.print("Waiting...");
    }
};

class ControlCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      std::string value = pCharacteristic->getValue();
      if (value.length() > 0) {
        String data = String(value.c_str());
        Serial.print("Control received: ");
        Serial.println(data);

        StaticJsonDocument<512> doc;
        DeserializationError error = deserializeJson(doc, data);

        if (error) {
          Serial.print("JSON parse error: ");
          Serial.println(error.c_str());
          return;
        }

        String stage = doc["stage"].as<String>();

        if (stage == "HANDSHAKE") {
          currentSessionId = doc["data"]["sessionId"].as<String>();
          lcd.clear();
          lcd.print("Handshake OK");
          lcd.setCursor(0, 1);
          lcd.print("Session: " + currentSessionId.substring(0, 8));

          String ack = "{\"stage\":\"HANDSHAKE_ACK\"}";
          pControlCharacteristic->setValue(ack.c_str());
          pControlCharacteristic->notify();
        }
        else if (stage == "METADATA") {
          int totalChunks = doc["data"]["totalChunks"].as<int>();
          int checksum = doc["data"]["checksum"].as<int>();

          lcd.clear();
          lcd.print("Receiving...");
          lcd.setCursor(0, 1);
          lcd.print("Chunks: " + String(totalChunks));

          String ack = "{\"stage\":\"METADATA_ACK\"}";
          pControlCharacteristic->setValue(ack.c_str());
          pControlCharacteristic->notify();
        }
        else if (stage == "CHUNKS_COMPLETE") {
          lcd.clear();
          lcd.print("Payment OK!");
          lcd.setCursor(0, 1);
          lcd.print("Verified");

          digitalWrite(GREEN_LED, HIGH);
          digitalWrite(BUZZER, HIGH);
          delay(200);
          digitalWrite(BUZZER, LOW);
          delay(200);
          digitalWrite(BUZZER, HIGH);
          delay(200);
          digitalWrite(BUZZER, LOW);
          digitalWrite(GREEN_LED, LOW);

          String ack = "{\"stage\":\"CHUNKS_COMPLETE_ACK\"}";
          pControlCharacteristic->setValue(ack.c_str());
          pControlCharacteristic->notify();
        }
        else if (stage == "DISCONNECT") {
          lcd.clear();
          lcd.print("BondPay Station");
          lcd.setCursor(0, 1);
          lcd.print("Waiting...");
        }
      }
    }
};

class DataCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      std::string value = pCharacteristic->getValue();
      if (value.length() > 0) {
        Serial.print("Data chunk received: ");
        Serial.println(value.length());
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
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_INDICATE |
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pControlCharacteristic->setCallbacks(new ControlCallbacks());

  pDataCharacteristic = pService->createCharacteristic(
    DATA_CHAR_UUID,
    BLECharacteristic::PROPERTY_WRITE_NR
  );
  pDataCharacteristic->setCallbacks(new DataCallbacks());

  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  pAdvertising->start();

  Serial.println("BLE advertising started");
}

void setupRFID() {
  SPI.begin();
  rfid.PCD_Init();
  delay(4);
  rfid.PCD_DumpVersionToSerial();
  Serial.println("RFID reader initialized");
}

void setupLCD() {
  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.print("BondPay Station");
  lcd.setCursor(0, 1);
  lcd.print("Initializing...");
}

void checkRFID() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    return;
  }

  String cardUID = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) cardUID += "0";
    cardUID += String(rfid.uid.uidByte[i], HEX);
  }
  cardUID.toUpperCase();

  Serial.print("Card detected: ");
  Serial.println(cardUID);

  lcd.clear();
  lcd.print("Card:");
  lcd.setCursor(0, 1);
  lcd.print(cardUID.substring(0, 16));

  digitalWrite(GREEN_LED, HIGH);
  digitalWrite(BUZZER, HIGH);
  delay(150);
  digitalWrite(BUZZER, LOW);
  delay(150);
  digitalWrite(GREEN_LED, LOW);

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}

void setup() {
  Serial.begin(115200);

  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(BUZZER, OUTPUT);

  digitalWrite(GREEN_LED, LOW);
  digitalWrite(RED_LED, LOW);
  digitalWrite(BUZZER, LOW);

  setupLCD();
  setupRFID();
  setupBLE();

  lcd.clear();
  lcd.print("BondPay Station");
  lcd.setCursor(0, 1);
  lcd.print("Ready");
}

void loop() {
  checkRFID();
  delay(100);
}
