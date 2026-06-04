/* Smoke-test the non-Electron services: Edge TTS + Gemini vision.
   (Screen capture needs Electron, so it's exercised by the real app.) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(__dirname, "..", ".env"));

const { speak } = await import("../src/services/tts.js").then((m) => m.default ?? m);
const { ask } = await import("../src/services/brain.js").then((m) => m.default ?? m);

// 1px-ish JPEG (a tiny gray image) so the vision call has something to chew on.
const TINY_JPEG =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";

let ok = true;

console.log("1) Edge TTS…");
try {
  const b64 = await speak("Hi, I'm Zarus.");
  console.log("   ✓ produced", Math.round((b64.length * 3) / 4 / 1024), "KB of audio");
} catch (e) {
  console.log("   ✗", e.message);
  ok = false;
}

console.log("2) Gemini vision…");
try {
  const r = await ask({
    imageBase64: TINY_JPEG,
    mimeType: "image/jpeg",
    shotW: 1,
    shotH: 1,
    transcript: "Just say hello in one short sentence.",
    history: [],
  });
  console.log("   ✓ answer:", JSON.stringify(r.text));
  console.log("   point:", r.point ? JSON.stringify(r.point) : "none");
} catch (e) {
  console.log("   ✗", e.message);
  ok = false;
}

console.log("\n", ok ? "✅ services OK" : "❌ a service failed");
process.exit(ok ? 0 : 1);

function loadEnv(file) {
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}
