import { fetchAccountPhoto, forgetAccountSet, listAccountPhotos, saveAccountPhoto } from "./account.js";
import { deleteSet, listSets, saveSet } from "./db.js";
import { blobToImage, featureCount, fileToPicture, fileToSign, makeDemoSign, quality } from "./images.js";
import { shapeGlb } from "./glb.js";
import { destroyScene, mountAR, mountPreview } from "./stage.js?v=model-on-photo-20261117";

const SAMPLE = {
  name: "Sample card",
  mindUrl: "https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.5/examples/image-tracking/assets/card-example/card.mind",
  signUrl: "https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.5/examples/image-tracking/assets/card-example/card.png",
  aspect: 0.552,
};

const DEMO_ID = "first-light";
const MARVINS_ID = "marvins";
const MARVINS = {
  name: "Marvins",
  signUrl: "/demos/marvins/target-day.jpg",
  mindUrl: "/demos/marvins/target.mind",
  modelUrl: "/demos/marvins/marvins-mechanical-museum-sign.glb",
};
const UNTITLED = "Untitled experience";

const PRESETS = [
  { id: "beacon", name: "Beacon" },
  { id: "monolith", name: "Monolith" },
  { id: "orb", name: "Orb" },
  { id: "portal", name: "Portal" },
  { id: "lantern", name: "Lantern" },
];

const AFRAME_SRC = "https://aframe.io/releases/1.6.0/aframe.min.js";
const MINDAR_SRC = "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js";

const LINE = [
  { id: "glb", label: "GLB" },
  { id: "target", label: "Target image" },
  { id: "place", label: "Place" },
  { id: "publish", label: "Publish" },
];

const state = {
  view: "library",
  returnView: "library",
  station: "glb",
  sets: [],
  draft: null,
  selectedId: null,
  displaySample: false,
  displayMarvins: false,
  displayReturn: "",
  error: "",
  found: new Set(),
  ready: false,
};

const bound = new Map();
let stageUrls = [];
let saveTimer = 0;
let previewTimer = 0;
let owner = "";
let query = "";
let runtimePromise = null;

const view = document.getElementById("ai-view");
const stage = document.getElementById("ai-stage");
const hud = document.getElementById("ai-hud");
const hudStatus = document.getElementById("ai-hud-status");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function hex(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(value || "") ? value : fallback;
}

function clampScale(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(1.6, Math.max(0.35, number));
}

function clampShift(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(0.4, Math.max(-0.4, Math.round(number * 100) / 100));
}

function message(error) {
  if (!error) return "Something went wrong.";
  if (error.name === "NotAllowedError") {
    return "Camera permission was blocked. Allow the camera for this site, then try again.";
  }
  if (error.name === "NotFoundError") return "No camera was found on this device.";
  if (error.name === "NotReadableError" || /timeout starting video/i.test(error.message || "")) {
    return "The camera did not respond. Close other apps that are using it, then try again.";
  }
  if (error.name === "QuotaExceededError") {
    return "This browser is out of space for experiences. Delete a saved one and try again.";
  }
  return error.message || "Something went wrong.";
}

function ago(timestamp) {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function defaultReplacement() {
  return {
    type: "object",
    preset: "beacon",
    tint: "#ff5a1f",
    plinth: "#1a1612",
    hideSign: true,
    scale: 1,
    shiftX: 0,
    shiftY: 0,
    imageBlob: null,
    modelBlob: null,
    modelName: "",
  };
}

function prettyName(filename) {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base || "Target image";
}

function urlFor(blob) {
  if (!blob) return "";
  if (bound.has(blob)) return bound.get(blob);
  const url = URL.createObjectURL(blob);
  bound.set(blob, url);
  return url;
}

function releaseUrls() {
  for (const url of bound.values()) URL.revokeObjectURL(url);
  bound.clear();
}

function releaseStageUrls() {
  stageUrls.forEach((url) => URL.revokeObjectURL(url));
  stageUrls = [];
}

function freshUrl(blob) {
  if (!blob) return "";
  const url = URL.createObjectURL(blob);
  stageUrls.push(url);
  return url;
}

function selectedTarget() {
  if (!state.draft) return null;
  return state.draft.targets.find((target) => target.id === state.selectedId) || state.draft.targets[0] || null;
}

function aspectOf(target) {
  const aspect = target.height / target.width;
  return Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
}

function specFrom(target, link) {
  const replacement = target.replacement;
  return {
    name: target.name,
    aspect: aspectOf(target),
    signUrl: target.signUrl || link(target.imageBlob),
    replacement: {
      type: replacement.type,
      preset: replacement.preset,
      tint: hex(replacement.tint, "#ff5a1f"),
      plinth: hex(replacement.plinth, "#1a1612"),
      hideSign: replacement.hideSign !== false,
      scale: clampScale(replacement.scale),
      shiftX: clampShift(replacement.shiftX),
      shiftY: clampShift(replacement.shiftY),
      imageUrl: replacement.imageBlob ? link(replacement.imageBlob) : "",
      modelUrl: replacement.modelUrl || (replacement.modelBlob ? link(replacement.modelBlob) : ""),
    },
  };
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.ready === "yes") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load the AR runtime.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => {
      script.dataset.ready = "yes";
      resolve();
    };
    script.onerror = () => reject(new Error("Could not load the AR runtime."));
    document.head.appendChild(script);
  });
}

function ensureAR() {
  if (window.AFRAME?.components?.["mindar-image"]) return Promise.resolve();
  if (!runtimePromise) {
    runtimePromise = loadScript(AFRAME_SRC)
      .then(() => loadScript(MINDAR_SRC))
      .then(() => {
        if (!window.AFRAME?.components?.["mindar-image"]) {
          throw new Error("MindAR or A-Frame did not load. Check the network connection and refresh.");
        }
      })
      .catch((error) => {
        runtimePromise = null;
        throw error;
      });
  }
  return runtimePromise;
}

function showBusy(text, progress) {
  document.getElementById("ai-busy-text").textContent = text;
  const wrap = document.getElementById("ai-busy-bar-wrap");
  const bar = document.getElementById("ai-busy-bar");
  if (progress == null) {
    wrap.hidden = true;
  } else {
    wrap.hidden = false;
    bar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }
  document.getElementById("ai-busy").hidden = false;
}

function hideBusy() {
  document.getElementById("ai-busy").hidden = true;
}

async function publishLocalPhotos() {
  for (const set of state.sets) {
    if (set.demo) continue;
    let changed = false;
    for (const target of set.targets || []) {
      if (!target.imageBlob || target.accountPhoto) continue;
      const kept = await saveAccountPhoto({
        id: target.id,
        name: target.name,
        setId: set.id,
        setName: set.name,
        targetId: target.id,
        width: target.width,
        height: target.height,
        blob: target.imageBlob,
      });
      if (kept) {
        target.accountPhoto = true;
        changed = true;
      }
    }
    if (changed) await saveSet(set, owner);
  }
}

