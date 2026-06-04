/**
 * The brain: Gemini 2.5 Flash with vision. Given a screenshot + the user's
 * spoken question, returns a short spoken answer and (optionally) a pixel
 * coordinate to point at, tagged as [POINT:x,y:label].
 */

function systemPrompt(shotW, shotH) {
  return [
    "You are Zarus, a friendly screen-aware assistant that lives next to the",
    "user's cursor. You are given a screenshot of their screen and what they",
    "just said out loud.",
    "",
    `The screenshot is ${shotW} x ${shotH} pixels (top-left is 0,0).`,
    "",
    "Answer in 1–3 short, natural spoken sentences. No markdown, no bullet",
    "lists, no emoji — it will be read aloud.",
    "",
    "If your answer refers to a specific thing on screen the user should look",
    "at or click, end your reply with EXACTLY this tag on its own line:",
    "  [POINT:x,y:short label]",
    "where x and y are normalized to 0–1000 (x: 0=left edge … 1000=right edge;",
    "y: 0=top edge … 1000=bottom edge) marking the CENTER of that element.",
    "If nothing specific should be pointed at, end with [POINT:none].",
    "Never mention the tag out loud.",
  ].join("\n");
}

async function ask({ imageBase64, mimeType, shotW, shotH, transcript, history }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY missing");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const contents = [];
  for (const h of history || []) {
    contents.push({ role: h.role, parts: [{ text: h.text }] });
  }
  contents.push({
    role: "user",
    parts: [
      { text: transcript || "(the user didn't say anything — greet them briefly)" },
      { inlineData: { mimeType, data: imageBase64 } },
    ],
  });

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt(shotW, shotH) }] },
    contents,
    generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  const raw =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";

  let point = null;
  const m = raw.match(/\[POINT:\s*(\d+)\s*,\s*(\d+)\s*:?([^\]]*)\]/i);
  if (m) {
    // Model returns 0–1000 normalized; convert to screenshot pixel space so
    // the caller's coordinate mapping works unchanged.
    point = {
      x: Math.round((Math.min(1000, +m[1]) / 1000) * shotW),
      y: Math.round((Math.min(1000, +m[2]) / 1000) * shotH),
      label: (m[3] || "").trim(),
    };
  }
  const text = raw.replace(/\[POINT:[^\]]*\]/gi, "").trim();

  return { text: text || "I'm not sure how to help with that.", point };
}

module.exports = { ask };
