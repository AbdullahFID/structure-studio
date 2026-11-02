// ============================================================================
// StructureViewer: three.js scene per option, instanced members, drafting
// gridlines, build animation, single and split-screen compare rendering.
// Expects THREE, OrbitControls, CSS2DRenderer, CSS2DObject, RoomEnvironment,
// gsap and buildGeometry in scope.
// ============================================================================

const LOOK = {
  timber: {
    column: '#c58b4b', beam: '#cc9556', girder: '#c18848', rafter: '#c58b4b', purlin: '#d3a46a',
    slab: '#e3c393', roofslab: '#e3c393', roofdeck: '#d9bd94', wall: '#d8c09b', rough: 0.62, metal: 0,
  },
  concrete: {
    column: '#979c9f', beam: '#a0a4a6', girder: '#9a9fa2', rafter: '#979c9f', purlin: '#a0a4a6',
    slab: '#b6b9ba', roofslab: '#b6b9ba', roofdeck: '#8e9397', wall: '#b9bcbc', rough: 0.93, metal: 0,
  },
  steel: {
    column: '#b5543d', beam: '#bb5c44', girder: '#ad4f39', infill: '#c4684f', brace: '#8e3c2c', rafter: '#b5543d', purlin: '#c4684f',
    slab: '#c6c9cb', roofslab: '#a3abb2', roofdeck: '#808b94', wall: '#9ea9b3', rough: 0.42, metal: 0.35,
  },
};
const SHARED_LOOK = { footing: '#9da1a4', glass: '#a8c5d6', door: '#3a3f45' };
const STRUCT_ROLES = ['footing', 'column', 'beam', 'girder', 'infill', 'brace', 'slab', 'roofslab', 'rafter', 'purlin', 'roofdeck'];
const ENV_ROLES = ['wall', 'glass', 'door'];
const HOVER = new THREE.Color('#ffd27a');
const WHITE = new THREE.Color('#ffffff');

const easeOut = (x) => 1 - Math.pow(1 - x, 3);

// ---- shared unit geometries: length along X, depth along Y, width along Z
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_I = (() => {
  const s = new THREE.Shape();
  const tf = 0.11, tw = 0.14; // flange and web thickness (unit space)
  s.moveTo(-0.5, -0.5); s.lineTo(0.5, -0.5); s.lineTo(0.5, -0.5 + tf); s.lineTo(tw / 2, -0.5 + tf);
  s.lineTo(tw / 2, 0.5 - tf); s.lineTo(0.5, 0.5 - tf); s.lineTo(0.5, 0.5); s.lineTo(-0.5, 0.5);
  s.lineTo(-0.5, 0.5 - tf); s.lineTo(-tw / 2, 0.5 - tf); s.lineTo(-tw / 2, -0.5 + tf); s.lineTo(-0.5, -0.5 + tf); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(0.5, 0, 0);
  g.computeVertexNormals();
  return g;
})();

// ---- reusable math scratch
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

// ---- ground grid shader with distance fade (colours come from CSS tokens)
function makeGroundGrid() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: {
      uMinor: { value: new THREE.Color('#9aa5a1') }, uMajor: { value: new THREE.Color('#6e7a76') },
      uFade: { value: 60 }, uOpacity: { value: 0.55 }, uStep: { value: 1 },
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform vec3 uMinor; uniform vec3 uMajor; uniform float uFade; uniform float uOpacity; uniform float uStep;
      varying vec3 vW;
      float line(vec2 p, float s){ vec2 q = p / s; vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q); return 1.0 - min(min(g.x, g.y), 1.0); }
      void main(){
        float d = length(vW.xz);
        float fade = 1.0 - smoothstep(uFade * 0.25, uFade, d);
        float mi = line(vW.xz, uStep) * 0.45;
        float ma = line(vW.xz, uStep * 5.0);
        vec3 c = mix(uMinor, uMajor, ma);
        gl_FragColor = vec4(c, max(mi, ma * 0.85) * fade * uOpacity);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  mesh.renderOrder = -1;
  return mesh;
}

