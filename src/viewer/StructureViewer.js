// ============================================================================
// StructureViewer: one three.js scene per option. Members are instanced meshes
// with instanced ink edges that share the member matrices, so outlines grow
// with the frame. Gridlines are drawn as chain lines (the drafting convention)
// that draw themselves in. Supports compare (scissor viewports), a quiet
// preview for the start screen, and thumbnails for the report.
// ============================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { buildGeometry } from '../engine/engine.js';
import { faceColor, edgeStyle, lookParams, BASE, PANEL_ROLES } from './palette.js';

const STRUCT_ROLES = ['footing', 'column', 'beam', 'girder', 'infill', 'brace', 'slab', 'roofslab', 'rafter', 'purlin', 'roofdeck'];
const ENV_ROLES = ['wall', 'glass', 'door'];
const SEE_THROUGH = new Set(['roofslab', 'roofdeck']);
const PREVIEW_ID = '__preview';
const WHITE = new THREE.Color('#ffffff');
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

// ---- unit geometries: length along X, depth along Y, width along Z
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_I = (() => {
  const s = new THREE.Shape();
  const tf = 0.11, tw = 0.14; // flange and web thickness in unit space
  s.moveTo(-0.5, -0.5); s.lineTo(0.5, -0.5); s.lineTo(0.5, -0.5 + tf); s.lineTo(tw / 2, -0.5 + tf);
  s.lineTo(tw / 2, 0.5 - tf); s.lineTo(0.5, 0.5 - tf); s.lineTo(0.5, 0.5); s.lineTo(-0.5, 0.5);
  s.lineTo(-0.5, 0.5 - tf); s.lineTo(-tw / 2, 0.5 - tf); s.lineTo(-tw / 2, -0.5 + tf); s.lineTo(-0.5, -0.5 + tf); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(0.5, 0, 0);
  g.computeVertexNormals();
  return g;
})();
const EDGE_ARRAYS = new Map([
  [UNIT_BOX, new THREE.EdgesGeometry(UNIT_BOX, 20).getAttribute('position').array],
  [UNIT_I, new THREE.EdgesGeometry(UNIT_I, 20).getAttribute('position').array],
]);

// ---- scratch
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _dir = new THREE.Vector3(), _ref = new THREE.Vector3();
const _ya = new THREE.Vector3(), _za = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _rq = new THREE.Quaternion();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function itemMatrix(it, p, out) {
  if (p <= 0.0001) return out.copy(ZERO);
  _a.fromArray(it.a); _b.fromArray(it.b);
  _dir.subVectors(_b, _a);
  const len = _dir.length();
  _dir.divideScalar(len || 1);
  if (Math.abs(_dir.y) > 0.99) _ref.set(1, 0, 0); else _ref.set(0, 1, 0);
  _za.crossVectors(_dir, _ref).normalize();
  _ya.crossVectors(_za, _dir).normalize();
  _m.makeBasis(_dir, _ya, _za);
  _q.setFromRotationMatrix(_m);
  if (it.roll) { _rq.setFromAxisAngle(_dir, it.roll); _q.premultiply(_rq); }
  const L = Math.max(1e-4, len * p);
  _p.copy(_a).addScaledVector(_dir, L / 2);
  _s.set(L, it.d, it.w);
  return out.compose(_p, _q, _s);
}

// ---- shaders -------------------------------------------------------------
// Instanced edges: the same mat4 attribute the InstancedMesh writes.
function makeEdgeMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color('#1d2327') }, uOpacity: { value: 0.8 } },
    vertexShader: /* glsl */ `
      attribute mat4 aInstance;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * aInstance * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        gl_FragColor = vec4(uColor, uOpacity);
        #include <colorspace_fragment>
      }`,
  });
}

// Drafting lines with a draw-on progress. Mode 0 is a chain line (long dash,
// dot), mode 1 a short dash, mode 2 solid. Distances are in metres.
function makeDraftMaterial({ mode = 0, color = '#1f4a8a', opacity = 0.8, scale = 1, window = 0.5 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uProgress: { value: 1 },
      uScale: { value: scale }, uMode: { value: mode }, uWindow: { value: window },
    },
    vertexShader: /* glsl */ `
      attribute float aDist;
      attribute float aLen;
      attribute float aDelay;
      varying float vDist;
      varying float vLen;
      varying float vDelay;
      void main() {
        vDist = aDist; vLen = aLen; vDelay = aDelay;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uProgress;
      uniform float uScale;
      uniform float uWindow;
      uniform int uMode;
      varying float vDist;
      varying float vLen;
      varying float vDelay;
      void main() {
        float p = clamp((uProgress - vDelay) / uWindow, 0.0, 1.0);
        if (vDist > vLen * p + 0.0001) discard;
        if (uMode == 0) {
          float t = mod(vDist, 1.56 * uScale) / uScale;
          if (!(t < 1.0 || (t > 1.22 && t < 1.34))) discard;
        } else if (uMode == 1) {
          float t = mod(vDist, 0.8 * uScale) / uScale;
          if (t > 0.48) discard;
        }
        gl_FragColor = vec4(uColor, uOpacity);
        #include <colorspace_fragment>
      }`,
  });
}

