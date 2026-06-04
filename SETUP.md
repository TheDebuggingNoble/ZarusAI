# Setup: always-on "Hey Zarus" + your-voice-only

The hotkey works out of the box. To enable **always-on wake word** and
**respond only to your voice**, do these one-time steps (all free).

## 1. Get a Picovoice access key (free)

1. Sign up at **https://console.picovoice.ai/** (no card).
2. Copy your **AccessKey** from the dashboard.
3. Paste it into `.env`:
   ```
   PICOVOICE_ACCESS_KEY=your_key_here
   ```

## 2. Train the "Hey Zarus" wake word

1. In the Picovoice console, open **Porcupine** → **Create Wake Word**.
2. Type the phrase: **Hey Zarus**
3. Language: **English**.
4. Platform: **Windows**.
5. Train (takes ~1–2 minutes), then **download** the `.ppn` file.
6. Rename it to **`hey-zarus.ppn`** and put it in this project's **`models/`**
   folder:
   ```
   ZarusAI/models/hey-zarus.ppn
   ```

> Porcupine is phonetic, so it handles different pronunciations of "Zarus"
> reasonably well. If it mishears, raise/lower `WAKEWORD_SENSITIVITY` in `.env`
> (higher = more eager, more false triggers).

## 3. Start the app and enroll your voice

```bash
npm start
```

1. Right-click the tray icon → **Enroll my voice**.
2. Talk naturally (read anything aloud) until the buddy shows **100%**.
   This builds your private voiceprint, stored locally at
   `…/AppData/Roaming/zarus-ai/voiceprint.bin`. It never leaves your machine.
3. Right-click the tray → **Start listening for "Hey Zarus"** (it auto-starts
   on future launches once you're enrolled).

## 4. Use it

Just say **"Hey Zarus"** then your question. The app:

1. Hears the wake word (Porcupine, on-device).
2. Confirms it's **you** speaking (Eagle speaker verification).
3. Captures the screen, answers aloud, and points.

If someone else says "Hey Zarus", Eagle's score will be below
`SPEAKER_THRESHOLD` and it's ignored (you'll see a note in the console).

## Tuning

| `.env` setting | Effect |
|---|---|
| `WAKEWORD_SENSITIVITY` (0–1) | Higher = triggers more easily (more false alarms) |
| `SPEAKER_THRESHOLD` (0–1) | Higher = stricter about it being *your* voice |

If it never triggers for you, lower `SPEAKER_THRESHOLD` (e.g. 0.35) or re-enroll
in a quiet room. If it triggers for others, raise it (e.g. 0.6).

## Notes

- Everything (wake word + speaker check) runs **on-device** — no audio leaves
  your machine for these. Only your actual *question* (after the wake word) is
  sent to Groq (transcription) and Gemini (vision).
- The hotkey (`Ctrl+Alt+C`) always works as a fallback, even without any of this.
