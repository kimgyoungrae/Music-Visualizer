# Music Visualizer
**Jason Kim — CSE 493F Physical Computing, Spring 2026**

A physical music visualizer built with an ESP32-S3 and p5.js. A sliding potentiometer controls volume, NeoPixel LEDs display a volume meter, an OLED screen shows track info, and two buttons control playback — all synced over Serial to a browser-based FFT visualizer.

## Hardware
- Adafruit ESP32-S3 Feather (2MB PSRAM)
- SSD1306 128x64 OLED display
- NeoPixel LED strip (8 LEDs)
- Piezo buzzer
- Play/pause and next track buttons
- Sliding potentiometer

## Songs
The included tracks were personally extracted from iTunes and are used for educational purposes only. Full credit goes to the original artists:

- Capital Cities — Safe and Sound
- Coldplay — Paradise, Sparks, Yellow, Fix You
- Duncan Sheik — Barely Breathing
- Kings of Leon — Use Somebody
- New Radicals — You Get What You Give
- Chromeo — Jealous
- Snow Patrol — Chasing Cars
- The Fray — You Found Me
- Goo Goo Dolls — Iris
- The Script — Breakeven
- Santigold — Disparate Youth

You can also add your own songs by placing MP3 files into the `songs/` folder and adding their filenames to the `SONG_FILES` array in `sketch.js`. Files should be named in `Artist - Title.mp3` format.

## Setup

### 1. Flash the Arduino
1. Open `music_visualizer.ino` in the Arduino IDE
2. Select **Adafruit Feather ESP32-S3** as your board
3. Connect the ESP32 via USB and select the correct port
4. Click **Upload**

### 2. Start the Local Web Server
In the project directory, run:
```bash
python3 -m http.server 8000
```
Then open **Chrome** and navigate to `http://localhost:8000`

> Project may not work properly with other browsers such as Firefox, Safari, or Edge. Chrome is recommended.

### 3. Connect Serial
1. Click the **Connect Serial** button in the browser
2. Select the ESP32's port from the popup dialog
3. The button will update to **Serial Connected** when successful

### 4. Play Music
- Press the **play/pause button** on the device to start playback
- Press the **next track button** to skip songs
- Slide the **potentiometer** to adjust volume

## Credits
- Dr. Froehlich and the [Interactive Physical Computing Textbook](https://makeabilitylab.github.io/physcomp/)
- Gemini assisted with debugging button and visualization issues
