import { fetchAccountPhoto, forgetAccountSet, listAccountPhotos, saveAccountPhoto } from "./account.js";
import { deleteSet, listSets, saveSet } from "./db.js";
import { blobToImage, featureCount, fileToPicture, fileToSign, makeDemoSign, quality } from "./images.js";
import { destroyScene, mountAR, mountPreview } from "./stage.js?v=modifiers-20261123";

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

const MODIFIERS = [
  { id: "link", name: "Link" },
  { id: "animation", name: "Animation" },
  { id: "model", name: "3D model" },
  { id: "image", name: "Image overlay" },
];

const AFRAME_SRC = "https://aframe.io/releases/1.6.0/aframe.min.js";
const MINDAR_SRC = "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js";

const LINE = [
  { id: "opens", label: "Opens" },
  { id: "target", label: "Object" },
  { id: "place", label: "Place" },
  { id: "publish", label: "Publish" },
];

const state = {
  view: "library",
  returnView: "library",
  station: "opens",
  sets: [],
  draft: null,
  selectedId: null,
  displaySample: false,
  displayMarvins: false,
  displayReturn: "",
  error: "",
  scene: null,
  sceneReturn: "",
  found: new Set(),
  ready: false,
  session: null,
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
    type: "link",
    href: "",
    linkLabel: "",
    tint: "#ff5a1f",
    plinth: "#1a1612",
    hideSign: false,
    scale: 1,
    shiftX: 0,
    shiftY: 0,
    imageBlob: null,
    animationBlob: null,
    animationName: "",
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
      href: replacement.href || "",
      linkLabel: replacement.linkLabel || "",
      imageUrl: replacement.imageBlob ? link(replacement.imageBlob) : "",
      animationUrl: replacement.animationBlob ? link(replacement.animationBlob) : "",
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

function httpUrl(value) {
  let raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw.replace(/^\/+/, "")}`;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (!url.hostname || !url.hostname.includes(".")) return "";
    return url.href;
  } catch (error) {
    return "";
  }
}

function modifierType(set) {
  const named = set?.modifierType;
  if (MODIFIERS.some((item) => item.id === named)) return named;
  const found = (set?.targets || []).find((target) => MODIFIERS.some((item) => item.id === target.replacement?.type));
  return found ? found.replacement.type : "";
}

function modifierSource(set) {
  const target = (set?.targets || []).find((item) => item.replacement) || null;
  return { ...(target?.replacement || {}), ...(set?.modifier || {}) };
}

function modifierReady(set) {
  const type = modifierType(set);
  const source = modifierSource(set);
  if (type === "link") return Boolean(httpUrl(source.href));
  if (type === "animation") return Boolean(source.animationBlob);
  if (type === "model") return Boolean(source.modelBlob || source.modelUrl || set?.glb?.blob);
  if (type === "image") return Boolean(source.imageBlob);
  return false;
}

function stampModifier(set, target) {
  const type = modifierType(set);
  if (!type || !target?.replacement) return;
  const source = modifierSource(set);
  target.replacement.type = type;
  target.replacement.href = source.href || "";
  target.replacement.linkLabel = source.linkLabel || "";
  if (source.animationBlob) {
    target.replacement.animationBlob = source.animationBlob;
    target.replacement.animationName = source.animationName || "";
  }
  if (type === "model") {
    const blob = set.glb?.blob || source.modelBlob;
    if (blob) {
      target.replacement.modelBlob = blob;
      target.replacement.modelName = set.glb?.name || source.modelName || "";
    }
    if (source.modelUrl) target.replacement.modelUrl = source.modelUrl;
  }
  if (type === "image" && source.imageBlob) target.replacement.imageBlob = source.imageBlob;
}

function setModifier(set, patch) {
  if (!set) return;
  set.modifier = { ...(set.modifier || {}), ...patch };
  if (patch.type) set.modifierType = patch.type;
  (set.targets || []).forEach((target) => stampModifier(set, target));
}

function hasTarget(set) {
  return (set?.targets || []).some((target) => target.imageBlob);
}

function stationReached(set, id) {
  if (id === "opens") return true;
  if (id === "target") return modifierReady(set);
  return modifierReady(set) && hasTarget(set);
}

function stationFor(set) {
  if (!modifierReady(set)) return "opens";
  if (!hasTarget(set)) return "target";
  if (set.mindBlob && !set.mindDirty) return "publish";
  return "place";
}

function stationBlock(set, id) {
  if (!modifierReady(set)) {
    const type = modifierType(set);
    if (type === "link") return "Add the page or the download, then continue.";
    if (type === "animation") return "Upload the animation, then continue.";
    if (type === "model") return "Upload the .glb, then continue.";
    if (type === "image") return "Choose the overlay, then continue.";
    return "Choose what the object opens, then continue.";
  }
  if (id !== "target" && !hasTarget(set)) return "Add a photo of the object, then continue.";
  return "Finish this step, then continue.";
}

function paintStations() {
  if (!view || !state.draft) return;
  view.querySelectorAll("[data-action='station']").forEach((button) => {
    if (button.dataset.advance) return;
    button.disabled = !stationReached(state.draft, button.dataset.station);
  });
}

function rememberGlb(blob, name) {
  if (!state.draft) return;
  state.draft.glb = { blob, name };
  setModifier(state.draft, { type: "model", modelBlob: blob, modelName: name });
}

function revealOf(set) {
  const type = modifierType(set);
  const source = modifierSource(set);
  if (type === "link") return source.linkLabel || source.href || "Link";
  if (type === "animation") return source.animationName || "Animation";
  if (type === "model") return source.modelName || set.glb?.name || "3D model";
  if (type === "image") return "Image overlay";
  return "Nothing opens yet";
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
  if (event.action === "seen") return `${name} appeared on a screen`;
  if (event.action === "compiled") return `${name} compiled`;
  if (event.action === "created") return `${name} created`;
  return `${name} saved`;
}

function eventTone(action) {
  if (action === "seen" || action === "impressed" || action === "compiled") return "active";
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

let measureSave = Promise.resolve();

function kindsOf(set) {
  const stored = set?.metrics?.kinds || {};
  return {
    link: Number(stored.link) || 0,
    animation: Number(stored.animation) || 0,
    model: Number(stored.model) || 0,
    image: Number(stored.image) || 0,
  };
}

function ensureMetrics(set) {
  const metrics = set.metrics && typeof set.metrics === "object" ? set.metrics : {};
  metrics.kinds = kindsOf(set);
  set.metrics = metrics;
  return metrics;
}

function persistMeasure(set) {
  measureSave = measureSave
    .then(() => saveSet(set, owner))
    .then((saved) => upsert(saved))
    .catch(() => {});
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function metricLine(set) {
  const kinds = kindsOf(set);
  return [
    plural(kinds.link, "link"),
    plural(kinds.animation, "animation"),
    plural(kinds.model, "model"),
    plural(kinds.image, "overlay"),
  ].join(" · ");
}

const MEASURE_NOTE = "The tally moves when the camera recognizes the object and that thing appears on the screen. Each kind keeps its own count.";

function beginSession(set) {
  state.session = set ? { set, seen: new Set() } : null;
}

function noteReady() {}

function kindOn(set, name) {
  const target = (set?.targets || []).find((item) => item.name === name);
  const type = target?.replacement?.type || modifierType(set);
  return Object.prototype.hasOwnProperty.call(kindsOf(set), type) ? type : "";
}

function noteFound(name) {
  const session = state.session;
  if (!session?.set || session.seen.has(name)) return;
  session.seen.add(name);
  const type = kindOn(session.set, name);
  if (!type) return;
  const metrics = ensureMetrics(session.set);
  metrics.kinds[type] += 1;
  pushEvent(session.set, "seen");
  persistMeasure(session.set);
}

function noteLost() {}

function endSession() {
  state.session = null;
}

function render() {
  if (!view) return;
  if (state.view !== "editor") {
    const preview = document.getElementById("ai-preview");
    if (preview) destroyScene(preview);
  }
  if (state.view === "library" || state.view === "logs") releaseUrls();
  document.body.classList.toggle("is-explore", state.view === "library" || state.view === "scene" || state.view === "projects");
  if (state.view === "editor") renderEditor();
  else if (state.view === "display") renderDisplay();
  else if (state.view === "logs") renderLogs();
  else if (state.view === "scene") renderScene();
  else if (state.view === "projects") renderProjects();
  else renderLibrary();
}

function renderProjects() {
  view.innerHTML = `
    <div class="ox-projects">
      <article class="ox-project-card">
        <div class="ox-tree" aria-hidden="true">
          <div class="ox-tree-board">
            <p class="ox-tree-project"><span class="ox-folder"></span> Project</p>
            <p class="ox-tree-label">AR Scenes</p>
            <div class="ox-tree-scenes">
              <div class="ox-tree-scene is-on">
                <img src="${esc(MARVINS.signUrl)}" alt="">
                <span class="ox-gem"></span>
                Scene 1
              </div>
              <div class="ox-tree-scene">
                <img src="${esc(SAMPLE.signUrl)}" alt="">
                <span class="ox-gem"></span>
                Scene 6
              </div>
            </div>
          </div>
        </div>
        <h2>Create your own AR experiences</h2>
        <p>Build and organize augmented reality projects and scenes step by step from scratch</p>
        <button type="button" class="ox-go ox-go-pill" data-action="new-set">+ Create</button>
      </article>
      <article class="ox-project-card ox-project-library">
        <h2>Start from a ready-made experience</h2>
        <p>Take a look at the library and start from a ready-made experience</p>
        <button type="button" class="ox-outline ox-outline-lg" data-action="show-library">View experience library</button>
        <div class="ox-browsers" aria-hidden="true">
          <div class="ox-browser">
            <div class="ox-browser-bar"><i></i><i></i><i></i><span>horseradish</span></div>
            <img src="${esc(MARVINS.signUrl)}" alt="">
          </div>
          <div class="ox-browser ox-browser-sample">
            <div class="ox-browser-bar"><i></i><i></i><i></i><span>studio</span></div>
            <img src="${esc(SAMPLE.signUrl)}" alt="">
          </div>
        </div>
      </article>
    </div>`;
}

function sampleProjects() {
  const samples = [
    {
      title: "Marvins",
      image: MARVINS.signUrl,
      alt: "Marvin's sign",
      placed: Boolean(marvinsSet()),
      place: "place-marvins",
      open: "open-marvins",
      show: "show-marvins",
      showLabel: "Show the sign",
      href: "demos/marvins/view.html",
    },
    {
      title: "First Light",
      image: SAMPLE.signUrl,
      alt: "Sample card",
      placed: Boolean(demoSet()),
      place: "place-demo",
      open: "open-demo",
      show: "show-demo-sign",
      showLabel: "Show the card",
      href: "",
    },
  ];
  if (!query) return samples;
  return samples.filter((sample) => sample.title.toLowerCase().includes(query));
}

function sampleCard(sample) {
  const action = sample.placed ? sample.open : sample.place;
  const label = sample.placed ? "Open camera" : "Try this sample";
  return `
    <article class="ox-sample">
      <img src="${esc(sample.image)}" alt="${esc(sample.alt)}">
      <div class="ox-sample-body">
        <p>Image tracking sample</p>
        <h3>${esc(sample.title)}</h3>
        <div class="ox-sample-actions">
          <button type="button" data-action="${action}">${label}</button>
          <button type="button" data-action="${sample.show}">${esc(sample.showLabel)}</button>
          ${sample.href ? `<a href="${esc(sample.href)}">View experience</a>` : ""}
        </div>
      </div>
    </article>`;
}

function experienceCard(set) {
  const target = (set.targets || []).find((item) => item.imageBlob);
  const thumb = target ? urlFor(target.imageBlob) : "";
  return `
    <article class="ox-sample">
      ${thumb
        ? `<img src="${esc(thumb)}" alt="">`
        : `<div class="ox-sample-empty" aria-hidden="true">${esc(String(set.name || "E").charAt(0).toUpperCase())}</div>`}
      <div class="ox-sample-body">
        <p>Your experience · ${esc(statusLabel(set))}</p>
        <h3>${esc(set.name || "Untitled experience")}</h3>
        <div class="ox-metrics">${esc(metricLine(set))}</div>
        <div class="ox-sample-actions">
          ${isActive(set) ? `<button type="button" data-action="camera" data-id="${esc(set.id)}">Open camera</button>` : ""}
          <button type="button" data-action="edit" data-id="${esc(set.id)}">Edit</button>
          <button type="button" data-action="copy-code" data-id="${esc(set.id)}">${state.copiedId === set.id && state.copiedOk ? "Copied" : "Copy code"}</button>
        </div>
      </div>
    </article>`;
}

function renderLibrary() {
  const shown = visibleSets();
  const samples = sampleProjects();
  const searching = Boolean(query);
  view.innerHTML = `
    <div class="ox-explore">
      <p class="ox-page">Explore Horseradish</p>
      ${state.error ? `<p class="ai-error" role="alert">${esc(state.error)}</p>` : ""}
      ${searching ? "" : `
        <div class="ox-hero">
          <article class="ox-start">
            <div class="ox-start-copy">
              <h2>Start building</h2>
              <p>Explore the basics of the studio.</p>
              <button type="button" class="ox-play" data-action="new-set">Start</button>
            </div>
            <video src="create.mp4" muted playsinline loop autoplay></video>
          </article>
          <div class="ox-hero-side">
            <article class="ox-side">
              <div>
                <h3>Works in the browser</h3>
                <p>Point a phone at the picture. The model appears on it.</p>
                <button type="button" class="ox-play ox-play-light" data-action="show-marvins">Show the sign</button>
              </div>
              <img src="${esc(MARVINS.signUrl)}" alt="Marvin's sign">
            </article>
            <article class="ox-side ox-talk">
              <div>
                <h3>Talk to Horseradish</h3>
                <p>The owner is the person inside. Send the work.</p>
              </div>
              <a class="ox-outline" href="contact.html">Let's talk</a>
            </article>
          </div>
        </div>`}
      <section class="ox-block">
        <div class="ox-section-head">
          <div>
            <h2>${searching ? "Matching samples" : "Sample projects are ready to try"}</h2>
            <p>Show the picture on one screen. Open the camera on another.</p>
          </div>
        </div>
        ${samples.length
          ? `<div class="ox-samples">${samples.map(sampleCard).join("")}</div>`
          : `<p class="ox-empty">No samples match that search.</p>`}
      </section>
      ${searching ? "" : `
        <section class="ox-block">
          <h2 class="ox-block-title">Getting started</h2>
          <article class="ox-guide">
            <div>
              <h2>What can you do with Horseradish?</h2>
              <p>Point a camera at the object. What it opens is impressed on the screen, and the tally moves.</p>
              <button type="button" class="ox-play" data-action="new-set">Start</button>
            </div>
            <img src="${esc(MARVINS.signUrl)}" alt="Marvin's sign, the picture the camera recognizes">
          </article>
        </section>
        <section class="ox-block">
          <h2 class="ox-block-title">Studio steps</h2>
          <div class="ox-steps">
            <button type="button" data-action="new-set">
              <span>Opens</span>
              <small>A link, an animation, a 3D model, or an image overlay.</small>
            </button>
            <button type="button" data-action="new-set">
              <span>Object</span>
              <small>Add the photo the camera should recognize.</small>
            </button>
            <button type="button" data-action="new-set">
              <span>Place</span>
              <small>Sit what it opens on the object.</small>
            </button>
            <button type="button" data-action="new-set">
              <span>Publish</span>
              <small>Open the camera and point it at that picture.</small>
            </button>
          </div>
        </section>`}
      <section class="ox-block">
        <div class="ox-section-head">
          <div>
            <h2>Your experiences</h2>
            <p>${shown.length ? "Open a camera, edit a scene, or copy the embed code." : "Create a scene and it lands here."}</p>
          </div>
          <button type="button" class="ox-outline" data-action="new-set">New scene</button>
        </div>
        <p class="ox-measure-note">${MEASURE_NOTE}</p>
        ${shown.length
          ? `<div class="ox-samples">${shown.map(experienceCard).join("")}</div>`
          : `<p class="ox-empty">${searching ? "No experiences match that search." : "No experiences yet."}</p>`}
        ${state.copiedId && !state.copiedOk ? `<pre class="ai-code" id="ai-code">${esc(state.copiedCode || "")}</pre><p class="ox-empty">The browser blocked automatic copy. The code above is selected.</p>` : ""}
      </section>
    </div>`;
}

function sceneReady() {
  return Boolean(state.scene && state.scene.image && String(state.scene.name || "").trim());
}

function libraryChoices() {
  const rows = [
    { id: "marvins", label: "Marvins sign" },
    { id: "sample", label: "Sample card" },
  ];
  state.sets.forEach((set) => {
    const target = (set.targets || []).find((item) => item.imageBlob);
    if (!target) return;
    rows.push({ id: `set:${set.id}`, label: `${set.name || "Experience"} · ${target.name || "Picture"}` });
  });
  return rows;
}

function renderScene() {
  const scene = state.scene || { name: "My scene", picker: false, help: false, image: null };
  const preview = scene.image ? urlFor(scene.image.blob) : "";
  const choices = libraryChoices();
  view.innerHTML = `
    <form class="ox-scene">
      <h1>Let's add a new scene</h1>
      <p class="ox-scene-lead">Where do you want the content of your AR scene to appear?<br>On a recognisable image, or anywhere in front of the user.</p>
      ${state.error ? `<p class="ai-error" role="alert">${esc(state.error)}</p>` : ""}
      <div class="ox-modes">
        <div class="ox-mode is-on">
          <div class="ox-mode-art ox-mode-image">
            <span class="ox-frame"></span>
            <span class="ox-object"></span>
            <button type="button" class="ox-q" data-action="scene-help" aria-expanded="${scene.help ? "true" : "false"}" aria-label="What's this?">?</button>
          </div>
          <div class="ox-mode-foot">
            <span>Image</span>
            <span class="ox-check" aria-hidden="true"></span>
          </div>
        </div>
        <div class="ox-mode">
          <div class="ox-mode-art ox-mode-surface">
            <span class="ox-floor"></span>
            <span class="ox-prop"></span>
          </div>
          <div class="ox-mode-foot">
            <span>Surface</span>
            <span class="ox-radio" aria-hidden="true"></span>
          </div>
        </div>
      </div>
      ${scene.help ? `<p class="ox-help">The camera looks for this picture, then places the model on it.</p>` : ""}
      <div class="ox-label-row">
        <label for="ox-scene-name">Scene name</label>
        <span class="ox-required">Required field</span>
      </div>
      <input id="ox-scene-name" data-field="scene-name" value="${esc(scene.name)}" maxlength="60" autocomplete="off">
      <div class="ox-label-row">
        <p id="ox-image-label">Image to trigger AR content</p>
      </div>
      <div class="ox-drop${scene.image ? " has-image" : ""}" id="ox-drop">
        ${preview
          ? `<img src="${esc(preview)}" alt="">
             <p>${esc(scene.image.label || "Picture")}</p>
             <button type="button" data-action="scene-upload">Replace image</button>`
          : `<button type="button" data-action="scene-library"><strong>Select image</strong> from library</button>
             <button type="button" data-action="scene-upload"><strong>upload</strong> from file</button>
             <p>or drop here to upload</p>`}
      </div>
      ${scene.picker ? `
        <div class="ox-library" role="listbox" aria-label="Image library">
          ${choices.map((choice) => `<button type="button" data-action="scene-choose" data-id="${esc(choice.id)}">${esc(choice.label)}</button>`).join("")}
        </div>` : ""}
      <button type="submit" class="ox-go" ${sceneReady() ? "" : "disabled"}>Create project &amp; AR scene</button>
    </form>`;
}

function renderLogs() {
  view.innerHTML = `
    <div class="os-head">
      <div>
        <h1>Logs</h1>
        <p>When an experience was created, compiled, and appeared on a screen.</p>
      </div>
    </div>
    ${state.error ? `<p class="ai-error" role="alert">${esc(state.error)}</p>` : ""}
    <ul class="os-panel os-activity">${activityList()}</ul>`;
}

function modifierFields(set) {
  const type = modifierType(set);
  const source = modifierSource(set);
  if (type === "link") {
    return `
      <label class="ai-name">
        <span class="os-field-label">Link</span>
        <input data-field="href" type="text" inputmode="url" placeholder="https:// or a download link" value="${esc(source.href || "")}" autocomplete="off">
      </label>
      <label class="ai-name">
        <span class="os-field-label">Label</span>
        <input data-field="link-label" value="${esc(source.linkLabel || "")}" maxlength="80" placeholder="Download" autocomplete="off">
      </label>`;
  }
  if (type === "animation") {
    return `
      <div class="ai-stack">
        <button type="button" class="os-create" data-action="pick-animation">${source.animationName ? "Replace animation" : "Upload animation"}</button>
        ${source.animationName ? `<p class="os-hint">${esc(source.animationName)}</p>` : `<p class="os-hint">Use an mp4 or webm.</p>`}
      </div>`;
  }
  if (type === "model") {
    const name = set.glb?.name || source.modelName || "";
    return `
      <div class="ai-stack">
        <button type="button" class="os-create" data-action="pick-model">${name ? "Replace .glb" : "Upload .glb"}</button>
        ${name ? `<p class="os-hint">${esc(name)}</p>` : ""}
      </div>`;
  }
  if (type === "image") {
    const picture = source.imageBlob ? `<img class="ai-mini" src="${esc(urlFor(source.imageBlob))}" alt="">` : "";
    return `
      <div class="ai-actions">
        ${picture || `<span class="os-hint">No overlay yet</span>`}
        <button type="button" class="os-ghost" data-action="pick-image">${source.imageBlob ? "Replace overlay" : "Choose overlay"}</button>
      </div>`;
  }
  return "";
}

function lineMarkup(set) {
  const station = LINE.some((item) => item.id === state.station) ? state.station : "opens";
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
  const station = LINE.some((item) => item.id === state.station) ? state.station : "opens";
  const current = selectedTarget();
  const chosen = modifierType(set);
  if (station === "opens") {
    const choices = MODIFIERS.map((item) => `
      <button type="button" class="os-ghost" data-action="modifier" data-type="${item.id}" aria-pressed="${chosen === item.id}">${item.name}</button>
    `).join("");
    return `
      <section class="os-panel ai-station">
        <p class="os-kicker">1 · Opens</p>
        <h2>What does the object open?</h2>
        <p>A link, an animation, a 3D model, or an image overlay. The tally counts when it is impressed on a screen.</p>
        <div class="ai-chips" role="group" aria-label="What it opens">${choices}</div>
        ${modifierFields(set)}
        <button type="button" class="os-ghost" data-action="station" data-station="target" data-advance="1">Next: the object</button>
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
        <h2>Add the object the camera should recognize.</h2>
        <p>Use a clear picture of the portrait, sign, or thing. The same photo is saved to your account.</p>
        <div class="ai-sign-list" id="ai-sign-list">${signs || `<p class="os-hint">No photo yet.</p>`}</div>
        <div class="ai-stack">
          <button type="button" class="os-create" data-action="add-signs">Add image</button>
          <button type="button" class="os-ghost" data-action="use-demo">Use the test image</button>
          <button type="button" class="os-ghost" data-action="station" data-station="place" data-advance="1">Next: place</button>
        </div>
      </section>`;
  }
  if (station === "place") {
    return `
      <section class="ai-station">
        <p class="os-kicker">3 · Place</p>
        <h2>Sit it on the object.</h2>
        <p>Slide it across the photo and set the size until it sits where you want it.</p>
        <div class="ai-preview" id="ai-preview"></div>
        ${current ? `
          <div class="ai-controls">
            <label>Across <input data-field="shift-x" type="range" min="-0.4" max="0.4" step="0.02" value="${clampShift(current.replacement.shiftX)}"></label>
            <label>Up <input data-field="shift-y" type="range" min="-0.4" max="0.4" step="0.02" value="${clampShift(current.replacement.shiftY)}"></label>
            <label>Size <input data-field="scale" type="range" min="0.35" max="1.6" step="0.05" value="${clampScale(current.replacement.scale)}"></label>
          </div>` : `<p class="os-hint">Add a photo first.</p>`}
        <button type="button" class="os-ghost" data-action="station" data-station="publish" data-advance="1">Next: publish</button>
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
        <div class="ox-metrics">${esc(metricLine(set))}</div>
      </div>
      <button type="button" class="os-ghost" data-action="back-library">Back</button>
    </div>
    <p class="ox-measure-note">${MEASURE_NOTE}</p>
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

function showOpenLink(specs) {
  const open = document.getElementById("ai-hud-open");
  if (!open) return;
  const found = (specs || []).find((spec) => state.found.has(spec.name) && spec.replacement?.type === "link" && httpUrl(spec.replacement.href));
  if (!found) {
    open.hidden = true;
    open.removeAttribute("href");
    return;
  }
  open.hidden = false;
  open.href = httpUrl(found.replacement.href);
  open.textContent = found.replacement.linkLabel || "Open link";
}

async function launch(mindUrl, specs, set) {
  endSession();
  beginSession(set);
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
      state.found.add(name);
      noteFound(name);
      showOpenLink(specs);
      setHud([...state.found].join(" · "), true);
      document.getElementById("ai-hud-hint").textContent = "Keep the object in view. The tally moves while it stays on screen.";
    },
    onLost: (name) => {
      state.found.delete(name);
      noteLost(name);
      showOpenLink(specs);
      if (state.found.size === 0) {
        setHud("Looking for a known sign", false);
        document.getElementById("ai-hud-hint").textContent = "Fill the frame with the sign and hold it steady.";
      } else {
        setHud([...state.found].join(" · "), true);
      }
    },
    onReady: () => {
      noteReady();
      if (state.found.size === 0) setHud("Looking for a known sign", false);
    },
    onError: () => {
      state.error = "The camera did not start. Allow camera access and try again.";
      exitStage();
    },
  });
}