async function absorbAccountPhotos() {
  const photos = await listAccountPhotos();
  if (!photos.length) return;
  const grouped = new Map();
  photos.forEach((photo) => {
    if (!photo.setId || !photo.targetId) return;
    if (!grouped.has(photo.setId)) grouped.set(photo.setId, []);
    grouped.get(photo.setId).push(photo);
  });
  for (const [setId, items] of grouped) {
    let set = state.sets.find((item) => item.id === setId);
    if (!set) {
      set = {
        id: setId,
        name: items[0].setName || UNTITLED,
        updated: items[0].updated || Date.now(),
        mindDirty: true,
        mindBlob: null,
        targets: [],
        owner,
      };
      state.sets.push(set);
    }
    let changed = false;
    for (const photo of items) {
      let target = set.targets.find((item) => item.id === photo.targetId);
      if (target?.imageBlob) {
        if (!target.accountPhoto) {
          target.accountPhoto = true;
          changed = true;
        }
        continue;
      }
      const blob = await fetchAccountPhoto(photo.id);
      if (!blob) continue;
      if (!target) {
        set.targets.push({
          id: photo.targetId,
          name: photo.name || "Photo",
          width: photo.width,
          height: photo.height,
          featureCount: null,
          imageBlob: blob,
          accountPhoto: true,
          replacement: defaultReplacement(),
        });
      } else {
        target.imageBlob = blob;
        target.accountPhoto = true;
        target.width = target.width || photo.width;
        target.height = target.height || photo.height;
      }
      changed = true;
    }
    if (changed) {
      set.updated = Date.now();
      await saveSet(set, owner);
    }
  }
  state.sets.sort((a, b) => b.updated - a.updated);
}

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!state.draft || (!state.draft.targets.length && !state.draft.glb?.blob)) return;
    saveSet(state.draft, owner).then(upsert).catch((error) => {
      state.error = message(error);
      render();
    });
  }, 200);
}

function upsert(set) {
  const index = state.sets.findIndex((item) => item.id === set.id);
  if (index === -1) state.sets.unshift(set);
  else state.sets[index] = set;
  state.sets.sort((a, b) => b.updated - a.updated);
}

function visibleSets() {
  if (!query) return state.sets;
  return state.sets.filter((set) => String(set.name || "").toLowerCase().includes(query));
}

function isActive(set) {
  const tracked = Boolean(set.mindBlob || set.mindUrl);
  return tracked && !set.mindDirty && set.targets.length > 0;
}

function demoSet() {
  return state.sets.find((set) => set.demo === DEMO_ID) || null;
}

function marvinsSet() {
  return state.sets.find((set) => set.demo === MARVINS_ID) || null;
}

function statusOf(set) {
  if (!set.targets.length) return "offline";
  return isActive(set) ? "active" : "idle";
}

function statusLabel(set) {
  const status = statusOf(set);
  if (status === "active") return "Active";
  if (status === "idle") return "Idle";
  return "Offline";
}

function hasGlb(set) {
  if (set?.glb?.blob) return true;
  return (set?.targets || []).some((target) => target.replacement?.type === "model" && target.replacement.modelBlob);
}

function hasTarget(set) {
  return (set?.targets || []).some((target) => target.imageBlob);
}

function stationReached(set, id) {
  if (id === "glb") return true;
  if (id === "target") return hasGlb(set);
  return hasGlb(set) && hasTarget(set);
}

function stationFor(set) {
  if (!hasGlb(set)) return "glb";
  if (!hasTarget(set)) return "target";
  if (set.mindBlob && !set.mindDirty) return "publish";
  return "place";
}

function rememberGlb(blob, name) {
  if (!state.draft) return;
  state.draft.glb = { blob, name };
  state.draft.targets.forEach((target) => {
    target.replacement.type = "model";
    target.replacement.modelBlob = blob;
    target.replacement.modelName = name;
    target.replacement.hideSign = false;
  });
}

function revealOf(set) {
  if (set.glb?.name) return set.glb.name;
  const target = set.targets[0];
  if (!target || !target.replacement) return "No GLB yet";
  if (target.replacement.type === "model") return target.replacement.modelName || "GLB";
  if (target.replacement.type === "image") return "Picture";
  const preset = PRESETS.find((item) => item.id === target.replacement.preset);
  return preset ? preset.name : "No GLB yet";
}

function shortId(id) {
  return String(id || "").replace(/-/g, "").slice(0, 12).toUpperCase();
}

function pushEvent(set, action) {
  if (!Array.isArray(set.events)) set.events = [];
  set.events.unshift({ at: Date.now(), action });
  set.events = set.events.slice(0, 30);
}

function allEvents() {
  const rows = [];
  state.sets.forEach((set) => {
    const events = Array.isArray(set.events) ? set.events : [];
    if (!events.length) {
      rows.push({ at: set.updated || Date.now(), action: "saved", name: set.name || "Experience" });
      return;
    }
    events.forEach((event) => {
      rows.push({ at: event.at, action: event.action, name: set.name || "Experience" });
    });
  });
  rows.sort((a, b) => b.at - a.at);
  return rows;
}

function eventCopy(event) {
  const name = event.name || "Experience";
  if (event.action === "seen") return `${name} unlocked`;
  if (event.action === "compiled") return `${name} compiled`;
  if (event.action === "created") return `${name} created`;
  return `${name} saved`;
}

function eventTone(action) {
  if (action === "seen" || action === "compiled") return "active";
  if (action === "created" || action === "saved") return "idle";
  return "offline";
}

function activityList(limit) {
  const events = allEvents();
  const shown = typeof limit === "number" ? events.slice(0, limit) : events;
  if (!shown.length) {
    return `<li class="ai-log-empty">No activity yet. Create an experience and it will show here.</li>`;
  }
  return shown.map((event) => `
    <li>
      <span class="os-dot is-${eventTone(event.action)}"></span>
      <div>
        ${esc(eventCopy(event))}
        <time>${esc(ago(event.at))}</time>
      </div>
    </li>`).join("");
}

function markNav(name) {
  document.querySelectorAll("[data-os-view]").forEach((btn) => {
    btn.classList.toggle("is-on", btn.getAttribute("data-os-view") === name);
  });
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch (error) {
      /* Fall through to the selection copy. */
    }
  }
  const box = document.createElement("textarea");
  box.value = value;
  box.setAttribute("readonly", "");
  box.style.position = "fixed";
  box.style.left = "-9999px";
  document.body.appendChild(box);
  box.select();
  const ok = document.execCommand("copy");
  box.remove();
  if (!ok) throw new Error("Could not copy the embed code.");
}

function modelCode(set) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = `model=${set.id}`;
  return `<div data-afterimage="${set.id}" data-name="${String(set.name || "Experience").replace(/"/g, "")}"></div>\n${url.href}`;
}

function recordImpression(name) {
  if (!state.draft) return;
  state.draft.impressions = Number(state.draft.impressions || 0) + 1;
  pushEvent(state.draft, "seen");
  saveSet(state.draft, owner).then(upsert).catch(() => {});
}

function render() {
  if (!view) return;
  if (state.view !== "editor") {
    const preview = document.getElementById("ai-preview");
    if (preview) destroyScene(preview);
  }
  if (state.view === "library" || state.view === "logs") releaseUrls();
  if (state.view === "editor") renderEditor();
  else if (state.view === "display") renderDisplay();
  else if (state.view === "logs") renderLogs();
  else renderLibrary();
}

