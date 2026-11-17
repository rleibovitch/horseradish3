const MAX_BYTES = 650000;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const comma = text.indexOf(",");
      resolve(comma >= 0 ? text.slice(comma + 1) : text);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function loadImage(blob) {
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

function toJpeg(img, quality) {
  const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("Could not store that image."));
      else resolve(blob);
    }, "image/jpeg", quality);
  });
}

async function compactJpeg(blob) {
  const img = await loadImage(blob);
  let quality = 0.82;
  let current = await toJpeg(img, quality);
  while (current.size > MAX_BYTES && quality > 0.4) {
    quality -= 0.14;
    current = await toJpeg(img, quality);
  }
  if (current.size > MAX_BYTES) {
    throw new Error("That photo is too heavy to keep on the account.");
  }
  return current;
}

async function readJson(res) {
  try {
    return await res.json();
  } catch (err) {
    return {};
  }
}

export async function saveAccountPhoto(photo) {
  const jpeg = await compactJpeg(photo.blob);
  const data = await blobToBase64(jpeg);
  const res = await fetch("/api/lab-photos", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: photo.id,
      name: photo.name,
      setId: photo.setId,
      setName: photo.setName,
      targetId: photo.targetId,
      width: photo.width,
      height: photo.height,
      data
    })
  });
  if (res.status === 404) return false;
  if (!res.ok) {
    const body = await readJson(res);
    throw new Error(body.message || "The account did not keep that photo.");
  }
  return true;
}

export async function listAccountPhotos() {
  const res = await fetch("/api/lab-photos", { credentials: "same-origin", cache: "no-store" });
  if (res.status === 404 || res.status === 401 || res.status === 503) return [];
  if (!res.ok) return [];
  const body = await readJson(res);
  return Array.isArray(body.photos) ? body.photos : [];
}

export async function fetchAccountPhoto(id) {
  const res = await fetch("/api/lab-photos?id=" + encodeURIComponent(id), {
    credentials: "same-origin",
    cache: "no-store"
  });
  if (!res.ok) return null;
  return res.blob();
}

export async function forgetAccountSet(setId) {
  const res = await fetch("/api/lab-photos?set=" + encodeURIComponent(setId), {
    method: "DELETE",
    credentials: "same-origin"
  });
  return res.ok || res.status === 404;
}
