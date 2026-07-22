// T-013: minimal blink — prove write → compile → upload → run
// ESP32-S3 onboard LED is usually WS2812 on GPIO48; also toggle GPIO2 as backup.

static const int RGB_PIN = 48;
static const int GPIO2_PIN = 2;
static const uint8_t LED_BRIGHT = 40;

static unsigned long blinkCount = 0;
static bool ledOn = false;

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(GPIO2_PIN, OUTPUT);
  digitalWrite(GPIO2_PIN, LOW);

  // Drive WS2812 RGB (core 3.x API); off at boot
  rgbLedWrite(RGB_PIN, 0, 0, 0);

  Serial.println("blink ready");
}

void loop() {
  ledOn = !ledOn;

  if (ledOn) {
    rgbLedWrite(RGB_PIN, LED_BRIGHT, 0, LED_BRIGHT);  // magenta
    digitalWrite(GPIO2_PIN, HIGH);
  } else {
    rgbLedWrite(RGB_PIN, 0, 0, 0);
    digitalWrite(GPIO2_PIN, LOW);
  }

  blinkCount++;
  Serial.print("blink ");
  Serial.println(blinkCount);

  delay(500);
}
