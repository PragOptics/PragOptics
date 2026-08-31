// src/components/modelViewer.js
// Zero-dependency 3D model viewer for the real shipping print files.
// Renders STL (ASCII + binary) and 3MF directly in the browser — no three.js,
// no CDN, nothing stale: the viewer shows the exact bytes a builder downloads.
//
//  - STL: parsed straight off the ArrayBuffer (84-byte header + 50 B/triangle,
//    with an ASCII fallback).
//  - 3MF: it's a ZIP of XML. The central directory is walked by hand and the
//    3dmodel.model entry is inflated with the browser-native
//    DecompressionStream('deflate-raw') — build items, component references,
//    and 3MF row-major 4×3 transforms are honored.
//  - Rendering: raw WebGL, flat-shaded with an emerald key light and cool rim
//    to match the site. Slicer files are Z-up; the camera basis converts to
//    Y-up so parts stand upright. Auto-orbits; drag to rotate.
//
// createModelViewer(host, sources, opts?) -> { load(index), destroy() }
//   sources: [{ label, href }]  (format inferred from the extension)
// parseSTL / parse3MF are exported for reuse (community builds, tests).

const VERT = `
attribute vec3 aPos;
attribute vec3 aNrm;
uniform mat4 uMVP;
uniform mat3 uRot;
varying vec3 vN;
varying vec3 vP;
void main(){
  vN = uRot * aNrm;
  vP = (uMVP * vec4(aPos, 1.0)).xyz;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec3 vN;
varying vec3 vP;
void main(){
  vec3 n = normalize(vN);
  vec3 key = normalize(vec3(0.5, 0.75, 0.6));
  vec3 fill = normalize(vec3(-0.6, 0.2, -0.5));
  float kd = max(dot(n, key), 0.0);
  float fd = max(dot(n, fill), 0.0) * 0.35;
  float rim = pow(1.0 - abs(n.z), 2.2) * 0.35;
  vec3 base = vec3(0.086, 0.36, 0.30);          /* emerald body */
  vec3 lit  = base * (0.30 + 0.85 * kd + fd);
  vec3 rimC = vec3(0.01, 0.99, 0.85) * rim;     /* #03FCDA rim */
  gl_FragColor = vec4(lit + rimC, 1.0);
}`;

/* ------------------------------ math ------------------------------ */

function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
}

function mat4Multiply(a, b) { // column-major a*b
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}

/* ----------------------------- parsers ----------------------------- */

function computeFlatNormals(positions) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i],     ay = positions[i + 1], az = positions[i + 2];
    const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5];
    const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (let k = 0; k < 3; k++) { normals[i + k * 3] = nx; normals[i + k * 3 + 1] = ny; normals[i + k * 3 + 2] = nz; }
  }
  return normals;
}

export function parseSTL(buffer) {
  const head = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(512, buffer.byteLength)));
  if (/^\s*solid/.test(head) && head.includes('facet')) {
    // ASCII STL
    const text = new TextDecoder().decode(buffer);
    const nums = [];
    const re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
    let m;
    while ((m = re.exec(text))) nums.push(+m[1], +m[2], +m[3]);
    const positions = new Float32Array(nums);
    return { positions, normals: computeFlatNormals(positions) };
  }
  // binary STL
  const dv = new DataView(buffer);
  const tris = dv.getUint32(80, true);
  const expected = 84 + tris * 50;
  if (buffer.byteLength < expected) throw new Error('Truncated STL');
  const positions = new Float32Array(tris * 9);
  const normals = new Float32Array(tris * 9);
  let needCompute = false;
  for (let t = 0; t < tris; t++) {
    const o = 84 + t * 50;
    const nx = dv.getFloat32(o, true), ny = dv.getFloat32(o + 4, true), nz = dv.getFloat32(o + 8, true);
    const flat = Math.abs(nx) + Math.abs(ny) + Math.abs(nz) < 1e-7;
    if (flat) needCompute = true;
    for (let v = 0; v < 3; v++) {
      const p = o + 12 + v * 12, j = t * 9 + v * 3;
      positions[j]     = dv.getFloat32(p, true);
      positions[j + 1] = dv.getFloat32(p + 4, true);
      positions[j + 2] = dv.getFloat32(p + 8, true);
      normals[j] = nx; normals[j + 1] = ny; normals[j + 2] = nz;
    }
  }
  return { positions, normals: needCompute ? computeFlatNormals(positions) : normals };
}