function exitStage() {
  endSession();
  showOpenLink([]);
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
  await launch(mindUrl, set.targets.map((target) => specFrom(target, freshUrl)), set);
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
    stampModifier(state.draft, target);
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
      type: "link",
      href: new URL("index.html", location.href).href,
      linkLabel: "First Light",
    },
  };
  const set = {
    id: crypto.randomUUID(),
    name: "First Light",
    demo: DEMO_ID,
    updated: Date.now(),
    mindDirty: false,
    mindBlob: await tracking.blob(),
    modifierType: "link",
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
    state.scene = null;
    state.view = "library";
    render();
    return;
  }

  if (action === "back-display") {
    leaveDisplay();
    return;
  }

  if (action === "new-set") {
    openScene();
    return;
  }

  if (action === "show-library") {
    state.scene = null;
    state.error = "";
    state.view = "library";
    markNav("models");
    render();
    return;
  }

  if (action === "scene-help") {
    if (!state.scene) return;
    state.scene.help = !state.scene.help;
    render();
    return;
  }

  if (action === "scene-library") {
    if (!state.scene) return;
    state.scene.picker = !state.scene.picker;
    render();
    return;
  }

  if (action === "scene-choose") {
    await chooseSceneImage(id);
    return;
  }

  if (action === "edit") {
    state.draft = state.sets.find((set) => set.id === id) || null;
    state.selectedId = state.draft?.targets[0]?.id || null;
    state.station = state.draft ? stationFor(state.draft) : "opens";
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
    if (!state.draft) return;
    if (!stationReached(state.draft, next)) {
      state.error = stationBlock(state.draft, next);
      render();
      return;
    }
    if (modifierType(state.draft) === "link") {
      const href = httpUrl(modifierSource(state.draft).href);
      if (href) setModifier(state.draft, { href });
    }
    state.station = next;
    state.error = "";
    if (next === "place" || next === "publish") await ensureAR();
    render();
    return;
  }

  if (action === "modifier") {
    const type = button.dataset.type;
    if (!state.draft || !MODIFIERS.some((item) => item.id === type)) return;
    setModifier(state.draft, { type });
    state.error = "";
    await saveSet(state.draft, owner);
    upsert(state.draft);
    render();
    return;
  }

  if (action === "pick-animation") {
    document.getElementById("ai-rep-animation")?.click();
    return;
  }
  if (action === "pick-image") document.getElementById("ai-rep-image").click();
  if (action === "pick-model") document.getElementById("ai-rep-model").click();
}

