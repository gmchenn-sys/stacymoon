// T-014/T-015: WiFi + POST /chat/stream + onboard WS2812 mood LED by intent
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include "secrets.h"

static const char* HOST = "stacymoon.online";
static const int PORT = 443;
static const char* PATH = "/chat/stream";

static const int RGB_PIN = 48;

static String tokenAccum;
static String finalResponse;
static String finalIntent;
static bool gotDone = false;

static void ledWrite(uint8_t r, uint8_t g, uint8_t b) {
  rgbLedWrite(RGB_PIN, r, g, b);
}

static void setLedByIntent(const String& intent) {
  uint8_t r = 20, g = 20, b = 20;
  const char* colorName = "dim_white";

  if (intent == "general") {
    r = 0; g = 60; b = 0;
    colorName = "green";
  } else if (intent == "health_knowledge") {
    r = 0; g = 40; b = 60;
    colorName = "cyan_blue";
  } else if (intent == "emotional_support") {
    r = 70; g = 25; b = 0;
    colorName = "warm_orange";
  } else if (intent == "crisis") {
    r = 90; g = 0; b = 0;
    colorName = "red";
    for (int i = 0; i < 3; i++) {
      ledWrite(90, 0, 0);
      delay(200);
      ledWrite(0, 0, 0);
      delay(200);
    }
  }

  ledWrite(r, g, b);
  Serial.print("LED intent=");
  Serial.print(intent.length() ? intent : "(empty)");
  Serial.print(" -> (");
  Serial.print(r);
  Serial.print(",");
  Serial.print(g);
  Serial.print(",");
  Serial.print(b);
  Serial.print(") ");
  Serial.println(colorName);
}

static void yellowSlowBlinkOnce() {
  ledWrite(40, 40, 0);
  delay(400);
  ledWrite(0, 0, 0);
  delay(400);
}

static bool connectWifi() {
  Serial.print("WiFi connecting to ");
  Serial.print(WIFI_SSID);
  Serial.println(" ...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    yellowSlowBlinkOnce();
    Serial.print(".");
    attempts++;
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi FAILED (check 2.4GHz SSID/pass; S3 has no 5G)");
    ledWrite(90, 0, 0);  // WiFi fail: solid red
    return false;
  }

  Serial.print("WiFi OK IP=");
  Serial.println(WiFi.localIP());
  return true;
}

static void handleSseData(const String& jsonLine) {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, jsonLine);
  if (err) {
    Serial.print("JSON err: ");
    Serial.println(err.c_str());
    return;
  }

  const char* type = doc["type"] | "";
  if (strcmp(type, "token") == 0) {
    const char* content = doc["content"] | "";
    tokenAccum += content;
    Serial.print(content);
  } else if (strcmp(type, "done") == 0) {
    const char* resp = doc["response"] | "";
    const char* intent = doc["intent"] | "";
    if (resp[0] != '\0') {
      finalResponse = resp;
    } else {
      finalResponse = tokenAccum;
    }
    finalIntent = intent;
    gotDone = true;
  }
}

static bool chatOnce() {
  tokenAccum = "";
  finalResponse = "";
  finalIntent = "";
  gotDone = false;

  ledWrite(0, 0, 50);  // waiting for reply: blue

  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(60000);  // ms — ESP32 Stream timeout

  Serial.print("TLS connect ");
  Serial.print(HOST);
  Serial.println(" ...");
  if (!client.connect(HOST, PORT)) {
    Serial.println("TLS connect FAILED");
    return false;
  }

  // Body matches T-014 curl probe
  String body =
      "{\"message\":\"你好\",\"user_id\":\"" + String(STACY_USER_ID) +
      "\",\"reply_mode\":\"text\",\"channel\":\"text\","
      "\"stacy_profile\":{\"name\":\"测试\",\"age\":50}}";

  String req;
  req.reserve(512 + body.length());
  req += "POST ";
  req += PATH;
  req += " HTTP/1.1\r\n";
  req += "Host: ";
  req += HOST;
  req += "\r\n";
  req += "Content-Type: application/json\r\n";
  req += "Accept: text/event-stream\r\n";
  req += "Connection: close\r\n";
  req += "Content-Length: ";
  req += String(body.length());
  req += "\r\n\r\n";
  req += body;

  client.print(req);

  // Status line
  String statusLine = client.readStringUntil('\n');
  statusLine.trim();
  Serial.print("HTTP status line: ");
  Serial.println(statusLine);

  int httpCode = 0;
  if (statusLine.startsWith("HTTP/")) {
    int sp1 = statusLine.indexOf(' ');
    int sp2 = statusLine.indexOf(' ', sp1 + 1);
    if (sp1 > 0 && sp2 > sp1) {
      httpCode = statusLine.substring(sp1 + 1, sp2).toInt();
    }
  }
  Serial.print("HTTP ");
  Serial.println(httpCode);

  // Skip headers
  while (client.connected() || client.available()) {
    String h = client.readStringUntil('\n');
    h.trim();
    if (h.length() == 0) break;
  }

  Serial.println("--- SSE tokens ---");
  String line;
  unsigned long deadline = millis() + 90000UL;
  while ((client.connected() || client.available()) && millis() < deadline) {
    if (!client.available()) {
      delay(10);
      continue;
    }
    line = client.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;
    if (!line.startsWith("data:")) continue;

    String payload = line.substring(5);
    payload.trim();
    if (payload.length() == 0 || payload == "[DONE]") continue;
    handleSseData(payload);
    if (gotDone) break;
  }
  client.stop();
  Serial.println();
  Serial.println("--- SSE end ---");

  if (!gotDone && tokenAccum.length() > 0) {
    finalResponse = tokenAccum;
  }

  Serial.print("【回复】");
  Serial.println(finalResponse);
  Serial.print("【intent】");
  Serial.println(finalIntent);

  setLedByIntent(finalIntent);

  return httpCode == 200 && finalResponse.length() > 0;
}

void setup() {
  Serial.begin(115200);
  delay(800);
  Serial.println();
  Serial.println("stacy_chat ready");

  ledWrite(40, 40, 0);  // boot: yellow

  if (!connectWifi()) {
    Serial.println("abort: no WiFi");
    return;
  }

  ledWrite(0, 0, 50);  // WiFi OK, before chat: blue

  bool ok = chatOnce();
  Serial.print("chatOnce ");
  Serial.println(ok ? "OK" : "FAIL");
}

void loop() {
  delay(1000);
}
