// ============================================================================
// The drafting crew: on the start screen, three crosshair cursors named after
// the agent's tools draw the example the way the agent does. place_footprint
// traces the outline, study_bays sets out the gridlines, size_members places
// the columns and frames the roof. Then they hand the pen to the message box.
// Each cursor rides a 3D point, so it stays on the drawing while it turns.
// ============================================================================
import gsap from 'gsap';
import * as THREE from 'three';

const TOOLS = ['place_footprint', 'study_bays', 'size_members'];
const ENTER = [0.3, 1.6, 2.9]; // seconds each cursor arrives
const HANDOFF = 7.5; // seconds the crew leaves for the message box
const CROSSHAIR = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M11 1v6M11 15v6M1 11h6M15 11h6"/><rect x="8.5" y="8.5" width="5" height="5" rx="0.6"/></svg>';

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smooth = (t) => { const c = clamp01(t); return c * c * (3 - 2 * c); };
const mix = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const mm = (v) => Math.round(v * 1000).toLocaleString('en-CA').replace(/,/g, ' ');
const _v = new THREE.Vector3();

// Walks a list of [u, point] stops; hops between neighbours with an ease.
function along(stops, u) {
  if (u <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [u1, p1] = stops[i];
    if (u <= u1) {
      const [u0, p0] = stops[i - 1];
      return lerp3(p0, p1, smooth((u - u0) / Math.max(1e-6, u1 - u0)));
    }
  }
  return stops[stops.length - 1][1];
}

