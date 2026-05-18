/**
 * Music Visualizer by Jason Kim
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
 * Gemini was used to assist with debugging with the project with button and visualization issues.
 *
 * Hardware:
 *   - Adafruit ESP32-S3 Feather (2MB PSRAM)
 *   - SSD1306 128x64 OLED display (for Visual I/O feedback)
 *   - NeoPixel LED strip (for Visual I/O feedback)
 *   - Piezo Buzzer (for Audible I/O feedback)
 *   - Buttons (for Play/Pause and Next Track)
 *   - Sliding Potentiometer (for Volume Control)
 */

const SONG_FILES = [
  'songs/Capital Cities - Safe and Sound.mp3',
  'songs/Coldplay - Paradise.mp3',
  'songs/Duncan Sheik - Barely Breathing.mp3',
  'songs/Kings of Leon - Use Somebody.mp3',
  'songs/New Radicals - You Get What You Give.mp3',
  'songs/Coldplay - Sparks.mp3',
  'songs/Coldplay - Yellow.mp3',
  'songs/Coldplay - Fix You.mp3',
  'songs/Chromeo - Jealous.mp3',
  'songs/Snow Patrol - Chasing Cars.mp3',
  'songs/The Fray - You Found Me.mp3',
  'songs/Iris - Goo Goo Dolls.mp3',
  'songs/The Script - Breakeven.mp3',
  'songs/Santigold - Disparate Youth.mp3'
];

let serial;
let serialOptions = { baudRate: 115200 };
let potVal = 0;
let lastNextSongTime  = 0;
let lastPlayPauseTime = 0;
const NEXT_SONG_COOLDOWN_MS  = 2000;
const PLAY_PAUSE_COOLDOWN_MS = 500;

let prevPlayPauseVal = 0;
let prevNextSongVal  = 0;

serial = new Serial();
serial.on(SerialEvents.CONNECTION_OPENED, onSerialConnectionOpened);
serial.on(SerialEvents.CONNECTION_CLOSED, onSerialConnectionClosed);
serial.on(SerialEvents.DATA_RECEIVED,     onSerialDataReceived);
serial.on(SerialEvents.ERROR_OCCURRED,    onSerialErrorOccurred);
serial.autoConnectAndOpenPreviouslyApprovedPort(serialOptions);

/**
 * Called when the serial port successfully opens.
 * Updates the connect button text to confirm the connection.
 *
 * @param {Serial} eventSender - the serial object that fired the event
 */
function onSerialConnectionOpened(eventSender) {
  console.log("onSerialConnectionOpened");
  document.getElementById('serialBtn').textContent = 'Serial Connected';
}

/**
 * Called when the serial port closes.
 * Resets the connect button text to prompt reconnection.
 *
 * @param {Serial} eventSender - the serial object that fired the event
 */
function onSerialConnectionClosed(eventSender) {
  document.getElementById('serialBtn').textContent = 'Connect Serial';
}

/**
 * Called when a serial error occurs.
 * Logs the error to the console for debugging.
 *
 * @param {Serial} eventSender - the serial object that fired the event
 * @param {*} error - the error that occurred
 */
function onSerialErrorOccurred(eventSender, error) {
  console.log("onSerialErrorOccurred", error);
}


/**
 * Called whenever a new line of data arrives from the Arduino over Serial.
 * Parses the CSV for potVal, playPauseVal, nextSongVal.
 * Detects rising edges on each button value and fires togglePlayPause() or
 * nextSong() if the corresponding cooldown has elapsed.
 * Ignores lines starting with '#' (debug comments from the Arduino).
 *
 * @param {Serial} eventSender - the serial object that fired the event
 * @param {string} newData - the raw string received from the Arduino
 */
function onSerialDataReceived(eventSender, newData) {
  if (newData.startsWith('#')) return;

  let parts = newData.trim().split(',');
  if (parts.length >= 3) {
    potVal           = parseInt(parts[0]);
    let playPauseVal = parseInt(parts[1]);
    let nextSongVal  = parseInt(parts[2]);

    let now = Date.now();

    let isPlayPausePressed = (playPauseVal === 1 && prevPlayPauseVal === 0);
    let isNextSongPressed  = (nextSongVal === 1 && prevNextSongVal === 0);

    if (isPlayPausePressed && (now - lastPlayPauseTime) > PLAY_PAUSE_COOLDOWN_MS) {
      console.log("TOGGLE PLAY PAUSE");
      togglePlayPause();
      lastPlayPauseTime = now;
    } else if (isNextSongPressed && (now - lastNextSongTime) > NEXT_SONG_COOLDOWN_MS) {
      console.log("NEXT SONG");
      nextSong();
      lastNextSongTime = now;
    }
    prevPlayPauseVal = playPauseVal;
    prevNextSongVal  = nextSongVal;

    sendSerialData();
  }
}

