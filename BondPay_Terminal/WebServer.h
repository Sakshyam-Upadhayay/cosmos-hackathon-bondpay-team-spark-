#ifndef BONDPAY_WEBSERVER_H
#define BONDPAY_WEBSERVER_H

#include <ESPAsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <AsyncJson.h>
#include "Storage.h"
#include "Hardware.h"
#include "WebUI.h"

AsyncWebServer server(80);

// Global variables for payment mode and scanning
bool paymentMode = false;
int paymentAmount = 0;
String lastScannedUID = "";

// Caching stats in RAM to avoid slow JSON files parse on every poll
int cacheTotalCards = 0;
int cacheTotalBalance = 0;
int cacheTotalTransactions = 0;
bool cacheLoaded = false;

void initStatsCache() {
  DynamicJsonDocument users = getUsers();
  DynamicJsonDocument txs = getTransactions();
  
  cacheTotalCards = users.size();
  cacheTotalBalance = 0;
  for (JsonObject user : users.as<JsonArray>()) {
    cacheTotalBalance += user["balance"].as<int>();
  }
  cacheTotalTransactions = txs.size();
  cacheLoaded = true;
  Serial.println("System RAM stats cache initialized.");
}

void updateStatsCache(int amount, bool isPayment) {
  if (isPayment) {
    cacheTotalBalance -= amount;
    // Reload transactions count dynamically from file size
    DynamicJsonDocument txs = getTransactions();
    cacheTotalTransactions = txs.size();
  }
}

void initWebServer() {
  // Initialize Stats Cache
  initStatsCache();

  // Serve the embedded HTML/CSS/JS page
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send_P(200, "text/html", index_html);
  });

  // API: Get System Stats (Served extremely fast from cache)
  server.on("/api/system", HTTP_GET, [](AsyncWebServerRequest *request){
    if (!cacheLoaded) {
      initStatsCache();
    }
    
    DynamicJsonDocument response(256);
    response["totalCards"] = cacheTotalCards;
    response["totalBalance"] = cacheTotalBalance;
    response["totalTransactions"] = cacheTotalTransactions;
    
    String json;
    serializeJson(response, json);
    request->send(200, "application/json", json);
  });

  // API: Get Cards
  server.on("/api/cards", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(LittleFS, "/users.json", "application/json");
  });

  // API: Add Card
  AsyncCallbackJsonWebHandler* addCardHandler = new AsyncCallbackJsonWebHandler("/api/cards", [](AsyncWebServerRequest *request, JsonVariant &json) {
    JsonObject jsonObj = json.as<JsonObject>();
    String uid = jsonObj["uid"];
    String name = jsonObj["name"];
    int balance = jsonObj["balance"];

    DynamicJsonDocument users = getUsers();
    
    // Check if exists
    bool exists = false;
    for (JsonObject user : users.as<JsonArray>()) {
      if (user["uid"] == uid) {
        exists = true;
        break;
      }
    }
    
    if (exists) {
      request->send(400, "application/json", "{\"error\":\"Card already exists\"}");
      return;
    }
    
    JsonObject newUser = users.createNestedObject();
    newUser["uid"] = uid;
    newUser["name"] = name;
    newUser["balance"] = balance;
    
    saveUsers(users);

    // Update Cache
    cacheTotalCards++;
    cacheTotalBalance += balance;

    request->send(200, "application/json", "{\"success\":true}");
  });
  server.addHandler(addCardHandler);

  // API: Delete Card
  server.on("/api/cards", HTTP_DELETE, [](AsyncWebServerRequest *request){
    if (request->hasParam("uid")) {
      String uid = request->getParam("uid")->value();
      DynamicJsonDocument users = getUsers();
      DynamicJsonDocument updated(4096);
      
      bool found = false;
      int deletedBalance = 0;
      for (JsonObject user : users.as<JsonArray>()) {
        if (user["uid"] != uid) {
          updated.add(user);
        } else {
          found = true;
          deletedBalance = user["balance"].as<int>();
        }
      }
      
      if (found) {
        saveUsers(updated);

        // Update Cache
        cacheTotalCards--;
        cacheTotalBalance -= deletedBalance;

        request->send(200, "application/json", "{\"success\":true}");
      } else {
        request->send(404, "application/json", "{\"error\":\"Card not found\"}");
      }
    } else {
      request->send(400, "application/json", "{\"error\":\"Missing uid\"}");
    }
  });

  // API: Get Transactions
  server.on("/api/transactions", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(LittleFS, "/transactions.json", "application/json");
  });

  // API: Get last scanned card UID for registration auto-fill
  server.on("/api/last-scan", HTTP_GET, [](AsyncWebServerRequest *request){
    DynamicJsonDocument response(128);
    if (lastScannedUID != "") {
      response["uid"] = lastScannedUID;
      lastScannedUID = ""; // Clear after consumption
    } else {
      response["uid"] = "";
    }
    String json;
    serializeJson(response, json);
    request->send(200, "application/json", json);
  });

  // API: Start Payment Mode
  AsyncCallbackJsonWebHandler* startPaymentHandler = new AsyncCallbackJsonWebHandler("/api/payment/start", [](AsyncWebServerRequest *request, JsonVariant &json) {
    JsonObject jsonObj = json.as<JsonObject>();
    if (jsonObj.containsKey("amount")) {
      paymentAmount = jsonObj["amount"];
      paymentMode = true;
      
      // Update hardware default LCD screen to payment prompt (non-blocking beep)
      setLCDDefaultState("Payment Mode", "Amount: NPR " + String(paymentAmount));
      beepNonBlocking(100);
      
      request->send(200, "application/json", "{\"success\":true}");
    } else {
      request->send(400, "application/json", "{\"error\":\"Missing amount\"}");
    }
  });
  server.addHandler(startPaymentHandler);

  // Captive Portal DNS Redirect & Wildcard Fallbacks
  server.onNotFound([](AsyncWebServerRequest *request){
    String url = request->url();
    // Keep API paths acting as normal 404s
    if (url.startsWith("/api/")) {
      request->send(404, "application/json", "{\"error\":\"Not found\"}");
      return;
    }

    String host = request->host();
    // Redirect if it's not the SoftAP local IP or configured domains
    if (host != "192.168.4.1" && host != "bonday.org" && host != "bondpay.org" && host.indexOf("192.168.4.1") == -1) {
      Serial.println("Captive Portal: Redirecting host: " + host + " (URL: " + url + ") to IP");
      request->redirect("http://192.168.4.1/");
    } else {
      // Serve the index.html page for matching domains
      request->send_P(200, "text/html", index_html);
    }
  });

  server.begin();
  Serial.println("Web server started");
}

#endif
