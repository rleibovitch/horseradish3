function el(tag, attrs = {}) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null && value !== false) {
      node.setAttribute(key, String(value));
    }
  }
  return node;
}

function addImage(assets, id, url) {
  if (!url) return null;
  const img = document.createElement("img");
  img.id = id;
  img.alt = "";
  img.src = url;
  if (/^https?:/i.test(url)) img.crossOrigin = "anonymous";
  assets.append(img);
  return { selector: `#${id}`, node: img };
}

function addPhotoPlane(parent, image, width, height, position) {
  const plane = el("a-plane", {
    width: String(width),
    height: String(height),
    position,
    material: "shader: flat; side: double; color: #f6f3ec",
  });
  parent.append(plane);
  const paint = () => plane.setAttribute("material", "src", image.selector);
  const ready = () => {
    if (!plane.isConnected) return;
    if (image.node.complete && image.node.naturalWidth) paint();
    else image.node.addEventListener("load", paint, { once: true });
  };
  requestAnimationFrame(ready);
  return plane;
}

function holdFrame(scene) {
  const drop = () => {
    if (scene.isConnected) document.documentElement.classList.remove("a-fullscreen");
  };
  drop();
  scene.addEventListener("loaded", drop);
  setTimeout(drop, 0);
  setTimeout(drop, 400);
}

function fitModel(model, userScale, shiftX = 0, shiftY = 0) {
  const mesh = model.getObject3D("mesh");
  const THREE = window.AFRAME?.THREE || window.THREE;
  model.object3D.position.set(shiftX, shiftY, 0);
  if (!mesh || !THREE) return;

  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.scale.set(1, 1, 1);
  mesh.updateMatrixWorld(true);

  const box = new THREE.Box3();
  const inverse = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
  mesh.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
    const local = child.geometry.boundingBox.clone();
    local.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, child.matrixWorld));
    box.union(local);
  });
  if (box.isEmpty()) return;

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const span = Math.max(size.x, size.y, 1e-5);
  let scale = userScale / span;
  if (size.z * scale > 0.55) scale = 0.55 / size.z;
  mesh.scale.setScalar(scale);
  mesh.position.set(-center.x * scale, -center.y * scale, -box.min.z * scale + 0.02);
}

function addVideo(assets, id, url) {
  if (!url) return null;
  const video = document.createElement("video");
  video.id = id;
  video.src = url;
  video.loop = true;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  if (/^https?:/i.test(url)) video.crossOrigin = "anonymous";
  assets.append(video);
  video.play().catch(() => {});
  return { selector: `#${id}`, node: video };
}

