const MAX_EDGE = 1024;

export function featureCount(entry) {
  const frames = entry?.matchingData;
  if (!Array.isArray(frames) || frames.length === 0) return null;
  const frame = frames[0];
  const count = (frame.maximaPoints?.length || 0) + (frame.minimaPoints?.length || 0);
  return count > 0 ? count : null;
}

export function quality(count) {
  if (count == null) return null;
  if (count < 80) {
    return {
      label: "Sparse",
      tone: "bad",
      hint: "The camera may lose this sign. Use a sharper picture with more contrast and less empty space.",
    };
  }
  if (count < 180) {
    return {
      label: "Fair",
      tone: "ok",
      hint: "Trackable. More unique detail will lock on faster.",
    };
  }
  return {
    label: "Strong",
    tone: "good",
    hint: "Plenty of detail for the camera to lock onto.",
  };
}

export function blobToImage(blob) {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

function drawCover(img, maxEdge, opaque) {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (opaque) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("Could not store that image."));
      else resolve(blob);
    }, "image/png");
  });
}

async function fileToCanvasBlob(file, { maxEdge, opaque }) {
  const img = await blobToImage(file);
  const canvas = drawCover(img, maxEdge, opaque);
  const blob = await canvasToBlob(canvas);
  return { blob, width: canvas.width, height: canvas.height };
}

export function fileToSign(file) {
  return fileToCanvasBlob(file, { maxEdge: MAX_EDGE, opaque: true });
}

export function fileToPicture(file) {
  return fileToCanvasBlob(file, { maxEdge: 1280, opaque: false });
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function glyph(ctx, kind, x, y, s, ink, paper) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(2, s * 0.08);
  const h = s / 2;
  if (kind === 0) {
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.72, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 1) {
    ctx.fillRect(-h * 0.7, -h * 0.7, s * 0.7, s * 0.7);
  } else if (kind === 2) {
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.8);
    ctx.lineTo(h * 0.8, h * 0.7);
    ctx.lineTo(-h * 0.75, h * 0.55);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 3) {
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.lineTo(h * 0.7, 0);
    ctx.lineTo(0, h * 0.85);
    ctx.lineTo(-h * 0.8, 0);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 4) {
    ctx.fillRect(-h * 0.16, -h * 0.8, s * 0.16, s * 0.8);
    ctx.fillRect(-h * 0.8, -h * 0.16, s * 0.8, s * 0.16);
  } else if (kind === 5) {
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.75, 0.2, 1.7 * Math.PI);
    ctx.stroke();
  } else if (kind === 6) {
    ctx.beginPath();
    ctx.arc(-h * 0.35, -h * 0.2, h * 0.22, 0, Math.PI * 2);
    ctx.arc(h * 0.32, h * 0.18, h * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-h * 0.1, -h * 0.55, s * 0.1, s * 0.55);
  } else {
    ctx.strokeRect(-h * 0.62, -h * 0.62, s * 0.62, s * 0.62);
    ctx.fillStyle = paper;
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export async function makeDemoSign() {
  const width = 900;
  const height = 1200;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const paper = "#f4efe6";
  const ink = "#1a120c";
  const accent = "#ff5a1f";
  const random = rng(0x51a7);

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, width, height);

  const cols = 12;
  const rows = 16;
  const cell = 68;
  const ox = (width - cols * cell) / 2 + cell / 2;
  const oy = 168;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const flip = (row + col) % 2 === 0;
      glyph(
        ctx,
        (row * 5 + col * 3) % 8,
        ox + col * cell,
        oy + row * cell,
        cell * 0.78,
        flip ? ink : accent,
        paper,
      );
    }
  }

  ctx.fillStyle = paper;
  ctx.fillRect(48, 36, width - 96, 118);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.strokeRect(48, 36, width - 96, 118);

  ctx.fillStyle = ink;
  ctx.font = "600 18px Georgia, serif";
  ctx.textAlign = "left";
  ctx.fillText("KNOWN SIGN  ·  01", 72, 78);
  ctx.font = "650 54px Georgia, serif";
  ctx.fillText("Experience", 72, 128);

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(790, 96, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.font = "700 22px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("AR", 790, 104);

  for (let i = 0; i < 46; i += 1) {
    const t = i / 45;
    const len = 10 + Math.floor(random() * 22);
    ctx.fillStyle = i % 3 === 0 ? accent : ink;
    ctx.fillRect(36 + t * (width - 72), 28, 3, len);
    ctx.fillRect(36 + t * (width - 72), height - 28 - len, 3, len);
  }

  ctx.fillStyle = paper;
  ctx.fillRect(70, height - 150, width - 140, 78);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.strokeRect(70, height - 150, width - 140, 78);
  ctx.fillStyle = ink;
  ctx.textAlign = "left";
  ctx.font = "600 22px Georgia, serif";
  ctx.fillText("Show this to the camera.", 92, height - 104);
  ctx.font = "400 16px Georgia, serif";
  ctx.fillText("The printed marks are the tracking sign.", 92, height - 78);

  const blob = await canvasToBlob(canvas);
  return { blob, width, height };
}