/**
 * Sends the current playback state back to the Arduino over Serial.
 * Format: "volume,trackNum,totalTracks,elapsed,duration,playing,Artist - Title"
 * Does nothing if the serial port is not open.
 */
function sendSerialData() {
  if (!serial.isOpen()) return;
  let volumeLevel = Math.round((potVal / 4095.0) * 100);
  let track = currentIndex + 1;
  let total = SONG_FILES.length;
  let elapsed = currentSong() ? Math.floor(currentSong().currentTime()) : 0;
  let duration = currentSong() ? Math.floor(currentSong().duration()) : 0;
  let playingInt = isPlaying ? 1 : 0;
  let songName = getSongName(currentIndex);
  serial.writeLine(`${volumeLevel},${track},${total},${elapsed},${duration},${playingInt},${songName}`);
}

/**
 * Opens the serial port when the connect button is clicked.
 * Does nothing if the port is already open.
 */
async function onSerialConnectButtonClicked() {
  if (!serial.isOpen()) {
    await serial.connectAndOpen(null, serialOptions);
  }
}


/**
 * Returns a human-readable song name from a file path by stripping
 * the directory prefix, file extension, and replacing underscores with spaces.
 *
 * @param {number} index - index into SONG_FILES
 * @returns {string} the cleaned song name, e.g. "Coldplay - Yellow".
 */
function getSongName(index) {
  return SONG_FILES[index]
    .replace('songs/', '')
    .replace('.mp3', '')
    .replace(/_/g, ' ');
}

let songs = [];
let currentIndex = 0;
let isPlaying = false;
let fft;
let songsLoaded = 0;
let ignoreEndedCallback = false;

/**
 * Returns the p5.SoundFile for the currently active track,
 * or null if no songs have been loaded yet.
 *
 * @returns {p5.SoundFile|null}
 */
function currentSong() {
  return songs.length > 0 ? songs[currentIndex] : null;
}

/**
 * Toggles playback of the current track between playing and paused.
 * Sets ignoreEndedCallback during pause to prevent the ended handler
 * from auto-advancing the track while the song is merely being paused.
 */
function togglePlayPause() {
  if (!currentSong()) return;
  console.log(`togglePlayPause: isPlaying=${isPlaying} currentIndex=${currentIndex}`);
  
  if (isPlaying) {
    ignoreEndedCallback = true; 
    currentSong().pause();
    setTimeout(() => { ignoreEndedCallback = false; }, 200);
    
    isPlaying = false;
  } else {
    currentSong().play();
    isPlaying = true;
  }
}


/**
 * Stops the current track and advances to the next one, wrapping around
 * to the beginning after the last track.
 * Sets ignoreEndedCallback during the stop to prevent the ended handler
 * from double-advancing the index.
 */
function nextSong() {
  if (songs.length < 2 || !currentSong()) {
    return;
  }

  let oldSong = currentSong();

  ignoreEndedCallback = true;
  oldSong.stop();
  setTimeout(() => { ignoreEndedCallback = false; }, 200);

  currentIndex = (currentIndex + 1) % songs.length;

  currentSong().play();
  isPlaying = true;
}

/**
 * Called automatically by p5.sound when a track finishes playing naturally.
 * Advances to the next track unless the callback is suppressed (e.g. during
 * a manual stop or pause) or the ended event is for a stale track index.
 *
 * @param {number} endedIndex - the index of the song that just ended
 */
function onSongEnded(endedIndex) {
  console.log(`onSongEnded fired: endedIndex=${endedIndex} currentIndex=${currentIndex} ignore=${ignoreEndedCallback}`);
  if (ignoreEndedCallback) return;
  if (endedIndex !== currentIndex) return;
  isPlaying = false;
  currentIndex = (currentIndex + 1) % songs.length;
  if (currentSong()) {
    currentSong().play();
    isPlaying = true;
  }
}

document.getElementById('playBtn').style.display = 'none';
document.getElementById('fileBtn').style.display = 'none';
document.getElementById('fileInput').style.display = 'none';