function wonderBanner() {
  const demo = demoSet();
  const marvins = marvinsSet();
  return `
    <section class="os-wonder">
      <div>
        <p class="os-kicker">Marvins</p>
        <h2>${marvins ? "Marvins is on the shelf." : "Marvins"}</h2>
        <p>Show the sign, then open the camera. The museum model appears on that photo. The same files load on your phone and this computer.</p>
      </div>
      <div class="os-wonder-actions">
        ${marvins
          ? `<button type="button" class="os-create is-wonder" data-action="open-marvins">Open camera</button>`
          : `<button type="button" class="os-create is-wonder" data-action="place-marvins">Place Marvins</button>`}
        <button type="button" class="os-ghost" data-action="show-marvins">Show the sign</button>
      </div>
    </section>
    <section class="os-wonder">
      <div>
        <p class="os-kicker">This week</p>
        <h2>${demo ? "First Light is on the shelf." : "First Light"}</h2>
        <p>${demo
          ? "Show the card on one screen. Open the camera on another. A lantern appears where the card is."
          : "The demo to ship. A printed card, a camera, and a lantern that opens in the air."}</p>
      </div>
      <div class="os-wonder-actions">
        ${demo
          ? `<button type="button" class="os-create is-wonder" data-action="open-demo">Open the demo</button>
             <button type="button" class="os-ghost" data-action="show-demo-sign">Show the card</button>`
          : `<button type="button" class="os-create is-wonder" data-action="place-demo">Place the demo</button>
             <button type="button" class="os-ghost" data-action="show-sample">Show the card</button>`}
      </div>
    </section>`;
}

function renderLibrary() {
  const shown = visibleSets();
  const fresh = state.sets.length === 0;
  const active = state.sets.filter(isActive).length;
  const unlocks = state.sets.reduce((sum, set) => sum + Number(set.impressions || 0), 0);
  const rows = shown.map((set) => {
    const status = statusOf(set);
    return `
      <tr class="${set.demo === DEMO_ID ? "is-demo" : ""}">
        <td>
          <div class="os-host">
            <span class="os-host-mark" data-body="${set.demo === DEMO_ID ? "lantern" : "square"}">${esc(String(set.name || "M").charAt(0).toUpperCase())}</span>
            <div>
              <strong>${esc(set.name || "Untitled experience")}</strong>
              <small>ID: ${esc(shortId(set.id))}</small>
            </div>
          </div>
        </td>
        <td class="os-role">${esc(revealOf(set))}</td>
        <td><span class="os-status is-${status}">${statusLabel(set)}</span></td>
        <td>
          <div class="os-actions">
            ${isActive(set) ? `<button type="button" class="os-mini is-open" data-action="camera" data-id="${esc(set.id)}">Open</button>` : ""}
            <button type="button" class="os-mini" data-action="edit" data-id="${esc(set.id)}">Edit</button>
            <button type="button" class="os-mini" data-action="copy-code" data-id="${esc(set.id)}">${state.copiedId === set.id && state.copiedOk ? "Copied" : "Copy code"}</button>
          </div>
        </td>
      </tr>`;
  }).join("");
  const emptyCopy = fresh
    ? "No experiences yet. Create your first experience to get started."
    : "No experiences match that search.";

  view.innerHTML = `
    <div class="os-head">
      <div>
        <h1>${fresh ? "Create your first experience" : "Experiences"}</h1>
        <p>${fresh
          ? "Create or upload a GLB, then move it down the line."
          : "Each experience starts with a GLB. The line carries it to a target image and publish."}</p>
      </div>
      <button type="button" class="os-create" data-action="new-set">${fresh ? "Create your first experience" : "+ Create experience"}</button>
    </div>
    ${wonderBanner()}
    ${state.error ? `<p class="ai-error" role="alert">${esc(state.error)}</p>` : ""}
    <div class="os-stats">
      <article class="os-stat">
        <div>
          <p class="os-stat-label">Total experiences</p>
          <p class="os-stat-value">${state.sets.length}</p>
          <p class="os-stat-meta">on this shelf</p>
        </div>
        <span class="os-stat-icon is-blue" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3a5 5 0 0 0-5 5v3.2L5.2 14.2A1 1 0 0 0 6 16h12a1 1 0 0 0 .8-1.8L17 11.2V8a5 5 0 0 0-5-5zm0 18a2.4 2.4 0 0 0 2.3-2h-4.6A2.4 2.4 0 0 0 12 21z" fill="currentColor"/></svg>
        </span>
      </article>
      <article class="os-stat">
        <div>
          <p class="os-stat-label">Active experiences</p>
          <p class="os-stat-value">${active}</p>
          <p class="os-stat-meta${active ? " is-live" : ""}">${active ? "ready for a camera" : "none ready for a camera"}</p>
        </div>
        <span class="os-stat-icon is-green" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 10-14h-7l0-6z" fill="currentColor"/></svg>
        </span>
      </article>
      <article class="os-stat">
        <div>
          <p class="os-stat-label">Unlocks</p>
          <p class="os-stat-value">${unlocks}</p>
          <p class="os-stat-meta">a camera opened the experience</p>
        </div>
        <span class="os-stat-icon is-purple" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M9.2 16.2L4.8 11.8l1.4-1.4 3 3 8-8 1.4 1.4-9.4 9.4z" fill="currentColor"/></svg>
        </span>
      </article>
    </div>
    <div class="os-split">
      <section class="os-panel">
        <div class="os-panel-head">
          <h2>Active experiences</h2>
          ${fresh ? "" : `<button type="button" class="os-text-link" data-action="show-all">View all</button>`}
        </div>
        ${rows ? `
          <div class="os-table-wrap">
            <table class="os-table">
              <thead>
                <tr>
                  <th>Experience</th>
                  <th>Content</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>` : `<p class="os-empty">${emptyCopy}</p>`}
        ${fresh ? `<p class="os-hint"><button type="button" class="os-text-link" data-action="preview-sample">Start from the sample card</button></p>` : ""}
        ${state.copiedId && !state.copiedOk ? `<pre class="ai-code" id="ai-code">${esc(state.copiedCode || "")}</pre><p class="os-hint">The browser blocked automatic copy. The code above is selected.</p>` : ""}
      </section>
      <section class="os-panel">
        <div class="os-panel-head">
          <h2>Recent Activity</h2>
          <button type="button" class="os-text-link" data-action="show-logs">View full logs</button>
        </div>
        <ul class="os-activity">${activityList(8)}</ul>
      </section>
    </div>`;
}

function renderLogs() {
  view.innerHTML = `
    <div class="os-head">
      <div>
        <h1>Logs</h1>
        <p>When an experience was created, published, and unlocked by a camera.</p>
      </div>
    </div>
    ${state.error ? `<p class="ai-error" role="alert">${esc(state.error)}</p>` : ""}
    <ul class="os-panel os-activity">${activityList()}</ul>`;
}

