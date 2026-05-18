/**
 * Muisc Visualizer by Jason Kim
 * CSE 493F - Physical Computing
 * Spring 2026
 * 
 * Beautifully visualizes music playing on the user's computer with a colorful physical interface and display. The 
 * potentiometer controls the volume, which is visualized on the NeoPixel strip. The OLED display shows the
 * current track information and progress. The button allows toggling between play/pause and skipping to the next track,
 * with accompanying chime sounds from the buzzer.
 * 
 * Credit to Dr. Froehlich and the Interactive Physical Computing Textbook
 * (including the template code for the project):
 * https://makeabilitylab.github.io/physcomp/
 *
 * Gemini was used to to assist with debugging with the project with button and visualizationissues.
 *
 * Hardware:
 *   - Adafruit ESP32-S3 Feather (2MB PSRAM)
 *   - SSD1306 128x64 OLED display (for Visual I/O feedback)
 *   - NeoPixel LED strip (for Visual I/O feedback)
 *   - Piezo Buzzer (for Audible I/O feedback)
 *   - Buttons (for Play/Pause and Next Track)
 *   - Sliding Potentiometer (for Volume Control)
 */


#include <Wire.h>
#include <Adafruit_NeoPixel.h>
#include <Adafruit_SSD1306.h>

#define POT_PIN A0
#define BUTTON_PLAYPAUSE 5
#define BUTTON_NEXT 9
#define NEO_PIN 6
#define NEO_COUNT 8
#define BUZZER_PIN A5
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_ADDR 0x3D
#define DEBOUNCE_MS 50

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
Adafruit_NeoPixel strip(NEO_COUNT, NEO_PIN, NEO_GRB + NEO_KHZ800);

int volumeLevel = 0;
int trackNumber = 1;
int totalTracks = 1;
int elapsedSec = 0;
int durationSec = 0;
bool playing = false;

String artist = "Waiting";
String songTitle = "...";
bool lastPlayPauseReading = false;
bool stablePlayPauseState = false;
bool lastStablePlayPauseState = false;
unsigned long lastPlayPauseDebounce = 0;

bool lastNextReading = false;
bool stableNextState = false;
bool lastStableNextState = false;
unsigned long lastNextDebounce = 0;

bool sendPlayPause = false;
bool sendNextSong  = false;

struct ChimeNote {
  int freq;
  int duration;
};

ChimeNote chimePlayPauseNotes[] = {{880, 80}, {1100, 80}};
ChimeNote chimeNextSongNotes[]  = {{660, 60}, {880, 60}, {1100, 60}};

ChimeNote* activeChime = nullptr;
int chimeNoteCount = 0;
int chimeNoteIndex = 0;
unsigned long chimeNoteStart = 0;
bool chimeActive = false;

/**
 * Starts the chime for the play/pause button.
 * Initializes the chime state machine and immediately begins first note.
 */
void startChimePlayPause() {
  activeChime = chimePlayPauseNotes;
  chimeNoteCount = 2;
  chimeNoteIndex = 0;
  chimeActive = true;
  chimeNoteStart = millis();
  tone(BUZZER_PIN, activeChime[0].freq);
}

/**
 * Starts the chime for the next track button.
 * Initializes the chime state machine and immediately begins first note.
 */
void startChimeNextSong() {
  activeChime = chimeNextSongNotes;
  chimeNoteCount = 3;
  chimeNoteIndex = 0;
  chimeActive = true;
  chimeNoteStart = millis();
  tone(BUZZER_PIN, activeChime[0].freq);
}

/**
 * Non-blocking chime tick; must be called every loop iteration.
 * Advances to the next note once the current note's duration has elapsed,
 * and silences the buzzer when the full sequence finishes.
 */
void updateChime() {
  if (!chimeActive) {
    return;
  }

  unsigned long now = millis();

  if (now - chimeNoteStart >= (unsigned long)activeChime[chimeNoteIndex].duration) {

    chimeNoteIndex++;

    if (chimeNoteIndex >= chimeNoteCount) {
      noTone(BUZZER_PIN);
      chimeActive = false;
    } else {
      chimeNoteStart = now;
      tone(BUZZER_PIN, activeChime[chimeNoteIndex].freq);
    }
  }

}

/**
 * Prints a string horizontally centered on the OLED at the given y-coordinate.
 * If the string is wider than the display, it falls back to left-aligned (x=0).
 *
 * @param text - the string to display
 * @param y - the y-coordinate (top of the character cell) in pixels
 */
void printCentered(String text, int y) {
  int16_t x1, y1;
  uint16_t w, h;
  
  display.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
  
  int x = (SCREEN_WIDTH - w) / 2;
  
  if (x < 0) x = 0; 
  
  display.setCursor(x, y);
  display.print(text);
}

/**
 * Initializes serial communication, pins, the NeoPixel strip, and OLED display.
 * Shows a startup splash screen if the OLED is found on the I2C bus.
 */