function onInput(event) {
  const field = event.target.dataset.field;
  if (field === "scene-name" && state.scene) {
    state.scene.name = event.target.value.slice(0, 60);
    const go = view.querySelector(".ox-go");
    if (go) go.disabled = !sceneReady();
    return;
  }
  if (!field || !state.draft) return;
  if (field === "set-name") {
    state.draft.name = event.target.value.slice(0, 60);
    queueSave();
    return;
  }
  if (field === "href" || field === "link-label") {
    const current = modifierSource(state.draft);
    setModifier(state.draft, {
      type: "link",
      href: field === "href" ? event.target.value.trim() : (current.href || ""),
      linkLabel: field === "link-label" ? event.target.value.slice(0, 80) : (current.linkLabel || ""),
    });
    queueSave();
    paintStations();
    if (modifierReady(state.draft) && state.error) {
      state.error = "";
      const alert = view.querySelector(".ai-error");
      if (alert) alert.remove();
    }
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
  picture: { type: "image", name: "Image overlay" },
  model: { type: "model", name: "3D model" },
  link: { type: "link", name: "Link" },
  animation: { type: "animation", name: "Animation" },
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
  state.station = "opens";
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
  };
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
    modifierType: look.type,
    targets: [target],
    owner,
  };
  pushEvent(set, "created");
  await saveSet(set, owner);
  upsert(set);
  state.draft = set;
  state.selectedId = target.id;
  state.station = modifierReady(set) ? "target" : "opens";
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

