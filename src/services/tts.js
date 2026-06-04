const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/**
 * Free voice via Microsoft Edge "Read aloud" neural voices. Returns the spoken
 * answer as a base64 MP3 the renderer can play.
 */
async function speak(text, voice) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zarus-tts-"));
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(
      voice || process.env.EDGE_VOICE || "en-US-AriaNeural",
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
    );
    const { audioFilePath } = await tts.toFile(dir, text);
    const buf = fs.readFileSync(audioFilePath);
    return buf.toString("base64");
  } finally {
    try {
      tts.close();
    } catch {
      /* ignore */
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { speak };
