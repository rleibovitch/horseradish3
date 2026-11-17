const SHAPES = new Set(["beacon", "monolith", "orb", "portal", "lantern"]);

function box(width, height, depth) {
  const hx = width / 2;
  const hy = height / 2;
  const hz = depth / 2;
  const faces = [
    [[-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz], [0, 1, 0]],
    [[-hx, -hy, hz], [hx, -hy, hz], [hx, -hy, -hz], [-hx, -hy, -hz], [0, -1, 0]],
    [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz], [1, 0, 0]],
    [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz], [-1, 0, 0]],
    [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [0, 0, 1]],
    [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [0, 0, -1]],
  ];
  const positions = [];
  const normals = [];
  const indices = [];
  faces.forEach((face) => {
    const normal = face[4];
    const start = positions.length / 3;
    face.slice(0, 4).forEach((corner) => {
      positions.push(corner[0], corner[1], corner[2]);
      normals.push(normal[0], normal[1], normal[2]);
    });
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  });
  return { positions, normals, indices };
}

function cone(radius, height, segments = 40) {
  const positions = [];
  const normals = [];
  const indices = [];
  const tip = height / 2;
  const base = -height / 2;
  const slope = Math.hypot(radius, height) || 1;
  const rise = radius / slope;
  const run = height / slope;
  for (let index = 0; index < segments; index += 1) {
    const a0 = (index / segments) * Math.PI * 2;
    const a1 = ((index + 1) / segments) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    const normal = [Math.cos(mid) * run, rise, Math.sin(mid) * run];
    const start = positions.length / 3;
    positions.push(0, tip, 0, Math.cos(a0) * radius, base, Math.sin(a0) * radius, Math.cos(a1) * radius, base, Math.sin(a1) * radius);
    normals.push(...normal, ...normal, ...normal);
    indices.push(start, start + 1, start + 2);
  }
  const center = positions.length / 3;
  positions.push(0, base, 0);
  normals.push(0, -1, 0);
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    positions.push(Math.cos(angle) * radius, base, Math.sin(angle) * radius);
    normals.push(0, -1, 0);
  }
  for (let index = 0; index < segments; index += 1) {
    indices.push(center, center + 1 + ((index + 1) % segments), center + 1 + index);
  }
  return { positions, normals, indices };
}

function sphere(radius, latBands = 16, lngBands = 24) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let lat = 0; lat <= latBands; lat += 1) {
    const theta = (lat / latBands) * Math.PI;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    for (let lng = 0; lng <= lngBands; lng += 1) {
      const phi = (lng / lngBands) * Math.PI * 2;
      const x = Math.cos(phi) * sinT;
      const y = cosT;
      const z = Math.sin(phi) * sinT;
      normals.push(x, y, z);
      positions.push(radius * x, radius * y, radius * z);
    }
  }
  for (let lat = 0; lat < latBands; lat += 1) {
    for (let lng = 0; lng < lngBands; lng += 1) {
      const first = lat * (lngBands + 1) + lng;
      const second = first + lngBands + 1;
      indices.push(first, second, first + 1, second, second + 1, first + 1);
    }
  }
  return { positions, normals, indices };
}

function torus(ring, tube, major = 28, minor = 12) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let step = 0; step <= major; step += 1) {
    const phi = (step / major) * Math.PI * 2;
    const cosP = Math.cos(phi);
    const sinP = Math.sin(phi);
    for (let turn = 0; turn <= minor; turn += 1) {
      const theta = (turn / minor) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      normals.push(cosP * cosT, sinP * cosT, sinT);
      positions.push((ring + tube * cosT) * cosP, (ring + tube * cosT) * sinP, tube * sinT);
    }
  }
  for (let step = 0; step < major; step += 1) {
    for (let turn = 0; turn < minor; turn += 1) {
      const first = step * (minor + 1) + turn;
      const second = first + minor + 1;
      indices.push(first, second, first + 1, second, second + 1, first + 1);
    }
  }
  return { positions, normals, indices };
}

function shiftY(part, amount) {
  const positions = part.positions.slice();
  for (let index = 1; index < positions.length; index += 3) positions[index] += amount;
  return { positions, normals: part.normals.slice(), indices: part.indices.slice() };
}

function merge(parts) {
  const positions = [];
  const normals = [];
  const indices = [];
  let offset = 0;
  parts.forEach((part) => {
    positions.push(...part.positions);
    normals.push(...part.normals);
    part.indices.forEach((index) => indices.push(index + offset));
    offset += part.positions.length / 3;
  });
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
}

function geometry(shape) {
  if (shape === "monolith") return merge([box(0.28, 1, 0.28)]);
  if (shape === "orb") return merge([sphere(0.5)]);
  if (shape === "portal") return merge([torus(0.42, 0.07)]);
  if (shape === "lantern") {
    return merge([
      shiftY(box(0.46, 0.62, 0.46), -0.12),
      shiftY(cone(0.34, 0.36, 24), 0.4),
    ]);
  }
  return merge([cone(0.32, 1, 40)]);
}

function colorFactor(hex) {
  const value = /^#[0-9a-fA-F]{6}$/.test(hex || "") ? hex : "#ff5a1f";
  const number = Number.parseInt(value.slice(1), 16);
  return [((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255];
}

function bounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  return { min, max };
}

function padText(text, code) {
  const extra = (4 - (text.length % 4)) % 4;
  return extra ? text + code.repeat(extra) : text;
}

export function shapeGlb(shape, hex) {
  const mesh = geometry(SHAPES.has(shape) ? shape : "beacon");
  const { min, max } = bounds(mesh.positions);
  const positionBytes = mesh.positions.byteLength;
  const normalBytes = mesh.normals.byteLength;
  const indexBytes = mesh.indices.byteLength;
  const indexPad = (4 - (indexBytes % 4)) % 4;
  const binLength = positionBytes + normalBytes + indexBytes + indexPad;
  const color = colorFactor(hex);
  const json = {
    asset: { version: "2.0", generator: "horseradish" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    materials: [{
      doubleSided: true,
      pbrMetallicRoughness: {
        baseColorFactor: [...color, 1],
        metallicFactor: 0.12,
        roughnessFactor: 0.42,
      },
      emissiveFactor: shape === "lantern" ? color : [0, 0, 0],
    }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: 2,
        material: 0,
      }],
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: mesh.positions.length / 3, type: "VEC3", min, max },
      { bufferView: 1, componentType: 5126, count: mesh.normals.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: mesh.indices.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes, target: 34962 },
      { buffer: 0, byteOffset: positionBytes, byteLength: normalBytes, target: 34962 },
      { buffer: 0, byteOffset: positionBytes + normalBytes, byteLength: indexBytes, target: 34963 },
    ],
    buffers: [{ byteLength: binLength }],
  };
  const jsonText = padText(JSON.stringify(json), " ");
  const total = 12 + 8 + jsonText.length + 8 + binLength;
  const file = new Uint8Array(total);
  const view = new DataView(file.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonText.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  new TextEncoder().encodeInto(jsonText, file.subarray(20, 20 + jsonText.length));
  const binStart = 20 + jsonText.length;
  view.setUint32(binStart, binLength, true);
  view.setUint32(binStart + 4, 0x004e4942, true);
  const bin = binStart + 8;
  file.set(new Uint8Array(mesh.positions.buffer), bin);
  file.set(new Uint8Array(mesh.normals.buffer), bin + positionBytes);
  file.set(new Uint8Array(mesh.indices.buffer), bin + positionBytes + normalBytes);
  return new Blob([file], { type: "model/gltf-binary" });
}