function openScene() {
  state.sceneReturn = state.view === "projects" ? "projects" : "library";
  state.scene = { name: "My scene", picker: false, help: false, image: null };
  state.error = "";
  state.view = "scene";
  render();
  const input = document.getElementById("ox-scene-name");
  if (input) {
    input.focus();
    input.select();
  }
}

async function rememberSceneImage(blob, width, height, label) {
  if (!state.scene) return;
  state.scene.image = { blob, width, height, label };
  state.scene.picker = false;
  state.error = "";
  render();
}

async function chooseSceneImage(id) {
  if (!state.scene || !id) return;
  if (id.startsWith("set:")) {
    const set = state.sets.find((item) => item.id === id.slice(4));
    const target = set && (set.targets || []).find((item) => item.imageBlob);
    if (!target) return;
    await rememberSceneImage(target.imageBlob, target.width, target.height, target.name || "Picture");
    return;
  }
  const url = id === "marvins" ? MARVINS.signUrl : SAMPLE.signUrl;
  const label = id === "marvins" ? "Marvins sign" : "Sample card";
  showBusy("Loading that picture…", null);
  const response = await fetch(url);
  if (!response.ok) throw new Error("That picture could not load. Check your connection and try again.");
  const blob = await response.blob();
  const image = await blobToImage(blob);
  hideBusy();
  await rememberSceneImage(blob, image.naturalWidth, image.naturalHeight, label);
}

