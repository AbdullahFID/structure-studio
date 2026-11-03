// ============================================================================
// Structure Studio engine: brief parser, bay study, member sizing, synthetic
// cost / carbon / schedule, ranking, and geometry description for the viewer.
// Pure functions only (no DOM, no three.js) so it can move to a backend later.
// All factors are SYNTHETIC placeholders for WSP's real tools and data.
// ============================================================================

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ceilTo = (v, step) => Math.ceil(v / step - 1e-9) * step;
const mm = (v) => Math.round(v * 1000);
const pickUp = (list, v) => list.find((x) => x >= v - 1e-6) ?? list[list.length - 1];

// Gridline letters skip I and O, as on structural drawings.
export const GRID_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export const PRIORITIES = {
  balanced: { label: 'Balanced', weights: { cost: 1, carbon: 1, schedule: 1 } },
  carbon: { label: 'Lowest carbon', weights: { cost: 0.6, carbon: 2.2, schedule: 0.6 } },
  cost: { label: 'Lowest cost', weights: { cost: 2.2, carbon: 0.6, schedule: 0.6 } },
  schedule: { label: 'Fastest build', weights: { cost: 0.6, carbon: 0.6, schedule: 2.2 } },
};

export const SHARED = {
  footing: { costPerM3: 780, carbonPerM3: 360, depth: 0.45 },
  pitchDeg: 20,
  limits: { length: [3, 120], width: [3, 60], storeyHeight: [2.4, 8], floors: [1, 12], bay: [2, 14] },
};

export const MATERIALS = {
  timber: {
    key: 'timber', name: 'Mass timber', short: 'Timber', code: 'CSA O86',
    system: 'Glulam posts and beams with CLT panels',
    maxSpan: 6, selfWeight: 0.6,
    carbon: { perM3: 240 },
    cost: { column: 3600, beam: 3300, slab: 1750, perPiece: 1400, perColumn: 1200 },
    build: { rate: 240, piecesPerDay: 26, minDays: 3, cureDays: 0 },
  },
  concrete: {
    key: 'concrete', name: 'Reinforced concrete', short: 'Concrete', code: 'CSA A23.3',
    system: 'Cast-in-place columns, beams and two-way slabs',
    maxSpan: 8, selfWeight: 1.0,
    carbon: { perM3: 520 },
    cost: { column: 2100, beam: 1850, slab: 1000, perPiece: 1100, perColumn: 2200 },
    build: { rate: 130, piecesPerDay: 16, minDays: 7, cureDays: 7 },
  },
  steel: {
    key: 'steel', name: 'Structural steel', short: 'Steel', code: 'CSA S16',
    system: 'Wide-flange frame with composite deck',
    maxSpan: 10, selfWeight: 0.8,
    carbon: { perKg: 1.25, compositeDeckPerM2: 68, roofDeckPerM2: 14 },
    cost: { perKg: 6.4, compositeDeckPerM2: 165, roofDeckPerM2: 48, perPiece: 2100, perColumn: 1400 },
    build: { rate: 260, piecesPerDay: 30, minDays: 4, cureDays: 0 },
  },
};
export const MATERIAL_KEYS = Object.keys(MATERIALS);

// ---------------------------------------------------------------- sections --
const GLULAM_W = [130, 175, 215, 265, 315, 365, 415, 465, 515, 565, 615, 665];
const W_DEPTHS = [150, 200, 250, 310, 360, 410, 460, 530, 610, 690, 760, 840];