export function startCrew(viewer, e, result, { layer, handoff, onDone }) {
  const root = document.createElement('div');
  root.className = 'vw-crew';
  root.setAttribute('aria-hidden', 'true');
  const curs = TOOLS.map((name) => {
    const el = document.createElement('div');
    el.className = 'crew-cur';
    el.innerHTML = CROSSHAIR;
    const tag = document.createElement('span');
    tag.className = 'crew-tag';
    const b = document.createElement('b');
    b.textContent = name;
    const read = document.createElement('span');
    read.className = 'crew-read';
    tag.append(b, read);
    el.appendChild(tag);
    root.appendChild(el);
    return { el, tag, read, text: null, tagW: 0, side: '' };
  });
  (layer || viewer.host).appendChild(root);

  const { L, W, H, n, gable, top } = e.bounds;
  const { xs, zs, y, zBack, xEdge } = e.marks;
  const eave = n * H;
  const sec = result.sections;

  // The drawing is driven from here so the cursors and the lines move as one.
  const st = { f: 0, g: 0, u: 0 };
  const fp = e.footMat.uniforms.uProgress, gp = e.gridMat.uniforms.uProgress;
  const dirty = () => (viewer.dirty = true);
  e.footprint.visible = true;
  e.fpFill.material.opacity = 0;
  fp.value = 0;
  gp.value = 0;
  viewer.setProgress(e, 0);
  const tl = gsap.timeline({ onComplete: () => finish() });
  tl.to(st, { f: 1, duration: 1.4, ease: 'power1.inOut', onUpdate: () => { fp.value = st.f; dirty(); } }, 0.6)
    .to(e.fpFill.material, { opacity: 0.05, duration: 0.6, onUpdate: dirty }, 1.7)
    .to(st, { g: 1, duration: 1.7, ease: 'none', onUpdate: () => { gp.value = st.g; dirty(); } }, 1.9)
    .to(st, { u: 1, duration: 4.2, ease: 'none', onUpdate: () => viewer.setProgress(e, st.u) }, 3.2)
    .to(e.footMat.uniforms.uOpacity, { value: 0, duration: 0.8, onUpdate: dirty }, 6.8)
    .to(e.fpFill.material, { opacity: 0, duration: 0.8 }, 6.8)
    .to({}, { duration: 1.2 }, HANDOFF);

  // Typing or clicking means the visitor is ready, so the crew hurries up.
  const hurry = () => tl.timeScale(3);
  window.addEventListener('keydown', hurry, { once: true });
  window.addEventListener('pointerdown', hurry, { once: true });

  // place_footprint: traces the outline corner to corner, reading out the length so far.
  const corners = [[-L / 2, y, -W / 2], [L / 2, y, -W / 2], [L / 2, y, W / 2], [-L / 2, y, W / 2], [-L / 2, y, -W / 2]];
  const edges = [L, W, L, W];
  function footprint() {
    let d = st.f * 2 * (L + W);
    let i = 0;
    while (i < 3 && d > edges[i]) d -= edges[i++];
    const p = lerp3(corners[i], corners[i + 1], clamp01(d / edges[i]));
    const run = st.f * 2 * (L + W);
    const text = st.f <= 0 ? '' : run < L ? mm(run) : run < L + W ? `${mm(L)} × ${mm(run - L)}` : `${mm(L)} × ${mm(W)}`;
    return [p, text];
  }

  // study_bays: walks the back edge as the numbered lines shoot forward, then meets the lettered lines along the right side.
  const gridStops = [[0, [xs[0], y, zBack]], [0.45, [xs[xs.length - 1], y, zBack]], [0.55, [xEdge, y, zs[0]]], [1, [xEdge, y, zs[zs.length - 1]]]];
  function grid() {
    const p = st.g < 0.45 ? lerp3(gridStops[0][1], gridStops[1][1], st.g / 0.45) : along(gridStops, st.g);
    const text = st.g <= 0 ? '' : st.g < 0.5 ? `bay ${mm(result.grid.sx)}` : `bays ${mm(result.grid.sx)} × ${mm(result.grid.sz)}`;
    return [p, text];
  }

  // size_members: sets each column top along the front, crosses the frame, then runs the ridge.
  const front = zs[zs.length - 1];
  const colStops = xs.map((x, i) => [0.12 + 0.235 * (i / Math.max(1, xs.length - 1)), [x, eave, front]]);
  const memberStops = [
    [0, [xs[0], 0, front]], ...colStops,
    [0.4, [xs[0], eave, 0]], [0.58, [xs[xs.length - 1], eave, 0]],
    ...(gable
      ? [[0.64, [-L / 2, top + 0.2, 0]], [0.86, [L / 2, top + 0.2, 0]]]
      : [[0.66, [-L / 2, top + 0.2, -W / 4]], [0.9, [L / 2, top + 0.2, -W / 4]]]),
  ];
  function members() {
    const u = st.u;
    const text = u <= 0 ? '' : u < 0.37 ? sec.column.name : u < 0.62 ? sec.beamX.name : gable ? sec.rafter.name : sec.roofDeck.name;
    return [along(memberStops, u), text];
  }

  const jobs = [footprint, grid, members];
  let target = null;
  function update(camera, width, height) {
    const t = tl.time();
    // Where the hand-off goes: the caret of the message box, measured once per frame.
    if (t > HANDOFF - 0.2 && handoff) {
      const r = handoff(), lr = root.getBoundingClientRect();
      target = r ? [r.left - lr.left + 1, r.top - lr.top + 14] : target;
    }
    curs.forEach((c, i) => {
      const [p, text] = jobs[i]();
      _v.set(p[0], p[1], p[2]).project(camera);
      let x = ((_v.x + 1) / 2) * width, yy = ((1 - _v.y) / 2) * height;
      // Arrive from below right, drift a little while waiting, then glide to the message box.
      const inP = smooth((t - ENTER[i]) / 0.6);
      x += (1 - inP) * 90 + Math.sin(t * 1.6 + i * 2) * 1.5;
      yy += (1 - inP) * 70 + Math.cos(t * 1.3 + i) * 1.5;
      // On the way out the name tags fade first, so only the crosshairs meet at the caret and fold into it.
      const outT = (t - HANDOFF - i * 0.1) / 0.8;
      const outP = smooth(outT);
      if (target && outP > 0) { x = mix(x, target[0], outP); yy = mix(yy, target[1], outP); }
      const alpha = Math.min(inP, 1 - clamp01((outT - 0.65) / 0.35));
      c.el.style.opacity = alpha.toFixed(3);
      c.el.style.transform = `translate3d(${x.toFixed(1)}px, ${yy.toFixed(1)}px, 0) scale(${(1 - 0.45 * smooth((outT - 0.4) / 0.6)).toFixed(3)})`;
      c.tag.style.opacity = (1 - smooth(outT / 0.35)).toFixed(3);
      if (text !== c.text) { c.text = text; c.read.textContent = text; c.tagW = c.tag.offsetWidth; }
      // Keep each tag on the sheet: it flips left near the right edge and up near the bottom.
      const side = `${x + 14 + c.tagW > width - 6 ? 'l' : ''}${yy + 40 > height ? 'u' : ''}`;
      if (side !== c.side) { c.side = side; c.el.dataset.side = side; }
    });
  }

  let done = false;
  function dispose() {
    if (done) return;
    done = true;
    tl.kill();
    window.removeEventListener('keydown', hurry);
    window.removeEventListener('pointerdown', hurry);
    root.remove();
  }
  function finish() {
    e.footprint.visible = false;
    e.footMat.uniforms.uOpacity.value = 0.9;
    dirty();
    dispose();
    onDone?.();
  }
  return { tl, update, dispose };
}