async function takeSceneFile(file) {
  if (!state.scene || !file) return;
  if (!isImageFile(file)) throw new Error("Choose a JPEG, PNG, or WebP.");
  showBusy("Preparing the picture…", null);
  const image = await fileToSign(file);
  hideBusy();
  await rememberSceneImage(image.blob, image.width, image.height, prettyName(file.name));
}

async function createScene() {
  const scene = state.scene;
  if (!scene || !scene.image || !String(scene.name || "").trim()) return;
  const set = {
    id: crypto.randomUUID(),
    name: scene.name.trim().slice(0, 60),
    updated: Date.now(),
    mindDirty: true,
    mindBlob: null,
    targets: [],
    owner,
  };
  const target = {
    id: crypto.randomUUID(),
    name: scene.image.label || "Target image",
    width: scene.image.width,
    height: scene.image.height,
    featureCount: null,
    imageBlob: scene.image.blob,
    replacement: defaultReplacement(),
  };
  set.targets.push(target);
  state.draft = set;
  state.selectedId = target.id;
  state.station = "opens";
  state.error = "";
  pushEvent(set, "created");
  showBusy("Saving the photo to your account…", null);
  await saveSet(set, owner);
  state.scene = null;
  upsert(set);
  try {
    await publishLocalPhotos();
  } catch (error) {
    state.error = message(error);
  }
  hideBusy();
  state.view = "editor";
  render();
}