const sections = {
  timber: {
    beam(span) {
      const d = ceilTo(clamp(span / 14, 0.228, 1.4), 0.038); // 38 mm laminations
      const b = pickUp(GLULAM_W, d * 400) / 1000;
      return { b, d, area: b * d, name: `Glulam ${mm(b)} × ${mm(d)}` };
    },
    column(trib, floors) {
      const b = pickUp(GLULAM_W, clamp(0.18 + 0.0016 * trib * floors, 0.175, 0.665) * 1000) / 1000;
      const d = ceilTo(b, 0.038);
      return { b, d, area: b * d, name: `Glulam ${mm(b)} × ${mm(d)}` };
    },
    slab(span) {
      const plies = span <= 4.2 ? 3 : span <= 6.4 ? 5 : span <= 8 ? 7 : 9;
      const t = plies * 0.035;
      return { t, name: `CLT ${plies}-ply, ${mm(t)} mm` };
    },
    roofDeck(span) { return this.slab(Math.min(span, 3.6)); },
  },
  concrete: {
    beam(span) {
      const d = ceilTo(clamp(span / 12, 0.35, 1.1), 0.025);
      const b = ceilTo(clamp(d * 0.5, 0.3, 0.6), 0.025);
      return { b, d, area: b * d, name: `Beam ${mm(b)} × ${mm(d)}` };
    },
    column(trib, floors) {
      const b = ceilTo(clamp(0.3 + 0.0012 * trib * floors, 0.3, 1.0), 0.05);
      return { b, d: b, area: b * b, name: `Column ${mm(b)} × ${mm(b)}` };
    },
    slab(span) {
      const t = ceilTo(clamp(span / 33, 0.15, 0.32), 0.01);
      return { t, name: `Two-way slab, ${mm(t)} mm` };
    },
    roofDeck() { return { t: 0.15, name: 'Sloped slab, 150 mm' }; },
  },
  steel: {
    beam(span, factor = 1) {
      const dn = pickUp(W_DEPTHS, clamp((span * factor) / 22, 0.15, 0.84) * 1000);
      const d = dn / 1000;
      const area = 0.045 * d * d;
      const kgm = Math.round(area * 7850);
      return { b: clamp(d * 0.42, 0.1, 0.3), d, area, kgm, name: `W${dn}×${kgm}` };
    },
    column(trib, floors) {
      const dn = pickUp([200, 250, 310, 360, 410, 460], clamp(0.18 + 0.0004 * trib * floors, 0.18, 0.46) * 1000);
      const d = dn / 1000;
      const area = 0.12 * d * d;
      const kgm = Math.round(area * 7850);
      return { b: d * 0.85, d, area, kgm, name: `W${dn}×${kgm}` };
    },
    brace() { return { b: 0.127, d: 0.127, kgm: 28, name: 'HSS 127×127×8' }; },
    slab() { return { t: 0.14, name: 'Composite deck, 140 mm' }; },
    roofDeck() { return { t: 0.04, name: 'Metal roof deck, 38 mm' }; },
  },
};

// ---------------------------------------------------------------- spec -----
export function normalizeSpec(s = {}) {
  const lim = SHARED.limits;
  return {
    type: s.type || 'building',
    length: clamp(+s.length || 12, ...lim.length),
    width: clamp(+s.width || 8, ...lim.width),
    storeyHeight: clamp(+s.storeyHeight || 3.6, ...lim.storeyHeight),
    floors: Math.round(clamp(+s.floors || 1, ...lim.floors)),
    roof: s.roof === 'gable' ? 'gable' : 'flat',
    bay: s.bay ? clamp(+s.bay, ...lim.bay) : null,
  };
}

export function layoutGrid(L, W, span) {
  const nx = Math.max(1, Math.ceil(L / span - 1e-9));
  const nz = Math.max(1, Math.ceil(W / span - 1e-9));
  const sx = L / nx, sz = W / nz;
  const xs = Array.from({ length: nx + 1 }, (_, i) => -L / 2 + i * sx);
  const zs = Array.from({ length: nz + 1 }, (_, j) => -W / 2 + j * sz);
  return { nx, nz, sx, sz, xs, zs, span };
}

