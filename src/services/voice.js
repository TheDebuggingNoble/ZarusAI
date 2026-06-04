const fs = require("node:fs");
const { Porcupine } = require("@picovoice/porcupine-node");
const { Eagle, EagleProfiler } = require("@picovoice/eagle-node");

/**
 * Always-on voice gate: Porcupine listens for the custom wake word ("Hey
 * Zarus"); Eagle verifies the speaker is the enrolled owner. Audio arrives as
 * 16kHz mono Int16 frames from the renderer. Everything runs on-device.
 */
class VoiceGate {
  constructor() {
    this.enabled = false;
    this.porcupine = null;
    this.eagle = null;
    this.profile = null;
    this.threshold = 0.5;
    this.lastScore = 0;
    this.lastVoiceAt = 0;
    this.onWake = null; // ({ speakerOk, score }) => void
    this._pBuf = new Int16Array(0);
    this._eBuf = new Int16Array(0);
    // enrollment
    this.profiler = null;
    this._enBuf = new Int16Array(0);
    this._enPct = 0;
  }

  /** Build the wake-word engine (+ speaker engine if a profile exists). */
  init({ accessKey, ppnPath, sensitivity = 0.6, profilePath, threshold = 0.5 }) {
    this.accessKey = accessKey;
    this.threshold = threshold;
    this.porcupine = new Porcupine(accessKey, [ppnPath], [sensitivity]);
    this.frameLength = this.porcupine.frameLength;

    this.loadProfile(profilePath);
    this.enabled = true;
  }

  loadProfile(profilePath) {
    this.profilePath = profilePath;
    if (profilePath && fs.existsSync(profilePath)) {
      this.profile = new Uint8Array(fs.readFileSync(profilePath));
      if (!this.eagle) this.eagle = new Eagle(this.accessKey);
      this.eagleMin = this.eagle.minProcessSamples;
      return true;
    }
    return false;
  }

  hasProfile() {
    return !!this.profile;
  }

  /** Feed a chunk of 16kHz mono Int16 audio. Fires onWake when triggered. */
  feed(int16) {
    if (!this.enabled || !this.porcupine) return;

    this._pBuf = concat(this._pBuf, int16);
    while (this._pBuf.length >= this.frameLength) {
      const frame = this._pBuf.slice(0, this.frameLength);
      this._pBuf = this._pBuf.slice(this.frameLength);
      let idx = -1;
      try {
        idx = this.porcupine.process(frame);
      } catch {
        /* ignore a bad frame */
      }
      if (idx >= 0) this._fire();
    }

    if (this.eagle && this.profile) {
      this._eBuf = concat(this._eBuf, int16);
      while (this._eBuf.length >= this.eagleMin) {
        const frame = this._eBuf.slice(0, this.eagleMin);
        this._eBuf = this._eBuf.slice(this.eagleMin);
        try {
          const scores = this.eagle.process(frame, [this.profile]);
          if (scores && scores.length) {
            this.lastScore = scores[0];
            this.lastVoiceAt = Date.now();
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  _fire() {
    // If no voiceprint is enrolled yet, allow the wake word alone.
    const fresh = Date.now() - this.lastVoiceAt < 1500;
    const speakerOk = !this.eagle || !this.profile
      ? true
      : fresh && this.lastScore >= this.threshold;
    if (this.onWake) this.onWake({ speakerOk, score: this.lastScore });
  }

  /* ── Enrollment ─────────────────────────────────────────────────────── */

  startEnroll() {
    if (!this.accessKey) throw new Error("voice gate not initialised");
    this.profiler = new EagleProfiler(this.accessKey);
    this._enBuf = new Int16Array(0);
    this._enPct = 0;
    // enroll() requires EXACTLY frameLength samples per call.
    this._enMin = this.profiler.frameLength;
  }

  /** Feed enrollment audio; returns completion percentage so far. */
  feedEnroll(int16) {
    if (!this.profiler) return 0;
    this._enBuf = concat(this._enBuf, int16);
    while (this._enBuf.length >= this._enMin) {
      const frame = this._enBuf.slice(0, this._enMin);
      this._enBuf = this._enBuf.slice(this._enMin);
      try {
        this._enPct = this.profiler.enroll(frame);
      } catch {
        /* keep going */
      }
    }
    return this._enPct;
  }

  /** Export + save the voiceprint, then activate speaker verification. */
  finishEnroll() {
    if (!this.profiler) return false;
    try {
      const prof = this.profiler.export();
      fs.writeFileSync(this.profilePath, Buffer.from(prof));
      this.profiler.release();
      this.profiler = null;
      this.profile = new Uint8Array(prof);
      if (!this.eagle) this.eagle = new Eagle(this.accessKey);
      this.eagleMin = this.eagle.minProcessSamples;
      return true;
    } catch {
      return false;
    }
  }

  release() {
    try { this.porcupine && this.porcupine.release(); } catch {}
    try { this.eagle && this.eagle.release(); } catch {}
    try { this.profiler && this.profiler.release(); } catch {}
  }
}

function concat(a, b) {
  const c = new Int16Array(a.length + b.length);
  c.set(a, 0);
  c.set(b, a.length);
  return c;
}

module.exports = { VoiceGate };