function projects() {
  markNav("projects");
  if (state.view === "stage") {
    state.returnView = "projects";
    exitStage();
    return;
  }
  if (state.view === "projects") return;
  state.displaySample = false;
  state.displayMarvins = false;
  state.scene = null;
  state.error = "";
  state.view = "projects";
  render();
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
  state.scene = null;
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
  state.scene = null;
  state.error = "";
  state.view = "logs";
  render();
}

function search(value) {
  query = String(value || "").trim().toLowerCase();
  if (state.view === "stage") return;
  state.displaySample = false;
  state.scene = null;
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
    if (action === "pick-animation") {
      document.getElementById("ai-rep-animation")?.click();
      return;
    }
    if (action === "pick-model") {
      document.getElementById("ai-rep-model")?.click();
      return;
    }
    if (action === "scene-upload") {
      document.getElementById("ai-scene-file")?.click();
      return;
    }
    onClick(event).catch(fail);
  });
  view.addEventListener("submit", (event) => {
    if (!(event.target instanceof HTMLFormElement) || !event.target.classList.contains("ox-scene")) return;
    event.preventDefault();
    createScene().catch(fail);
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
    if (state.view === "scene") {
      event.preventDefault();
      document.getElementById("ox-drop")?.classList.add("is-dropping");
      return;
    }
    if (state.view !== "editor") return;
    event.preventDefault();
    document.getElementById("ai-sign-list")?.classList.add("is-dropping");
  });
  view.addEventListener("dragleave", () => {
    document.getElementById("ox-drop")?.classList.remove("is-dropping");
    document.getElementById("ai-sign-list")?.classList.remove("is-dropping");
  });
  view.addEventListener("drop", (event) => {
    if (state.view === "scene") {
      event.preventDefault();
      document.getElementById("ox-drop")?.classList.remove("is-dropping");
      const file = event.dataTransfer?.files?.[0];
      if (file) takeSceneFile(file).catch(fail);
      return;
    }
    if (state.view !== "editor") return;
    event.preventDefault();
    document.getElementById("ai-sign-list")?.classList.remove("is-dropping");
    addFiles(event.dataTransfer.files).catch(fail);
  });
}