function editorPanel(target) {
  const replacement = target.replacement;
  const presetChips = PRESETS.map((preset) => `
    <button type="button" class="os-ghost" data-action="preset" data-preset="${preset.id}" aria-pressed="${replacement.preset === preset.id}">${preset.name}</button>
  `).join("");
  const report = quality(target.featureCount);
  const picture = replacement.imageBlob
    ? `<img class="ai-mini" src="${esc(urlFor(replacement.imageBlob))}" alt="">`
    : `<span class="os-hint">No picture yet</span>`;
  const model = replacement.modelName
    ? `<span class="os-hint">${esc(replacement.modelName)}</span>`
    : `<span class="os-hint">No model yet</span>`;

  return `
    <div class="os-panel ai-panel">
      <p class="os-field-label">Add content</p>
      <div class="ai-panel-head">
        <label class="ai-name grow">
          <span class="os-field-label">Name</span>
          <input data-field="target-name" value="${esc(target.name)}" maxlength="60">
        </label>
        <button type="button" class="os-ghost" data-action="show-sign">Show image</button>
        <button type="button" class="os-ghost os-delete" data-action="remove-target">Remove</button>
      </div>
      ${report ? `<p class="ai-quality ${report.tone}"><strong>${report.label}.</strong> ${esc(report.hint)}</p>` : `<p class="os-hint">Publish to score how well this image will track.</p>`}
      <div class="ai-switch" role="group" aria-label="Add content">
        <button type="button" class="os-ghost" data-action="type" data-type="object" aria-pressed="${replacement.type === "object"}">3D object</button>
        <button type="button" class="os-ghost" data-action="type" data-type="image" aria-pressed="${replacement.type === "image"}">Different picture</button>
        <button type="button" class="os-ghost" data-action="type" data-type="model" aria-pressed="${replacement.type === "model"}">Your 3D file</button>
      </div>
      ${replacement.type === "object" ? `<div class="ai-chips" role="group" aria-label="Object">${presetChips}</div>` : ""}
      ${replacement.type === "image" ? `<div class="ai-actions">${picture}<button type="button" class="os-ghost" data-action="pick-image">Choose picture</button></div>` : ""}
      ${replacement.type === "model" ? `<div class="ai-actions">${model}<button type="button" class="os-ghost" data-action="pick-model">Choose .glb</button></div>` : ""}
      <div class="ai-controls">
        <label>Size <input data-field="scale" type="range" min="0.35" max="1.6" step="0.05" value="${clampScale(replacement.scale)}"></label>
        <label>Color <input data-field="tint" type="color" value="${hex(replacement.tint, "#ff5a1f")}"></label>
        <label>Cover <input data-field="plinth" type="color" value="${hex(replacement.plinth, "#1a1612")}"></label>
        ${replacement.type === "object" || replacement.type === "model" ? `<label class="ai-check"><input data-field="hide" type="checkbox" ${replacement.hideSign ? "checked" : ""}> Hide the target image</label>` : ""}
      </div>
    </div>`;
}

function lineMarkup(set) {
  const station = LINE.some((item) => item.id === state.station) ? state.station : "glb";
  return `
    <ol class="ai-line">
      ${LINE.map((item, index) => {
        const open = stationReached(set, item.id);
        const current = item.id === station;
        return `
          <li>
            <button type="button" data-action="station" data-station="${item.id}" aria-current="${current ? "step" : "false"}" ${open ? "" : "disabled"}>
              ${index + 1} ${esc(item.label)}
            </button>
          </li>`;
      }).join("")}
    </ol>`;
}

function stationMarkup(set) {
  const station = LINE.some((item) => item.id === state.station) ? state.station : "glb";
  const current = selectedTarget();
  const glbName = set.glb?.name || current?.replacement?.modelName || "";
  if (station === "glb") {
    const shapes = PRESETS.map((preset) => `
      <button type="button" class="os-ghost" data-action="shape" data-preset="${preset.id}">${preset.name}</button>
    `).join("");
    return `
      <section class="os-panel ai-station">
        <p class="os-kicker">1 · GLB</p>
        <h2>Start with the model.</h2>
        <p>Upload a .glb, or pick a shape. This is what the camera puts on your photo.</p>
        ${glbName ? `<p class="os-hint">Using ${esc(glbName)}.</p>` : ""}
        <div class="ai-stack">
          <button type="button" class="os-create" data-action="pick-model">Upload .glb</button>
        </div>
        <div class="ai-chips" role="group" aria-label="Shapes">${shapes}</div>
        <button type="button" class="os-ghost" data-action="station" data-station="target" ${hasGlb(set) ? "" : "disabled"}>Next: target image</button>
      </section>`;
  }
  if (station === "target") {
    const signs = set.targets.map((target) => {
      const active = current && target.id === current.id;
      return `
        <button type="button" class="ai-sign${active ? " is-on" : ""}" data-action="select" data-id="${esc(target.id)}">
          <img src="${esc(urlFor(target.imageBlob))}" alt="">
          <span>${esc(target.name)}</span>
        </button>`;
    }).join("");
    return `
      <section class="os-panel ai-station">
        <p class="os-kicker">2 · Target image</p>
        <h2>Add the photo the camera should recognize.</h2>
        <p>Use a clear picture of the sign, card, or page. The same photo is saved to your account.</p>
        <div class="ai-sign-list" id="ai-sign-list">${signs || `<p class="os-hint">No photo yet.</p>`}</div>
        <div class="ai-stack">
          <button type="button" class="os-create" data-action="add-signs">Add image</button>
          <button type="button" class="os-ghost" data-action="use-demo">Use the test image</button>
          <button type="button" class="os-ghost" data-action="station" data-station="place" ${hasTarget(set) ? "" : "disabled"}>Next: place</button>
        </div>
      </section>`;
  }
  if (station === "place") {
    return `
      <section class="ai-station">
        <p class="os-kicker">3 · Place</p>
        <h2>Sit the model on the photo.</h2>
        <p>Slide it across the photo and set the size until it sits where you want it.</p>
        <div class="ai-preview" id="ai-preview"></div>
        ${current ? `
          <div class="ai-controls">
            <label>Across <input data-field="shift-x" type="range" min="-0.4" max="0.4" step="0.02" value="${clampShift(current.replacement.shiftX)}"></label>
            <label>Up <input data-field="shift-y" type="range" min="-0.4" max="0.4" step="0.02" value="${clampShift(current.replacement.shiftY)}"></label>
            <label>Size <input data-field="scale" type="range" min="0.35" max="1.6" step="0.05" value="${clampScale(current.replacement.scale)}"></label>
          </div>` : `<p class="os-hint">Add a photo first.</p>`}
        <button type="button" class="os-ghost" data-action="station" data-station="publish" ${hasTarget(set) ? "" : "disabled"}>Next: publish</button>
      </section>`;
  }
  const trackingReady = Boolean(set.mindBlob);
  return `
    <section class="ai-station">
      <p class="os-kicker">4 · Publish</p>
      <h2>Send it to the camera.</h2>
      <p>Publish reads the photo, then you can open the camera and point it at that picture.</p>
      <div class="ai-preview" id="ai-preview"></div>
      <div class="ai-stack">
        <button type="button" class="os-create" data-action="publish">Publish experience</button>
        <button type="button" class="os-ghost" data-action="open-draft">Open camera</button>
        ${trackingReady ? `<button type="button" class="os-ghost" data-action="download-mind">Download tracking file</button>` : ""}
        <button type="button" class="os-ghost os-delete" data-action="delete-draft">Delete experience</button>
      </div>
    </section>`;
}

