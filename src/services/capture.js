const { desktopCapturer, screen } = require("electron");

/**
 * Grab a screenshot of the primary display, capped at 1280px on the long edge
 * (enough for the vision model to read UI text, small enough to stay fast).
 * Returns the image + the coordinate spaces we need to map the model's pixel
 * coordinates back onto the screen.
 */
async function capturePrimary() {
  const primary = screen.getPrimaryDisplay();
  const logical = primary.size; // CSS/logical px (what the overlay uses)
  const scale = primary.scaleFactor || 1;
  const physW = Math.round(logical.width * scale);
  const physH = Math.round(logical.height * scale);

  const MAX = 1280;
  const ratio = Math.min(1, MAX / Math.max(physW, physH));
  const shotW = Math.max(1, Math.round(physW * ratio));
  const shotH = Math.max(1, Math.round(physH * ratio));

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: shotW, height: shotH },
  });
  const src =
    sources.find((s) => String(s.display_id) === String(primary.id)) ||
    sources[0];
  if (!src) throw new Error("no screen source available");

  const jpeg = src.thumbnail.toJPEG(80);

  return {
    base64: jpeg.toString("base64"),
    mimeType: "image/jpeg",
    shotW,
    shotH, // model returns coordinates in this space
    bounds: primary.bounds, // logical px on the virtual desktop
  };
}

/** Map a model point (in screenshot px) to overlay-local logical px. */
function toOverlayPoint(point, cap) {
  const x = (point.x / cap.shotW) * cap.bounds.width;
  const y = (point.y / cap.shotH) * cap.bounds.height;
  return {
    x: Math.max(0, Math.min(cap.bounds.width, Math.round(x))),
    y: Math.max(0, Math.min(cap.bounds.height, Math.round(y))),
    label: point.label || "",
  };
}

module.exports = { capturePrimary, toOverlayPoint };
