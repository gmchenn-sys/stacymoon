// T-014/T-015/T-016: WiFi + POST /chat/stream + onboard WS2812 mood LED by intent (carousel)
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include "secrets.h"

static const char* HOST = "stacymoon.online";
static const int PORT = 443;
static const char* PATH = "/chat/stream";

static const int RGB_PIN = 48;

// T-020: external dual-color LED (red+green chips), digital drive
static const int EXT_RED = 4;   // S 脚
static const int EXT_GREEN = 5; // 中间脚
static void extLed(bool redOn, bool greenOn) {
  digitalWrite(EXT_RED, redOn ? HIGH : LOW);
  digitalWrite(EXT_GREEN, greenOn ? HIGH : LOW);
}

// T-016: rotate 3 mood messages so LED color actually changes
static const char* MESSAGES[] = {
  "闺女今天给我打电话了，我们聊得挺开心",
  "我这两天心里特别烦，晚上老睡不着，总觉得孤单难受",
  "医生说我血压有点偏高，平时饮食上要注意些什么？",
};
static const int MESSAGE_COUNT = 3;
static int messageIndex = 0;
static bool wifiOk = false;

static String tokenAccum;
static String finalResponse;
static String finalIntent;
static bool gotDone = false;

static void ledWrite(uint8_t r, uint8_t g, uint8_t b) {
  rgbLedWrite(RGB_PIN, r, g, b);
}

static void setLedByIntent(const String& intent) {
  uint8_t r = 40, g = 40, b = 40;
  const char* colorName = "dim_white";

  if (intent == "general") {
    r = 0; g = 130; b = 0;
    colorName = "green";
    extLed(false, true);   // ext: 绿
  } else if (intent == "health_knowledge") {
    r = 0; g = 50; b = 150;
    colorName = "blue";
    extLed(true, true);    // ext: 橙(红+绿)
  } else if (intent == "emotional_support") {
    r = 160; g = 50; b = 0;
    colorName = "orange";
    extLed(true, true);    // ext: 橙(红+绿)
  } else if (intent == "crisis") {
    r = 160; g = 0; b = 0;
    colorName = "red";
    for (int i = 0; i < 3; i++) {
      ledWrite(160, 0, 0);
      extLed(true, false);
      delay(200);
      ledWrite(0, 0, 0);
      extLed(false, false);
      delay(200);
    }
    extLed(true, false);   // ext: 红常亮
  } else {
    extLed(false, false);
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

// Boot mood-color showcase: green → blue → orange → red (~900ms each)
static void showcaseMoodColors() {
  struct { const char* name; uint8_t r, g, b; } colors[] = {
    {"green",  0,   130, 0},
    {"blue",   0,    50, 150},
    {"orange", 160,  50, 0},
    {"red",    160,   0, 0},
  };
  for (int i = 0; i < 4; i++) {
    // ext dual-color mirror: green→绿 / blue→灭(双色灯无蓝) / orange→橙 / red→红
    if (i == 0)      extLed(false, true);
    else if (i == 1) extLed(false, false);
    else if (i == 2) extLed(true, true);
    else             extLed(true, false);
    Serial.print("SHOWCASE: ");
    Serial.print(colors[i].name);
    Serial.print(" -> (");
    Serial.print(colors[i].r);
    Serial.print(",");
    Serial.print(colors[i].g);
    Serial.print(",");
    Serial.print(colors[i].b);
    Serial.println(")");
    ledWrite(colors[i].r, colors[i].g, colors[i].b);
    delay(900);
  }
  ledWrite(0, 0, 0);
  extLed(false, false);
}

static void yellowSlowBlinkOnce() {
  ledWrite(40, 40, 0);
  extLed(true, true);   // ext 橙闪 = 连WiFi中
  delay(400);
  ledWrite(0, 0, 0);
  extLed(false, false);
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

static bool chatOnce(const char* message) {
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

  // Escape message for JSON string (minimal: quotes + backslash)
  String escapedMsg;
  for (const char* p = message; *p; p++) {
    if (*p == '"' || *p == '\\') {
      escapedMsg += '\\';
    }
    escapedMsg += *p;
  }

  String body =
      "{\"message\":\"" + escapedMsg + "\",\"user_id\":\"" + String(STACY_USER_ID) +
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
  pinMode(EXT_RED, OUTPUT);
  pinMode(EXT_GREEN, OUTPUT);
  extLed(false, false);
  delay(800);
  Serial.println();
  Serial.println("stacy_chat ready (T-019 mood showcase)");

  showcaseMoodColors();

  wifiOk = connectWifi();
  if (!wifiOk) {
    Serial.println("abort: no WiFi");
    return;
  }

  ledWrite(0, 0, 50);  // WiFi OK: blue, loop will start carousel
}

void loop() {
  if (!wifiOk) {
    delay(1000);
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi lost — waiting (no reconnect in loop)");
    ledWrite(90, 0, 0);
    delay(2000);
    return;
  }

  int idx = messageIndex;
  const char* msg = MESSAGES[idx];
  Serial.println();
  Serial.print("=== round msg#");
  Serial.print(idx + 1);
  Serial.print("/");
  Serial.print(MESSAGE_COUNT);
  Serial.println(" ===");
  Serial.print("【发送】");
  Serial.println(msg);

  bool ok = chatOnce(msg);
  Serial.print("chatOnce ");
  Serial.println(ok ? "OK" : "FAIL");
  Serial.print("round#");
  Serial.print(idx + 1);
  Serial.print(" intent=");
  Serial.println(finalIntent);

  // Hold mood color so human eye can see it
  Serial.println("hold LED 12s ...");
  delay(12000);

  messageIndex = (messageIndex + 1) % MESSAGE_COUNT;
}