/* --- minimal ZIP reader: enough to pull 3D/3dmodel.model out of a 3MF --- */

async function zipExtract(buffer, entryMatch) {
  const dv = new DataView(buffer);
  const len = buffer.byteLength;
  // find End Of Central Directory (scan back through max comment length)
  let eocd = -1;
  for (let i = len - 22; i >= Math.max(0, len - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid 3MF (no ZIP directory)');
  let count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  // ZIP64 (slicer exports use it even for small archives): the 32-bit fields
  // hold 0xFFFFFFFF sentinels and the real values live in the ZIP64 EOCD.
  if (p === 0xFFFFFFFF || count === 0xFFFF) {
    const loc = eocd - 20;
    if (loc < 0 || dv.getUint32(loc, true) !== 0x07064b50) throw new Error('Corrupt 3MF (ZIP64 locator missing)');
    const z64 = Number(dv.getBigUint64(loc + 8, true));
    if (dv.getUint32(z64, true) !== 0x06064b50) throw new Error('Corrupt 3MF (ZIP64 directory missing)');
    count = Number(dv.getBigUint64(z64 + 32, true));
    p = Number(dv.getBigUint64(z64 + 48, true));
  }
  const td = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (p + 46 > len || dv.getUint32(p, true) !== 0x02014b50) break;
    const method   = dv.getUint16(p + 10, true);
    let compSize   = dv.getUint32(p + 20, true);
    const uncSize  = dv.getUint32(p + 24, true);
    const nameLen  = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const cmtLen   = dv.getUint16(p + 32, true);
    let localOff   = dv.getUint32(p + 42, true);
    const name = td.decode(new Uint8Array(buffer, p + 46, nameLen));
    // per-entry ZIP64 extra field (id 0x0001): 8-byte values appear in spec
    // order, but only for the fixed fields that carry the 0xFFFFFFFF sentinel
    if (compSize === 0xFFFFFFFF || localOff === 0xFFFFFFFF || uncSize === 0xFFFFFFFF) {
      let xp = p + 46 + nameLen;
      const xend = xp + extraLen;
      while (xp + 4 <= xend) {
        const id = dv.getUint16(xp, true), sz = dv.getUint16(xp + 2, true);
        if (id === 0x0001) {
          let vp = xp + 4;
          if (uncSize === 0xFFFFFFFF) vp += 8;
          if (compSize === 0xFFFFFFFF) { compSize = Number(dv.getBigUint64(vp, true)); vp += 8; }
          if (localOff === 0xFFFFFFFF) { localOff = Number(dv.getBigUint64(vp, true)); vp += 8; }
          break;
        }
        xp += 4 + sz;
      }
    }
    if (entryMatch(name)) {
      // local header: name/extra lengths there may differ from central ones
      const lNameLen  = dv.getUint16(localOff + 26, true);
      const lExtraLen = dv.getUint16(localOff + 28, true);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const slice = buffer.slice(start, start + compSize);
      if (method === 0) return slice;
      if (method === 8) {
        const ds = new DecompressionStream('deflate-raw');
        return await new Response(new Blob([slice]).stream().pipeThrough(ds)).arrayBuffer();
      }
      throw new Error('Unsupported 3MF compression');
    }
    p += 46 + nameLen + extraLen + cmtLen;
  }
  throw new Error('No model found inside the 3MF');
}

// 3MF transform attribute: 12 numbers, row-major 4×3, translation in the last
// row. Points transform as row vectors: p' = p · M.
function apply3mfTransform(m, x, y, z) {
  if (!m) return [x, y, z];
  return [
    x * m[0] + y * m[3] + z * m[6] + m[9],
    x * m[1] + y * m[4] + z * m[7] + m[10],
    x * m[2] + y * m[5] + z * m[8] + m[11]
  ];
}

export async function parse3MF(buffer) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('3MF preview needs a newer browser. Grab the download instead.');
  }
  const modelBuf = await zipExtract(buffer, n => /(^|\/)3dmodel\.model$/i.test(n) || /\.model$/i.test(n));
  const text = new TextDecoder().decode(modelBuf);

  // Honor the 3MF unit attribute — exporters vary (the lid ships in inches).
  // Everything is normalized to millimeters.
  const UNIT_MM = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };
  const unit = (text.match(/<model\b[^>]*\bunit="([^"]+)"/) || [])[1] || 'millimeter';
  const unitScale = UNIT_MM[unit.toLowerCase()] ?? 1;

  // Slicer-generated XML is regular and entity-free — a streaming regex pass
  // is ~10x faster than DOMParser on the multi-megabyte mesh sections.
  const attr = (s, name) => {
    const m = s.match(new RegExp('\\b' + name + '="([^"]*)"'));
    return m ? m[1] : null;
  };
  const parseTransform = (s) => {
    const t = attr(s, 'transform');
    return t ? t.trim().split(/\s+/).map(Number) : null;
  };

  // objects: id -> { verts, tris } | { components: [{objectid, transform}] }
  const objects = new Map();
  const objRe = /<object\b([^>]*)>([\s\S]*?)<\/object>/g;
  let om;
  while ((om = objRe.exec(text))) {
    const id = attr(om[1], 'id');
    if (!id) continue;
    const body = om[2];
    if (body.indexOf('<mesh') !== -1) {
      const verts = [];
      const vRe = /<vertex\b([^>]*?)\/?>/g;
      let vm;
      while ((vm = vRe.exec(body))) {
        verts.push(+attr(vm[1], 'x') || 0, +attr(vm[1], 'y') || 0, +attr(vm[1], 'z') || 0);
      }
      const tris = [];
      const tRe = /<triangle\b([^>]*?)\/?>/g;
      let tm;
      while ((tm = tRe.exec(body))) {
        tris.push(+attr(tm[1], 'v1') || 0, +attr(tm[1], 'v2') || 0, +attr(tm[1], 'v3') || 0);
      }
      objects.set(id, { verts: Float32Array.from(verts), tris: Uint32Array.from(tris) });
    } else {
      const comps = [];
      const cRe = /<component\b([^>]*?)\/?>/g;
      let cm;
      while ((cm = cRe.exec(body))) {
        comps.push({ objectid: attr(cm[1], 'objectid'), transform: parseTransform(cm[1]) });
      }
      if (comps.length) objects.set(id, { components: comps });
    }
  }

  const chunks = [];
  let total = 0;
  const emit = (o, transform) => {
    if (!o) return;
    if (o.components) {
      // one level of nesting is all real slicer exports use
      for (const c of o.components) emit(objects.get(c.objectid), c.transform || transform);
      return;
    }
    const { verts, tris } = o;
    const out = new Float32Array(tris.length * 3);
    for (let i = 0; i < tris.length; i++) {
      const vi = tris[i] * 3;
      const [x, y, z] = apply3mfTransform(transform, verts[vi], verts[vi + 1], verts[vi + 2]);
      out[i * 3] = x * unitScale; out[i * 3 + 1] = y * unitScale; out[i * 3 + 2] = z * unitScale;
    }
    chunks.push(out);
    total += out.length;
  };

  const items = [];
  const buildM = text.match(/<build\b[^>]*>([\s\S]*?)<\/build>/);
  if (buildM) {
    const iRe = /<item\b([^>]*?)\/?>/g;
    let im;
    while ((im = iRe.exec(buildM[1]))) {
      items.push({ objectid: attr(im[1], 'objectid'), transform: parseTransform(im[1]) });
    }
  }
  if (items.length) {
    for (const it of items) emit(objects.get(it.objectid), it.transform);
  } else {
    for (const o of objects.values()) emit(o, null);
  }
  if (!total) throw new Error('The 3MF contains no printable mesh');

  const positions = new Float32Array(total);
  let off = 0;
  for (const c of chunks) { positions.set(c, off); off += c.length; }
  return { positions, normals: computeFlatNormals(positions) };
}