export class StructureViewer {
  constructor(host, { onBuilt, onInteract, onHoverChange } = {}) {
    this.host = host;
    this.onBuilt = onBuilt || (() => {});
    this.onInteract = onInteract || (() => {});
    this.onHoverChange = onHoverChange || (() => {});
    this.entries = new Map(); // option id -> entry
    this.activeId = null;
    this.compareIds = [];
    this.display = { envelope: false, labels: true };
    this.theme = {};
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
    r.toneMappingExposure = 1.0;
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

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 2000);
    this.camera.position.set(20, 14, 26);
    const c = (this.controls = new OrbitControls(this.camera, r.domElement));
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.maxPolarAngle = Math.PI / 2 - 0.03;
    c.screenSpacePanning = true;
    c.addEventListener('start', () => { this.onInteract('orbit'); this.hideTip(); });
    c.addEventListener('change', () => (this.dirty = true));

    this.materials = new Map();
    this.raycaster = new THREE.Raycaster();
    this.pointer = { x: 0, y: 0, inside: false, down: false };
    this.hover = null;

    const el = r.domElement;
    el.addEventListener('pointermove', (e) => this.onPointer(e));
    el.addEventListener('pointerleave', () => { this.pointer.inside = false; this.setHover(null); });
    el.addEventListener('pointerdown', () => { this.pointer.down = true; this.setHover(null); });
    window.addEventListener('pointerup', () => (this.pointer.down = false));

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------ materials --
  mat(material, role) {
    const key = `${material}:${role}`;
    if (this.materials.has(key)) return this.materials.get(key);
    const look = LOOK[material];
    const color = look[role] || SHARED_LOOK[role] || look.column;
    let m;
    if (role === 'glass') {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.5, envMapIntensity: 1.4 });
    } else if (role === 'door') {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
    } else if (role === 'footing') {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
    } else {
      const isMetal = material === 'steel' && !['slab', 'roofslab', 'wall'].includes(role);
      m = new THREE.MeshStandardMaterial({
        color, roughness: role === 'wall' ? 0.8 : look.rough,
        metalness: isMetal ? look.metal : 0, envMapIntensity: 0.9,
      });
    }
    this.materials.set(key, m);
    this.applyDisplayToMaterial(role, m);
    return m;
  }

  applyDisplayToMaterial(role, m) {
    const see = !this.display.envelope;
    if (role === 'roofslab' || role === 'roofdeck') {
      m.transparent = see;
      m.opacity = see ? (role === 'roofdeck' ? 0.32 : 0.42) : 1;
      m.depthWrite = !see;
      m.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- theme --
  setTheme(t) {
    this.theme = t;
    for (const e of this.entries.values()) this.themeEntry(e);
    this.dirty = true;
  }

  themeEntry(e) {
    const t = this.theme;
    if (!t.gridMinor) return;
    const u = e.ground.material.uniforms;
    u.uMinor.value.set(t.gridMinor);
    u.uMajor.value.set(t.gridMajor);
    u.uOpacity.value = t.dark ? 0.5 : 0.6;
    e.shadow.material.opacity = t.dark ? 0.5 : 0.16;
    e.gridLineMat.color.set(t.gridline);
    e.dimLineMat.color.set(t.ink3);
    e.footMat.color.set(t.gridline);
    e.hemi.intensity = t.dark ? 0.9 : 1.15;
    e.sun.intensity = t.dark ? 2.1 : 2.4;
  }

  // ----------------------------------------------------------------- sync --
  sync(options, { activeId, compareIds, display }) {
    const ids = new Set(options.map((o) => o.id));
    for (const [id, e] of this.entries) if (!ids.has(id)) this.disposeEntry(id, e);
    for (const o of options) {
      if (!o.result) continue;
      let e = this.entries.get(o.id);
      if (!e || e.version !== o.version) {
        if (e) this.disposeEntry(o.id, e);
        e = this.buildEntry(o);
        this.entries.set(o.id, e);
        e.stage = null;
      }
      if (e.stage !== o.stage) this.setStage(o.id, e, o.stage, o.animate);
    }
    const displayChanged = display && (display.envelope !== this.display.envelope || display.labels !== this.display.labels);
    if (display) this.display = { ...display };
    if (displayChanged) {
      for (const [k, m] of this.materials) this.applyDisplayToMaterial(k.split(':')[1], m);
      for (const e of this.entries.values()) this.applyDisplay(e);
    }
    const prevKey = `${this.activeId}|${this.compareIds.join(',')}`;
    if (this.activeId !== activeId) this.detachLabels(this.activeId);
    this.activeId = activeId;
    this.compareIds = compareIds || [];
    this.labels.domElement.hidden = this.compareIds.length > 1;
    const nextKey = `${this.activeId}|${this.compareIds.join(',')}`;
    if (prevKey !== nextKey || !this.framed) this.frame(false);
    this.dirty = true;
  }

  detachLabels(id) {
    const e = this.entries.get(id);
    if (!e) return;
    e.scene.traverse((o) => { if (o.isCSS2DObject && o.element.parentNode) o.element.remove(); });
  }

  // ---------------------------------------------------------------- build --
  buildEntry(o) {
    const geo = buildGeometry(o.result);
    const { L, W, top } = geo.bounds;
    const ext = Math.max(L, W, top * 1.2);
    const scene = new THREE.Scene();
    scene.environment = this.env;
    scene.environmentIntensity = 0.55;

    const hemi = new THREE.HemisphereLight('#ffffff', '#b9b2a6', 1.15);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff7ee', 2.4);
    sun.position.set(-0.55 * ext - 6, 1.1 * ext + 10, 0.75 * ext + 6);
    sun.castShadow = true;
    const sc = sun.shadow.camera;
    const half = Math.max(L, W) * 0.75 + top * 0.6 + 4;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.near = 0.5; sc.far = ext * 4 + 60;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 4;
    scene.add(sun);

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.16 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.setScalar(ext * 6 + 40);
    shadow.receiveShadow = true;
    scene.add(shadow);
    const ground = makeGroundGrid();
    ground.scale.setScalar(ext * 8 + 60);
    ground.material.uniforms.uFade.value = ext * 2.2 + 18;
    ground.material.uniforms.uStep.value = ext > 60 ? 2 : 1;
    scene.add(ground);

    // Members
    const building = new THREE.Group();
    const parts = [];
    for (const role of [...STRUCT_ROLES, ...ENV_ROLES]) {
      const items = geo.parts[role];
      if (!items?.length) continue;
      const shape = items[0].shape === 'I' ? UNIT_I : UNIT_BOX;
      const mesh = new THREE.InstancedMesh(shape, this.mat(o.material, role), items.length);
      mesh.castShadow = !['glass', 'roofdeck', 'roofslab'].includes(role) || this.display.envelope;
      mesh.receiveShadow = role !== 'glass';
      mesh.frustumCulled = false;
      mesh.userData = { role, items };
      for (let i = 0; i < items.length; i++) mesh.setColorAt(i, WHITE);
      mesh.instanceColor.needsUpdate = true;
      building.add(mesh);
      parts.push({ role, mesh, items, env: ENV_ROLES.includes(role) });
    }
    // Gable end walls
    const gableEnds = new THREE.Group();
    if (geo.bounds.gable) {
      const off = geo.bounds.off;
      const s = new THREE.Shape();
      s.moveTo(-W / 2 - off, 0); s.lineTo(W / 2 + off, 0); s.lineTo(0, geo.bounds.rise + off * 0.36 + 0.1); s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false });
      g.rotateY(Math.PI / 2);
      for (const sx of [-1, 1]) {
        const m = new THREE.Mesh(g, this.mat(o.material, 'wall'));
        m.position.set(sx * (L / 2 + off) - 0.06, top - geo.bounds.rise, 0);
        m.castShadow = true;
        gableEnds.add(m);
      }
    }
    building.add(gableEnds);
    scene.add(building);

    // Drafting layer: footprint, gridlines, bubbles, dimension strings
    const draft = new THREE.Group();
    const k = THREE.MathUtils.clamp(Math.max(L, W) / 26, 0.7, 2.6);
    const gridLineMat = new THREE.LineDashedMaterial({ color: '#1e4c8f', dashSize: 0.45 * k, gapSize: 0.22 * k, transparent: true, opacity: 0.75 });
    const dimLineMat = new THREE.LineBasicMaterial({ color: '#7c8589', transparent: true, opacity: 0.9 });
    const footMat = new THREE.LineDashedMaterial({ color: '#1e4c8f', dashSize: 0.3 * k, gapSize: 0.18 * k, transparent: true, opacity: 0.9 });
    const y = 0.03;
    const off = geo.bounds.off;
    // Annotate the two sides nearest the default camera (front +z, right +x)
    const zFront = W / 2 + off, xRight = L / 2 + off;
    const dim1 = 1.5 * k, dim2 = 2.9 * k, bub = 4.6 * k;

    const lineGeo = (pts) => new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...p)));
    const fp = new THREE.LineLoop(lineGeo([[-L / 2, y, -W / 2], [L / 2, y, -W / 2], [L / 2, y, W / 2], [-L / 2, y, W / 2]]), footMat);
    fp.computeLineDistances();
    const fpFill = new THREE.Mesh(new THREE.PlaneGeometry(L, W), new THREE.MeshBasicMaterial({ color: '#1e4c8f', transparent: true, opacity: 0.07, depthWrite: false }));
    fpFill.rotation.x = -Math.PI / 2; fpFill.position.y = 0.01;
    const footprint = new THREE.Group();
    footprint.add(fp, fpFill);
    draft.add(footprint);

    const gridGroup = new THREE.Group();
    const label = (cls, text, pos) => {
      const d = document.createElement('div');
      d.className = cls;
      d.textContent = text;
      const obj = new CSS2DObject(d);
      obj.position.set(...pos);
      return obj;
    };
    geo.grid.xs.forEach((x, i) => {
      const l = new THREE.Line(lineGeo([[x, y, -W / 2 - off - 0.8 * k], [x, y, zFront + bub - 0.45 * k]]), gridLineMat);
      l.computeLineDistances();
      gridGroup.add(l, label('gl-bubble', geo.grid.xLabels[i], [x, y, zFront + bub]));
    });
    geo.grid.zs.forEach((z, j) => {
      const l = new THREE.Line(lineGeo([[-L / 2 - off - 0.8 * k, y, z], [xRight + bub - 0.45 * k, y, z]]), gridLineMat);
      l.computeLineDistances();
      gridGroup.add(l, label('gl-bubble', geo.grid.zLabels[j], [xRight + bub, y, z]));
    });
    // Dimension strings with architectural ticks (millimetres, as on drawings)
    const segs = [];
    const tick = 0.22 * k;
    const xs = geo.grid.xs, zs = geo.grid.zs;
    const zd1 = zFront + dim1, zd2 = zFront + dim2, xd1 = xRight + dim1, xd2 = xRight + dim2;
    segs.push([xs[0], y, zd1], [xs[xs.length - 1], y, zd1], [-L / 2, y, zd2], [L / 2, y, zd2]);
    segs.push([xd1, y, zs[0]], [xd1, y, zs[zs.length - 1]], [xd2, y, -W / 2], [xd2, y, W / 2]);
    for (const x of xs) segs.push([x - tick, y, zd1 + tick], [x + tick, y, zd1 - tick]);
    for (const x of [-L / 2, L / 2]) segs.push([x - tick, y, zd2 + tick], [x + tick, y, zd2 - tick], [x, y, zFront + 0.25 * k], [x, y, zd2 + 0.3 * k]);
    for (const z of zs) segs.push([xd1 - tick, y, z + tick], [xd1 + tick, y, z - tick]);
    for (const z of [-W / 2, W / 2]) segs.push([xd2 - tick, y, z + tick], [xd2 + tick, y, z - tick], [xRight + 0.25 * k, y, z], [xd2 + 0.3 * k, y, z]);
    gridGroup.add(new THREE.LineSegments(lineGeo(segs), dimLineMat));
    const mmTxt = (v) => Math.round(v * 1000).toLocaleString('en-CA').replace(/,/g, ' ');
    // Overall dimensions sit between gridlines so they never land on a bubble line
    const mid = (a) => (a.length % 2 === 0 ? 0 : (a[(a.length - 1) / 2] + a[(a.length + 1) / 2]) / 2);
    if (xs.length > 2) for (let i = 0; i < xs.length - 1; i++) gridGroup.add(label('gl-dim', mmTxt(xs[i + 1] - xs[i]), [(xs[i] + xs[i + 1]) / 2, y, zd1]));
    gridGroup.add(label('gl-dim gl-dim--total', mmTxt(L), [xs.length > 2 ? mid(xs) : 0, y, zd2]));
    if (zs.length > 2) for (let j = 0; j < zs.length - 1; j++) gridGroup.add(label('gl-dim', mmTxt(zs[j + 1] - zs[j]), [xd1, y, (zs[j] + zs[j + 1]) / 2]));
    gridGroup.add(label('gl-dim gl-dim--total', mmTxt(W), [xd2, y, zs.length > 2 ? mid(zs) : 0]));
    draft.add(gridGroup);
    scene.add(draft);

    const e = {
      id: o.id, version: o.version, material: o.material, scene, building, parts, gableEnds, draft, footprint, gridGroup,
      ground, shadow, hemi, sun, gridLineMat, dimLineMat, footMat, geo, bounds: geo.bounds, u: 1, stage: null,
      radius: 0.5 * Math.hypot(L + 2 * dim2, W + 2 * dim2, top) + 1,
    };
    this.themeEntry(e);
    this.applyDisplay(e);
    this.setProgress(e, 1);
    return e;
  }

  applyDisplay(e) {
    const env = this.display.envelope;
    for (const p of e.parts) {
      if (p.env) p.mesh.visible = env && e.stage !== 'footprint' && e.stage !== 'grid';
      if (p.role === 'roofslab' || p.role === 'roofdeck') p.mesh.castShadow = env;
    }
    e.gableEnds.visible = env && (e.stage === 'ready' || e.stage === 'build');
    e.gridGroup.visible = this.display.labels && e.stage !== 'footprint';
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
      p.mesh.computeBoundingSphere();
    }
    this.dirty = true;
  }

  setStage(id, e, stage, animate = true) {
    e.stage = stage;
    gsap.killTweensOf(e);
    e.footprint.visible = stage === 'footprint' || stage === 'grid' || stage === 'build';
    if (stage === 'footprint' || stage === 'grid') {
      this.setProgress(e, 0);
      if (!this.reduced) gsap.fromTo(e.footMat, { opacity: 0.25 }, { opacity: 0.95, duration: 0.6, yoyo: true, repeat: -1, onUpdate: () => (this.dirty = true) });
    } else {
      gsap.killTweensOf(e.footMat);
      e.footMat.opacity = 0.9;
    }
    if (stage === 'build') {
      const T = this.reduced || !animate ? 0.01 : THREE.MathUtils.clamp(1.3 + 0.18 * e.bounds.n, 1.4, 3.0);
      this.setProgress(e, 0);
      this.anims++;
      const st = { u: 0 };
      gsap.to(st, {
        u: 1, duration: T, ease: 'none',
        onUpdate: () => this.setProgress(e, st.u),
        onComplete: () => { this.anims--; e.footprint.visible = false; this.setProgress(e, 1); this.onBuilt(id); },
      });
    } else if (stage === 'ready') {
      e.footprint.visible = false;
      this.setProgress(e, 1);
    }
    this.applyDisplay(e);
    this.dirty = true;
  }

  disposeEntry(id, e) {
    gsap.killTweensOf(e.footMat);
    e.scene.traverse((o) => {
      if (o.isCSS2DObject && o.element.parentNode) o.element.remove();
      if (o.isInstancedMesh) o.dispose();
      else if (o.geometry && o.geometry !== UNIT_BOX && o.geometry !== UNIT_I) o.geometry.dispose();
      if (o.material && !Array.from(this.materials.values()).includes(o.material)) o.material.dispose?.();
    });
    this.entries.delete(id);
    if (this.hover?.id === id) this.setHover(null);
  }

  // Overlays (inspector, metrics) cover part of the canvas. Shift the projection
  // so the model is framed in the free area instead of behind the panels.
  setInsets(ins) {
    const k = (o) => `${o.top}|${o.right}|${o.bottom}|${o.left}`;
    if (k(ins) === k(this.insets)) return;
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
  viewRects() {
    const w = this.width, h = this.height;
    const ids = this.compareIds.length > 1 ? this.compareIds : [this.activeId];
    return compareRects(w, h, ids.length).map((r, i) => ({ ...r, id: ids[i] }));
  }

  frame(animate = true, view = this.view || 'iso') {
    this.view = view;
    if (this.camTween) { this.camTween.kill(); this.camTween = null; this.anims = Math.max(0, this.anims - 1); }
    const ids = this.compareIds.length > 1 ? this.compareIds : [this.activeId];
    const es = ids.map((id) => this.entries.get(id)).filter(Boolean);
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
    const dist = (radius / Math.sin(Math.min(vf, hf))) * (single ? (aspect < 1.1 ? 1.0 : 0.86) : 0.95);
    const dirs = {
      iso: [Math.sin(0.68) * Math.cos(0.5), Math.sin(0.5), Math.cos(0.68) * Math.cos(0.5)],
      top: [0, 1, 0.0008],
      front: [0, 0.16, 1],
      side: [1, 0.16, 0],
    };
    const d = new THREE.Vector3(...dirs[view]).normalize();
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
      px: pos.x, py: pos.y, pz: pos.z, tx: target.x, ty: target.y, tz: target.z, duration: 0.75, ease: 'power3.inOut',
      onUpdate: () => {
        this.camera.position.set(from.px, from.py, from.pz);
        this.controls.target.set(from.tx, from.ty, from.tz);
        this.dirty = true;
      },
      onComplete: () => { this.anims--; this.camTween = null; },
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
    const r = this.viewRects().find((v) => x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h);
    const e = r && this.entries.get(r.id);
    if (!e || e.stage !== 'ready') return this.setHover(null);
    const ndc = new THREE.Vector2(((x - r.x) / r.w) * 2 - 1, -((y - r.y) / r.h) * 2 + 1);
    this.camera.aspect = r.w / r.h;
    this.applyOffset(r, this.viewRects().length === 1);
    this.camera.updateProjectionMatrix();
    this.raycaster.setFromCamera(ndc, this.camera);
    const see = !this.display.envelope;
    const meshes = e.parts.filter((p) => p.mesh.visible && (!p.env || !see) && !(see && (p.role === 'roofdeck' || p.role === 'roofslab'))).map((p) => p.mesh);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit) return this.setHover(null);
    const items = hit.object.userData.items;
    this.setHover({ id: e.id, mesh: hit.object, index: hit.instanceId, meta: items[hit.instanceId]?.meta });
  }

  setHover(h) {
    const prev = this.hover;
    if (prev && (!h || prev.mesh !== h.mesh || prev.index !== h.index)) {
      if (prev.mesh.instanceColor) { prev.mesh.setColorAt(prev.index, WHITE); prev.mesh.instanceColor.needsUpdate = true; }
    }
    this.hover = h;
    if (h) {
      h.mesh.setColorAt(h.index, HOVER);
      h.mesh.instanceColor.needsUpdate = true;
      this.tip.hidden = false;
      this.tip.innerHTML = '';
      const t = document.createElement('strong'); t.textContent = h.meta?.title || '';
      const s = document.createElement('span'); s.textContent = h.meta?.sub || '';
      this.tip.append(t, s);
      const tx = Math.min(this.pointer.x + 14, this.width - 240);
      this.tip.style.transform = `translate(${Math.max(8, tx)}px, ${Math.max(8, this.pointer.y + 16)}px)`;
    } else this.hideTip();
    this.onHoverChange(h?.meta || null);
    this.dirty = true;
  }

  hideTip() { this.tip.hidden = true; }

  // --------------------------------------------------------------- render --
  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.labels.setSize(w, h);
    this.dirty = true;
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
      if (single && this.display.labels) this.labels.render(e.scene, this.camera);
    }
    r.setScissorTest(false);
  }

  snapshot() {
    this.render();
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    for (const [id, e] of this.entries) this.disposeEntry(id, e);
    for (const m of this.materials.values()) m.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    this.host.innerHTML = '';
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