function renderEditor() {
  const set = state.draft;
  if (!set) {
    state.view = "library";
    renderLibrary();
    return;
  }
  if (!LINE.some((item) => item.id === state.station)) state.station = stationFor(set);
  const current = selectedTarget();
  const showPreview = state.station === "place" || state.station === "publish";

  view.innerHTML = `
    <div class="os-head">
      <div>
        <p class="os-kicker">Experience</p>
        <h1>Create experience</h1>
      </div>
      <button type="button" class="os-ghost" data-action="back-library">Back</button>
    </div>
    <label class="ai-name">
      <span class="os-field-label">Name</span>
      <input data-field="set-name" value="${esc(set.name)}" maxlength="60" autocomplete="off">
    </label>
    ${lineMarkup(set)}
    ${state.error ? `<p class="ai-error" role="alert">${esc(state.error)}</p>` : ""}
    ${state.copiedId === set.id ? `
      <section class="os-panel ai-ready" role="status">
        <p class="os-kicker">Ready</p>
        <h2>Your experience is published.</h2>
        <p>${state.copiedOk ? "It’s saved in this browser, and the embed code is copied." : "It’s saved in this browser."}</p>
        <p>Open the camera and point it at your photo. The model shows up on the photo.</p>
        <button type="button" class="os-create" data-action="open-draft">Open camera</button>
        ${state.copiedOk ? "" : `<pre class="ai-code" id="ai-code">${esc(state.copiedCode || "")}</pre><p class="os-hint">The browser blocked automatic copy. The code above is selected.</p>`}
      </section>` : ""}
    ${stationMarkup(set)}`;

  if (showPreview && current) mountPreview(document.getElementById("ai-preview"), specFrom(current, urlFor));
}

function renderDisplay() {
  const back = `<button type="button" class="os-ghost" data-action="back-display">Back</button>`;
  if (state.displaySample) {
    view.innerHTML = `
      <section class="ai-display">
        <img src="${SAMPLE.signUrl}" alt="Sample card to show the camera">
        <p>Fill the other screen with this card, then point the camera at it.</p>
        ${back}
      </section>`;
    return;
  }
  if (state.displayMarvins) {
    view.innerHTML = `
      <section class="ai-display">
        <img src="${MARVINS.signUrl}" alt="Marvins sign to show the camera">
        <p>Leave this sign up on one screen. On the phone, open the lab, place Marvins, then press Open camera and aim it here.</p>
        ${back}
      </section>`;
    return;
  }
  const target = selectedTarget();
  if (!target) {
    state.view = "library";
    renderLibrary();
    return;
  }
  view.innerHTML = `
    <section class="ai-display">
      <img src="${esc(urlFor(target.imageBlob))}" alt="Sign to show the camera">
      <p>Leave this up on a second screen. Open the camera on the other device and aim it here.</p>
      <div class="ai-actions">
        <button type="button" class="os-ghost" data-action="open-tab">Open in a new tab</button>
        ${back}
      </div>
    </section>`;
}

function refreshPreview() {
  if (state.view !== "editor") return;
  const host = document.getElementById("ai-preview");
  const target = selectedTarget();
  if (!host || !target) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    mountPreview(host, specFrom(target, urlFor));
  }, 140);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

let compilerPromise = null;

function ensureCompiler() {
  if (window.MINDAR?.IMAGE?.Compiler) return Promise.resolve(window.MINDAR.IMAGE.Compiler);
  if (window.__MindCompiler) return Promise.resolve(window.__MindCompiler);
  if (compilerPromise) return compilerPromise;
  const src = "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js";
  compilerPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      const Compiler = window.MINDAR?.IMAGE?.Compiler;
      if (!Compiler) return;
      settled = true;
      window.clearTimeout(timer);
      window.__MindCompiler = Compiler;
      resolve(Compiler);
    };
    const giveUp = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      compilerPromise = null;
      reject(error);
    };
    const timer = window.setTimeout(() => {
      giveUp(new Error("This is taking too long. Check your connection and press Publish again."));
    }, 20000);
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing?.dataset.ready === "yes") {
      finish();
      if (!settled) giveUp(new Error("The photo tools did not load. Press Publish again."));
      return;
    }
    const script = existing || document.createElement("script");
    script.addEventListener("load", () => {
      script.dataset.ready = "yes";
      finish();
      if (!settled) giveUp(new Error("The photo tools did not load. Press Publish again."));
    }, { once: true });
    script.addEventListener("error", () => {
      giveUp(new Error("The photo tools did not load. Check your connection and press Publish again."));
    }, { once: true });
    if (!existing) {
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return compilerPromise;
}

function compileLine(progress) {
  if (progress < 20) return "Taking a look at your photo.";
  if (progress < 55) return "Finding the details a camera can hold onto.";
  if (progress < 85) return "Still with you. The first photo takes a little while.";
  return "Wrapping it up.";
}

async function compile(set) {
  if (!set.targets.length) throw new Error("Add a target image first.");
  const Compiler = await ensureCompiler();
  showBusy(compileLine(0), 0);
  const images = [];
  for (const target of set.targets) images.push(await blobToImage(target.imageBlob));
  const compiler = new Compiler();
  const data = await compiler.compileImageTargets(images, (progress) => {
    showBusy(compileLine(progress), progress);
  });
  data.forEach((entry, index) => {
    set.targets[index].featureCount = featureCount(entry);
  });
  const exported = await compiler.exportData();
  set.mindBlob = new Blob([exported]);
  set.mindDirty = false;
  pushEvent(set, "compiled");
  await saveSet(set, owner);
  upsert(set);
}

async function primeCamera() {
  if (!window.isSecureContext) {
    throw new Error("Open the secure HTTPS lab link in Chrome on your Android phone. Camera access does not work from an ordinary HTTP address.");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser has no camera API. Use Chrome.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: "environment" } },
  });
  stream.getTracks().forEach((track) => track.stop());
  await new Promise((resolve) => setTimeout(resolve, 350));
}

function setHud(text, locked) {
  hudStatus.textContent = text;
  hudStatus.classList.toggle("is-locked", locked);
}

async function launch(mindUrl, specs) {
  state.view = "stage";
  state.found = new Set();
  document.body.classList.add("ai-live");
  stage.hidden = false;
  hud.hidden = false;
  setHud("Starting the camera", false);
  document.getElementById("ai-hud-hint").textContent = "Fill the frame with the sign and hold it steady.";
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  mountAR(stage, {
    mindUrl,
    specs,
    onFound: (name) => {
      if (!state.found.has(name)) recordImpression(name);
      state.found.add(name);
      setHud([...state.found].join(" · "), true);
      document.getElementById("ai-hud-hint").textContent = "Keep the picture in view. Move slowly to explore the reveal.";
    },
    onLost: (name) => {
      state.found.delete(name);
      if (state.found.size === 0) {
        setHud("Looking for a known sign", false);
        document.getElementById("ai-hud-hint").textContent = "Fill the frame with the sign and hold it steady.";
      } else {
        setHud([...state.found].join(" · "), true);
      }
    },
    onReady: () => {
      if (state.found.size === 0) setHud("Looking for a known sign", false);
    },
    onError: () => {
      state.error = "The camera did not start. Allow camera access and try again.";
      exitStage();
    },
  });
}

function exitStage() {
  destroyScene(stage);
  releaseStageUrls();
  stage.hidden = true;
  hud.hidden = true;
  document.body.classList.remove("ai-live");
  state.found.clear();
  state.view = state.returnView || (state.draft ? "editor" : "library");
  render();
}

async function openCameraFor(set, sample = false) {
  state.error = "";
  state.returnView = state.view === "stage" ? state.returnView : state.view;
  if (!sample && !set.targets.length) throw new Error("Add a target image first.");
  showBusy("Asking for the camera…", null);
  await primeCamera();
  await ensureAR();
  const readyMind = sample || set.mindUrl || (set.mindBlob && !set.mindDirty);
  if (!readyMind) await compile(set);
  hideBusy();
  releaseStageUrls();
  if (sample) {
    await launch(SAMPLE.mindUrl, [{
      name: SAMPLE.name,
      aspect: SAMPLE.aspect,
      signUrl: SAMPLE.signUrl,
      replacement: defaultReplacement(),
    }]);
    return;
  }
  const mindUrl = set.mindUrl || freshUrl(set.mindBlob);
  await launch(mindUrl, set.targets.map((target) => specFrom(target, freshUrl)));
}