// Size members and add up quantities, cost, carbon and schedule for one grid.
export function evaluate(spec, matKey, span) {
  const M = MATERIALS[matKey];
  const S = sections[matKey];
  const { length: L, width: W, storeyHeight: H, floors: n, roof } = spec;
  const g = layoutGrid(L, W, span);
  const trib = g.sx * g.sz;
  const plan = L * W;
  const pitch = (SHARED.pitchDeg * Math.PI) / 180;
  const gable = roof === 'gable';
  const nCols = (g.nx + 1) * (g.nz + 1);

  // Sections
  const sec = { column: S.column(trib, n) };
  if (matKey === 'steel') {
    sec.beamX = S.beam(g.sx);
    sec.girder = S.beam(g.sz, 1.25);
    sec.infill = S.beam(g.sx, 0.9);
    sec.brace = S.brace();
  } else {
    sec.beamX = S.beam(g.sx);
    sec.girder = S.beam(g.sz);
  }
  sec.slab = S.slab(Math.min(g.sx, g.sz));
  if (gable) {
    const slope = W / 2 / Math.cos(pitch);
    sec.rafter = S.beam(Math.min(slope, g.sz / Math.cos(pitch)));
    sec.purlin = S.beam(g.sx, 0.7);
    sec.roofDeck = S.roofDeck(g.sx);
  } else {
    sec.roofDeck = matKey === 'steel' ? S.roofDeck() : sec.slab;
  }
  const infillPerBay = matKey === 'steel' ? Math.max(0, Math.ceil(g.sz / 3.2) - 1) : 0;

  // Lengths (m)
  const colLen = nCols * n * H;
  const beamXLenPerLevel = (g.nz + 1) * L;
  const girderLenPerLevel = (g.nx + 1) * W;
  const infillLenPerLevel = infillPerBay * g.nz * L;
  const levels = n; // beams at every level, including roof / tie level
  const slabLevels = gable ? n - 1 : n - 1; // suspended floors
  const roofArea = gable ? 2 * L * (W / 2 / Math.cos(pitch)) : plan;
  const rafterLen = gable ? 2 * (g.nx + 1) * (W / 2 / Math.cos(pitch)) + L : 0; // rafters + ridge
  const purlinLen = gable ? 4 * L : 0;
  const bracedBays = (g.nx >= 3 ? 4 : 2) + 2;
  const braceLen = matKey === 'steel' ? bracedBays * 2 * n * Math.hypot(g.sx, H) : 0;

  // Pieces to fabricate, connect and erect (drives connection cost and crane time)
  const piecesPerLevel = nCols + (g.nz + 1) * g.nx + (g.nx + 1) * g.nz + infillPerBay * g.nz * g.nx;
  const roofPieces = gable ? 2 * (g.nx + 1) + 1 + 4 * g.nx : 0;
  const pieces = piecesPerLevel * n + roofPieces;

  // Footings
  const footVol = clamp(0.35 + 0.025 * trib * n * M.selfWeight, 0.4, 14);
  const footingVol = footVol * nCols;
  const footSide = Math.max(0.8, Math.sqrt(footVol / SHARED.footing.depth));

  // Small members connect cheaply; piece costs reach full rate at ~90 m² of load per column stack.
  const pieceScale = clamp((trib * n) / 90, 0.25, 1);
  let cost = footingVol * SHARED.footing.costPerM3 + pieceScale * (pieces * M.cost.perPiece + nCols * n * M.cost.perColumn);
  let carbon = footingVol * SHARED.footing.carbonPerM3;
  let steelKg = 0, volume = 0;

  if (matKey === 'steel') {
    steelKg =
      colLen * sec.column.kgm +
      levels * (beamXLenPerLevel * sec.beamX.kgm + girderLenPerLevel * sec.girder.kgm + (gable ? 0 : infillLenPerLevel * sec.infill.kgm)) +
      (gable ? (n - 1) * infillLenPerLevel * sec.infill.kgm + rafterLen * sec.rafter.kgm + purlinLen * sec.purlin.kgm : 0) +
      braceLen * sec.brace.kgm;
    const compositeArea = slabLevels * plan;
    cost += steelKg * M.cost.perKg + compositeArea * M.cost.compositeDeckPerM2 + roofArea * M.cost.roofDeckPerM2;
    carbon += steelKg * M.carbon.perKg + compositeArea * M.carbon.compositeDeckPerM2 + roofArea * M.carbon.roofDeckPerM2;
  } else {
    const vCol = colLen * sec.column.area;
    const vBeam =
      levels * (beamXLenPerLevel * sec.beamX.area + girderLenPerLevel * sec.girder.area) +
      (gable ? rafterLen * sec.rafter.area + purlinLen * sec.purlin.area : 0);
    const vSlab = slabLevels * plan * sec.slab.t + roofArea * sec.roofDeck.t;
    volume = vCol + vBeam + vSlab;
    cost += vCol * M.cost.column + vBeam * M.cost.beam + vSlab * M.cost.slab;
    carbon += volume * M.carbon.perM3;
  }

  // Schedule (working days, 5 per week)
  const mobilize = 1 + Math.min(4, (plan * n) / 400);
  const footingDays = 2 + 0.35 * nCols;
  let floorDays = 0;
  for (let k = 0; k < n; k++) {
    const pk = piecesPerLevel + (k === n - 1 ? roofPieces : 0);
    floorDays += Math.max(M.build.minDays, (plan * (k === n - 1 && gable ? 1.1 : 1)) / M.build.rate + pk / M.build.piecesPerDay);
  }
  const days = mobilize + footingDays + floorDays + M.build.cureDays;

  const gfa = plan * n;
  return {
    span, grid: g, sections: sec, infillPerBay, footSide, bracedBays,
    quantities: { columns: nCols, footings: nCols, colLen, footingVol, steelKg, volume, gfa, pieces },
    metrics: {
      cost, carbon, weeks: days / 5, days,
      intensity: carbon / gfa, costPerM2: cost / gfa,
      bayX: g.sx, bayZ: g.sz, columns: nCols,
    },
  };
}

// Score relative to the best value in a set: 1.0 means best on every metric.
export function scoreSet(metricsList, priority = 'balanced') {
  const w = PRIORITIES[priority]?.weights || PRIORITIES.balanced.weights;
  const keys = [['cost', 'cost'], ['carbon', 'carbon'], ['schedule', 'weeks']];
  const best = Object.fromEntries(keys.map(([k, m]) => [k, Math.min(...metricsList.map((x) => x[m]))]));
  const wsum = w.cost + w.carbon + w.schedule;
  return metricsList.map((x) => keys.reduce((s, [k, m]) => s + (w[k] * (x[m] / best[k])), 0) / wsum);
}