new p5((p) => {
   /**
   * Preloads all songs from SONG_FILES before setup() runs.
   * Registers the onSongEnded callback for each track and tracks
   * load progress via songsLoaded.
   */
  p.preload = () => {
    for (let i = 0; i < SONG_FILES.length; i++) {
      let s = p.loadSound(SONG_FILES[i], () => {
        songsLoaded++;
        console.log(`Loaded: ${SONG_FILES[i]}`);
      });
      s.onended(() => onSongEnded(i));
      songs.push(s);
    }
  };

  /**
   * Creates the full-window canvas and initializes the FFT analyzer.
   */
  p.setup = () => {
    let canvas = p.createCanvas(p.windowWidth, p.windowHeight);
    canvas.parent('canvas-container');
    fft = new p5.FFT(0.9, 64);
  };

  /**
    * Resizes the canvas to fill the window whenever the browser is resized.
    */
  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };

   /**
   * Main draw loop. Renders one of three states each frame:
   * - A loading screen while songs are still being decoded.
   * - A paused screen with instructions when nothing is playing.
   * - The full visualizer: an FFT frequency bar chart with a per-song hue,
   *   a bass-driven full-screen glow, and a bottom HUD showing track info.
   * Also sets the current song's volume from the potentiometer each frame.
   */
  p.draw = () => {
    p.background(10, 10, 20);

    if (songsLoaded < SONG_FILES.length) {
      p.fill(255);
      p.textAlign(p.CENTER);
      p.textSize(20);
      p.noStroke();
      p.text(`Loading Songs... ${songsLoaded}/${SONG_FILES.length}`, p.width / 2, p.height / 2);
      return;
    }

    if (!isPlaying) {
      p.fill(255);
      p.textAlign(p.CENTER);
      p.textSize(24);
      p.noStroke();
      p.text('Press Play to Start', p.width / 2, p.height / 2);
      p.textSize(16);
      p.fill(180);
      p.text('Press Next to Skip Song', p.width / 2, p.height / 2 + 36);
      return;
    }

    fft.setInput(currentSong());
    let spectrum = fft.analyze();
    let bass = fft.getEnergy('bass');
    let volume = potVal / 4095.0;

    if (currentSong()) {
      let vol = Math.max(volume, 0.1);
      currentSong().setVolume(vol);
    }

    let baseHue = p.map(currentIndex, 0, SONG_FILES.length - 1, 0, 300);
    p.colorMode(p.HSB, 360, 100, 100, 100);

    let usefulBins = Math.floor(spectrum.length * 0.75); 
    let barWidth = Math.ceil(p.width / usefulBins); 

    for (let i = 0; i < usefulBins; i++) {
      let amp = p.map(spectrum[i], 0, 255, 0, p.height) * (0.3 + volume * 0.7);
      let hue = (baseHue + p.map(i, 0, usefulBins, 0, 60)) % 360; 
      let brightness = p.map(amp, 0, p.height, 30, 100);
      
      p.fill(hue, 100, brightness, 100);
      p.noStroke();
      p.rect(i * barWidth, p.height - amp, barWidth + 1, amp);
    }

    if (bass > 160) {
      p.colorMode(p.HSB, 360, 100, 100, 100);
      let glowAlpha = p.map(bass, 160, 255, 0, 25);
      p.fill(baseHue, 80, 100, glowAlpha);
      p.rect(0, 0, p.width, p.height);
    }

    p.colorMode(p.RGB, 255, 255, 255, 255);
    p.fill(0, 0, 0, 160);
    p.noStroke();
    p.rect(0, p.height - 70, p.width, 70);

    p.fill(255);
    p.textSize(18);
    p.textAlign(p.LEFT);
    p.text(getSongName(currentIndex), 20, p.height - 40);

    let elapsed  = currentSong() ? Math.floor(currentSong().currentTime()) : 0;
    let duration = currentSong() ? Math.floor(currentSong().duration()) : 0;
    let eMins = Math.floor(elapsed / 60);
    let eSecs = elapsed % 60;
    let dMins = Math.floor(duration / 60);
    let dSecs = duration % 60;
    let timeStr = `${eMins}:${eSecs < 10 ? '0' : ''}${eSecs} / ${dMins}:${dSecs < 10 ? '0' : ''}${dSecs}`;
    let volPct  = Math.round(volume * 100);

    p.textSize(13);
    p.fill(200);
    p.text(
      `Track ${currentIndex + 1} of ${SONG_FILES.length}  |  ${timeStr}  |  Volume: ${volPct}%  |  Serial: ${serial.isOpen() ? 'Connected' : 'Disconnected'}`,
      20, p.height - 18
    );
  };
});