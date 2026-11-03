import { MATERIALS, PRIORITIES, computeOption, normalizeSpec, rankOptions, buildGeometry, fmt } from '../engine/engine.js';

export const REDUCED = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const wait = (ms) => new Promise((r) => setTimeout(r, REDUCED ? Math.min(ms, 60) : ms));
let _uid = 0;
export const uid = (p) => `${p}${++_uid}`;
export const LETTERS = 'ABCDEFGH';
export const MAX_OPTIONS = 6;

const TYPE_DEFAULTS = {
  shed: { storeyHeight: 2.7, roof: 'gable' }, garage: { storeyHeight: 3, roof: 'gable' }, cabin: { storeyHeight: 2.7, roof: 'gable' },
  barn: { storeyHeight: 5, roof: 'gable' }, house: { storeyHeight: 2.8, roof: 'gable' }, workshop: { storeyHeight: 4.5, roof: 'gable' },
  warehouse: { storeyHeight: 7, roof: 'flat' }, hangar: { storeyHeight: 8, roof: 'flat' }, office: { storeyHeight: 3.8, roof: 'flat' },
  school: { storeyHeight: 3.8, roof: 'flat' }, lab: { storeyHeight: 4.2, roof: 'flat' }, library: { storeyHeight: 4.2, roof: 'flat' },
  gym: { storeyHeight: 7, roof: 'flat' }, pavilion: { storeyHeight: 4, roof: 'gable' }, studio: { storeyHeight: 4, roof: 'gable' },
};
export const typeDefaults = (t) => TYPE_DEFAULTS[t] || { storeyHeight: 3.6, roof: 'flat' };

export const matShort = (k) => MATERIALS[k].short;
export const optLabel = (o) => `${o.letter} ${matShort(o.material)}`;
export const storeys = (n) => `${n} ${n === 1 ? 'storey' : 'storeys'}`;
export const describeSpec = (s) =>
  `${fmt.m(s.length)} × ${fmt.m(s.width)} m, ${storeys(s.floors)}, ${fmt.m(s.storeyHeight)} m ${s.floors > 1 ? 'floor to floor' : 'to the eaves'}, ${s.roof} roof`;
export const capFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const listJoin = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

export function nextLetter(options) {
  const used = options.map((o) => LETTERS.indexOf(o.letter));
  const max = used.length ? Math.max(...used) : -1;
  if (max + 1 < LETTERS.length) return LETTERS[max + 1];
  return LETTERS.split('').find((l) => !options.some((o) => o.letter === l)) || 'Z';
}

export function makeOption(letter, material, spec, priority, stage = 'ready') {
  const result = computeOption(spec, material, priority);
  return { id: uid('o'), letter, material, spec: result.spec, result, version: 1, stage, animate: true, fresh: true };
}

export function withChange(o, patch = {}, material, priority) {
  const m = material || o.material;
  const spec = normalizeSpec({ ...o.spec, ...patch });
  const result = computeOption(spec, m, priority);
  return { ...o, material: m, spec: result.spec, result, version: o.version + 1 };
}

const MEMBER_ROLES = ['footing', 'column', 'beam', 'girder', 'infill', 'brace', 'slab', 'roofslab', 'rafter', 'purlin', 'roofdeck'];
export function memberCount(o) {
  const g = buildGeometry(o.result).parts;
  return MEMBER_ROLES.reduce((s, k) => s + g[k].length, 0);
}

export function recommendation(options, priority) {
  if (options.length < 2) return null;
  const order = rankOptions(options.map((o) => o.result), priority).map((i) => options[i]);
  const [a, b] = order;
  const P = PRIORITIES[priority].label.toLowerCase();
  const ma = a.result.metrics, mb = b.result.metrics;
  const diff = (x, y, more, less) => {
    const p = fmt.pct(x, y);
    return p === 0 ? `about the same ${more.split(' ').pop()}` : `${Math.abs(p)}% ${p > 0 ? more : less}`;
  };
  const cp = Math.abs(fmt.pct(ma.carbon, mb.carbon));
  const carbonTxt = cp === 0 ? 'about the same embodied carbon' : `${cp}% ${ma.carbon <= mb.carbon ? 'less' : 'more'} embodied carbon`;
  const costTxt = diff(ma.cost, mb.cost, 'more to build', 'less to build');
  const wk = ma.weeks - mb.weeks;
  const schedTxt = Math.abs(wk) < 0.15 ? 'takes about as long' : `is ${Math.abs(wk).toFixed(1)} weeks ${wk < 0 ? 'faster' : 'slower'}`;
  const basis = priority === 'balanced' ? 'on a balanced score of cost, carbon and schedule' : `for ${P}`;
  return {
    leadId: a.id,
    order: order.map((o) => o.id),
    text: `Option ${optLabel(a)} ranks first ${basis}. Against ${optLabel(b)}, it has ${carbonTxt}, costs ${costTxt} and ${schedTxt}.`,
  };
}

export function traceStepsFor(opts, multi) {
  const s0 = opts[0].spec;
  const studyDetail = opts.length > 1
    ? opts.map((o) => `${matShort(o.material)} ${fmt.bay(o.result.grid.sx, o.result.grid.sz)} m`).join(', ')
    : `Tried ${plural(opts[0].result.study.length, 'layout')}, kept ${fmt.bay(opts[0].result.grid.sx, opts[0].result.grid.sz)} m bays`;
  const steps = [
    { key: 'footprint', label: 'Lay out the footprint', tool: 'place_footprint', detail: describeSpec(s0) },
    { key: 'bays', label: 'Iterate bay layouts', tool: 'study_bays', detail: studyDetail },
    { key: 'size', label: 'Size members', tool: 'size_members', detail: opts.map((o) => `${matShort(o.material)} columns ${o.result.sections.column.name}`).join(', ') },
    { key: 'estimate', label: 'Estimate cost, carbon and schedule', tool: 'estimate_metrics', detail: 'Synthetic factors, version 0.1' },
    { key: 'build', label: opts.length > 1 ? 'Build 3D models' : 'Build 3D model', tool: 'build_geometry', detail: `${fmt.int(opts.reduce((n, o) => n + memberCount(o), 0))} members` },
  ];
  if (multi) steps.push({ key: 'rank', label: 'Rank options', tool: 'rank_options', detail: '' });
  return steps;
}