// The agent's framing study: try several bay sizes, keep the best one.
export function studyBays(spec, matKey, priority) {
  const M = MATERIALS[matKey];
  const raw = [0.6, 0.8, 1.0, 1.2].map((f) => Math.round(M.maxSpan * f * 2) / 2);
  const seen = new Set();
  const runs = [];
  for (const s of raw) {
    const r = evaluate(spec, matKey, s);
    const key = `${r.grid.nx}x${r.grid.nz}`;
    if (seen.has(key)) continue;
    seen.add(key);
    runs.push(r);
  }
  // Operations: tight grids crowd the floor plate, so they carry a small penalty.
  const scores = scoreSet(runs.map((r) => r.metrics), priority).map((s, i) => {
    const bay = Math.sqrt(runs[i].grid.sx * runs[i].grid.sz);
    return s + 0.25 * Math.max(0, M.maxSpan / bay - 1) ** 2;
  });
  runs.forEach((r, i) => (r.score = scores[i]));
  const bestIdx = scores.indexOf(Math.min(...scores));
  return { runs, bestIdx };
}

export function computeOption(specIn, matKey, priority = 'balanced') {
  const spec = normalizeSpec(specIn);
  const study = studyBays(spec, matKey, priority);
  const chosen = spec.bay ? evaluate(spec, matKey, spec.bay) : study.runs[study.bestIdx];
  return {
    spec, material: matKey, manualBay: !!spec.bay, ...chosen,
    study: study.runs.map((r, i) => ({
      span: r.span, nx: r.grid.nx, nz: r.grid.nz, sx: r.grid.sx, sz: r.grid.sz,
      cost: r.metrics.cost, carbon: r.metrics.carbon, weeks: r.metrics.weeks,
      columns: r.metrics.columns, depth: Math.max(r.sections.beamX.d, r.sections.girder.d),
      chosen: !spec.bay && i === study.bestIdx,
    })),
  };
}

export function rankOptions(results, priority = 'balanced') {
  if (!results.length) return [];
  const scores = scoreSet(results.map((r) => r.metrics), priority);
  return scores.map((s, i) => ({ i, s })).sort((a, b) => a.s - b.s).map((x) => x.i);
}

// Best (lowest) value per metric across a set, for badges.
export function bestOf(results) {
  const pick = (k) => Math.min(...results.map((r) => r.metrics[k]));
  return { cost: pick('cost'), carbon: pick('carbon'), weeks: pick('weeks'), columns: pick('columns') };
}