function isImageFile(file) {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name || "");
}

async function addFiles(fileList) {
  const files = [...fileList].filter(isImageFile);
  if (!files.length) throw new Error("Choose a JPEG, PNG, or WebP.");
  showBusy("Preparing signs…", null);
  for (const file of files) {
    const image = await fileToSign(file);
    const target = {
      id: crypto.randomUUID(),
      name: prettyName(file.name),
      width: image.width,
      height: image.height,
      featureCount: null,
      imageBlob: image.blob,
      replacement: defaultReplacement(),
    };
    state.draft.targets.push(target);
    state.selectedId = target.id;
    if (state.draft.glb?.blob) rememberGlb(state.draft.glb.blob, state.draft.glb.name);
  }
  state.draft.mindDirty = true;
  state.draft.mindBlob = null;
  pushEvent(state.draft, state.draft.events?.length ? "saved" : "created");
  await saveSet(state.draft, owner);
  upsert(state.draft);
  showBusy("Saving the photo to your account…", null);
  try {
    await publishLocalPhotos();
  } catch (error) {
    state.error = message(error);
  }
  hideBusy();
  render();
}

async function placeMarvins() {
  if (marvinsSet()) return;
  showBusy("Bringing in Marvins…", null);
  const picture = await fetch(MARVINS.signUrl);
  if (!picture.ok) throw new Error("The Marvins sign could not load. Check your connection and try again.");
  const imageBlob = await picture.blob();
  const image = await blobToImage(imageBlob);
  const target = {
    id: crypto.randomUUID(),
    name: "Marvins sign",
    width: image.naturalWidth,
    height: image.naturalHeight,
    imageBlob,
    signUrl: MARVINS.signUrl,
    featureCount: null,
    replacement: {
      ...defaultReplacement(),
      type: "model",
      modelName: "Marvins",
      modelUrl: MARVINS.modelUrl,
      hideSign: true,
    },
  };
  const set = {
    id: crypto.randomUUID(),
    name: "Marvins",
    demo: MARVINS_ID,
    updated: Date.now(),
    mindDirty: false,
    mindBlob: null,
    mindUrl: MARVINS.mindUrl,
    targets: [target],
    impressions: 0,
    owner,
  };
  pushEvent(set, "created");
  await saveSet(set, owner);
  upsert(set);
  state.draft = set;
  state.selectedId = target.id;
  state.view = "library";
  hideBusy();
  render();
}

async function placeDemo() {
  if (demoSet()) return;
  showBusy("Preparing First Light…", null);
  const [picture, tracking] = await Promise.all([fetch(SAMPLE.signUrl), fetch(SAMPLE.mindUrl)]);
  if (!picture.ok || !tracking.ok) throw new Error("The demo card could not load. Check your connection and try again.");
  const imageBlob = await picture.blob();
  const image = await blobToImage(imageBlob);
  const target = {
    id: crypto.randomUUID(),
    name: "The card",
    width: image.naturalWidth,
    height: image.naturalHeight,
    imageBlob,
    featureCount: null,
    replacement: {
      ...defaultReplacement(),
      preset: "lantern",
      tint: "#f6c56b",
      plinth: "#140e09",
    },
  };
  const set = {
    id: crypto.randomUUID(),
    name: "First Light",
    demo: DEMO_ID,
    updated: Date.now(),
    mindDirty: false,
    mindBlob: await tracking.blob(),
    targets: [target],
    impressions: 0,
    owner,
  };
  pushEvent(set, "created");
  await saveSet(set, owner);
  upsert(set);
  state.draft = set;
  state.selectedId = target.id;
  state.view = "library";
  hideBusy();
  render();
}

async function addDemo() {
  showBusy("Drawing a test sign…", null);
  const image = await makeDemoSign();
  const target = {
    id: crypto.randomUUID(),
    name: "Test sign",
    width: image.width,
    height: image.height,
    featureCount: null,
    imageBlob: image.blob,
    replacement: defaultReplacement(),
  };
  state.draft.targets.push(target);
  state.selectedId = target.id;
  state.draft.mindDirty = true;
  state.draft.mindBlob = null;
  pushEvent(state.draft, "created");
  await saveSet(state.draft, owner);
  upsert(state.draft);
  hideBusy();
  render();
}

function leaveDisplay() {
  state.displaySample = false;
  state.displayMarvins = false;
  state.error = "";
  state.view = state.displayReturn || (state.draft ? "editor" : "library");
  state.displayReturn = "";
  render();
}

