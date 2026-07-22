// T-014: WiFi + POST /chat/stream, parse SSE, print response + intent
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include "secrets.h"

static const char* HOST = "stacymoon.online";
static const int PORT = 443;
static const char* PATH = "/chat/stream";

static String tokenAccum;
static String finalResponse;
static String finalIntent;
static bool gotDone = false;

static bool connectWifi() {
  Serial.print("WiFi connecting to ");
  Serial.print(WIFI_SSID);
  Serial.println(" ...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi FAILED (check 2.4GHz SSID/pass; S3 has no 5G)");
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

  return httpCode == 200 && finalResponse.length() > 0;
}

void setup() {
  Serial.begin(115200);
  delay(800);
  Serial.println();
  Serial.println("stacy_chat ready");

  if (!connectWifi()) {
    Serial.println("abort: no WiFi");
    return;
  }

  bool ok = chatOnce();
  Serial.print("chatOnce ");
  Serial.println(ok ? "OK" : "FAIL");
}

void loop() {
  delay(1000);
}