/* ----------------------------- viewer ----------------------------- */

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function createModelViewer(host, sources, opts = {}) {
  host.classList.add('mv');
  const startIndex = opts.defaultIndex ?? 0;
  host.innerHTML = `
    <canvas class="mv-canvas" aria-label="Interactive 3D model preview"></canvas>
    ${sources.length > 1 ? `
    <div class="mv-pick" data-mv-pick>
      <button class="mv-pick-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
        <span class="mv-pick-label">${escapeHtml(sources[startIndex]?.label || '')}</span>
        <span class="mv-pick-caret" aria-hidden="true">▾</span>
      </button>
      <div class="mv-menu" hidden role="listbox" aria-label="Files to view">
        <span class="mv-menu-head">Choose a file to view</span>
        ${sources.map((s, i) =>
          `<button class="mv-item${i === startIndex ? ' is-active' : ''}" type="button" role="option"
                   aria-selected="${i === startIndex}" data-mv-src="${i}">${escapeHtml(s.label)}</button>`).join('')}
      </div>
    </div>` : ''}
    <div class="mv-status" hidden></div>
    <span class="mv-hint">drag to orbit</span>
  `;
  const canvas = host.querySelector('.mv-canvas');
  const status = host.querySelector('.mv-status');
  const pick = host.querySelector('[data-mv-pick]');
  const pickBtn = pick?.querySelector('.mv-pick-btn');
  const pickLabel = pick?.querySelector('.mv-pick-label');
  const pickMenu = pick?.querySelector('.mv-menu');

  // preserveDrawingBuffer: the canvas stays readable between frames (users can
  // right-click-save the view; tests can probe pixels). Tiny canvas — the
  // compositing cost is negligible.
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) {
    host.innerHTML = `<div class="mv-status">3D preview isn’t available in this browser${opts.fallbackImage ? '' : '.'}</div>` +
      (opts.fallbackImage ? `<img class="pm-sch-img" src="${escapeHtml(opts.fallbackImage)}" alt="Model preview">` : '');
    return { load() {}, destroy() {} };
  }

  // --- program ---
  const mk = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader error');
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, mk(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.enable(gl.DEPTH_TEST);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  const aNrm = gl.getAttribLocation(prog, 'aNrm');
  const uMVP = gl.getUniformLocation(prog, 'uMVP');
  const uRot = gl.getUniformLocation(prog, 'uRot');
  const posBuf = gl.createBuffer();
  const nrmBuf = gl.createBuffer();

  const state = {
    vertCount: 0,
    center: [0, 0, 0], radius: 1,
    theta: 0.7, phi: 0.42,
    lastInteract: 0,
    dragging: false,
    raf: 0, dead: false,
    abort: null,
    gen: 0
  };

  function setStatus(msg) {
    if (!status) return;
    status.hidden = !msg;
    status.textContent = msg || '';
  }

  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = host.clientWidth, h = host.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = Math.max(1, w * dpr);
      canvas.height = Math.max(1, h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
  }

  function upload({ positions, normals }) {
    // bounds
    let minX = 1e30, minY = 1e30, minZ = 1e30, maxX = -1e30, maxY = -1e30, maxZ = -1e30;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], y = positions[i + 1], z = positions[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    state.center = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
    state.radius = Math.max(1e-6, Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
    state.vertCount = positions.length / 3;
  }

  function drawScene() {
    fit();
    gl.clearColor(0.02, 0.027, 0.05, 1); // #05070d
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!state.vertCount) return;

    const ct = Math.cos(state.theta), st = Math.sin(state.theta);
    const cp = Math.cos(state.phi),  sp = Math.sin(state.phi);
    const s = 1 / state.radius;
    const [cx, cy, cz] = state.center;
    // M = Ry(theta) is applied AFTER Rx(-90) (Z-up -> Y-up), then Rx(phi) tilt,
    // then scale/center; composed here directly, column-major.
    const rotY = new Float32Array([ct, 0, -st, 0,  0, 1, 0, 0,  st, 0, ct, 0,  0, 0, 0, 1]);
    const rotXup = new Float32Array([1, 0, 0, 0,  0, 0, -1, 0,  0, 1, 0, 0,  0, 0, 0, 1]); // Rx(-90°)
    const tilt = new Float32Array([1, 0, 0, 0,  0, cp, sp, 0,  0, -sp, cp, 0,  0, 0, 0, 1]);
    const scaleCenter = new Float32Array([s, 0, 0, 0,  0, s, 0, 0,  0, 0, s, 0,
      -cx * s, -cy * s, -cz * s, 1]);
    let model = mat4Multiply(rotXup, scaleCenter);
    model = mat4Multiply(rotY, model);
    model = mat4Multiply(tilt, model);
    const view = new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, -0.04, -2.7, 1]);
    const proj = mat4Perspective(0.66, canvas.width / canvas.height, 0.05, 50);
    const mvp = mat4Multiply(proj, mat4Multiply(view, model));
    gl.uniformMatrix4fv(uMVP, false, mvp);
    // rotation part of the model matrix for normals
    gl.uniformMatrix3fv(uRot, false, new Float32Array([
      model[0] / s, model[1] / s, model[2] / s,
      model[4] / s, model[5] / s, model[6] / s,
      model[8] / s, model[9] / s, model[10] / s
    ]));
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
    gl.enableVertexAttribArray(aNrm);
    gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, state.vertCount);
  }

  let lastT = 0;
  function frame(t) {
    if (state.dead) return;
    if (!canvas.isConnected) { destroy(); return; }
    state.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;
    if (!state.dragging && t - state.lastInteract > 2500) state.theta += dt * 0.25;
    drawScene();
  }

  // --- interaction ---
  canvas.addEventListener('pointerdown', (e) => {
    state.dragging = true;
    state.lastInteract = performance.now();
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!state.dragging) return;
    state.theta += e.movementX * 0.008;
    state.phi = Math.max(-1.25, Math.min(1.35, state.phi + e.movementY * 0.006));
    state.lastInteract = performance.now();
  });
  const endDrag = () => { state.dragging = false; state.lastInteract = performance.now(); };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  async function load(index) {
    const src = sources[index];
    if (!src) return;
    const gen = ++state.gen;
    state.abort?.abort();
    const ac = new AbortController();
    state.abort = ac;
    setStatus(`Loading ${src.label}…`);
    try {
      // no-cache = always revalidate with the server, so a re-exported model
      // shows up immediately (304 + cached bytes when unchanged — still cheap).
      const res = await fetch(src.href, { signal: ac.signal, cache: 'no-cache' });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const buf = await res.arrayBuffer();
      if (gen !== state.gen || state.dead) return;
      setStatus('Building the mesh…');
      await new Promise(r => setTimeout(r, 30)); // let the status paint
      const mesh = /\.3mf(\?|$)/i.test(src.href) ? await parse3MF(buf) : parseSTL(buf);
      if (gen !== state.gen || state.dead) return;
      upload(mesh);
      setStatus('');
      drawScene(); // first frame immediately — no waiting on the rAF loop
    } catch (ex) {
      if (ac.signal.aborted || gen !== state.gen || state.dead) return;
      setStatus(ex?.message || 'Could not load this file.');
    }
  }

  // glass file picker — same container language as the download selectors
  function setMenuOpen(open) {
    if (!pickMenu) return;
    pickMenu.hidden = !open;
    pickBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function onDocDown(e) {
    if (pick && !pick.contains(e.target)) setMenuOpen(false);
  }
  function onDocKey(e) {
    if (e.key === 'Escape') setMenuOpen(false);
  }
  if (pick) {
    pickBtn.addEventListener('click', () => setMenuOpen(pickMenu.hidden));
    pickMenu.addEventListener('click', (e) => {
      const item = e.target.closest('[data-mv-src]');
      if (!item) return;
      const i = +item.dataset.mvSrc;
      pickMenu.querySelectorAll('.mv-item').forEach(el => {
        const on = el === item;
        el.classList.toggle('is-active', on);
        el.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (pickLabel) pickLabel.textContent = sources[i]?.label || '';
      setMenuOpen(false);
      load(i);
    });
    document.addEventListener('pointerdown', onDocDown);
    document.addEventListener('keydown', onDocKey);
  }

  function destroy() {
    if (state.dead) return;
    state.dead = true;
    state.abort?.abort();
    document.removeEventListener('pointerdown', onDocDown);
    document.removeEventListener('keydown', onDocKey);
    cancelAnimationFrame(state.raf);
    try {
      gl.deleteBuffer(posBuf); gl.deleteBuffer(nrmBuf); gl.deleteProgram(prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { /* context already gone */ }
  }

  state.raf = requestAnimationFrame(frame);
  load(startIndex);
  return { load, destroy };
}
