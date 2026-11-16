import { destroyScene, mountPreview } from "./afterimage/stage.js";

const SAMPLE = "https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.5/examples/image-tracking/assets/card-example/card.png";
const AFRAME = "https://aframe.io/releases/1.6.0/aframe.min.js";

const LOOKS = {
  beacon: { label: "Beacon", tint: "#ff5a1f", plinth: "#1a1612" },
  monolith: { label: "Monolith", tint: "#ff5a1f", plinth: "#1a1612" },
  orb: { label: "Orb", tint: "#ff5a1f", plinth: "#1a1612" },
  portal: { label: "Portal", tint: "#ff5a1f", plinth: "#1a1612" },
  lantern: { label: "Lantern", tint: "#f6c56b", plinth: "#140e09" },
};

let current = "lantern";
let shown = false;
let loading = null;

function loadAframe() {
  if (window.AFRAME) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = AFRAME;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("The 3D preview could not load. Check the connection and try again."));
      document.head.appendChild(script);
    });
  }
  return loading;
}

function paintChoice() {
  document.querySelectorAll("[data-look-choice]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.lookChoice === current ? "true" : "false");
  });
  const name = document.getElementById("home-look-name");
  if (name && LOOKS[current]) name.textContent = LOOKS[current].label;
}

async function showPreview() {
  const status = document.getElementById("home-stage-status");
  const stage = document.getElementById("home-stage");
  const button = document.getElementById("home-preview");
  if (!stage || !LOOKS[current]) return;
  if (button) button.disabled = true;
  if (status) status.textContent = "Loading the 3D preview…";
  try {
    await loadAframe();
    const look = LOOKS[current];
    mountPreview(stage, {
      name: look.label,
      aspect: 0.552,
      signUrl: SAMPLE,
      replacement: {
        type: "object",
        preset: current,
        tint: look.tint,
        plinth: look.plinth,
        hideSign: true,
        scale: 1,
        imageUrl: "",
        modelUrl: "",
      },
    });
    shown = true;
    stage.hidden = false;
    document.getElementById("home-poster")?.setAttribute("hidden", "");
    if (status) {
      status.textContent = `${look.label}. Illustrative 3D preview of a built-in look. The camera stays off.`;
    }
  } catch (error) {
    destroyScene(stage);
    if (status) status.textContent = error.message || "The 3D preview could not load.";
  } finally {
    if (button) button.disabled = false;
  }
}

function menu() {
  const hamburger = document.querySelector(".hamburger-menu");
  const navMenu = document.querySelector(".nav-menu");
  if (!hamburger || !navMenu) return;

  function closeMenu() {
    hamburger.classList.remove("active");
    navMenu.classList.remove("open");
    hamburger.setAttribute("aria-expanded", "false");
    hamburger.setAttribute("aria-label", "Open menu");
  }

  hamburger.addEventListener("click", () => {
    const open = navMenu.classList.contains("open");
    if (open) {
      closeMenu();
      return;
    }
    hamburger.classList.add("active");
    navMenu.classList.add("open");
    hamburger.setAttribute("aria-expanded", "true");
    hamburger.setAttribute("aria-label", "Close menu");
  });

  navMenu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href") || "";
      if (href.startsWith("#")) {
        const target = document.getElementById(href.slice(1));
        if (target) {
          event.preventDefault();
          const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          const top = target.getBoundingClientRect().top + window.scrollY - 84;
          window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
        }
      }
      closeMenu();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
}

function sessionLabel() {
  const link = document.querySelector("[data-sign-in]");
  if (!link) return;
  fetch("/api/lab-session", { credentials: "same-origin", cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => {
      if (!body || !body.user) return;
      link.textContent = "Your experiences";
      link.href = "lab.html";
    })
    .catch(() => {});
}

menu();
paintChoice();
sessionLabel();

document.getElementById("home-preview")?.addEventListener("click", () => {
  showPreview();
});

document.querySelectorAll("[data-look-choice]").forEach((button) => {
  button.addEventListener("click", () => {
    const next = button.dataset.lookChoice;
    if (!LOOKS[next]) return;
    current = next;
    paintChoice();
    if (shown) showPreview();
  });
});

window.addEventListener("pagehide", () => {
  const stage = document.getElementById("home-stage");
  if (stage) destroyScene(stage);
});