document.getElementById("ai-hud-exit")?.addEventListener("click", exitStage);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.view === "stage") exitStage();
  if (event.key === "Escape" && state.view === "scene") {
    const back = state.sceneReturn === "projects" ? "projects" : "library";
    state.scene = null;
    state.sceneReturn = "";
    state.error = "";
    state.view = back;
    markNav(back === "projects" ? "projects" : "models");
    render();
  }
});

document.getElementById("ai-scene-file")?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (file) takeSceneFile(file).catch(fail);
});

document.getElementById("ai-sign-files")?.addEventListener("change", (event) => {
  const files = [...(event.target.files || [])];
  event.target.value = "";
  if (files.length) addFiles(files).catch(fail);
});

document.getElementById("ai-rep-image")?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file || !state.draft) return;
  fileToPicture(file).then((image) => {
    setModifier(state.draft, { type: "image", imageBlob: image.blob });
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
    state.station = modifierReady(state.draft) && hasTarget(state.draft) ? state.station : "opens";
    state.error = "";
    return saveSet(state.draft, owner).then(upsert).then(() => render());
  }).catch(fail);
});

document.getElementById("ai-rep-animation")?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file || !state.draft) return;
  const name = file.name || "animation.mp4";
  const video = file.type === "video/mp4" || file.type === "video/webm" || /\.(mp4|webm)$/i.test(name);
  if (!video) {
    fail(new Error("Use an mp4 or webm animation."));
    return;
  }
  if (file.size > 40_000_000) {
    fail(new Error("That animation is over 40 MB. Export a smaller file."));
    return;
  }
  setModifier(state.draft, { type: "animation", animationBlob: file, animationName: name });
  state.error = "";
  saveSet(state.draft, owner).then(upsert).then(() => render()).catch(fail);
});

window.HorseradishAfterImage = { open, home, logs, search, projects };
document.dispatchEvent(new Event("afterimage-ready"));