// segs: [{ a, b, d0?, total?, delay? }]. d0/total let a polyline draw as one stroke.
function draftGeometry(segs) {
  const n = segs.length;
  const pos = new Float32Array(n * 6), dist = new Float32Array(n * 2), len = new Float32Array(n * 2), del = new Float32Array(n * 2);
  segs.forEach((s, i) => {
    pos.set(s.a, i * 6); pos.set(s.b, i * 6 + 3);
    const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]);
    const d0 = s.d0 ?? 0;
    dist[i * 2] = d0; dist[i * 2 + 1] = d0 + L;
    len[i * 2] = len[i * 2 + 1] = s.total ?? L;
    del[i * 2] = del[i * 2 + 1] = s.delay ?? 0;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aDist', new THREE.BufferAttribute(dist, 1));
  g.setAttribute('aLen', new THREE.BufferAttribute(len, 1));
  g.setAttribute('aDelay', new THREE.BufferAttribute(del, 1));
  return g;
}

function makeGroundGrid() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: {
      uMinor: { value: new THREE.Color('#c9cfcf') }, uMajor: { value: new THREE.Color('#aab3b4') },
      uFade: { value: 60 }, uOpacity: { value: 0.55 }, uStep: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uMinor;
      uniform vec3 uMajor;
      uniform float uFade;
      uniform float uOpacity;
      uniform float uStep;
      varying vec3 vW;
      float line(vec2 p, float s) {
        vec2 q = p / s;
        vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
        return 1.0 - min(min(g.x, g.y), 1.0);
      }
      void main() {
        float d = length(vW.xz);
        float fade = 1.0 - smoothstep(uFade * 0.2, uFade, d);
        float mi = line(vW.xz, uStep) * 0.5;
        float ma = line(vW.xz, uStep * 5.0);
        vec3 c = mix(uMinor, uMajor, ma);
        gl_FragColor = vec4(c, max(mi, ma * 0.9) * fade * uOpacity);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  mesh.renderOrder = -1;
  return mesh;
}

const VIEW_DIRS = {
  iso: [Math.sin(0.68) * Math.cos(0.5), Math.sin(0.5), Math.cos(0.68) * Math.cos(0.5)],
  top: [0, 1, 0.0008],
  front: [0, 0.16, 1],
  side: [1, 0.16, 0],
};

export class StructureViewer {
  constructor(host, { onBuilt, onInteract, onHoverChange } = {}) {
    this.host = host;
    this.onBuilt = onBuilt || (() => {});
    this.onInteract = onInteract || (() => {});
    this.onHoverChange = onHoverChange || (() => {});
    this.entries = new Map();
    this.activeId = null;
    this.compareIds = [];
    this.display = { envelope: false, labels: true };
    this.theme = { look: 'drafting', dark: false, gridline: '#1f4a8a', ink: '#1d2327', ink3: '#6b7277', gridMinor: '#d5dad9', gridMajor: '#b5bdbd' };
    this.dirty = true;
    this.anims = 0;
    this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setClearColor(0x000000, 0);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.NeutralToneMapping;
    r.domElement.className = 'vw-canvas';
    host.appendChild(r.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'vw-labels';
    host.appendChild(this.labels.domElement);

    this.tip = document.createElement('div');
    this.tip.className = 'vw-tip';
    this.tip.hidden = true;
    host.appendChild(this.tip);

    const pm = new THREE.PMREMGenerator(r);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);
    this.camera.position.set(20, 14, 26);
    const c = (this.controls = new OrbitControls(this.camera, r.domElement));
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.maxPolarAngle = Math.PI / 2 - 0.03;
    c.screenSpacePanning = true;
    c.autoRotateSpeed = 0.45;
    c.addEventListener('start', () => { this.onInteract('orbit'); this.hideTip(); });
    c.addEventListener('change', () => (this.dirty = true));

    this.faceMats = new Map();
    this.edgeMats = new Map();
    this.raycaster = new THREE.Raycaster();
    this.pointer = { x: 0, y: 0, inside: false, down: false };
    this.hover = null;

    const el = r.domElement;
    this._onMove = (e) => this.onPointer(e);
    this._onLeave = () => { this.pointer.inside = false; this.setHover(null); };
    this._onDown = () => { this.pointer.down = true; this.setHover(null); };
    this._onUp = () => (this.pointer.down = false);
    el.addEventListener('pointermove', this._onMove);
    el.addEventListener('pointerleave', this._onLeave);
    el.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointerup', this._onUp);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------ materials --
  faceMat(material, role) {
    const key = `${material}:${role}`;
    let m = this.faceMats.get(key);
    if (m) return m;
    const look = BASE[material];
    if (role === 'glass') m = new THREE.MeshStandardMaterial({ roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.45 });
    else if (role === 'door') m = new THREE.MeshStandardMaterial({ roughness: 0.5 });
    else {
      const isMetal = material === 'steel' && !PANEL_ROLES.has(role) && role !== 'wall' && role !== 'footing';
      m = new THREE.MeshStandardMaterial({
        roughness: role === 'wall' || role === 'footing' ? 0.9 : look.rough,
        metalness: isMetal ? look.metal : 0,
      });
    }
    // Push faces back a touch so the ink edges always win the depth test.
    m.polygonOffset = true;
    m.polygonOffsetFactor = 1;
    m.polygonOffsetUnits = 1;
    m.userData = { material, role };
    this.faceMats.set(key, m);
    this.styleFace(m);
    return m;
  }

  styleFace(m) {
    const { material, role } = m.userData;
    const { look, dark } = this.theme;
    const p = lookParams(look, dark);
    faceColor(material, role, look, dark, m.color);
    m.envMapIntensity = p.env;
    const see = SEE_THROUGH.has(role) && !this.display.envelope;
    const glass = role === 'glass';
    m.transparent = see || glass;
    m.opacity = glass ? 0.45 : see ? (look === 'studio' ? 0.3 : 0.22) : 1;
    m.depthWrite = !see;
    m.needsUpdate = true;
  }

  edgeMat(role, preview = false) {
    const cat = preview ? 'preview' : ENV_ROLES.includes(role) ? 'env' : PANEL_ROLES.has(role) || role === 'footing' ? 'panel' : 'frame';
    let m = this.edgeMats.get(cat);
    if (m) return m;
    m = makeEdgeMaterial();
    m.userData = { cat, role };
    this.edgeMats.set(cat, m);
    this.styleEdge(m);
    return m;
  }

  styleEdge(m) {
    const { look, dark, ink } = this.theme;
    const { cat, role } = m.userData;
    if (cat === 'preview') {
      m.uniforms.uColor.value.set(ink);
      m.uniforms.uOpacity.value = dark ? 0.3 : 0.26;
      return;
    }
    const s = edgeStyle(role, look, dark);
    m.uniforms.uColor.value.set(s.color);
    m.uniforms.uOpacity.value = s.opacity;
  }

  // ---------------------------------------------------------------- theme --
  setTheme(t) {
    const prev = this.theme;
    this.theme = { ...prev, ...t };
    const p = lookParams(this.theme.look, this.theme.dark);
    this.renderer.toneMappingExposure = p.exposure;
    for (const m of this.faceMats.values()) this.styleFace(m);
    for (const m of this.edgeMats.values()) this.styleEdge(m);
    for (const e of this.entries.values()) this.themeEntry(e);
    this.dirty = true;
  }

  themeEntry(e) {
    const t = this.theme;
    const p = lookParams(t.look, t.dark);
    const studio = t.look === 'studio';
    const u = e.ground.material.uniforms;
    u.uMinor.value.set(t.gridMinor);
    u.uMajor.value.set(t.gridMajor);
    u.uOpacity.value = studio ? 0 : t.dark ? 0.55 : 0.7;
    e.ground.visible = !studio && !e.preview;
    e.shadow.material.opacity = e.preview ? 0 : p.shadow;
    e.gridMat.uniforms.uColor.value.set(t.gridline);
    e.gridMat.uniforms.uOpacity.value = e.preview ? 0.28 : t.dark ? 0.8 : 0.72;
    e.footMat.uniforms.uColor.value.set(t.gridline);
    e.fpFill.material.color.set(t.gridline);
    e.dimMat.color.set(t.ink3);
    e.hemi.intensity = p.hemi;
    e.hemi.color.set(t.dark ? '#c9d6ea' : '#ffffff');
    e.hemi.groundColor.set(t.dark ? '#1a2230' : '#cfc9bf');
    e.sun.intensity = p.sun;
    e.scene.environmentIntensity = studio ? 0.7 : 0.5;
  }

  // ----------------------------------------------------------------- sync --
  sync(options, { activeId, compareIds, display }) {
    const ids = new Set(options.map((o) => o.id));
    for (const [id, e] of this.entries) if (!e.preview && !ids.has(id)) this.disposeEntry(id, e);
    for (const o of options) {
      if (!o.result) continue;
      let e = this.entries.get(o.id);
      if (!e || e.version !== o.version) {
        if (e) this.disposeEntry(o.id, e);
        e = this.buildEntry(o);
        this.entries.set(o.id, e);
      }
      if (e.stage !== o.stage) this.setStage(o.id, e, o.stage, o.animate);
    }
    const displayChanged = display && (display.envelope !== this.display.envelope || display.labels !== this.display.labels);
    if (display) this.display = { ...display };
    if (displayChanged) {
      for (const m of this.faceMats.values()) this.styleFace(m);
      for (const e of this.entries.values()) this.applyDisplay(e);
    }
    const prevKey = `${this.activeId}|${this.compareIds.join(',')}`;
    if (this.activeId !== activeId) this.detachLabels(this.activeId);
    this.activeId = activeId;
    this.compareIds = compareIds || [];
    this.labels.domElement.hidden = this.compareIds.length > 1;
    const preview = this.entries.get(PREVIEW_ID);
    this.controls.autoRotate = !!preview && !this.activeId && !this.reduced;
    const nextKey = `${this.activeId}|${this.compareIds.join(',')}`;
    if (prevKey !== nextKey || !this.framed) this.frame(false);
    this.dirty = true;
  }

  // A quiet linework model: the example behind the start screen, or a ghost
  // of the brief while it waits for approval. Edits swap it without replaying.
  setPreview(result, { animate = true } = {}) {
    const old = this.entries.get(PREVIEW_ID);
    if (old) this.disposeEntry(PREVIEW_ID, old);
    if (result) {
      const e = this.buildEntry({ id: PREVIEW_ID, version: 0, material: result.material, result }, { preview: true });
      this.entries.set(PREVIEW_ID, e);
      e.stage = 'build';
      if (this.reduced || !animate) this.setProgress(e, 1);
      else {
        this.setProgress(e, 0);
        e.gridMat.uniforms.uProgress.value = 0;
        this.anims++;
        const st = { u: 0, g: 0 };
        e.tween = gsap.timeline({ onComplete: () => { this.anims--; e.tween = null; } })
          .to(st, { g: 1, duration: 1.6, ease: 'power2.out', onUpdate: () => { e.gridMat.uniforms.uProgress.value = st.g; this.dirty = true; } })
          .to(st, { u: 1, duration: 5.5, ease: 'none', onUpdate: () => this.setProgress(e, st.u) }, 0.5);
      }
    }
    this.controls.autoRotate = !!result && !this.activeId && !this.reduced;
    if (!this.activeId) this.frame(!animate && !!old);
    this.dirty = true;
  }

  detachLabels(id) {
    const e = this.entries.get(id);
    if (!e) return;
    e.scene.traverse((o) => { if (o.isCSS2DObject && o.element.parentNode) o.element.remove(); });
  }

  // ---------------------------------------------------------------- build --
  buildEntry(o, { preview = false } = {}) {
    const geo = buildGeometry(o.result);
    const { L, W, top } = geo.bounds;
    const ext = Math.max(L, W, top * 1.2);
    const scene = new THREE.Scene();
    scene.environment = this.env;

    const hemi = new THREE.HemisphereLight('#ffffff', '#cfc9bf', 1.2);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff8f0', 2.2);
    sun.position.set(-0.55 * ext - 6, 1.1 * ext + 10, 0.75 * ext + 6);
    sun.castShadow = !preview;
    const sc = sun.shadow.camera;
    const half = Math.max(L, W) * 0.75 + top * 0.6 + 4;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.near = 0.5; sc.far = ext * 4 + 60;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 5;
    scene.add(sun);

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.12 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.setScalar(ext * 6 + 40);
    shadow.receiveShadow = true;
    scene.add(shadow);
    const ground = makeGroundGrid();
    ground.scale.setScalar(ext * 8 + 60);
    ground.material.uniforms.uFade.value = ext * 2.2 + 18;
    ground.material.uniforms.uStep.value = ext > 60 ? 2 : 1;
    scene.add(ground);

    // Members: faces plus instanced edges sharing the same matrices
    const building = new THREE.Group();
    const parts = [];
    for (const role of [...STRUCT_ROLES, ...ENV_ROLES]) {
      const items = geo.parts[role];
      if (!items?.length) continue;
      const shape = items[0].shape === 'I' ? UNIT_I : UNIT_BOX;
      const mesh = new THREE.InstancedMesh(shape, this.faceMat(o.material, role), items.length);
      mesh.castShadow = !preview && role !== 'glass' && !SEE_THROUGH.has(role);
      mesh.receiveShadow = role !== 'glass';
      mesh.frustumCulled = false;
      mesh.userData = { role, items };
      mesh.visible = !preview;
      for (let i = 0; i < items.length; i++) mesh.setColorAt(i, WHITE);
      mesh.instanceColor.needsUpdate = true;
      building.add(mesh);

      const eg = new THREE.InstancedBufferGeometry();
      eg.setAttribute('position', new THREE.BufferAttribute(EDGE_ARRAYS.get(shape), 3));
      eg.setAttribute('aInstance', mesh.instanceMatrix);
      eg.instanceCount = items.length;
      const edges = new THREE.LineSegments(eg, this.edgeMat(role, preview));
      edges.frustumCulled = false;
      edges.renderOrder = 2;
      building.add(edges);
      parts.push({ role, mesh, edges, items, env: ENV_ROLES.includes(role) });
    }
    const gableEnds = new THREE.Group();
    if (geo.bounds.gable && !preview) {
      const off = geo.bounds.off;
      const s = new THREE.Shape();
      s.moveTo(-W / 2 - off, 0); s.lineTo(W / 2 + off, 0); s.lineTo(0, geo.bounds.rise + off * 0.36 + 0.1); s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false });
      g.rotateY(Math.PI / 2);
      for (const sx of [-1, 1]) {
        const m = new THREE.Mesh(g, this.faceMat(o.material, 'wall'));
        m.position.set(sx * (L / 2 + off) - 0.06, top - geo.bounds.rise, 0);
        m.castShadow = true;
        gableEnds.add(m);
      }
    }
    building.add(gableEnds);
    scene.add(building);

    // Drafting layer: footprint, chain gridlines, bubbles, dimension strings
    const draft = new THREE.Group();
    const k = THREE.MathUtils.clamp(Math.max(L, W) / 26, 0.7, 2.6);
    const y = 0.03;
    const off = geo.bounds.off;
    const zFront = W / 2 + off, xRight = L / 2 + off;
    const dim1 = 1.5 * k, dim2 = 2.9 * k, bub = 4.6 * k;

    const perim = 2 * (L + W);
    const corners = [[-L / 2, y, -W / 2], [L / 2, y, -W / 2], [L / 2, y, W / 2], [-L / 2, y, W / 2]];
    let acc = 0;
    const fpSegs = corners.map((c0, i) => {
      const c1 = corners[(i + 1) % 4];
      const s = { a: c0, b: c1, d0: acc, total: perim };
      acc += Math.hypot(c1[0] - c0[0], c1[2] - c0[2]);
      return s;
    });
    const footMat = makeDraftMaterial({ mode: 1, opacity: 0.9, scale: 0.6 * k, window: 1 });
    const fpLine = new THREE.LineSegments(draftGeometry(fpSegs), footMat);
    const fpFill = new THREE.Mesh(new THREE.PlaneGeometry(L, W), new THREE.MeshBasicMaterial({ color: '#1f4a8a', transparent: true, opacity: 0.06, depthWrite: false }));
    fpFill.rotation.x = -Math.PI / 2;
    fpFill.position.y = 0.01;
    const footprint = new THREE.Group();
    footprint.add(fpLine, fpFill);
    footprint.visible = false;
    draft.add(footprint);

    const gridGroup = new THREE.Group();
    const xs = geo.grid.xs, zs = geo.grid.zs;
    const spread = (i, n) => (n <= 1 ? 0 : 0.45 * Math.abs(i - (n - 1) / 2) / ((n - 1) / 2));
    const gridSegs = [
      ...xs.map((x, i) => ({ a: [x, y, -W / 2 - off - 0.8 * k], b: [x, y, zFront + bub - 0.48 * k], delay: spread(i, xs.length) })),
      ...zs.map((z, j) => ({ a: [-L / 2 - off - 0.8 * k, y, z], b: [xRight + bub - 0.48 * k, y, z], delay: 0.05 + spread(j, zs.length) })),
    ];
    const gridMat = makeDraftMaterial({ mode: 0, scale: 0.9 * k, window: 0.5 });
    gridGroup.add(new THREE.LineSegments(draftGeometry(gridSegs), gridMat));

    const labelEls = [];
    const label = (cls, text, pos, delay = 0) => {
      const d = document.createElement('div');
      d.className = cls;
      const span = document.createElement('span');
      span.textContent = text;
      d.appendChild(span);
      d.style.setProperty('--d', `${delay}s`);
      const obj = new CSS2DObject(d);
      obj.position.set(...pos);
      labelEls.push(d);
      return obj;
    };
    if (!preview) {
      xs.forEach((x, i) => gridGroup.add(label('gl-bubble', geo.grid.xLabels[i], [x, y, zFront + bub], 0.35 + spread(i, xs.length) * 1.1)));
      zs.forEach((z, j) => gridGroup.add(label('gl-bubble', geo.grid.zLabels[j], [xRight + bub, y, z], 0.4 + spread(j, zs.length) * 1.1)));
    }

    // Dimension strings with architectural ticks, in millimetres
    const segs = [];
    const tick = 0.22 * k;
    const zd1 = zFront + dim1, zd2 = zFront + dim2, xd1 = xRight + dim1, xd2 = xRight + dim2;
    segs.push([xs[0], y, zd1], [xs[xs.length - 1], y, zd1], [-L / 2, y, zd2], [L / 2, y, zd2]);
    segs.push([xd1, y, zs[0]], [xd1, y, zs[zs.length - 1]], [xd2, y, -W / 2], [xd2, y, W / 2]);
    for (const x of xs) segs.push([x - tick, y, zd1 + tick], [x + tick, y, zd1 - tick]);
    for (const x of [-L / 2, L / 2]) segs.push([x - tick, y, zd2 + tick], [x + tick, y, zd2 - tick], [x, y, zFront + 0.25 * k], [x, y, zd2 + 0.3 * k]);
    for (const z of zs) segs.push([xd1 - tick, y, z + tick], [xd1 + tick, y, z - tick]);
    for (const z of [-W / 2, W / 2]) segs.push([xd2 - tick, y, z + tick], [xd2 + tick, y, z - tick], [xRight + 0.25 * k, y, z], [xd2 + 0.3 * k, y, z]);
    const dimMat = new THREE.LineBasicMaterial({ color: '#6b7277', transparent: true, opacity: 0.9 });
    const dims = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segs.map((p) => new THREE.Vector3(...p))), dimMat);
    dims.visible = !preview;
    gridGroup.add(dims);
    if (!preview) {
      const mmTxt = (v) => Math.round(v * 1000).toLocaleString('en-CA').replace(/,/g, ' ');
      const mid = (a) => (a.length % 2 === 0 ? 0 : (a[(a.length - 1) / 2] + a[(a.length + 1) / 2]) / 2);
      const dd = 0.9;
      if (xs.length > 2) for (let i = 0; i < xs.length - 1; i++) gridGroup.add(label('gl-dim', mmTxt(xs[i + 1] - xs[i]), [(xs[i] + xs[i + 1]) / 2, y, zd1], dd));
      gridGroup.add(label('gl-dim gl-dim--total', mmTxt(L), [xs.length > 2 ? mid(xs) : 0, y, zd2], dd + 0.1));
      if (zs.length > 2) for (let j = 0; j < zs.length - 1; j++) gridGroup.add(label('gl-dim', mmTxt(zs[j + 1] - zs[j]), [xd1, y, (zs[j] + zs[j + 1]) / 2], dd));
      gridGroup.add(label('gl-dim gl-dim--total', mmTxt(W), [xd2, y, zs.length > 2 ? mid(zs) : 0], dd + 0.1));
    }
    draft.add(gridGroup);
    scene.add(draft);

    const e = {
      id: o.id, version: o.version, material: o.material, preview, scene, building, parts, gableEnds, draft,
      footprint, fpFill, gridGroup, gridMat, footMat, dims, dimMat, labelEls,
      ground, shadow, hemi, sun, geo, bounds: geo.bounds, u: 1, stage: null, tween: null,
      // The preview draws no dimension strings, so it can be framed tighter.
      radius: preview ? 0.5 * Math.hypot(L + 1.2 * bub, W + 1.2 * bub, top) + 0.5 : 0.5 * Math.hypot(L + 2 * dim2, W + 2 * dim2, top) + 1,
    };
    this.themeEntry(e);
    this.applyDisplay(e);
    this.setProgress(e, 1);
    return e;
  }

  applyDisplay(e) {
    const env = this.display.envelope && !e.preview;
    for (const p of e.parts) {
      if (p.env) {
        const on = env && e.stage !== 'footprint' && e.stage !== 'grid';
        p.mesh.visible = on;
        p.edges.visible = on;
      }
      if (SEE_THROUGH.has(p.role)) p.mesh.castShadow = env;
    }
    e.gableEnds.visible = env && (e.stage === 'ready' || e.stage === 'build');
    e.gridGroup.visible = e.preview || (this.display.labels && e.stage !== 'footprint');
  }

  setProgress(e, u) {
    e.u = u;
    const dur = THREE.MathUtils.clamp(0.22 / Math.sqrt(e.bounds.n), 0.07, 0.22);
    for (const p of e.parts) {
      if (p.env) {
        for (let i = 0; i < p.items.length; i++) p.mesh.setMatrixAt(i, itemMatrix(p.items[i], 1, _m));
      } else {
        for (let i = 0; i < p.items.length; i++) {
          const it = p.items[i];
          const t = THREE.MathUtils.clamp((u * (1 + dur) - it.delay) / dur, 0, 1);
          p.mesh.setMatrixAt(i, itemMatrix(it, easeOut(t), _m));
        }
      }
      p.mesh.instanceMatrix.needsUpdate = true;
    }
    this.dirty = true;
  }

  showLabels(e, on) {
    for (const el of e.labelEls) el.classList.toggle('is-in', on);
  }

  setStage(id, e, stage, animate = true) {
    e.stage = stage;
    if (e.tween) { e.tween.kill(); e.tween = null; this.anims = Math.max(0, this.anims - 1); }
    const fast = this.reduced || !animate;
    const run = (tl, done) => {
      this.anims++;
      e.tween = tl;
      tl.eventCallback('onComplete', () => { this.anims = Math.max(0, this.anims - 1); e.tween = null; done?.(); });
    };
    const fp = e.footMat.uniforms.uProgress, gp = e.gridMat.uniforms.uProgress;
    const dirty = () => (this.dirty = true);

    if (stage === 'footprint') {
      this.setProgress(e, 0);
      e.footprint.visible = true;
      gp.value = 0;
      this.showLabels(e, false);
      e.dimMat.opacity = 0;
      if (fast) fp.value = 1;
      else { fp.value = 0; run(gsap.timeline().to(fp, { value: 1, duration: 0.9, ease: 'power2.inOut', onUpdate: dirty })); }
    } else if (stage === 'grid') {
      this.setProgress(e, 0);
      e.footprint.visible = true;
      fp.value = 1;
      this.showLabels(e, true);
      if (fast) { gp.value = 1; e.dimMat.opacity = 0.9; } else {
        gp.value = 0;
        run(gsap.timeline()
          .to(gp, { value: 1, duration: 1.1, ease: 'power2.out', onUpdate: dirty })
          .to(e.dimMat, { opacity: 0.9, duration: 0.5, onUpdate: dirty }, 0.6));
      }
    } else if (stage === 'build') {
      e.footprint.visible = true;
      fp.value = 1; gp.value = 1; e.dimMat.opacity = 0.9;
      this.showLabels(e, true);
      const T = fast ? 0.01 : THREE.MathUtils.clamp(1.4 + 0.2 * e.bounds.n, 1.6, 3.2);
      this.setProgress(e, 0);
      const st = { u: 0 };
      const finish = () => { e.footprint.visible = false; this.setProgress(e, 1); this.onBuilt(id); };
      if (fast) finish();
      else {
        const tl = gsap.timeline();
        tl.to(st, { u: 1, duration: T, ease: 'none', onUpdate: () => this.setProgress(e, st.u) });
        tl.to(e.fpFill.material, { opacity: 0, duration: 0.6, onUpdate: dirty }, T * 0.5);
        run(tl, finish);
      }
    } else if (stage === 'ready') {
      e.footprint.visible = false;
      fp.value = 1; gp.value = 1; e.dimMat.opacity = 0.9;
      this.showLabels(e, true);
      this.setProgress(e, 1);
    }
    this.applyDisplay(e);
    this.dirty = true;
  }

  disposeEntry(id, e) {
    if (e.tween) { e.tween.kill(); this.anims = Math.max(0, this.anims - 1); }
    const shared = new Set([...this.faceMats.values(), ...this.edgeMats.values()]);
    e.scene.traverse((o) => {
      if (o.isCSS2DObject && o.element.parentNode) o.element.remove();
      if (o.isInstancedMesh) o.dispose();
      else if (o.geometry && o.geometry !== UNIT_BOX && o.geometry !== UNIT_I) o.geometry.dispose();
      if (o.material && !shared.has(o.material)) o.material.dispose?.();
    });
    this.entries.delete(id);
    if (this.hover?.id === id) this.setHover(null);
  }

  // Panels cover part of the canvas. Shift the projection so the model is
  // framed in the free area instead of behind them.
  setInsets(ins) {
    // Measure first: panels usually change in the same frame as the canvas size.
    const resized = this.resize(false);
    const k = (o) => `${o.top}|${o.right}|${o.bottom}|${o.left}`;
    if (k(ins) === k(this.insets) && !resized) return;
    this.insets = { ...ins };
    if (this.framed && this.compareIds.length < 2) this.frame(true);
    this.dirty = true;
  }

  applyOffset(v, single) {
    const cam = this.camera;
    if (!single) { cam.clearViewOffset(); return; }
    const { left, right, top, bottom } = this.insets;
    const dx = (right - left) / 2, dy = (bottom - top) / 2;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) cam.clearViewOffset();
    else cam.setViewOffset(v.w, v.h, dx, dy, v.w, v.h);
  }

  // --------------------------------------------------------------- camera --
  shownIds() {
    if (this.compareIds.length > 1) return this.compareIds;
    if (this.activeId && this.entries.has(this.activeId)) return [this.activeId];
    if (!this.activeId && this.entries.has(PREVIEW_ID)) return [PREVIEW_ID];
    return [this.activeId];
  }

  viewRects() {
    const ids = this.shownIds();
    return compareRects(this.width, this.height, ids.length).map((r, i) => ({ ...r, id: ids[i] }));
  }

  frame(animate = true, view = this.view || 'iso') {
    this.view = view;
    if (this.camTween) { this.camTween.kill(); this.camTween = null; this.anims = Math.max(0, this.anims - 1); }
    const es = this.shownIds().map((id) => this.entries.get(id)).filter(Boolean);
    if (!es.length) { this.framed = false; return; }
    this.framed = true;
    const radius = Math.max(...es.map((e) => e.radius));
    const topY = Math.max(...es.map((e) => e.bounds.top));
    const rects = this.viewRects();
    const single = rects.length === 1;
    const ins = single ? this.insets : { top: 0, right: 0, bottom: 0, left: 0 };
    const r0 = rects[0];
    const sw = Math.max(80, r0.w - ins.left - ins.right), sh = Math.max(80, r0.h - ins.top - ins.bottom);
    const aspect = single ? sw / sh : Math.min(...rects.map((r) => r.w / Math.max(1, r.h)));
    const vf0 = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const vf = single ? Math.atan(Math.tan(vf0) * (sh / Math.max(1, r0.h))) : vf0;
    const hf = Math.atan(Math.tan(vf) * aspect);
    const preview = es[0].preview;
    const dist = (radius / Math.sin(Math.min(vf, hf))) * (preview ? 0.9 : single ? (aspect < 1.1 ? 1.0 : 0.88) : 0.95);
    const d = new THREE.Vector3(...VIEW_DIRS[view]).normalize();
    const target = new THREE.Vector3(0, view === 'top' ? 0 : topY * 0.32, 0);
    const pos = target.clone().addScaledVector(d, dist);
    this.controls.minDistance = radius * 0.4;
    this.controls.maxDistance = dist * 3;
    if (!animate || this.reduced) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      this.dirty = true;
      return;
    }
    this.anims++;
    const from = { px: this.camera.position.x, py: this.camera.position.y, pz: this.camera.position.z, tx: this.controls.target.x, ty: this.controls.target.y, tz: this.controls.target.z };
    this.camTween = gsap.to(from, {
      px: pos.x, py: pos.y, pz: pos.z, tx: target.x, ty: target.y, tz: target.z, duration: 0.8, ease: 'power3.inOut',
      onUpdate: () => {
        this.camera.position.set(from.px, from.py, from.pz);
        this.controls.target.set(from.tx, from.ty, from.tz);
        this.dirty = true;
      },
      onComplete: () => { this.anims = Math.max(0, this.anims - 1); this.camTween = null; },
    });
  }

  // ---------------------------------------------------------------- hover --
  onPointer(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = e.clientX - rect.left;
    this.pointer.y = e.clientY - rect.top;
    this.pointer.inside = true;
    if (this.pointer.down || e.pointerType === 'touch') return;
    if (!this.hoverQueued) {
      this.hoverQueued = true;
      requestAnimationFrame(() => { this.hoverQueued = false; this.pick(); });
    }
  }

  pick() {
    if (!this.pointer.inside) return;
    const { x, y } = this.pointer;
    const rects = this.viewRects();
    const r = rects.find((v) => x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h);
    const e = r && this.entries.get(r.id);
    if (!e || e.preview || e.stage !== 'ready') return this.setHover(null);
    const ndc = new THREE.Vector2(((x - r.x) / r.w) * 2 - 1, -((y - r.y) / r.h) * 2 + 1);
    this.camera.aspect = r.w / r.h;
    this.applyOffset(r, rects.length === 1);
    this.camera.updateProjectionMatrix();
    this.raycaster.setFromCamera(ndc, this.camera);
    const see = !this.display.envelope;
    const meshes = e.parts.filter((p) => p.mesh.visible && !(see && SEE_THROUGH.has(p.role))).map((p) => p.mesh);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit) return this.setHover(null);
    const items = hit.object.userData.items;
    this.setHover({ id: e.id, mesh: hit.object, index: hit.instanceId, meta: items[hit.instanceId]?.meta, material: e.material });
  }

  setHover(h) {
    const prev = this.hover;
    if (prev && (!h || prev.mesh !== h.mesh || prev.index !== h.index)) {
      if (prev.mesh.instanceColor) { prev.mesh.setColorAt(prev.index, WHITE); prev.mesh.instanceColor.needsUpdate = true; }
    }
    this.hover = h;
    if (h) {
      // Tint toward the full material colour, the way a highlighter marks a print.
      const base = new THREE.Color(BASE[h.material]?.[h.mesh.userData.role] || '#ffcf70');
      const cur = h.mesh.material.color;
      const tint = new THREE.Color(base.r / Math.max(0.05, cur.r), base.g / Math.max(0.05, cur.g), base.b / Math.max(0.05, cur.b));
      if (this.theme.look === 'studio') tint.setRGB(1.35, 1.2, 0.9);
      h.mesh.setColorAt(h.index, tint);
      h.mesh.instanceColor.needsUpdate = true;
      this.tip.hidden = false;
      this.tip.replaceChildren();
      const t = document.createElement('strong'); t.textContent = h.meta?.title || '';
      const s = document.createElement('span'); s.textContent = h.meta?.sub || '';
      this.tip.append(t, s);
      const tx = Math.min(this.pointer.x + 16, this.width - 250);
      this.tip.style.transform = `translate(${Math.max(8, tx)}px, ${Math.max(8, this.pointer.y + 18)}px)`;
    } else this.hideTip();
    this.onHoverChange(h?.meta || null);
    this.dirty = true;
  }

  hideTip() { this.tip.hidden = true; }

  // --------------------------------------------------------------- render --
  resize(reframe = true) {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h || (w === this.width && h === this.height)) return false;
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.labels.setSize(w, h);
    // A camera move aimed at the old size would land off-centre, so re-aim it.
    if (reframe && this.framed) this.frame(!!this.camTween);
    this.dirty = true;
    return true;
  }

  loop() {
    this.raf = requestAnimationFrame(this.loop);
    const moved = this.controls.update();
    if (this.dirty || moved || this.anims > 0) {
      this.render();
      this.dirty = false;
    }
  }

  render() {
    const r = this.renderer;
    if (!this.width) return;
    const rects = this.viewRects();
    const single = rects.length === 1;
    r.setScissorTest(!single);
    for (const v of rects) {
      const e = this.entries.get(v.id);
      r.setViewport(v.x, this.height - v.y - v.h, v.w, v.h);
      r.setScissor(v.x, this.height - v.y - v.h, v.w, v.h);
      if (!e) { r.clear(); continue; }
      this.camera.aspect = v.w / v.h;
      this.applyOffset(v, single);
      this.camera.updateProjectionMatrix();
      r.render(e.scene, this.camera);
      if (single && this.display.labels && !e.preview) this.labels.render(e.scene, this.camera);
    }
    r.setScissorTest(false);
  }

  // Renders one option to a PNG at the given size without touching the live view.
  thumbnail(id, { w = 520, h = 340, view = 'iso' } = {}) {
    const e = this.entries.get(id);
    if (!e || !this.width) return null;
    const r = this.renderer;
    const dpr = r.getPixelRatio();
    const cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 2000);
    const vf = THREE.MathUtils.degToRad(15);
    const hf = Math.atan(Math.tan(vf) * (w / h));
    const dist = (e.radius / Math.sin(Math.min(vf, hf))) * 0.86;
    const target = new THREE.Vector3(0, e.bounds.top * 0.3, 0);
    cam.position.copy(target).addScaledVector(new THREE.Vector3(...VIEW_DIRS[view]).normalize(), dist);
    cam.lookAt(target);
    const u = e.u;
    if (u < 1) this.setProgress(e, 1);
    r.setPixelRatio(2);
    r.setSize(w, h, false);
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
    r.clear();
    r.render(e.scene, cam);
    const url = r.domElement.toDataURL('image/png');
    r.setPixelRatio(dpr);
    r.setSize(this.width, this.height, false);
    if (u < 1) this.setProgress(e, u);
    this.render();
    return url;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this._onMove);
    el.removeEventListener('pointerleave', this._onLeave);
    el.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointerup', this._onUp);
    this.camTween?.kill();
    for (const [id, e] of this.entries) this.disposeEntry(id, e);
    for (const m of this.faceMats.values()) m.dispose();
    for (const m of this.edgeMats.values()) m.dispose();
    this.env.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    this.host.replaceChildren();
  }
}

// Shared by the viewer and the React overlays so labels line up with viewports.
export function compareRects(w, h, n) {
  const gap = 2;
  if (n <= 1) return [{ x: 0, y: 0, w, h }];
  const portrait = w < 700 && h > w * 0.9;
  if (portrait) {
    const rh = (h - gap * (n - 1)) / n;
    return Array.from({ length: n }, (_, i) => ({ x: 0, y: Math.round(i * (rh + gap)), w, h: Math.round(rh) }));
  }
  if (n === 4 || (n > 3 && w / h < 2.2)) {
    const cols = Math.ceil(n / 2), rw = (w - gap * (cols - 1)) / cols, rh = (h - gap) / 2;
    return Array.from({ length: n }, (_, i) => ({ x: Math.round((i % cols) * (rw + gap)), y: Math.round(Math.floor(i / cols) * (rh + gap)), w: Math.round(rw), h: Math.round(rh) }));
  }
  const rw = (w - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: Math.round(i * (rw + gap)), y: 0, w: Math.round(rw), h }));
}

export { PREVIEW_ID };