function buildContent(parent, assets, spec, index) {
  const aspect = spec.aspect > 0 ? spec.aspect : 1;
  const replacement = spec.replacement;
  const isModel = replacement.type === "model";
  const hide = !isModel && (replacement.type === "image" || replacement.hideSign);
  const showPhoto = Boolean(spec.preview || !hide);
  const sign = addImage(assets, `sign-${index}`, spec.preview || (!isModel && showPhoto) ? spec.signUrl : "");
  const shiftX = Number(replacement.shiftX) || 0;
  const shiftY = (Number(replacement.shiftY) || 0) * aspect;

  if (spec.preview) {
    parent.append(
      el("a-plane", {
        width: "1.06",
        height: String(aspect + 0.06),
        position: "0 0 -0.001",
        material: "shader: flat; side: double; color: #8d7764",
      }),
    );
  }

  if (spec.preview && sign) {
    addPhotoPlane(parent, sign, 1, aspect, "0 0 0.002");
  } else if (!isModel && hide) {
    parent.append(
      el("a-plane", {
        width: "1",
        height: String(aspect),
        position: "0 0 0.002",
        material: `shader: flat; side: double; color: ${replacement.plinth}`,
      }),
    );
  } else if (!isModel && sign) {
    addPhotoPlane(parent, sign, 1, aspect, "0 0 0.002");
  }

  if (replacement.type === "image") {
    const picture = addImage(assets, `picture-${index}`, replacement.imageUrl);
    const scale = replacement.scale;
    if (picture) {
      addPhotoPlane(parent, picture, scale, aspect * scale, "0 0 0.01");
    } else {
      parent.append(
        el("a-text", {
          value: "Add a picture",
          align: "center",
          color: "#f6f1e8",
          width: "1.4",
          position: "0 0 0.02",
        }),
      );
    }
    return;
  }

  if (replacement.type === "model") {
    if (!replacement.modelUrl) {
      parent.append(
        el("a-text", {
          value: "Add a .glb model",
          align: "center",
          color: "#f6f1e8",
          width: "1.5",
          position: "0 0 0.04",
        }),
      );
      return;
    }
    const model = el("a-gltf-model", { src: replacement.modelUrl });
    model.addEventListener("model-error", () => {
      const host = model.closest(".ai-preview");
      if (!host || host.querySelector(".ai-model-error")) return;
      const note = document.createElement("p");
      note.className = "ai-model-error";
      note.textContent = "That model did not open. Use a .glb with its textures packed inside.";
      host.append(note);
    });
    model.addEventListener("model-loaded", () => fitModel(model, replacement.scale, shiftX, shiftY));
    parent.append(model);
    return;
  }

  if (replacement.type === "link") {
    const scale = replacement.scale || 1;
    const label = String(replacement.linkLabel || replacement.href || "Add a link").slice(0, 80);
    parent.append(
      el("a-plane", {
        width: String(0.92 * scale),
        height: String(0.24 * scale),
        position: `${shiftX} ${shiftY} 0.02`,
        material: "shader: flat; side: double; color: #181a1b",
      }),
      el("a-text", {
        value: label,
        align: "center",
        color: "#f6f1e8",
        width: String(1.3 * scale),
        position: `${shiftX} ${shiftY} 0.03`,
        side: "double",
      }),
    );
    return;
  }

  if (replacement.type === "animation") {
    const scale = replacement.scale || 1;
    const clip = addVideo(assets, `clip-${index}`, replacement.animationUrl);
    if (!clip) {
      parent.append(
        el("a-text", {
          value: "Add an animation",
          align: "center",
          color: "#f6f1e8",
          width: "1.5",
          position: "0 0 0.04",
        }),
      );
      return;
    }
    parent.append(
      el("a-video", {
        src: clip.selector,
        width: String(scale),
        height: String(aspect * scale),
        position: `${shiftX} ${shiftY} 0.02`,
      }),
    );
    return;
  }

  if (replacement.type === "reflect") {
    const scale = replacement.scale || 1;
    const pieces = Array.isArray(replacement.catalogPieces) ? replacement.catalogPieces : [];
    const first = pieces.find((piece) => piece?.url)?.url || (replacement.catalogUrls || [])[0] || "";
    const picture = addImage(assets, `reflect-${index}`, first);
    if (picture) {
      addPhotoPlane(parent, picture, scale, aspect * scale, `${shiftX} ${shiftY} 0.02`);
    } else {
      parent.append(
        el("a-text", {
          value: "Upload the catalog",
          align: "center",
          color: "#f6f1e8",
          width: "1.5",
          position: "0 0 0.04",
        }),
      );
    }
    return;
  }

  parent.append(
    el("a-text", {
      value: "Choose a link, an animation, a model, an overlay, or a Reflect.",
      align: "center",
      color: "#f6f1e8",
      width: "1.4",
      position: "0 0 0.04",
    }),
  );
}

function addLights(scene) {
  scene.append(
    el("a-light", { type: "ambient", color: "#fff8f2", intensity: "2.2" }),
    el("a-light", { type: "directional", color: "#ffffff", intensity: "2.8", position: "0.4 0.9 1.3" }),
    el("a-light", { type: "directional", color: "#e7eeff", intensity: "1.1", position: "-0.7 0.3 0.8" }),
  );
}

function stopVideo(video) {
  video?.srcObject?.getTracks().forEach((track) => track.stop());
  video?.remove();
}