void setup() {
  Serial.begin(115200);
  Serial.setTimeout(10);
  delay(1000);

  pinMode(BUTTON_PLAYPAUSE, INPUT_PULLUP);
  pinMode(BUTTON_NEXT, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);

  strip.begin();
  strip.setBrightness(80);
  strip.show();

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("OLED Connectio Failed");
  } else {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("Music Visualizer");
    display.println("Waiting...");
    display.display();
  }
}

/**
 * Main loop: debounces both buttons, sends control events and pot value to the host
 * over Serial, receives playback state back from the host, updates the NeoPixel
 * volume meter, ticks the chime state machine, and refreshes the OLED display.
 */
void loop() {
  int potVal = analogRead(POT_PIN);
  unsigned long now = millis();

  bool ppReading = digitalRead(BUTTON_PLAYPAUSE) == LOW;
  if (ppReading != lastPlayPauseReading) {
    lastPlayPauseDebounce = now;
  }
  lastPlayPauseReading = ppReading;

  bool newStablePP = stablePlayPauseState;
  if ((now - lastPlayPauseDebounce) > DEBOUNCE_MS) {
    newStablePP = ppReading;
  }

  if (lastStablePlayPauseState == true && newStablePP == false) {
    sendPlayPause = true;
  }
  lastStablePlayPauseState = newStablePP;
  stablePlayPauseState = newStablePP;

  bool nextReading = digitalRead(BUTTON_NEXT) == LOW;
  if (nextReading != lastNextReading) {
    lastNextDebounce = now;
  }
  lastNextReading = nextReading;

  bool newStableNext = stableNextState;
  if ((now - lastNextDebounce) > DEBOUNCE_MS) {
    newStableNext = nextReading;
  }

  if (lastStableNextState == true && newStableNext == false) {
    sendNextSong = true;
  }
  lastStableNextState = newStableNext;
  stableNextState = newStableNext;

  Serial.print(potVal);
  Serial.print(",");
  Serial.print(sendPlayPause ? 1 : 0);
  Serial.print(",");
  Serial.println(sendNextSong ? 1 : 0);

  bool playedPlayPause = sendPlayPause;
  bool playedNextSong  = sendNextSong;

  sendPlayPause = false;
  sendNextSong  = false;

  if (playedPlayPause) {
    startChimePlayPause();
  }

  if (playedNextSong) {
     startChimeNextSong();
  }

  updateChime();

  if (Serial.available()) {
    String msg = Serial.readStringUntil('\n');
    msg.trim();

    int idx = 0;
    String parts[7];
    int partCount = 0;

    for (int i = 0; i <= msg.length() && partCount < 7; i++) {
      if (i == msg.length() || (msg[i] == ',' && partCount < 6)) {
        parts[partCount++] = msg.substring(idx, i);
        idx = i + 1;
      }
    }

    if (partCount >= 7) {
      volumeLevel = parts[0].toInt();
      trackNumber = parts[1].toInt();
      totalTracks = parts[2].toInt();
      elapsedSec  = parts[3].toInt();
      durationSec = parts[4].toInt();
      playing     = parts[5].toInt() == 1;

      String full = parts[6];
      int dash = full.indexOf(" - ");

      if (dash != -1) {
        artist    = full.substring(0, dash);
        songTitle = full.substring(dash + 3);
      } else {
        artist    = "";
        songTitle = full;
      }
    }
  }

  int ledsLit = map(volumeLevel, 0, 100, 0, NEO_COUNT);
  strip.clear();
  for (int i = 0; i < ledsLit; i++) {
    strip.setPixelColor(NEO_COUNT - 1 - i, strip.Color(148, 0, 211));
  }
  if (ppReading || nextReading) {
    strip.fill(strip.Color(255, 255, 255));
  }
  strip.show();

  static unsigned long lastDisplayUpdate = 0;
  if (now - lastDisplayUpdate >= 50) {
    lastDisplayUpdate = now;
    
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    
    printCentered(playing ? "Now Playing" : "Paused", 0);
    display.drawLine(0, 10, 127, 10, SSD1306_WHITE);

    String dispArtist = artist;
    if (dispArtist.length() > 21) dispArtist = dispArtist.substring(0, 21);
    printCentered(dispArtist, 14);

    String dispTitle = songTitle;
    if (dispTitle.length() > 21) dispTitle = dispTitle.substring(0, 21);
    printCentered(dispTitle, 24);

    String trackStr = "Track " + String(trackNumber) + " of " + String(totalTracks);
    printCentered(trackStr, 36);

    int eMins = elapsedSec / 60;
    int eSecs = elapsedSec % 60;
    int dMins = durationSec / 60;
    int dSecs = durationSec % 60;
    
    String timeStr = String(eMins) + ":";
    if (eSecs < 10) timeStr += "0";
    timeStr += String(eSecs) + " / " + String(dMins) + ":";
    if (dSecs < 10) timeStr += "0";
    timeStr += String(dSecs);
    
    printCentered(timeStr, 47);
    String volStr = "Volume: " + String(map(potVal, 0, 4095, 0, 100)) + "%";
    printCentered(volStr, 57);

    display.display();
  }
}