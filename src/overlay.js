/* Overlay renderer: handles push-to-talk recording, plays the spoken reply,
   shows the caption, and flies the pointer to the target. */

const buddy = document.getElementById("buddy");
const caption = document.getElementById("caption");
const captionYou = caption.querySelector(".you");
const captionMsg = caption.querySelector(".msg");
const pointer = document.getElementById("pointer");
const pointerTag = pointer.querySelector(".tag");

let recording = false;
let mediaRecorder = null;
let chunks = [];
let stream = null;
let captionTimer = null;

/* ── Push-to-talk ─────────────────────────────────────────────────────── */

window.zarus.onToggleListen(() => {
  if (recording) stopRecording();
  else startRecording();
});

window.zarus.onState((s) => {
  buddy.classList.toggle("thinking", s === "thinking");
});

async function startRecording() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    showCaption("", "I couldn't access the microphone.");
    return;
  }
  recording = true;
  chunks = [];
  buddy.classList.add("listening");
  hidePointer();

  mediaRecorder = new MediaRecorder(stream, { mimeType: pickMime() });
  mediaRecorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
  mediaRecorder.onstop = onRecordingStopped;
  mediaRecorder.start();

  // Auto-stop when the user goes quiet (after they've spoken).
  watchSilence(stream);
  // Hard cap so it never records forever.
  setTimeout(() => recording && stopRecording(), 12000);
}

function stopRecording() {
  if (!recording) return;
  recording = false;
  buddy.classList.remove("listening");
  try {
    mediaRecorder && mediaRecorder.state !== "inactive" && mediaRecorder.stop();
  } catch {}
}

async function onRecordingStopped() {
  stream && stream.getTracks().forEach((t) => t.stop());
  const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
  if (blob.size < 800) {
    // Basically silence — nudge the buddy and bail.
    pulse();
    return;
  }
  const buf = await blob.arrayBuffer();
  const b64 = bufToBase64(buf);
  window.zarus.sendAudio(b64, mediaRecorder.mimeType);
}

/** Stop ~1.2s after the speaker drops below a volume threshold. */
function watchSilence(stream) {
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  src.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  let spoke = false;
  let quietSince = 0;

  const tick = () => {
    if (!recording) {
      ctx.close();
      return;
    }
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    const now = performance.now();
    if (rms > 0.035) {
      spoke = true;
      quietSince = 0;
    } else if (spoke) {
      if (!quietSince) quietSince = now;
      else if (now - quietSince > 1200) {
        stopRecording();
        ctx.close();
        return;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ── Response ─────────────────────────────────────────────────────────── */

window.zarus.onRespond((data) => {
  buddy.classList.remove("thinking");
  showCaption(data.transcript, data.text);
  if (data.audio) playAudio(data.audio);
  if (data.point) flyPointer(data.point);
  else hidePointer();
});

function playAudio(b64) {
  const audio = new Audio("data:audio/mp3;base64," + b64);
  audio.play().catch(() => {});
}

function showCaption(youText, msg) {
  captionYou.textContent = youText ? `“${youText}”` : "";
  captionMsg.textContent = msg || "";
  caption.classList.add("show");
  clearTimeout(captionTimer);
  // Keep it up long enough to read; longer for longer answers.
  const ms = Math.min(12000, 3500 + (msg || "").length * 45);
  captionTimer = setTimeout(() => caption.classList.remove("show"), ms);
}

/* ── Pointer flight ───────────────────────────────────────────────────── */

function flyPointer(point) {
  pointerTag.textContent = point.label || "";
  pointerTag.style.display = point.label ? "block" : "none";

  // Start from the buddy, arc to the target along a quadratic bezier.
  const start = { x: window.innerWidth - 54, y: window.innerHeight - 54 };
  const end = { x: point.x, y: point.y };
  const ctrl = {
    x: (start.x + end.x) / 2,
    y: Math.min(start.y, end.y) - 140,
  };

  pointer.style.opacity = "1";
  const dur = 850;
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
    const x =
      (1 - e) * (1 - e) * start.x + 2 * (1 - e) * e * ctrl.x + e * e * end.x;
    const y =
      (1 - e) * (1 - e) * start.y + 2 * (1 - e) * e * ctrl.y + e * e * end.y;
    pointer.style.transform = `translate(${x}px, ${y}px)`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);

  // Linger, then fade.
  clearTimeout(flyPointer._t);
  flyPointer._t = setTimeout(hidePointer, 6000);
}

function hidePointer() {
  pointer.style.opacity = "0";
}

/* ── helpers ──────────────────────────────────────────────────────────── */

function pickMime() {
  const opts = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
  for (const o of opts) if (MediaRecorder.isTypeSupported(o)) return o;
  return "";
}
function bufToBase64(buf) {
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function pulse() {
  buddy.style.transform = "scale(1.18)";
  setTimeout(() => (buddy.style.transform = ""), 180);
}

/* ── Always-on wake-word + enrollment PCM streaming (16kHz Int16) ──────── */

const statusEl = document.getElementById("status");
let pcmCtx = null;
let pcmStream = null;
let pcmNode = null;
let pcmMode = null; // "wake" | "enroll"

window.zarus.onListenControl((on) => {
  if (on) startPcm("wake");
  else if (pcmMode === "wake") stopPcm();
  setStatus(on ? "Listening — say “Hey Zarus”" : "");
});

window.zarus.onEnrollControl((on) => {
  if (on) startPcm("enroll");
  else if (pcmMode === "enroll") stopPcm();
  if (!on) setStatus("");
});

window.zarus.onEnrollProgress((pct) => setStatus(`Learning your voice… ${pct}%`));
window.zarus.onNotice((msg) => showCaption("", msg));

async function startPcm(mode) {
  if (pcmCtx) stopPcm();
  try {
    pcmStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    pcmCtx = new AudioContext({ sampleRate: 16000 });
    const src = pcmCtx.createMediaStreamSource(pcmStream);
    pcmNode = pcmCtx.createScriptProcessor(4096, 1, 1);
    pcmMode = mode;
    pcmNode.onaudioprocess = (e) => {
      const f32 = e.inputBuffer.getChannelData(0);
      const i16 = new Int16Array(f32.length);
      for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]));
        i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      if (mode === "enroll") window.zarus.sendEnrollPcm(i16);
      else window.zarus.sendPcm(i16);
    };
    src.connect(pcmNode);
    pcmNode.connect(pcmCtx.destination); // required for the node to fire
  } catch {
    setStatus("mic unavailable");
  }
}

function stopPcm() {
  try { if (pcmNode) pcmNode.onaudioprocess = null; } catch {}
  try { pcmNode && pcmNode.disconnect(); } catch {}
  try { pcmStream && pcmStream.getTracks().forEach((t) => t.stop()); } catch {}
  try { pcmCtx && pcmCtx.close(); } catch {}
  pcmCtx = pcmStream = pcmNode = pcmMode = null;
}

function setStatus(text) {
  statusEl.textContent = text || "";
  statusEl.classList.toggle("show", !!text);
}