export function destroyScene(container) {
  const scene = container.querySelector("a-scene");
  const video = scene?.systems?.["mindar-image-system"]?.video;
  container.querySelectorAll("video").forEach((item) => item.pause());
  try {
    scene?.remove();
  } catch (error) {
    console.warn(error);
  }
  stopVideo(video);
  container.querySelectorAll("video").forEach(stopVideo);
}

function frameCamera(container, aspect) {
  const width = container.clientWidth || 640;
  const height = container.clientHeight || 360;
  const fov = 42;
  const tan = Math.tan((fov * Math.PI) / 360);
  const margin = 1.2;
  const distanceForHeight = (aspect * margin) / (2 * tan);
  const distanceForWidth = margin / (2 * tan * (width / height));
  return { fov, distance: Math.max(distanceForHeight, distanceForWidth, 0.8) };
}

export function mountPreview(container, spec) {
  destroyScene(container);
  const scene = document.createElement("a-scene");
  const aspect = spec.aspect > 0 ? spec.aspect : 1;
  const frame = frameCamera(container, aspect);
  scene.setAttribute("embedded", "true");
  scene.setAttribute("background", "color: #efeae2");
  scene.setAttribute("color-space", "sRGB");
  scene.setAttribute("renderer", "colorManagement: true; physicallyCorrectLights: true; antialias: true");
  scene.setAttribute("vr-mode-ui", "enabled: false");
  scene.setAttribute("device-orientation-permission-ui", "enabled: false");
  scene.setAttribute("loading-screen", "enabled: false");
  addLights(scene);

  const x = frame.distance * 0.16;
  const y = frame.distance * 0.06;
  const z = frame.distance;
  const yaw = Math.atan2(x, z) * 180 / Math.PI;
  const pitch = -Math.atan2(y, Math.hypot(x, z)) * 180 / Math.PI;
  const camera = el("a-camera", {
    fov: String(frame.fov),
    position: `${x} ${y} ${z}`,
    rotation: `${pitch} ${yaw} 0`,
    "look-controls": "enabled: false",
    "wasd-controls": "enabled: false",
  });
  const assets = document.createElement("a-assets");
  const root = document.createElement("a-entity");
  scene.append(camera, assets, root);
  buildContent(root, assets, { ...spec, preview: true }, 0);
  container.append(scene);
  holdFrame(scene);
}

export function mountAR(container, { mindUrl, specs, onFound, onLost, onReady, onError }) {
  destroyScene(container);
  const scene = document.createElement("a-scene");
  scene.setAttribute(
    "mindar-image",
    [
      `imageTargetSrc: ${mindUrl}`,
      `maxTrack: ${Math.max(1, specs.length)}`,
      "filterMinCF: 0.001",
      "filterBeta: 0.01",
      "uiLoading: no",
      "uiScanning: no",
      "uiError: no",
      "autoStart: true",
    ].join("; "),
  );
  scene.setAttribute("embedded", "true");
  scene.setAttribute("color-space", "sRGB");
  scene.setAttribute("renderer", "colorManagement: true; physicallyCorrectLights: true; alpha: true; antialias: true");
  scene.setAttribute("background", "color: #000000; transparent: true");
  scene.setAttribute("vr-mode-ui", "enabled: false");
  scene.setAttribute("device-orientation-permission-ui", "enabled: false");
  addLights(scene);
  scene.append(
    el("a-camera", {
      position: "0 0 0",
      "look-controls": "enabled: false",
      "wasd-controls": "enabled: false",
    }),
  );
  const assets = document.createElement("a-assets");
  scene.append(assets);

  specs.forEach((spec, index) => {
    const anchor = el("a-entity", { "mindar-image-target": `targetIndex: ${index}` });
    buildContent(anchor, assets, spec, index);
    anchor.addEventListener("targetFound", () => onFound(spec.name));
    anchor.addEventListener("targetLost", () => onLost(spec.name));
    scene.append(anchor);
  });

  scene.addEventListener("arReady", () => onReady());
  scene.addEventListener("arError", (event) => onError(event));
  container.append(scene);
  holdFrame(scene);
  return scene;
}
