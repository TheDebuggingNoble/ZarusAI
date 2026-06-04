/* Live pipeline test: runs inside Electron so it can really capture the screen.
   Captures your current primary display → Gemini vision → answer + point → TTS. */
const { app } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

loadEnv(path.join(__dirname, "..", ".env"));
const capture = require("../src/services/capture");
const brain = require("../src/services/brain");
const tts = require("../src/services/tts");

app.whenReady().then(async () => {
  try {
    const cap = await capture.capturePrimary();
    console.log(`captured screen → ${cap.shotW}x${cap.shotH}`);

    const { text, point } = await brain.ask({
      imageBase64: cap.base64,
      mimeType: cap.mimeType,
      shotW: cap.shotW,
      shotH: cap.shotH,
      transcript:
        "In one short sentence, what's on my screen right now? Then point at one clickable thing I could interact with.",
      history: [],
    });
    console.log("\nANSWER:", text);
    if (point) {
      const op = capture.toOverlayPoint(point, cap);
      console.log(
        `POINT: shot ${point.x},${point.y} (“${point.label}”) → overlay px ${op.x},${op.y}`,
      );
    } else {
      console.log("POINT: none");
    }

    const audio = await tts.speak(text);
    console.log(`TTS: ${Math.round((audio.length * 3) / 4 / 1024)} KB of speech`);
    console.log("\n✅ live pipeline responded");
  } catch (e) {
    console.error("FAIL:", e.message);
  }
  app.quit();
});

app.on("window-all-closed", () => app.quit());

function loadEnv(file) {
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}
