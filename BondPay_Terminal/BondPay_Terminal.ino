#include <ESP8266WiFi.h>
#include <DNSServer.h>
#include "Hardware.h"
#include "Storage.h"
#include "WebServer.h"

const char* ssid = "BondPay Free WiFi";
DNSServer dnsServer;
const byte DNS_PORT = 53;

// External variables from WebServer.h
extern bool paymentMode;
extern int paymentAmount;
extern String lastScannedUID;

unsigned long lastReadTime = 0;

void setup() {
  Serial.begin(115200);
  
  // Hardware
  initHardware();
  
  // Storage
  initStorage();
  
  // WiFi Access Point - configured as Open/Free Network
  WiFi.softAP(ssid);
  IPAddress IP = WiFi.softAPIP();
  Serial.print("AP IP address: ");
  Serial.println(IP);
  
  // DNS Server - Redirect all traffic to SoftAP IP for Captive Portal
  dnsServer.start(DNS_PORT, "*", IP);
  Serial.println("DNS server started redirecting to AP IP");
  
  // Web Server (this also loads the cache)
  initWebServer();
  
  // Set default LCD display state
  setLCDDefaultState("BondPay Station", "IP: " + IP.toString());
  beepNonBlocking(100, 2);
}

void loop() {
  // Always run DNS processing and Hardware state machines continuously
  dnsServer.processNextRequest();
  updateHardwareNonBlocking();

  // Guard RFID scanning: only read if not in debounce and not showing a temporary message
  if (millis() - lastReadTime >= 1000 && !lcdNeedsRevert) {
    String uid = readRFID();
    if (uid != "") {
      Serial.println("Card Scanned: " + uid);
      lastReadTime = millis();
      beepNonBlocking(50, 1);
      
      // Store in global variable for Web UI registration auto-fill
      lastScannedUID = uid;
      
      DynamicJsonDocument users = getUsers();
      bool userFound = false;
      JsonObject userObj;
      int userIndex = -1;
      
      int i = 0;
      for (JsonObject user : users.as<JsonArray>()) {
        if (user["uid"] == uid) {
          userFound = true;
          userObj = user;
          userIndex = i;
          break;
        }
        i++;
      }
      
      if (!userFound) {
        Serial.println("Unregistered Card: " + uid);
        updateLCDNonBlocking("Unregistered", "Card: " + uid, 2000);
        showStatusLEDNonBlocking(false, 2000);
        
        paymentMode = false; // Reset payment mode on error/unregistered card
        IPAddress IP = WiFi.softAPIP();
        setLCDDefaultState("BondPay Station", "IP: " + IP.toString());
        return;
      }
      
      String name = userObj["name"].as<String>();
      int balance = userObj["balance"].as<int>();
      
      if (paymentMode) {
        // Execute Payment
        if (balance >= paymentAmount) {
          int newBalance = balance - paymentAmount;
          users[userIndex]["balance"] = newBalance;
          saveUsers(users);
          addTransaction(uid, name, paymentAmount, balance, newBalance);
          
          // Update the RAM stats cache
          updateStatsCache(paymentAmount, true);
          
          updateLCDNonBlocking("Payment Success", "Rem: NPR " + String(newBalance), 3000);
          showStatusLEDNonBlocking(true, 3000);
          beepNonBlocking(100, 2);
        } else {
          updateLCDNonBlocking("Insuff. Balance", "Bal: NPR " + String(balance), 3000);
          showStatusLEDNonBlocking(false, 3000);
          beepNonBlocking(300, 1);
        }
        
        paymentMode = false; // Reset payment mode after attempt
        IPAddress IP = WiFi.softAPIP();
        setLCDDefaultState("BondPay Station", "IP: " + IP.toString());
      } else {
        // Just display info
        updateLCDNonBlocking(name, "Bal: NPR " + String(balance), 2000);
        showStatusLEDNonBlocking(true, 2000);
      }
    }
  }
}