// --------------------------------------------------------------- geometry --
// Describes every member as a segment (a -> b) with a cross-section (w x d).
// The viewer turns these into instanced meshes and animates them by `delay`.
export function buildGeometry(res) {
  const { spec, grid: g, sections: sec, material } = res;
  const { length: L, width: W, storeyHeight: H, floors: n, roof } = spec;
  const gable = roof === 'gable';
  const pitch = (SHARED.pitchDeg * Math.PI) / 180;
  const rise = (W / 2) * Math.tan(pitch);
  const top = n * H;
  const P = {
    footing: [], column: [], beam: [], girder: [], infill: [], brace: [],
    slab: [], roofslab: [], rafter: [], purlin: [], roofdeck: [],
    wall: [], glass: [], door: [],
  };
  const num = (i) => String(i + 1);
  const let_ = (j) => GRID_LETTERS[j] || `Z${j}`;
  const span = 0.84 / n; // build window per level
  const t0 = (k) => 0.12 + k * span; // k = 0-based level
  const xN = (x) => (x + L / 2) / L; // 0..1 sweep along length

  const slabT = sec.slab.t;
  const roofT = gable ? 0 : sec.roofDeck.t;
  const slabAt = (k) => (k === n - 1 ? roofT : slabT); // slab thickness at top of level k

  // Footings
  for (let i = 0; i <= g.nx; i++) for (let j = 0; j <= g.nz; j++) {
    const x = g.xs[i], z = g.zs[j];
    P.footing.push({
      a: [x, -0.42, z], b: [x, 0.04, z], w: res.footSide, d: res.footSide,
      delay: 0.1 * xN(x),
      meta: { title: `Footing ${let_(j)}${num(i)}`, sub: `${res.footSide.toFixed(2)} m square pad` },
    });
  }

  for (let k = 0; k < n; k++) {
    const y0 = k * H, y1 = (k + 1) * H;
    const base = t0(k);
    const tTop = slabAt(k);
    // Columns
    for (let i = 0; i <= g.nx; i++) for (let j = 0; j <= g.nz; j++) {
      const x = g.xs[i], z = g.zs[j];
      P.column.push({
        a: [x, y0 + (k === 0 ? 0.04 : 0), z], b: [x, y1 - tTop, z], w: sec.column.b, d: sec.column.d,
        delay: base + 0.28 * span * xN(x), shape: material === 'steel' ? 'I' : 'box', spin: true,
        meta: { title: `Column ${let_(j)}${num(i)}, level ${k + 1}`, sub: `${sec.column.name}, ${H.toFixed(1)} m` },
      });
    }
    const isTop = k === n - 1;
    const yBeam = (d) => y1 - tTop - d / 2;
    // Beams along x (on lettered gridlines)
    for (let j = 0; j <= g.nz; j++) for (let i = 0; i < g.nx; i++) {
      const s = sec.beamX;
      P.beam.push({
        a: [g.xs[i], yBeam(s.d), g.zs[j]], b: [g.xs[i + 1], yBeam(s.d), g.zs[j]], w: s.b, d: s.d,
        delay: base + span * (0.3 + 0.22 * xN(g.xs[i])), shape: material === 'steel' ? 'I' : 'box',
        meta: { title: `Beam on ${let_(j)}, ${num(i)} to ${num(i + 1)}`, sub: `${s.name}, span ${g.sx.toFixed(1)} m` },
      });
    }
    // Girders along z (on numbered gridlines)
    for (let i = 0; i <= g.nx; i++) for (let j = 0; j < g.nz; j++) {
      const s = sec.girder;
      P.girder.push({
        a: [g.xs[i], yBeam(s.d), g.zs[j]], b: [g.xs[i], yBeam(s.d), g.zs[j + 1]], w: s.b, d: s.d,
        delay: base + span * (0.36 + 0.22 * xN(g.xs[i])), shape: material === 'steel' ? 'I' : 'box',
        meta: { title: `${material === 'steel' ? 'Girder' : 'Beam'} on ${num(i)}, ${let_(j)} to ${let_(j + 1)}`, sub: `${s.name}, span ${g.sz.toFixed(1)} m` },
      });
    }
    // Steel infill beams
    if (material === 'steel' && !(isTop && gable) && res.infillPerBay > 0) {
      const s = sec.infill;
      for (let j = 0; j < g.nz; j++) for (let m = 1; m <= res.infillPerBay; m++) {
        const z = g.zs[j] + (m * g.sz) / (res.infillPerBay + 1);
        for (let i = 0; i < g.nx; i++) {
          P.infill.push({
            a: [g.xs[i], yBeam(s.d), z], b: [g.xs[i + 1], yBeam(s.d), z], w: s.b * 0.8, d: s.d,
            delay: base + span * (0.5 + 0.18 * xN(g.xs[i])), shape: 'I',
            meta: { title: 'Infill beam', sub: `${s.name}, span ${g.sx.toFixed(1)} m` },
          });
        }
      }
    }
    // Steel X-bracing in end bays
    if (material === 'steel') {
      const s = sec.brace;
      const ib = g.nx >= 3 ? [0, g.nx - 1] : [0];
      const yb0 = y0 + 0.15, yb1 = y1 - tTop - sec.beamX.d;
      for (const z of [g.zs[0], g.zs[g.nz]]) for (const i of ib) {
        const x0 = g.xs[i], x1 = g.xs[i + 1];
        for (const [a, b] of [[[x0, yb0, z], [x1, yb1, z]], [[x1, yb0, z], [x0, yb1, z]]]) {
          P.brace.push({ a, b, w: s.b, d: s.d, delay: base + span * 0.55, meta: { title: 'Vertical brace', sub: s.name } });
        }
      }
      const jb = Math.floor((g.nz - 1) / 2);
      const z0 = g.zs[jb], z1 = g.zs[jb + 1];
      for (const x of [g.xs[0], g.xs[g.nx]]) {
        for (const [a, b] of [[[x, yb0, z0], [x, yb1, z1]], [[x, yb0, z1], [x, yb1, z0]]]) {
          P.brace.push({ a, b, w: s.b, d: s.d, delay: base + span * 0.58, meta: { title: 'Vertical brace', sub: s.name } });
        }
      }
    }
    // Slabs (CLT panels for timber, one pour per bay otherwise)
    if (!(isTop && gable)) {
      const t = tTop;
      const role = isTop ? 'roofslab' : 'slab';
      const name = isTop ? sec.roofDeck.name : sec.slab.name;
      const yS = y1 - t / 2;
      if (material === 'timber') {
        const strips = Math.max(1, Math.ceil(L / 2.4));
        const pw = L / strips;
        for (let j = 0; j < g.nz; j++) for (let p = 0; p < strips; p++) {
          const xa = -L / 2 + p * pw + 0.012, xb = -L / 2 + (p + 1) * pw - 0.012;
          P[role].push({
            a: [xa, yS, (g.zs[j] + g.zs[j + 1]) / 2], b: [xb, yS, (g.zs[j] + g.zs[j + 1]) / 2], w: g.sz - 0.02, d: t,
            delay: base + span * (0.62 + 0.3 * (p / strips)),
            meta: { title: isTop ? 'Roof panel' : `Floor panel, level ${k + 2}`, sub: `${name}, ${pw.toFixed(2)} m wide` },
          });
        }
      } else {
        for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
          P[role].push({
            a: [g.xs[i], yS, (g.zs[j] + g.zs[j + 1]) / 2], b: [g.xs[i + 1], yS, (g.zs[j] + g.zs[j + 1]) / 2], w: g.sz, d: t,
            delay: base + span * (0.62 + 0.3 * xN(g.xs[i])),
            meta: { title: isTop ? 'Roof slab' : `Floor slab, level ${k + 2}`, sub: name },
          });
        }
      }
    }
  }

  // Gable roof framing
  if (gable) {
    const base = t0(n - 1) + span * 0.62;
    const r = sec.rafter, p = sec.purlin;
    const over = 0.35;
    const ox = over * Math.cos(pitch), oy = over * Math.sin(pitch);
    for (let i = 0; i <= g.nx; i++) {
      const x = g.xs[i];
      for (const s of [-1, 1]) {
        P.rafter.push({
          a: [x, top - oy, s * (W / 2 + ox)], b: [x, top + rise, 0], w: r.b, d: r.d,
          delay: base + 0.12 * span * xN(x), shape: material === 'steel' ? 'I' : 'box',
          meta: { title: `Rafter on ${num(i)}`, sub: `${r.name}, ${SHARED.pitchDeg}° pitch` },
        });
      }
    }
    P.rafter.push({
      a: [-L / 2, top + rise, 0], b: [L / 2, top + rise, 0], w: r.b, d: r.d,
      delay: base + 0.14 * span, shape: material === 'steel' ? 'I' : 'box',
      meta: { title: 'Ridge beam', sub: r.name },
    });
    // Purlins sit on the rafters and the deck sits on the purlins, offset along the slope normal
    const deckT = Math.max(0.05, sec.roofDeck.t);
    const slope = W / 2 / Math.cos(pitch) + over;
    for (const s of [-1, 1]) {
      const e0 = [s * (W / 2 + ox), top - oy], e1 = [0, top + rise];
      const n = [s * Math.sin(pitch), Math.cos(pitch)]; // (z, y) outward normal
      const at = (f, off) => [e0[0] + f * (e1[0] - e0[0]) + n[0] * off, e0[1] + f * (e1[1] - e0[1]) + n[1] * off];
      for (const f of [0.3, 0.62, 0.92]) {
        const [z, yy] = at(f, r.d / 2 + p.d / 2);
        P.purlin.push({
          a: [-L / 2, yy, z], b: [L / 2, yy, z], w: p.b, d: p.d, roll: s * pitch, delay: base + 0.2 * span,
          meta: { title: 'Purlin', sub: p.name },
        });
      }
      const [zc, yc] = at(0.5, r.d / 2 + p.d + deckT / 2 + 0.01);
      P.roofdeck.push({
        a: [-L / 2 - 0.3, yc, zc], b: [L / 2 + 0.3, yc, zc], w: slope, d: deckT, roll: s * pitch,
        delay: base + 0.25 * span, meta: { title: 'Roof deck', sub: sec.roofDeck.name },
      });
    }
  }

  // Envelope (walls, glazing, door) for the "Envelope" view
  const off = sec.column.b / 2 + 0.08;
  const wallT = 0.12;
  for (let k = 0; k < n; k++) {
    const y0 = k * H, h = H;
    const yc = y0 + h / 2;
    for (const s of [-1, 1]) {
      P.wall.push({ a: [-L / 2 - off, yc, s * (W / 2 + off)], b: [L / 2 + off, yc, s * (W / 2 + off)], w: wallT, d: h, delay: 0, meta: { title: 'Wall', sub: 'Cladding' } });
      P.wall.push({ a: [s * (L / 2 + off), yc, -W / 2 - off], b: [s * (L / 2 + off), yc, W / 2 + off], w: wallT, d: h, delay: 0, meta: { title: 'Wall', sub: 'Cladding' } });
    }
    // Glazing between columns on the long walls (skip the door bay at ground level)
    for (const s of [-1, 1]) for (let i = 0; i < g.nx; i++) {
      if (k === 0 && s === 1 && i === 0) continue;
      const inset = Math.min(0.6, g.sx * 0.12);
      const gh = Math.min(1.6, h * 0.45);
      const gy = y0 + Math.max(0.9, h * 0.32) + gh / 2;
      if (g.sx - 2 * inset < 0.8) continue;
      P.glass.push({ a: [g.xs[i] + inset, gy, s * (W / 2 + off + wallT / 2 + 0.01)], b: [g.xs[i + 1] - inset, gy, s * (W / 2 + off + wallT / 2 + 0.01)], w: 0.02, d: gh, delay: 0, meta: { title: 'Window', sub: 'Glazing' } });
    }
  }
  const doorW = L > 14 ? 3.6 : 1.0, doorH = L > 14 ? Math.min(3.6, H - 0.4) : Math.min(2.1, H - 0.3);
  const dx = g.xs[0] + Math.min(g.sx, L) / 2;
  P.door.push({ a: [dx - doorW / 2, doorH / 2, W / 2 + off + wallT / 2 + 0.015], b: [dx + doorW / 2, doorH / 2, W / 2 + off + wallT / 2 + 0.015], w: 0.03, d: doorH, delay: 0, meta: { title: 'Door', sub: `${doorW.toFixed(1)} × ${doorH.toFixed(1)} m` } });

  return {
    parts: P,
    bounds: { L, W, top: gable ? top + rise : top, rise, gable, off, n, H },
    grid: {
      xs: g.xs, zs: g.zs,
      xLabels: g.xs.map((_, i) => num(i)),
      zLabels: g.zs.map((_, j) => let_(j)),
    },
  };
}

