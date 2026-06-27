#ifndef STORAGE_H
#define STORAGE_H

#include <LittleFS.h>
#include <ArduinoJson.h>

void initStorage() {
  if (!LittleFS.begin()) {
    Serial.println("LittleFS Mount Failed, formatting...");
    LittleFS.format();
    if (!LittleFS.begin()) {
      Serial.println("LittleFS Mount Failed again");
      return;
    }
  }
  Serial.println("LittleFS mounted");
  
  // Ensure files exist
  if (!LittleFS.exists("/users.json")) {
    File file = LittleFS.open("/users.json", "w");
    file.print("[]");
    file.close();
  }
  if (!LittleFS.exists("/transactions.json")) {
    File file = LittleFS.open("/transactions.json", "w");
    file.print("[]");
    file.close();
  }
}

String readFile(const char * path) {
  File file = LittleFS.open(path, "r");
  if (!file) return "[]";
  String content = file.readString();
  file.close();
  return content;
}

void writeFile(const char * path, const String& content) {
  File file = LittleFS.open(path, "w");
  if (!file) return;
  file.print(content);
  file.close();
}

// User operations
DynamicJsonDocument getUsers() {
  String json = readFile("/users.json");
  DynamicJsonDocument doc(4096);
  deserializeJson(doc, json);
  return doc;
}

void saveUsers(DynamicJsonDocument& doc) {
  String json;
  serializeJson(doc, json);
  writeFile("/users.json", json);
}

// Transaction operations
DynamicJsonDocument getTransactions() {
  String json = readFile("/transactions.json");
  DynamicJsonDocument doc(8192); // larger doc for transactions
  deserializeJson(doc, json);
  return doc;
}

void saveTransactions(DynamicJsonDocument& doc) {
  // Keep only the last 50 transactions to save space
  while (doc.size() > 50) {
    doc.remove(0);
  }
  String json;
  serializeJson(doc, json);
  writeFile("/transactions.json", json);
}

void addTransaction(String uid, String name, int amount, int prevBalance, int newBalance) {
  DynamicJsonDocument doc = getTransactions();
  JsonObject tx = doc.createNestedObject();
  tx["id"] = String(millis());
  tx["uid"] = uid;
  tx["name"] = name;
  tx["amount"] = amount;
  tx["prev_balance"] = prevBalance;
  tx["new_balance"] = newBalance;
  saveTransactions(doc);
}

#endif
