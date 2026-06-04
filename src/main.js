const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  screen,
  nativeImage,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");

// Load .env (tiny parser — avoids a dependency).
loadEnv(path.join(__dirname, "..", ".env"));

const capture = require("./services/capture");
const stt = require("./services/stt");
const brain = require("./services/brain");
const tts = require("./services/tts");
const { VoiceGate } = require("./services/voice");

const HOTKEY = process.env.HOTKEY || "Control+Alt+C";
let overlay = null;
let tray = null;
let busy = false;
let enrolling = false;
let wakeOn = false;
let wakeCooldown = 0;
const history = []; // [{role, text}], last few turns

const PROFILE_PATH = path.join(app.getPath("userData"), "voiceprint.bin");
const PPN_PATH = path.join(__dirname, "..", "models", "hey-zarus.ppn");
const voice = new VoiceGate();

function createOverlay() {
  const primary = screen.getPrimaryDisplay();
  overlay = new BrowserWindow({
    x: primary.bounds.x,
    y: primary.bounds.y,
    width: primary.bounds.width,
    height: primary.bounds.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.loadFile(path.join(__dirname, "overlay.html"));
}

function createTray() {
  const png = nativeImage.createFromDataURL(DOT_ICON);
  tray = new Tray(png);
  refreshTray();
}

function refreshTray() {
  if (!tray) return;
  const wakeReady = !!process.env.PICOVOICE_ACCESS_KEY && fs.existsSync(PPN_PATH);
  tray.setToolTip(
    wakeOn ? `ZarusAI — say "Hey Zarus"` : `ZarusAI — press ${HOTKEY} to talk`,
  );
  const items = [
    { label: `Talk now (${HOTKEY})`, click: () => toggleListen() },
    { type: "separator" },
  ];
  if (wakeReady) {
    items.push({
      label: wakeOn ? "✓ Listening for “Hey Zarus”" : "Start listening for “Hey Zarus”",
      click: () => setWake(!wakeOn),
    });
    items.push({
      label: voice.hasProfile() ? "Re-enroll my voice" : "Enroll my voice (required for voice-ID)",
      click: () => startEnroll(),
    });
  } else {
    items.push({ label: "Wake word: set up Picovoice (see SETUP.md)", enabled: false });
  }
  items.push({ type: "separator" }, { label: "Quit", click: () => app.quit() });
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function setWake(on) {
  if (on && !voice.enabled) {
    try {
      voice.init({
        accessKey: process.env.PICOVOICE_ACCESS_KEY,
        ppnPath: PPN_PATH,
        sensitivity: Number(process.env.WAKEWORD_SENSITIVITY || 0.6),
        profilePath: PROFILE_PATH,
        threshold: Number(process.env.SPEAKER_THRESHOLD || 0.5),
      });
    } catch (e) {
      notify(`Wake word failed: ${e.message}`);
      return;
    }
  }
  wakeOn = on;
  overlay.webContents.send("listen-control", on);
  refreshTray();
}

function startEnroll() {
  if (enrolling) return;
  // Pause wake listening during enrollment.
  if (wakeOn) overlay.webContents.send("listen-control", false);
  try {
    if (!voice.accessKey) {
      voice.init({
        accessKey: process.env.PICOVOICE_ACCESS_KEY,
        ppnPath: PPN_PATH,
        sensitivity: Number(process.env.WAKEWORD_SENSITIVITY || 0.6),
        profilePath: PROFILE_PATH,
        threshold: Number(process.env.SPEAKER_THRESHOLD || 0.5),
      });
    }
    voice.startEnroll();
  } catch (e) {
    notify(`Enrollment failed: ${e.message}`);
    return;
  }
  enrolling = true;
  notify("Enrolling — keep talking naturally until it reaches 100%.");
  overlay.webContents.send("enroll-control", true);
}

voice.onWake = ({ speakerOk, score }) => {
  if (busy || enrolling) return;
  if (Date.now() < wakeCooldown) return;
  wakeCooldown = Date.now() + 2500;
  if (!speakerOk) {
    console.log(`[wake] heard, but speaker score ${score.toFixed(2)} — ignored`);
    return;
  }
  console.log(`[wake] triggered (score ${score.toFixed(2)})`);
  overlay.webContents.send("toggle-listen");
};

function toggleListen() {
  if (busy || !overlay) return;
  overlay.webContents.send("toggle-listen");
}

function notify(msg) {
  if (overlay) overlay.webContents.send("notice", msg);
  console.log("[notice]", msg);
}

/** The renderer sends us recorded audio; we run the full pipeline. */
async function handleAudio(audioBase64, mime) {
  if (busy) return;
  busy = true;
  try {
    overlay.webContents.send("state", "thinking");

    const cap = await capture.capturePrimary();
    const audio = Buffer.from(audioBase64, "base64");

    let transcript = "";
    try {
      transcript = await stt.transcribe(audio, mime);
    } catch (e) {
      console.error("STT failed:", e.message);
    }

    const { text, point } = await brain.ask({
      imageBase64: cap.base64,
      mimeType: cap.mimeType,
      shotW: cap.shotW,
      shotH: cap.shotH,
      transcript,
      history: history.slice(-6),
    });

    history.push({ role: "user", text: transcript || "(looked at screen)" });
    history.push({ role: "model", text });

    let audioOut = null;
    try {
      audioOut = await tts.speak(text);
    } catch (e) {
      console.error("TTS failed:", e.message);
    }

    const overlayPoint =
      point && point.x != null ? capture.toOverlayPoint(point, cap) : null;

    overlay.webContents.send("respond", {
      transcript,
      text,
      point: overlayPoint,
      audio: audioOut,
    });
  } catch (e) {
    console.error("pipeline error:", e.message);
    overlay.webContents.send("respond", {
      text: `Something went wrong: ${e.message}`,
      point: null,
      audio: null,
    });
  } finally {
    busy = false;
  }
}

app.whenReady().then(() => {
  createOverlay();
  createTray();
  globalShortcut.register(HOTKEY, toggleListen);

  ipcMain.on("audio", (_e, { audio, mime }) => handleAudio(audio, mime));

  // Always-on wake-word audio (16kHz mono Int16 from the renderer).
  ipcMain.on("pcm", (_e, buf) => {
    if (!wakeOn || busy || enrolling) return;
    voice.feed(toInt16(buf));
  });

  // Enrollment audio.
  ipcMain.on("pcm-enroll", (_e, buf) => {
    if (!enrolling) return;
    const pct = voice.feedEnroll(toInt16(buf));
    overlay.webContents.send("enroll-progress", Math.round(pct));
    if (pct >= 100) {
      enrolling = false;
      overlay.webContents.send("enroll-control", false);
      const ok = voice.finishEnroll();
      notify(ok ? "Voice enrolled — it will only respond to you now." : "Enrollment couldn't be saved.");
      if (ok && wakeOn) overlay.webContents.send("listen-control", true);
      refreshTray();
    }
  });

  // Auto-start wake listening if it's configured and a voiceprint exists.
  const wakeReady =
    !!process.env.PICOVOICE_ACCESS_KEY && fs.existsSync(PPN_PATH);
  if (wakeReady && fs.existsSync(PROFILE_PATH)) {
    overlay.webContents.once("did-finish-load", () => setWake(true));
  }
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {
  /* keep running in the tray */
});

/* ── helpers ─────────────────────────────────────────────────────────── */

function toInt16(buf) {
  if (buf instanceof Int16Array) return buf;
  if (ArrayBuffer.isView(buf))
    return new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2));
  if (buf instanceof ArrayBuffer) return new Int16Array(buf);
  if (Array.isArray(buf)) return Int16Array.from(buf);
  return new Int16Array(0);
}

function loadEnv(file) {
  try {
    const txt = fs.readFileSync(file, "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no .env — rely on real env */
  }
}

// A small violet dot, base64 PNG, for the tray.
const DOT_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAWklEQVR4nGNgGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoAAB5kQGBy0i7XwAAAABJRU5ErkJggg==";