// ----------------------------------------------------------------- parser --
const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, single: 1 };
const NUM = '(\\d+(?:\\.\\d+)?)';
const UNIT = '(m|metres?|meters?|ft|feet|foot|\')?';

const MAT_PATTERNS = [
  ['timber', /\b(timber|wood(en)?|glulam|clt|mass[- ]timber|lumber)\b/gi],
  ['concrete', /\b(concrete|rc|cast[- ]in[- ]place|precast)\b/gi],
  ['steel', /\b(steel|metal)\b/gi],
];
const TYPES = ['shed', 'garage', 'workshop', 'warehouse', 'office', 'pavilion', 'school', 'lab', 'laboratory', 'library', 'residence', 'house', 'cabin', 'barn', 'studio', 'gym', 'hangar', 'clinic', 'building', 'annex', 'hall'];

export function parseBrief(text) {
  const t = ` ${String(text || '').toLowerCase().replace(/×/g, 'x')} `;
  const out = { materials: [], units: 'm' };
  const toM = (v, u) => (u && /^(ft|feet|foot|')$/.test(u) ? ((out.units = 'ft'), v * 0.3048) : v);

  // Footprint "6 x 4", "6 m by 4 m", "6x4x3 m"
  const dimRe = new RegExp(`${NUM}\\s*${UNIT}\\s*(?:x|by|\\*)\\s*${NUM}\\s*${UNIT}(?:\\s*(?:x|by|\\*)\\s*${NUM}\\s*${UNIT})?`, 'i');
  const dm = t.match(dimRe);
  if (dm) {
    const u = dm[2] || dm[4] || dm[6];
    const a = toM(+dm[1], u), b = toM(+dm[3], u);
    out.length = Math.max(a, b);
    out.width = Math.min(a, b);
    if (dm[5]) out.storeyHeight = toM(+dm[5], u);
  }
  // Single dimension edits
  const lenM = t.match(new RegExp(`${NUM}\\s*${UNIT}\\s*(?:long|in length)\\b`)) || t.match(new RegExp(`length\\s*(?:to|of|=|:)?\\s*${NUM}\\s*${UNIT}`));
  if (lenM && !dm) out.length = toM(+lenM[1], lenM[2]);
  const widM = t.match(new RegExp(`${NUM}\\s*${UNIT}\\s*(?:wide|in width|deep)\\b`)) || t.match(new RegExp(`width\\s*(?:to|of|=|:)?\\s*${NUM}\\s*${UNIT}`));
  if (widM && !dm) out.width = toM(+widM[1], widM[2]);

  // Height
  const hM =
    t.match(new RegExp(`${NUM}\\s*${UNIT}\\s*(?:tall|high|clear|to (?:the )?eaves?|eaves?|floor[- ]to[- ]floor|storey height|story height|ceilings?)\\b`)) ||
    t.match(new RegExp(`(?:height|eaves?|clear height|storey height|story height)\\s*(?:of|to|=|:|at)?\\s*${NUM}\\s*${UNIT}`));
  if (hM) out.storeyHeight = toM(+hM[1], hM[2]);

  // Floors
  const fM = t.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|single)[\s-]*(?:storeys?|stor(?:y|ies)|floors?|levels?)\b/);
  if (fM && !/(storey|story) height/.test(fM[0])) out.floors = WORDNUM[fM[1]] || +fM[1];
  if (/\bbungalow\b/.test(t)) out.floors = 1;

  // Materials (in order of mention)
  const found = [];
  for (const [key, re] of MAT_PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(t);
    if (m) found.push([m.index, key]);
  }
  out.materials = found.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  if (/\ball (three|3)( materials| systems)?\b|\bevery material\b/.test(t)) out.materials = [...MATERIAL_KEYS];

  // Roof
  if (/\b(gable|gabled|pitched|peaked|sloped|a-frame)\b/.test(t)) out.roof = 'gable';
  else if (/\bflat(?:[- ]roof)?\b/.test(t)) out.roof = 'flat';

  // Type
  const ty = TYPES.find((k) => new RegExp(`\\b${k}s?\\b`).test(t));
  if (ty) out.type = ty === 'laboratory' ? 'lab' : ty;

  // Priority
  if (/\b(carbon|emissions?|green|sustainab\w*|low[- ]impact|climate)\b/.test(t)) out.priority = 'carbon';
  else if (/\b(cheap\w*|cost|budget|price|afford\w*|economical)\b/.test(t)) out.priority = 'cost';
  else if (/\b(fast\w*|quick\w*|schedule|speed|asap|soon)\b/.test(t)) out.priority = 'schedule';
  else if (/\bbalanced?\b/.test(t)) out.priority = 'balanced';

  // Bay spacing
  const bM = t.match(new RegExp(`${NUM}\\s*${UNIT}\\s*bays?\\b`)) || t.match(new RegExp(`bays?\\s*(?:of|at|spacing|to|=|:)?\\s*${NUM}\\s*${UNIT}`)) || t.match(new RegExp(`columns?\\s*(?:every|at|spaced)\\s*${NUM}\\s*${UNIT}`));
  if (bM) out.bay = toM(+bM[1], bM[2]);
  if (/\b(auto(matic)?|optimi[sz]e)\b.*\bbays?\b|\bbays?\b.*\b(auto(matic)?|optimi[sz]e)/.test(t)) out.bay = 'auto';

  // Intents
  const letter = (re) => { const m = t.match(re); return m ? m[1].toUpperCase() : null; };
  out.deleteLetter = letter(/\b(?:delete|remove|drop|discard|get rid of)\s+(?:option\s+)?([a-h])\b(?!\s*\w*\s*storey)/);
  if (!out.deleteLetter && /\b(delete|remove|discard)\s+(this|the current|current|active)\s+option\b/.test(t)) out.deleteLetter = 'ACTIVE';
  out.selectLetter = letter(/\b(?:show|open|go to|view|select|switch to|back to)\s+option\s+([a-h])\b/);
  out.newOption = /\b(new option|another option|as an option|second option|third option|also try|add (?:a |an )?(?:\w+ )?(?:version|option)|try (?:it |this |the same )?(?:in|with|using|as)|what about|alternative|duplicate|copy (?:of|this))\b/.test(t);
  out.compare = /\b(compare|comparison|side[- ]by[- ]side|split[- ]?screen)\b/.test(t);
  out.report = /\b(report|summary|summari[sz]e|write[- ]?up)\b/.test(t);
  out.reset = /\b(start over|new project|reset|clear everything)\b/.test(t);
  out.help = /\b(help|what can you do|how does this work)\b/.test(t) || t.trim() === '?';
  out.undo = /\bundo\b/.test(t);
  out.envelope = /\b(show|add|turn on)\b.*\b(walls?|cladding|envelope)\b/.test(t) ? true : /\b(hide|remove|turn off)\b.*\b(walls?|cladding|envelope)\b/.test(t) ? false : undefined;

  out.hasSpec = ['length', 'width', 'storeyHeight', 'floors', 'roof', 'type'].some((k) => out[k] !== undefined) || out.bay !== undefined;
  return out;
}

// ------------------------------------------------------------ formatters --
export const fmt = {
  money(v) {
    if (v >= 1e6) return `$${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1)}k`;
    return `$${Math.round(v)}`;
  },
  carbon(kg) {
    const t = kg / 1000;
    return t >= 100 ? `${Math.round(t)}` : t >= 10 ? t.toFixed(1) : t.toFixed(2);
  },
  weeks(w) { return w >= 10 ? `${Math.round(w)}` : w.toFixed(1); },
  m(v, d = 1) { return `${(+v).toFixed(d)}`; },
  bay(sx, sz) { return `${sx.toFixed(1)} × ${sz.toFixed(1)}`; },
  pct(a, b) { return Math.round(((a - b) / b) * 100); },
  int(v) { return Math.round(v).toLocaleString('en-CA'); },
};

export const titleCase = (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
