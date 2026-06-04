# ZarusAI — a screen-aware AI by your cursor

A Windows desktop companion in the spirit of [HeyClicky](https://www.heyclicky.com/).
Say **"Hey Zarus"** (or press a hotkey) and talk; it sees your screen, answers
out loud, and **flies a pointer to the exact button** you need. An always-on
wake word and **your-voice-only** speaker verification mean it wakes for you and
ignores everyone else. Runs entirely on free services.

```
"Hey Zarus" (wake word, on-device) ─► is it YOUR voice? (on-device)
        │ hotkey also works                 │ yes
        ▼                                    ▼
   record mic ─► Groq Whisper (speech→text)
                                  │
        screenshot ──────────────┤
                                  ▼
                     Gemini Flash (vision) ─► answer + [POINT:x,y]
                                  │
                 ┌────────────────┴───────────────┐
                 ▼                                 ▼
        Edge TTS (speak it)            overlay pointer flies to the spot
```

## Setup

```bash
npm install
```

Edit **`.env`** with your free keys:

- `GEMINI_API_KEY` — https://aistudio.google.com/apikey (vision)
- `GROQ_API_KEY` — https://console.groq.com/keys (Whisper speech-to-text)
- `PICOVOICE_ACCESS_KEY` — https://console.picovoice.ai/ (wake word + speaker ID)
- Edge TTS needs no key.

> ⚠️ The keys currently in `.env` were exposed in chat earlier — **rotate them.**

The hotkey works immediately. To enable the **"Hey Zarus"** wake word and
your-voice-only recognition, follow **[`SETUP.md`](./SETUP.md)** (free Picovoice
account → train the wake word → enroll your voice once).

## Run

```bash
npm start
```

A little buddy appears in the bottom-right of your screen and a dot in the
system tray. Then either:

- **Say "Hey Zarus"** then your question (once the wake word is set up + you're
  enrolled), or
- Press **`Ctrl+Alt+C`** (configurable via `HOTKEY` in `.env`).

The buddy pulses — **ask your question out loud** ("how do I export this?").
Stop talking; it auto-detects the silence, thinks, then **speaks the answer and
points** at the relevant button.

Quit from the tray icon.

## How it works

- **Wake word** — Picovoice **Porcupine** listens on-device for a custom
  "Hey Zarus" model. Phonetic, so it tolerates pronunciation variants.
- **Your voice only** — Picovoice **Eagle** compares the speaker to your enrolled
  voiceprint and ignores the wake word if it isn't you. Both run fully on-device;
  no always-on audio leaves your machine.
- **Screen capture** — Electron grabs the primary display, capped at 1280px.
- **Speech-to-text** — the question is recorded and transcribed by Groq Whisper.
- **The brain** — Gemini 2.5 Flash (vision) gets the screenshot + your words and
  replies with a short spoken answer plus a `[POINT:x,y:label]` tag. Coordinates
  are **normalized 0–1000** (Gemini's native pointing format) for accuracy, then
  mapped to screen pixels.
- **Voice** — the answer is spoken via free Microsoft Edge neural TTS.
- **The pointer** — a transparent, click-through, always-on-top overlay flies an
  animated pointer to the target along a bezier curve. It never touches your real
  mouse — purely visual guidance.

## Verified

`npm run test:services` exercises Edge TTS + Gemini vision. In testing, asking
"how do I save my settings?" about a screenshot with a *Save changes* button
returned the right spoken answer and pointed within ~20px of the button center.

## Honest limits / next steps

- **Wake word + speaker ID** need a one-time setup (free Picovoice key + a
  trained "Hey Zarus" model + a quick voice enrollment) — see `SETUP.md`. The
  hotkey always works without any of that.
- **Pointing** is very good on clear buttons but can drift on dense/ambiguous UIs.
  A stronger vision step could sharpen it further.
- **No real clicking** — this is the point-and-talk build. Agent mode (actually
  moving/clicking the mouse via `nut.js`) is the natural Phase 2.
- **Single monitor** for now; multi-monitor capture is a small extension.
- Powered by: Electron · Picovoice Porcupine + Eagle · Gemini · Groq Whisper ·
  Microsoft Edge TTS.