async function onClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button || !view.contains(button)) return;
  const { action, id } = button.dataset;

  if (action === "show-logs") {
    state.view = "logs";
    markNav("logs");
    render();
    return;
  }

  if (action === "show-all") {
    query = "";
    const input = document.getElementById("os-search");
    if (input) input.value = "";
    state.view = "library";
    markNav("models");
    render();
    return;
  }

  if (action === "copy-code") {
    const set = state.sets.find((item) => item.id === id);
    if (!set) return;
    const code = modelCode(set);
    state.copiedId = set.id;
    state.copiedCode = code;
    state.error = "";
    try {
      await copyText(code);
      state.copiedOk = true;
    } catch (error) {
      state.copiedOk = false;
    }
    render();
    const pre = document.getElementById("ai-code");
    if (pre) {
      const range = document.createRange();
      range.selectNodeContents(pre);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    return;
  }

  if (action === "back-library") {
    state.error = "";
    state.view = "library";
    render();
    return;
  }

  if (action === "back-display") {
    leaveDisplay();
    return;
  }

  if (action === "new-set") {
    const set = {
      id: crypto.randomUUID(),
      name: UNTITLED,
      updated: Date.now(),
      mindDirty: true,
      mindBlob: null,
      targets: [],
      owner,
    };
    state.draft = set;
    state.selectedId = null;
    state.station = "glb";
    state.error = "";
    state.view = "editor";
    render();
    return;
  }

  if (action === "edit") {
    state.draft = state.sets.find((set) => set.id === id) || null;
    state.selectedId = state.draft?.targets[0]?.id || null;
    state.station = state.draft ? stationFor(state.draft) : "glb";
    state.error = "";
    state.view = "editor";
    if (state.station === "place" || state.station === "publish") await ensureAR();
    render();
    return;
  }

  if (action === "delete") {
    const set = state.sets.find((item) => item.id === id);
    if (!set || !confirm(`Delete “${set.name}”?`)) return;
    await deleteSet(id);
    forgetAccountSet(id).catch(() => {});
    state.sets = state.sets.filter((item) => item.id !== id);
    render();
    return;
  }

  if (action === "camera") {
    const set = state.sets.find((item) => item.id === id);
    if (!set) return;
    state.draft = set;
    state.selectedId = set.targets[0]?.id || null;
    await openCameraFor(set);
    return;
  }

  if (action === "place-demo") {
    await placeDemo();
    return;
  }

  if (action === "place-marvins") {
    await placeMarvins();
    return;
  }

  if (action === "open-marvins") {
    const set = marvinsSet();
    if (!set) return;
    state.draft = set;
    state.selectedId = set.targets[0]?.id || null;
    await openCameraFor(set);
    return;
  }

  if (action === "show-marvins") {
    state.displaySample = false;
    state.displayMarvins = true;
    state.displayReturn = "library";
    state.view = "display";
    state.error = "";
    render();
    return;
  }

  if (action === "open-demo") {
    const set = demoSet();
    if (!set) return;
    state.draft = set;
    state.selectedId = set.targets[0]?.id || null;
    await openCameraFor(set);
    return;
  }

  if (action === "show-demo-sign") {
    const set = demoSet();
    if (!set) return;
    state.draft = set;
    state.selectedId = set.targets[0]?.id || null;
    state.displaySample = false;
    state.displayReturn = "library";
    state.error = "";
    state.view = "display";
    render();
    return;
  }

  if (action === "preview-sample") {
    await ensureAR();
    showBusy("Preparing your first reveal…", null);
    const [picture, tracking] = await Promise.all([fetch(SAMPLE.signUrl), fetch(SAMPLE.mindUrl)]);
    if (!picture.ok || !tracking.ok) throw new Error("The sample could not load. Check your connection and try again.");
    const imageBlob = await picture.blob();
    const image = await blobToImage(imageBlob);
    const target = {
      id: crypto.randomUUID(),
      name: SAMPLE.name,
      width: image.naturalWidth,
      height: image.naturalHeight,
      imageBlob,
      featureCount: null,
      replacement: defaultReplacement(),
    };
    state.draft = {
      id: crypto.randomUUID(),
      name: "My first reveal",
      updated: Date.now(),
      mindDirty: false,
      mindBlob: await tracking.blob(),
      targets: [target],
      owner,
    };
    state.selectedId = target.id;
    pushEvent(state.draft, "created");
    await saveSet(state.draft, owner);
    upsert(state.draft);
    state.view = "editor";
    hideBusy();
    render();
    return;
  }

  if (action === "prepare-tracking") {
    await compile(state.draft);
    hideBusy();
    render();
    return;
  }

  if (action === "show-sample") {
    state.displaySample = true;
    state.displayReturn = "library";
    state.view = "display";
    state.error = "";
    render();
    return;
  }

  if (action === "add-signs" || action === "pick-image" || action === "pick-model") return;

  if (action === "use-demo") {
    await addDemo();
    return;
  }

  if (action === "publish") {
    if (!state.draft?.targets?.length) throw new Error("Add your photo first, then publish.");
    showBusy("Taking a look at your photo.", 0);
    if (!(state.draft.mindBlob && !state.draft.mindDirty)) await compile(state.draft);
    const code = modelCode(state.draft);
    state.copiedId = state.draft.id;
    state.copiedCode = code;
    state.copiedOk = false;
    state.error = "";
    hideBusy();
    state.view = "editor";
    render();
    document.querySelector(".ai-ready")?.scrollIntoView({ block: "start" });
    try {
      await copyText(code);
      state.copiedOk = true;
      render();
    } catch (error) {
      state.copiedOk = false;
      render();
      const pre = document.getElementById("ai-code");
      if (pre) {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    return;
  }

  if (action === "open-draft") {
    await openCameraFor(state.draft);
    return;
  }

  if (action === "download-mind" && state.draft?.mindBlob) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(state.draft.mindBlob);
    link.download = `${state.draft.name.replace(/[^\w.-]+/g, "-").toLowerCase() || "signs"}.mind`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    return;
  }

  if (action === "delete-draft" && state.draft) {
    if (!confirm(`Delete “${state.draft.name}”?`)) return;
    const gone = state.draft.id;
    await deleteSet(gone);
    forgetAccountSet(gone).catch(() => {});
    state.sets = state.sets.filter((item) => item.id !== gone);
    state.draft = null;
    state.view = "library";
    render();
    return;
  }

  if (action === "select") {
    state.selectedId = id;
    render();
    return;
  }

  if (action === "remove-target") {
    const current = selectedTarget();
    if (!current) return;
    state.draft.targets = state.draft.targets.filter((target) => target.id !== current.id);
    state.draft.mindDirty = true;
    state.draft.mindBlob = null;
    state.selectedId = state.draft.targets[0]?.id || null;
    await saveSet(state.draft, owner);
    upsert(state.draft);
    render();
    return;
  }

  if (action === "show-sign") {
    state.displaySample = false;
    state.error = "";
    state.view = "display";
    render();
    return;
  }

  if (action === "open-tab") {
    const target = selectedTarget();
    if (!target) return;
    const dataUrl = await blobToDataUrl(target.imageBlob);
    const html = `<!DOCTYPE html><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(target.name)}</title><style>html,body{margin:0;background:#111;min-height:100%}body{display:grid;place-items:center}img{width:min(100%,920px);height:auto}</style><img alt="Sign" src="${dataUrl}">`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }

  if (action === "station") {
    const next = button.dataset.station;
    if (!state.draft || !stationReached(state.draft, next)) return;
    state.station = next;
    state.error = "";
    if (next === "place" || next === "publish") await ensureAR();
    render();
    return;
  }

  if (action === "shape") {
    const preset = PRESETS.find((item) => item.id === button.dataset.preset);
    if (!preset || !state.draft) return;
    rememberGlb(shapeGlb(preset.id, "#ff5a1f"), preset.name);
    state.station = "target";
    state.error = "";
    await saveSet(state.draft, owner);
    upsert(state.draft);
    render();
    return;
  }

  if (action === "pick-image") document.getElementById("ai-rep-image").click();
  if (action === "pick-model") document.getElementById("ai-rep-model").click();
}

function onInput(event) {
  const field = event.target.dataset.field;
  if (!field || !state.draft) return;
  if (field === "set-name") {
    state.draft.name = event.target.value.slice(0, 60);
    queueSave();
    return;
  }
  const target = selectedTarget();
  if (!target) return;
  if (field === "target-name") {
    target.name = event.target.value.slice(0, 60);
    const label = document.querySelector(`.ai-sign[data-id="${CSS.escape(target.id)}"] span`);
    if (label) label.textContent = target.name;
    queueSave();
    return;
  }
  if (field === "scale") target.replacement.scale = clampScale(event.target.value);
  if (field === "shift-x") target.replacement.shiftX = clampShift(event.target.value);
  if (field === "shift-y") target.replacement.shiftY = clampShift(event.target.value);
  if (field === "tint") target.replacement.tint = hex(event.target.value, target.replacement.tint);
  if (field === "plinth") target.replacement.plinth = hex(event.target.value, target.replacement.plinth);
  if (field === "hide") target.replacement.hideSign = event.target.checked;
  queueSave();
  refreshPreview();
}

function fail(error) {
  hideBusy();
  state.error = message(error);
  if (state.view === "stage") {
    exitStage();
    return;
  }
  try {
    render();
  } catch (renderError) {
    console.error(renderError);
  }
}

function accountOwner() {
  const user = window.HorseradishLab && window.HorseradishLab.config && window.HorseradishLab.config().user;
  return user && user.sub ? String(user.sub) : "";
}

const HOME_LOOKS = {
  beacon: { type: "object", preset: "beacon", name: "Beacon", tint: "#ff5a1f", plinth: "#1a1612" },
  monolith: { type: "object", preset: "monolith", name: "Monolith", tint: "#ff5a1f", plinth: "#1a1612" },
  orb: { type: "object", preset: "orb", name: "Orb", tint: "#ff5a1f", plinth: "#1a1612" },
  portal: { type: "object", preset: "portal", name: "Portal", tint: "#ff5a1f", plinth: "#1a1612" },
  lantern: { type: "object", preset: "lantern", name: "Lantern", tint: "#f6c56b", plinth: "#140e09" },
  picture: { type: "image", name: "Picture", tint: "#ff5a1f", plinth: "#1a1612" },
  model: { type: "model", name: "Your model", tint: "#ff5a1f", plinth: "#1a1612" },
};

function takeHomeEntry() {
  const params = new URLSearchParams(location.search);
  const look = HOME_LOOKS[String(params.get("look") || "").toLowerCase()] || null;
  const create = params.get("create") === "1";
  if (!look && !create) return null;
  const url = new URL(location.href);
  url.searchParams.delete("look");
  url.searchParams.delete("create");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return { look, create };
}

async function startBlank() {
  state.draft = {
    id: crypto.randomUUID(),
    name: UNTITLED,
    updated: Date.now(),
    mindDirty: true,
    mindBlob: null,
    targets: [],
    owner,
  };
  state.selectedId = null;
  state.station = "glb";
  state.error = "";
  state.view = "editor";
}

async function startFromLook(look) {
  await ensureAR();
  showBusy("Opening that look…", null);
  const image = await makeDemoSign();
  const replacement = {
    ...defaultReplacement(),
    type: look.type,
    tint: look.tint,
    plinth: look.plinth,
  };
  if (look.preset) replacement.preset = look.preset;
  const target = {
    id: crypto.randomUUID(),
    name: "Test sign",
    width: image.width,
    height: image.height,
    featureCount: null,
    imageBlob: image.blob,
    replacement,
  };
  const set = {
    id: crypto.randomUUID(),
    name: look.name,
    updated: Date.now(),
    mindDirty: true,
    mindBlob: null,
    targets: [target],
    owner,
  };
  pushEvent(set, "created");
  await saveSet(set, owner);
  upsert(set);
  state.draft = set;
  state.selectedId = target.id;
  state.error = "";
  state.view = "editor";
  hideBusy();
}

async function open() {
  if (!view) return;
  owner = accountOwner();
  state.error = "";
  state.view = "library";
  state.displaySample = false;
  query = "";
  if (!owner) {
    state.sets = [];
    state.ready = false;
    state.error = "Sign in again before creating an experience.";
    render();
    return;
  }
  try {
    state.sets = await listSets(owner);
    state.ready = true;
  } catch (error) {
    state.sets = [];
    state.ready = false;
    state.error = message(error);
  }
  if (state.ready) {
    try {
      await publishLocalPhotos();
      await absorbAccountPhotos();
    } catch (error) {
      state.error = message(error);
    }
  }
  const entry = takeHomeEntry();
  if (entry) {
    try {
      if (entry.look) await startFromLook(entry.look);
      else await startBlank();
    } catch (error) {
      hideBusy();
      state.error = message(error);
      state.view = "library";
    }
  }
  render();
  ensureAR().catch((error) => {
    state.error = message(error);
    render();
  });
}

function home() {
  markNav("models");
  const stay = state.view === "library" && !state.displaySample && !state.copiedId;
  state.copiedId = "";
  state.copiedOk = false;
  if (stay) return;
  if (state.view === "stage") {
    state.returnView = "library";
    exitStage();
    return;
  }
  state.displaySample = false;
  state.error = "";
  state.view = "library";
  render();
}

function logs() {
  markNav("logs");
  if (state.view === "stage") {
    state.returnView = "logs";
    exitStage();
    return;
  }
  state.displaySample = false;
  state.error = "";
  state.view = "logs";
  render();
}

function search(value) {
  query = String(value || "").trim().toLowerCase();
  if (state.view === "stage") return;
  state.displaySample = false;
  state.view = "library";
  render();
}

function nameField(target) {
  if (target instanceof HTMLInputElement && target.dataset.field === "set-name") return target;
  const label = target instanceof Element ? target.closest("label.ai-name") : null;
  return label?.querySelector("[data-field='set-name']") || null;
}

function clearUntitled(input) {
  if (!input || input.value.trim().toLowerCase() !== UNTITLED.toLowerCase()) return;
  input.value = "";
  if (state.draft) state.draft.name = "";
}

if (view) {
  view.addEventListener("pointerdown", (event) => {
    clearUntitled(nameField(event.target));
  });
  view.addEventListener("click", (event) => {
    clearUntitled(nameField(event.target));
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "add-signs") {
      document.getElementById("ai-sign-files")?.click();
      return;
    }
    if (action === "pick-image") {
      document.getElementById("ai-rep-image")?.click();
      return;
    }
    if (action === "pick-model") {
      document.getElementById("ai-rep-model")?.click();
      return;
    }
    onClick(event).catch(fail);
  });
  view.addEventListener("focusin", (event) => {
    clearUntitled(nameField(event.target));
  });
  view.addEventListener("focusout", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.dataset.field !== "set-name") return;
    if (input.value.trim() || !state.draft) return;
    input.value = UNTITLED;
    state.draft.name = UNTITLED;
  });
  view.addEventListener("input", onInput);
  view.addEventListener("dragover", (event) => {
    if (state.view !== "editor") return;
    event.preventDefault();
    document.getElementById("ai-sign-list")?.classList.add("is-dropping");
  });
  view.addEventListener("dragleave", () => {
    document.getElementById("ai-sign-list")?.classList.remove("is-dropping");
  });
  view.addEventListener("drop", (event) => {
    if (state.view !== "editor") return;
    event.preventDefault();
    document.getElementById("ai-sign-list")?.classList.remove("is-dropping");
    addFiles(event.dataTransfer.files).catch(fail);
  });
}

