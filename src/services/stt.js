/** Speech-to-text via Groq's free Whisper endpoint. */
async function transcribe(audioBuffer, mime = "audio/webm") {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY missing");

  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: mime }), "audio.webm");
  form.append("model", process.env.GROQ_STT_MODEL || "whisper-large-v3");
  form.append("response_format", "json");

  const res = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form },
  );
  if (!res.ok) {
    throw new Error(`Groq STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return String(data.text || "").trim();
}

module.exports = { transcribe };