document.getElementById("ai-hud-exit")?.addEventListener("click", exitStage);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.view === "stage") exitStage();
});

document.getElementById("ai-sign-files")?.addEventListener("change", (event) => {
  const files = [...(event.target.files || [])];
  event.target.value = "";
  if (files.length) addFiles(files).catch(fail);
});

document.getElementById("ai-rep-image")?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  const target = selectedTarget();
  if (!file || !target) return;
  fileToPicture(file).then((image) => {
    target.replacement.imageBlob = image.blob;
    target.replacement.type = "image";
    state.error = "";
    queueSave();
    render();
  }).catch(fail);
});

document.getElementById("ai-rep-model")?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  const name = file?.name || "model.glb";
  const reading = file ? file.arrayBuffer() : null;
  event.target.value = "";
  if (!reading || !state.draft) return;
  reading.then((bytes) => {
    const head = new Uint8Array(bytes, 0, 4);
    const magic = String.fromCharCode(head[0] || 0, head[1] || 0, head[2] || 0, head[3] || 0);
    if (!name.toLowerCase().endsWith(".glb") || magic !== "glTF") {
      fail(new Error("Use a .glb file so the textures travel with the model."));
      return;
    }
    if (bytes.byteLength > 40_000_000) {
      fail(new Error("That model is over 40 MB. Export a smaller .glb."));
      return;
    }
    rememberGlb(new Blob([bytes], { type: "model/gltf-binary" }), name);
    state.station = "target";
    state.error = "";
    return saveSet(state.draft, owner).then(upsert).then(() => render());
  }).catch(fail);
});

window.HorseradishAfterImage = { open, home, logs, search };
document.dispatchEvent(new Event("afterimage-ready"));
