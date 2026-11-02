// ============================================================================
// Structure Studio app (React 18 + htm, no build step).
// The "agent" here is a local script that calls the engine like tools would.
// Swapping it for a real orchestrator only changes createAgent().
// ============================================================================

const { useState, useEffect, useRef, useReducer, useMemo, useCallback, useLayoutEffect } = React;
const html = htm.bind(React.createElement);
const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, REDUCED ? Math.min(ms, 60) : ms));
let _uid = 0;
const uid = (p) => `${p}${++_uid}`;
const LETTERS = 'ABCDEFGH';
const MAX_OPTIONS = 6;

const TYPE_DEFAULTS = {
  shed: { storeyHeight: 2.7, roof: 'gable' }, garage: { storeyHeight: 3, roof: 'gable' }, cabin: { storeyHeight: 2.7, roof: 'gable' },
  barn: { storeyHeight: 5, roof: 'gable' }, house: { storeyHeight: 2.8, roof: 'gable' }, workshop: { storeyHeight: 4.5, roof: 'gable' },
  warehouse: { storeyHeight: 7, roof: 'flat' }, hangar: { storeyHeight: 8, roof: 'flat' }, office: { storeyHeight: 3.8, roof: 'flat' },
  school: { storeyHeight: 3.8, roof: 'flat' }, lab: { storeyHeight: 4.2, roof: 'flat' }, library: { storeyHeight: 4.2, roof: 'flat' },
  gym: { storeyHeight: 7, roof: 'flat' }, pavilion: { storeyHeight: 4, roof: 'gable' }, studio: { storeyHeight: 4, roof: 'gable' },
};
const typeDefaults = (t) => TYPE_DEFAULTS[t] || { storeyHeight: 3.6, roof: 'flat' };

// ------------------------------------------------------------- helpers ----
const matShort = (k) => MATERIALS[k].short;
const optLabel = (o) => `${o.letter} ${matShort(o.material)}`;
const storeys = (n) => `${n} ${n === 1 ? 'storey' : 'storeys'}`;
const describeSpec = (s) => `${fmt.m(s.length)} × ${fmt.m(s.width)} m, ${storeys(s.floors)}, ${fmt.m(s.storeyHeight)} m ${s.floors > 1 ? 'floor to floor' : 'to the eaves'}, ${s.roof} roof`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const listJoin = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

function nextLetter(options) {
  const used = options.map((o) => LETTERS.indexOf(o.letter));
  const max = used.length ? Math.max(...used) : -1;
  for (let i = max + 1; i < LETTERS.length; i++) return LETTERS[i];
  return LETTERS.split('').find((l) => !options.some((o) => o.letter === l)) || 'Z';
}

function makeOption(letter, material, spec, priority, stage = 'ready') {
  const result = computeOption(spec, material, priority);
  return { id: uid('o'), letter, material, spec: result.spec, result, version: 1, stage, animate: true, fresh: true };
}

function withChange(o, patch = {}, material, priority) {
  const m = material || o.material;
  const spec = normalizeSpec({ ...o.spec, ...patch });
  const result = computeOption(spec, m, priority);
  return { ...o, material: m, spec: result.spec, result, version: o.version + 1 };
}

function memberCount(o) {
  const g = buildGeometry(o.result).parts;
  return ['footing', 'column', 'beam', 'girder', 'infill', 'brace', 'slab', 'roofslab', 'rafter', 'purlin', 'roofdeck'].reduce((s, k) => s + g[k].length, 0);
}

function recommendation(options, priority) {
  if (options.length < 2) return null;
  const order = rankOptions(options.map((o) => o.result), priority).map((i) => options[i]);
  const [a, b] = order;
  const P = PRIORITIES[priority].label.toLowerCase();
  const ma = a.result.metrics, mb = b.result.metrics;
  const diff = (x, y, more, less) => {
    const p = fmt.pct(x, y);
    return p === 0 ? `about the same ${more.split(' ').pop()}` : `${Math.abs(p)}% ${p > 0 ? more : less}`;
  };
  const carbonTxt = ma.carbon <= mb.carbon ? `${Math.abs(fmt.pct(ma.carbon, mb.carbon))}% less embodied carbon` : `${Math.abs(fmt.pct(ma.carbon, mb.carbon))}% more embodied carbon`;
  const costTxt = diff(ma.cost, mb.cost, 'more to build', 'less to build');
  const wk = ma.weeks - mb.weeks;
  const schedTxt = Math.abs(wk) < 0.15 ? 'takes about as long' : `is ${Math.abs(wk).toFixed(1)} weeks ${wk < 0 ? 'faster' : 'slower'}`;
  const basis = priority === 'balanced' ? 'on a balanced score of cost, carbon and schedule' : `for ${P}`;
  return {
    leadId: a.id, order: order.map((o) => o.id),
    text: `Option ${optLabel(a)} ranks first ${basis}. Against ${optLabel(b)}, it has ${carbonTxt}, costs ${costTxt} and ${schedTxt}.`,
  };
}

// ----------------------------------------------------------- state ------
function exampleState() {
  const spec = { type: 'workshop', length: 30, width: 12, storeyHeight: 4.5, floors: 1, roof: 'gable' };
  const priority = 'carbon';
  const mats = ['timber', 'concrete', 'steel'];
  const options = mats.map((m, i) => ({ ...makeOption(LETTERS[i], m, spec, priority, i === 0 ? 'build' : 'ready'), fresh: false }));
  const rec = recommendation(options, priority);
  const brief = 'Single-storey workshop, 30 × 12 m, 4.5 m to the eaves, gable roof. Compare timber, concrete and steel. Lowest carbon matters most.';
  return {
    project: { name: 'Campus workshop', example: true },
    priority,
    options,
    activeId: options[0].id,
    compare: false,
    display: { envelope: false, labels: true },
    messages: [
      { id: uid('m'), role: 'user', kind: 'text', text: brief },
      { id: uid('m'), role: 'agent', kind: 'spec', spec: normalizeSpec(spec), materials: mats, priority, assumed: [], state: 'confirmed' },
      {
        id: uid('m'), role: 'agent', kind: 'trace', title: 'Generated 3 options', state: 'done', elapsed: 4.6, collapsed: true,
        steps: traceStepsFor(options, true).map((s) => ({ ...s, status: 'done' })),
      },
      { id: uid('m'), role: 'agent', kind: 'result', optionIds: options.map((o) => o.id), title: '3 options ready', text: rec.text },
    ],
    busy: false, busyLabel: '',
    ui: { report: false, inspector: !window.matchMedia('(max-width: 860px)').matches, panel: 'chat', walk: false },
    walk: { generated: true, viewed: false, changed: false, added: false, managed: false },
    toast: null,
  };
}

function emptyProject(prev) {
  return {
    ...prev,
    project: { name: 'Untitled project', example: false },
    options: [], activeId: null, compare: false, priority: 'balanced',
    messages: [{ id: uid('m'), role: 'agent', kind: 'welcome' }],
    busy: false, busyLabel: '',
    ui: { ...prev.ui, report: false },
    walk: { generated: false, viewed: false, changed: false, added: false, managed: false },
  };
}

function reducer(s, a) {
  switch (a.type) {
    case 'msg/add': return { ...s, messages: [...s.messages, { fresh: true, ...a.msg }] };
    case 'msg/patch': return { ...s, messages: s.messages.map((m) => (m.id === a.id ? { ...m, ...(typeof a.patch === 'function' ? a.patch(m) : a.patch) } : m)) };
    case 'opt/add': return { ...s, options: [...s.options, ...a.options], activeId: a.activate ?? s.activeId, compare: a.compare ?? s.compare };
    case 'opt/set': return { ...s, options: s.options.map((o) => (o.id === a.id ? (typeof a.patch === 'function' ? a.patch(o) : { ...o, ...a.patch }) : o)) };
    case 'opt/stageAll': return { ...s, options: s.options.map((o) => (a.ids.includes(o.id) ? { ...o, stage: a.stage, animate: a.animate ?? true } : o)) };
    case 'opt/remove': {
      const idx = s.options.findIndex((o) => o.id === a.id);
      if (idx < 0) return s;
      const removed = s.options[idx];
      const options = s.options.filter((o) => o.id !== a.id);
      const activeId = s.activeId === a.id ? (options[idx] || options[idx - 1] || options[0])?.id ?? null : s.activeId;
      return { ...s, options, activeId, compare: options.length > 1 && s.compare, toast: { id: uid('t'), text: `Option ${removed.letter} deleted`, undo: { kind: 'option', option: { ...removed, stage: 'ready', fresh: true }, index: idx } } };
    }
    case 'opt/restore': {
      const options = [...s.options];
      options.splice(Math.min(a.index, options.length), 0, a.option);
      return { ...s, options, activeId: a.option.id, toast: null };
    }
    case 'active': return { ...s, activeId: a.id, compare: a.keepCompare ? s.compare : s.compare };
    case 'priority': return {
      ...s, priority: a.value,
      options: s.options.map((o) => ({ ...withChange(o, {}, o.material, a.value), stage: 'ready', animate: false })),
    };
    case 'compare': return { ...s, compare: a.value && s.options.length > 1 };
    case 'display': return { ...s, display: { ...s.display, ...a.patch } };
    case 'busy': return { ...s, busy: a.value, busyLabel: a.label ?? (a.value ? s.busyLabel : '') };
    case 'busyLabel': return { ...s, busyLabel: a.label };
    case 'project': return { ...s, project: { ...s.project, ...a.patch } };
    case 'ui': return { ...s, ui: { ...s.ui, ...a.patch } };
    case 'walk': return s.walk[a.key] ? s : { ...s, walk: { ...s.walk, [a.key]: true } };
    case 'toast': return { ...s, toast: a.toast };
    case 'reset': return { ...emptyProject(s), toast: { id: uid('t'), text: 'Started a new project', undo: { kind: 'project', snapshot: s } } };
    case 'restoreProject': return { ...a.snapshot, toast: null, ui: { ...a.snapshot.ui, report: false } };
    default: return s;
  }
}

// ------------------------------------------------------------- agent -----
function traceStepsFor(opts, multi) {
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

function createAgent(get, dispatch, hooks) {
  const builtWaiters = new Map();
  let pending = null; // partial brief waiting for a footprint

  const say = (text, extra = {}) => dispatch({ type: 'msg/add', msg: { id: uid('m'), role: 'agent', kind: 'text', text, ...extra } });

  const waitBuilt = (id) => new Promise((resolve) => {
    builtWaiters.set(id, resolve);
    setTimeout(() => { if (builtWaiters.get(id) === resolve) { builtWaiters.delete(id); dispatch({ type: 'opt/stageAll', ids: [id], stage: 'ready' }); resolve(); } }, 6000);
  });

  async function runTrace(title, steps) {
    const id = uid('m');
    const t0 = performance.now();
    dispatch({ type: 'msg/add', msg: { id, role: 'agent', kind: 'trace', title, state: 'running', steps: steps.map(({ run, ms, ...s }) => ({ ...s, status: 'pending', detail: '' })) } });
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      dispatch({ type: 'msg/patch', id, patch: (m) => ({ steps: m.steps.map((x, j) => (j === i ? { ...x, status: 'running' } : x)) }) });
      dispatch({ type: 'busyLabel', label: st.label });
      await wait(st.ms ?? 450);
      if (st.run) await st.run();
      const detail = typeof st.detail === 'function' ? st.detail() : st.detail;
      dispatch({ type: 'msg/patch', id, patch: (m) => ({ steps: m.steps.map((x, j) => (j === i ? { ...x, status: 'done', detail } : x)) }) });
    }
    const elapsed = (performance.now() - t0) / 1000;
    dispatch({ type: 'msg/patch', id, patch: { state: 'done', elapsed, title: title.replace(/^Generating/, 'Generated').replace(/^Updating/, 'Updated').replace(/^Adding/, 'Added') } });
    await wait(260);
    dispatch({ type: 'msg/patch', id, patch: { collapsed: true } });
    return id;
  }

  async function generate(specIn, materials, priority, { added = false } = {}) {
    const st = get();
    const room = MAX_OPTIONS - st.options.length;
    if (room <= 0) return say(`You have ${MAX_OPTIONS} options open, which is the limit for now. Delete one to make room.`);
    materials = materials.slice(0, room);
    dispatch({ type: 'busy', value: true, label: 'Starting' });
    hooks.showModel();
    const spec = normalizeSpec(specIn);
    let letterBase = [...st.options];
    const opts = materials.map((m) => {
      const o = makeOption(nextLetter(letterBase), m, spec, priority, 'footprint');
      letterBase = [...letterBase, o];
      return o;
    });
    const ids = opts.map((o) => o.id);
    dispatch({ type: 'opt/add', options: opts, activate: ids[0], compare: false });
    const all = [...st.options, ...opts];
    const multi = all.length > 1;
    const base = traceStepsFor(opts, multi);
    const steps = base.map((s) => ({ ...s, ms: { footprint: 420, bays: 900, size: 600, estimate: 520, build: 120, rank: 420 }[s.key] }));
    steps[1].run = async () => dispatch({ type: 'opt/stageAll', ids, stage: 'grid' });
    steps[4].run = async () => { dispatch({ type: 'opt/stageAll', ids, stage: 'build', animate: true }); await Promise.all(ids.map(waitBuilt)); };
    let rec = null;
    if (multi) {
      rec = recommendation(all, priority);
      const lead = all.find((o) => o.id === rec.leadId);
      steps[5].detail = `${PRIORITIES[priority].label}: ${optLabel(lead)} ranks first`;
    }
    const title = opts.length > 1 ? `Generating ${opts.length} options` : added ? `Adding option ${opts[0].letter}` : `Generating option ${opts[0].letter}`;
    await runTrace(title, steps);
    const kept = st.options.length && added ? ` Option${st.options.length > 1 ? 's' : ''} ${listJoin(st.options.map((o) => o.letter))} ${st.options.length > 1 ? 'are' : 'is'} still in ${st.options.length > 1 ? 'their tabs' : 'its tab'}.` : '';
    dispatch({
      type: 'msg/add',
      msg: {
        id: uid('m'), role: 'agent', kind: 'result', optionIds: ids,
        title: opts.length > 1 ? `${opts.length} options ready` : `Option ${optLabel(opts[0])} ready`,
        text: (rec ? rec.text : `${MATERIALS[opts[0].material].system}, on a ${fmt.bay(opts[0].result.grid.sx, opts[0].result.grid.sz)} m grid.`) + kept,
      },
    });
    dispatch({ type: 'walk', key: 'generated' });
    if (added) dispatch({ type: 'walk', key: 'added' });
    dispatch({ type: 'busy', value: false });
  }

  async function change(optionId, patch, material, source = 'chat') {
    const st = get();
    const o = st.options.find((x) => x.id === optionId);
    if (!o) return;
    const next = withChange(o, patch, material, st.priority);
    dispatch({ type: 'busy', value: true, label: 'Updating' });
    hooks.showModel();
    const what = [];
    if (material && material !== o.material) what.push(`material to ${matShort(material).toLowerCase()}`);
    if (patch.length && patch.length !== o.spec.length) what.push(`length to ${fmt.m(next.spec.length)} m`);
    if (patch.width && patch.width !== o.spec.width) what.push(`width to ${fmt.m(next.spec.width)} m`);
    if (patch.floors && patch.floors !== o.spec.floors) what.push(storeys(next.spec.floors));
    if (patch.storeyHeight && patch.storeyHeight !== o.spec.storeyHeight) what.push(`storey height to ${fmt.m(next.spec.storeyHeight)} m`);
    if (patch.roof && patch.roof !== o.spec.roof) what.push(`${patch.roof} roof`);
    if ('bay' in patch && patch.bay !== o.spec.bay) what.push(patch.bay ? `${fmt.m(patch.bay)} m bays` : 'optimized bays');
    await runTrace(`Updating option ${o.letter}`, [
      { label: 'Update the brief', tool: 'update_spec', ms: 380, detail: what.length ? `Set ${listJoin(what)}` : 'No change needed' },
      {
        label: next.manualBay ? 'Lay out your bay grid' : 'Re-run bay study', tool: 'study_bays', ms: 650,
        run: async () => dispatch({ type: 'opt/set', id: o.id, patch: { ...next, stage: 'grid' } }),
        detail: `${fmt.bay(next.result.grid.sx, next.result.grid.sz)} m bays, ${next.result.metrics.columns} columns`,
      },
      {
        label: 'Rebuild 3D model', tool: 'build_geometry', ms: 120,
        run: async () => { dispatch({ type: 'opt/set', id: o.id, patch: { stage: 'build', animate: true } }); await waitBuilt(o.id); },
        detail: `${fmt.int(memberCount(next))} members`,
      },
    ]);
    const a = o.result.metrics, b = next.result.metrics;
    const bits = [];
    if (material && material !== o.material) bits.push(`Option ${o.letter} is now ${MATERIALS[material].name.toLowerCase()}.`);
    else bits.push(`Option ${o.letter} is updated.`);
    if (a.bayX !== b.bayX || a.bayZ !== b.bayZ) {
      const dc = b.columns - a.columns;
      bits.push(`The grid moved from ${fmt.bay(a.bayX, a.bayZ)} m to ${fmt.bay(b.bayX, b.bayZ)} m bays${dc ? `, so it ${dc < 0 ? 'loses' : 'needs'} ${Math.abs(dc)} column${Math.abs(dc) === 1 ? '' : 's'}` : ''}.`);
    } else bits.push(`It keeps the ${fmt.bay(b.bayX, b.bayZ)} m grid.`);
    dispatch({
      type: 'msg/add',
      msg: {
        id: uid('m'), role: 'agent', kind: 'change', text: bits.join(' '), optionId: o.id,
        deltas: [
          { label: 'Cost', pct: fmt.pct(b.cost, a.cost) },
          { label: 'Carbon', pct: fmt.pct(b.carbon, a.carbon) },
          { label: 'Schedule', pct: fmt.pct(b.weeks, a.weeks) },
        ],
      },
    });
    dispatch({ type: 'walk', key: 'changed' });
    dispatch({ type: 'busy', value: false });
  }

  function remove(id, viaChat) {
    const o = get().options.find((x) => x.id === id);
    if (!o) return;
    dispatch({ type: 'opt/remove', id });
    dispatch({ type: 'walk', key: 'managed' });
    if (viaChat) say(`Deleted option ${optLabel(o)}. Use Undo in the notice below if you need it back.`);
    else dispatch({ type: 'msg/add', msg: { id: uid('m'), role: 'note', kind: 'note', text: `You deleted option ${optLabel(o)}` } });
  }

  function startBrief(p, text) {
    const st = get();
    const merged = pending ? { ...pending, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))) } : p;
    if (!merged.length || !merged.width) {
      pending = merged;
      dispatch({
        type: 'msg/add',
        msg: {
          id: uid('m'), role: 'agent', kind: 'clarify',
          text: merged.type ? `What footprint should the ${merged.type} have? Pick one or type your own, like "8 x 5 m".` : merged.hasSpec || merged.materials?.length ? 'What footprint should I use? Pick one or type your own, like "8 x 5 m".' : 'Describe the building you want to study. Pick a starting point or type your own.',
          chips: merged.type ? [`6 x 4 m`, `12 x 8 m`, `30 x 12 m`] : ['6 x 4 m shed', '30 x 12 m workshop', '48 x 24 m office, 5 storeys'],
        },
      });
      return;
    }
    pending = null;
    const d = typeDefaults(merged.type);
    const assumed = [];
    if (merged.storeyHeight === undefined) assumed.push('storeyHeight');
    if (merged.floors === undefined) assumed.push('floors');
    if (merged.roof === undefined) assumed.push('roof');
    if (!merged.materials?.length) assumed.push('materials');
    const spec = normalizeSpec({
      type: merged.type || 'building', length: merged.length, width: merged.width,
      storeyHeight: merged.storeyHeight ?? d.storeyHeight, floors: merged.floors ?? 1, roof: merged.roof ?? d.roof,
      bay: typeof merged.bay === 'number' ? merged.bay : null,
    });
    const materials = merged.materials?.length ? merged.materials : [...MATERIAL_KEYS];
    const priority = merged.priority || st.priority;
    dispatch({ type: 'msg/add', msg: { id: uid('m'), role: 'agent', kind: 'spec', spec, materials, priority, assumed, state: 'pending', units: merged.units } });
  }

  async function send(raw) {
    const text = String(raw || '').trim();
    if (!text) return;
    const st = get();
    dispatch({ type: 'msg/add', msg: { id: uid('m'), role: 'user', kind: 'text', text } });
    if (st.busy) return say('I am still working on the last request. Send that again once it finishes.');
    await wait(260);
    const p = parseBrief(text);
    const active = st.options.find((o) => o.id === st.activeId);
    const letterOpt = (L) => (L === 'ACTIVE' ? active : st.options.find((o) => o.letter === L));

    if (p.help) {
      return say('I lay out a column grid, size the members and estimate cost, embodied carbon and schedule for each structural system. Try:\n• "Generate a 6 m x 4 m wooden shed"\n• "Switch it to steel"\n• "Add a concrete version as a new option"\n• "Use 8 m bays" or "Make it two storeys"\n• "Compare options" or "Write the report"');
    }
    if (p.undo) {
      const t = get().toast;
      if (t?.undo) { hooks.undo(t); return say('Done. I undid the last delete.'); }
      return say('There is nothing to undo right now.');
    }
    if (p.reset) { hooks.reset(); return; }
    if (p.deleteLetter) {
      const o = letterOpt(p.deleteLetter);
      return o ? remove(o.id, true) : say(`There is no option ${p.deleteLetter}. Open options: ${listJoin(st.options.map((x) => x.letter)) || 'none'}.`);
    }
    if (p.selectLetter && !p.materials.length && !p.hasSpec) {
      const o = letterOpt(p.selectLetter);
      if (!o) return say(`There is no option ${p.selectLetter}.`);
      dispatch({ type: 'active', id: o.id });
      dispatch({ type: 'compare', value: false });
      dispatch({ type: 'walk', key: 'managed' });
      return say(`Showing option ${optLabel(o)}.`);
    }
    if (p.report && !p.hasSpec) {
      if (!st.options.length) return say('There is nothing to report yet. Describe a building first.');
      hooks.openReport();
      return say('The comparison report is open. You can copy it as Markdown from there.');
    }
    if (p.envelope !== undefined && !p.hasSpec && !p.materials.length) {
      dispatch({ type: 'display', patch: { envelope: p.envelope } });
      return say(p.envelope ? 'Walls and roof are on.' : 'Walls and roof are off, so you can see the frame.');
    }
    if (p.compare && !p.hasSpec && p.materials.length < 2) {
      if (st.options.length < 2) return say('Comparing needs at least two options. Try "Add a steel version as a new option".');
      dispatch({ type: 'compare', value: true });
      hooks.showModel();
      return say(`Showing ${listJoin(st.options.slice(0, 4).map((o) => o.letter))} side by side. The camera is shared, so drag any view to orbit all of them.`);
    }
    if (p.priority && !p.hasSpec && !p.materials.length && st.options.length) {
      dispatch({ type: 'priority', value: p.priority });
      const rec = recommendation(get().options, p.priority);
      return say(`Ranking by ${PRIORITIES[p.priority].label.toLowerCase()} now. I re-ran the bay study for every option.${rec ? ` ${rec.text}` : ''}`);
    }

    // A brief is waiting for approval and this message adds nothing new
    const waiting = st.messages.some((m) => m.kind === 'spec' && m.state === 'pending');
    if (waiting && !p.hasSpec && !p.materials.length) {
      return say('The brief above is waiting for you. Press Generate, edit any field, or describe a different building.');
    }
    // No options yet, or a fresh multi-material brief: start the brief flow
    if (!st.options.length || pending) return startBrief(p, text);
    if (p.length && p.width && p.materials.length >= 2 && !p.newOption) return startBrief(p, text);

    // New option(s) from the active spec
    if (p.newOption || (p.materials.length >= 2 && !p.hasSpec)) {
      const base = active || st.options[0];
      const used = new Set(st.options.map((o) => o.material));
      const mats = p.materials.length ? p.materials : [MATERIAL_KEYS.find((k) => !used.has(k)) || base.material];
      const patch = {};
      for (const k of ['length', 'width', 'storeyHeight', 'floors', 'roof']) if (p[k] !== undefined) patch[k] = p[k];
      if (typeof p.bay === 'number') patch.bay = p.bay;
      return generate({ ...base.spec, ...patch }, mats, st.priority, { added: true });
    }

    // Change the active option
    if (active && (p.materials.length || p.hasSpec)) {
      const patch = {};
      for (const k of ['length', 'width', 'storeyHeight', 'floors', 'roof']) if (p[k] !== undefined) patch[k] = p[k];
      if (p.bay === 'auto') patch.bay = null;
      else if (typeof p.bay === 'number') patch.bay = p.bay;
      return change(active.id, patch, p.materials[0]);
    }
    return say('I did not find a building or a change in that. Try a footprint like "6 m x 4 m shed", or a change like "switch it to steel".');
  }

  async function confirmSpec(msgId, spec, materials, priority) {
    dispatch({ type: 'msg/patch', id: msgId, patch: { state: 'confirmed', spec, materials, priority } });
    if (priority !== get().priority) dispatch({ type: 'priority', value: priority });
    await generate(spec, materials, priority);
  }

  return {
    send, confirmSpec, change, remove, generate,
    resolveBuilt(id) { const r = builtWaiters.get(id); if (r) { builtWaiters.delete(id); r(); } },
    clearPending() { pending = null; },
    addOption(material) {
      const st = get();
      const base = st.options.find((o) => o.id === st.activeId) || st.options[0];
      if (!base) return;
      dispatch({ type: 'msg/add', msg: { id: uid('m'), role: 'user', kind: 'text', text: `Add a ${matShort(material).toLowerCase()} version as a new option` } });
      generate(base.spec, [material], st.priority, { added: true });
    },
  };
}

// ------------------------------------------------------------- icons -----
const ICONS = {
  send: 'M12 19V5M6 11l6-6 6 6',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  chev: 'M6 9l6 6 6-6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  iso: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  top: 'M4.5 4.5h15v15h-15zM4.5 12h15M12 4.5v15',
  front: 'M4 20h16M6 20V10h12v10M6 10l6-5 6 5',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  sun: 'M12 4V2.5M12 21.5V20M4 12H2.5M21.5 12H20M6.3 6.3L5.2 5.2M18.8 18.8l-1.1-1.1M6.3 17.7l-1.1 1.1M18.8 5.2l-1.1 1.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  moon: 'M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4',
  split: 'M4 5h16v14H4zM12 5v14',
  walls: 'M3 10l9-6 9 6M5 9v11h14V9M10 20v-6h4v6',
  ruler: 'M3.5 16.5l13-13 4 4-13 13zM7.5 12.5l2 2M10.5 9.5l2 2M13.5 6.5l2 2',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  newdoc: 'M14 3H6v18h12V7zM14 3v4h4M12 11v6M9 14h6',
  clip: 'M20 11.5l-8.2 8.2a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L15 7.2',
  info: 'M12 8h.01M11 12h1v5h1M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
  chat: 'M5 5h14v10H9l-4 4z',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z',
};
const Icon = ({ name, size = 18, stroke = 1.6 }) => html`
  <svg className="ic" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth=${stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d=${ICONS[name]} /></svg>`;

const BrandMark = () => html`
  <svg className="brand-mark" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
    <circle cx="13" cy="8.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M13 15v10M6 21h14" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.2 1.8" />
    <text x="13" y="11.6" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="currentColor" fontFamily="Archivo, system-ui, sans-serif">S</text>
  </svg>`;

// --------------------------------------------------------- small UI -----
function useEnter(ref, enabled, from = { y: 8, opacity: 0 }) {
  useLayoutEffect(() => {
    if (!enabled || REDUCED || !ref.current) return;
    gsap.from(ref.current, { ...from, duration: 0.34, ease: 'power2.out', clearProps: 'transform,opacity' });
  }, []);
}

function useCountUp(value, format) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    if (REDUCED || prev.current === value || !isFinite(prev.current)) { prev.current = value; setShown(value); return; }
    const o = { v: prev.current };
    prev.current = value;
    const tw = gsap.to(o, { v: value, duration: 0.7, ease: 'power3.out', onUpdate: () => setShown(o.v) });
    return () => tw.kill();
  }, [value]);
  return format(shown);
}

const MatTile = ({ o, size = 'md' }) => html`<span className=${`mat-tile mat-tile--${size} is-${o.material}`} aria-hidden="true">${o.letter}</span>`;

function Segmented({ value, options, onChange, label, small }) {
  return html`<div className=${`seg ${small ? 'seg--sm' : ''}`} role="radiogroup" aria-label=${label}>
    ${options.map((op) => html`<button key=${op.value} type="button" role="radio" aria-checked=${value === op.value} className=${`seg-btn ${value === op.value ? 'is-on' : ''}`} onClick=${() => onChange(op.value)} disabled=${op.disabled}>
      ${op.dot && html`<span className=${`dot is-${op.value}`}></span>`}${op.label}</button>`)}
  </div>`;
}

function NumberField({ id, label, value, unit, min, max, step, onChange, assumed, compact }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(+(+value).toFixed(2))), [value]);
  const commit = () => {
    const v = parseFloat(txt);
    if (!isFinite(v)) return setTxt(String(value));
    const c = Math.min(max, Math.max(min, v));
    setTxt(String(c));
    if (c !== value) onChange(c);
  };
  return html`<label className=${`nf ${compact ? 'nf--compact' : ''} ${assumed ? 'is-assumed' : ''}`} htmlFor=${id}>
    <span className="nf-label">${label}${assumed && html`<em className="assumed">assumed</em>`}</span>
    <span className="nf-box">
      <input id=${id} inputMode="decimal" value=${txt} onChange=${(e) => setTxt(e.target.value)} onBlur=${commit} onKeyDown=${(e) => e.key === 'Enter' && e.currentTarget.blur()} />
      ${unit && html`<span className="nf-unit">${unit}</span>`}
    </span>
  </label>`;
}

function SliderField({ id, label, value, unit, min, max, step, onChange, onCommit, format = (v) => v }) {
  return html`<div className="sf">
    <div className="sf-top"><label htmlFor=${id}>${label}</label><output htmlFor=${id}>${format(value)}${unit ? html`<span className="unit"> ${unit}</span>` : ''}</output></div>
    <input id=${id} type="range" min=${min} max=${max} step=${step} value=${value}
      style=${{ '--p': `${((value - min) / (max - min)) * 100}%` }}
      onChange=${(e) => onChange(+e.target.value)} onPointerUp=${() => onCommit?.()} onKeyUp=${() => onCommit?.()} />
  </div>`;
}

// ------------------------------------------------------------- chat -----
function Message({ m, state, agent, ui }) {
  const ref = useRef(null);
  useEnter(ref, m.fresh);
  let body;
  if (m.kind === 'welcome') body = html`<${Welcome} ui=${ui} />`;
  else if (m.role === 'user') body = html`<div className="bubble">${m.text}</div>`;
  else if (m.kind === 'note') body = html`<div className="note">${m.text}</div>`;
  else if (m.kind === 'trace') body = html`<${TraceCard} m=${m} ui=${ui} />`;
  else if (m.kind === 'spec') body = html`<${SpecCard} m=${m} agent=${agent} busy=${state.busy} />`;
  else if (m.kind === 'result') body = html`<${ResultCard} m=${m} state=${state} ui=${ui} />`;
  else if (m.kind === 'change') body = html`<${ChangeCard} m=${m} />`;
  else if (m.kind === 'clarify') body = html`<div className="agent-text"><p>${m.text}</p><div className="chips">${m.chips.map((c) => html`<button key=${c} type="button" className="chip" onClick=${() => agent.send(c)}>${c}</button>`)}</div></div>`;
  else body = html`<div className="agent-text">${String(m.text).split('\n').map((l, i) => html`<p key=${i}>${l}</p>`)}</div>`;
  const agentSide = m.role === 'agent' && m.kind !== 'welcome';
  return html`<div ref=${ref} className=${`msg msg--${m.role} msg--${m.kind}`}>
    ${agentSide && html`<span className="avatar" aria-hidden="true"><${BrandMark} /></span>`}
    <div className="msg-body">${body}</div>
  </div>`;
}

function Welcome({ ui }) {
  const examples = [
    'Generate a 6 m x 4 m wooden shed',
    'Single-storey workshop, 30 x 12 m, gable roof. Compare timber, concrete and steel.',
    '5-storey office, 48 x 24 m, lowest carbon',
  ];
  return html`<div className="welcome">
    <h2>What are we designing?</h2>
    <p>Describe the building in plain words. I will lay out a column grid, size the members and compare cost, embodied carbon and schedule for each structural system.</p>
    <div className="welcome-list">
      ${examples.map((e) => html`<button key=${e} type="button" className="example" onClick=${() => ui.fill(e)}><span>${e}</span><${Icon} name="send" size=${14} /></button>`)}
    </div>
  </div>`;
}

function TraceCard({ m, ui }) {
  const running = m.state === 'running';
  const done = m.steps.filter((s) => s.status === 'done').length;
  const open = running || !m.collapsed;
  return html`<div className=${`trace ${running ? 'is-running' : ''}`}>
    <button type="button" className="trace-head" onClick=${() => !running && ui.patchMsg(m.id, { collapsed: !m.collapsed })} aria-expanded=${open}>
      <span className="trace-state">${running ? html`<span className="spin" aria-hidden="true"></span>` : html`<${Icon} name="check" size=${14} stroke=${2} />`}</span>
      <span className="trace-title">${m.title}</span>
      <span className="trace-meta">${running ? `${done} of ${m.steps.length}` : `${m.steps.length} tool calls, ${m.elapsed?.toFixed(1)} s`}</span>
      ${!running && html`<span className=${`trace-chev ${open ? 'is-open' : ''}`}><${Icon} name="chev" size=${14} /></span>`}
    </button>
    ${open && html`<ol className="trace-steps">
      ${m.steps.map((s, i) => html`<li key=${i} className=${`step is-${s.status}`}>
        <span className="step-dot" aria-hidden="true">${s.status === 'done' ? html`<${Icon} name="check" size=${11} stroke=${2.4} />` : s.status === 'running' ? html`<span className="spin spin--sm"></span>` : ''}</span>
        <div className="step-main">
          <div className="step-row"><span className="step-label">${s.label}</span><code className="step-tool">${s.tool}</code></div>
          ${s.detail && html`<div className="step-detail">${s.detail}</div>`}
        </div>
      </li>`)}
    </ol>`}
  </div>`;
}

function SpecCard({ m, agent, busy }) {
  const [spec, setSpec] = useState(m.spec);
  const [mats, setMats] = useState(m.materials);
  const [priority, setPriority] = useState(m.priority);
  const [assumed, setAssumed] = useState(m.assumed || []);
  const locked = m.state !== 'pending';
  const set = (k, v) => { setSpec((s) => normalizeSpec({ ...s, [k]: v })); setAssumed((a) => a.filter((x) => x !== k)); };
  const toggleMat = (k) => { setMats((a) => (a.includes(k) ? (a.length > 1 ? a.filter((x) => x !== k) : a) : MATERIAL_KEYS.filter((x) => a.includes(x) || x === k))); setAssumed((a) => a.filter((x) => x !== 'materials')); };
  if (locked) {
    return html`<div className="spec spec--locked">
      <div className="spec-head"><span className="spec-title">Brief confirmed</span><span className="pill pill--good"><${Icon} name="check" size=${12} stroke=${2.2} />You approved</span></div>
      <p className="spec-line">${titleCase(m.spec.type)}, ${describeSpec(m.spec)}.</p>
      <p className="spec-line spec-line--muted">Systems: ${listJoin(m.materials.map((k) => MATERIALS[k].name.toLowerCase()))}. Ranked by ${PRIORITIES[m.priority].label.toLowerCase()}.</p>
    </div>`;
  }
  const id = (k) => `${m.id}-${k}`;
  return html`<div className="spec">
    <div className="spec-head"><span className="spec-title">Check the brief before I generate</span><span className="pill pill--warn">Needs your review</span></div>
    <p className="spec-intro">This is what I read from your message.${assumed.length ? ' Fields marked assumed were not in it, so I used typical values.' : ''}${m.units === 'ft' ? ' I converted feet to metres.' : ''}</p>
    <div className="spec-grid">
      <${NumberField} id=${id('len')} label="Length" unit="m" value=${spec.length} min=${3} max=${120} onChange=${(v) => set('length', v)} />
      <${NumberField} id=${id('wid')} label="Width" unit="m" value=${spec.width} min=${3} max=${60} onChange=${(v) => set('width', v)} />
      <${NumberField} id=${id('flr')} label="Storeys" value=${spec.floors} min=${1} max=${12} onChange=${(v) => set('floors', Math.round(v))} assumed=${assumed.includes('floors')} />
      <${NumberField} id=${id('sh')} label=${spec.floors > 1 ? 'Floor to floor' : 'Eaves height'} unit="m" value=${spec.storeyHeight} min=${2.4} max=${8} onChange=${(v) => set('storeyHeight', v)} assumed=${assumed.includes('storeyHeight')} />
    </div>
    <div className="spec-row">
      <span className="spec-label">Roof${assumed.includes('roof') && html`<em className="assumed">assumed</em>`}</span>
      <${Segmented} small label="Roof" value=${spec.roof} onChange=${(v) => set('roof', v)} options=${[{ value: 'flat', label: 'Flat' }, { value: 'gable', label: 'Gable' }]} />
    </div>
    <div className="spec-row">
      <span className="spec-label">Systems${assumed.includes('materials') && html`<em className="assumed">all three</em>`}</span>
      <div className="toggles" role="group" aria-label="Structural systems">
        ${MATERIAL_KEYS.map((k) => html`<button key=${k} type="button" aria-pressed=${mats.includes(k)} className=${`toggle ${mats.includes(k) ? 'is-on' : ''}`} onClick=${() => toggleMat(k)}><span className=${`dot is-${k}`}></span>${MATERIALS[k].short}</button>`)}
      </div>
    </div>
    <div className="spec-row">
      <span className="spec-label">Rank by</span>
      <select id=${`${m.id}-rank`} className="select" aria-label="Rank options by" value=${priority} onChange=${(e) => setPriority(e.target.value)}>
        ${Object.entries(PRIORITIES).map(([k, v]) => html`<option key=${k} value=${k}>${v.label}</option>`)}
      </select>
    </div>
    <div className="spec-actions">
      <button type="button" className="btn btn--primary" disabled=${busy} onClick=${() => agent.confirmSpec(m.id, spec, mats, priority)}>
        Generate ${mats.length > 1 ? `${mats.length} options` : `${MATERIALS[mats[0]].short.toLowerCase()} option`}
      </button>
      <span className="hint">You can change any of this later.</span>
    </div>
  </div>`;
}

function ResultCard({ m, state, ui }) {
  const opts = m.optionIds.map((id) => state.options.find((o) => o.id === id)).filter(Boolean);
  const live = state.options.filter((o) => o.stage === 'ready');
  const best = live.length > 1 ? bestOf(live.map((o) => o.result)) : null;
  const isBest = (o, k) => best && o.result.metrics[k] === best[k];
  return html`<div className="result">
    <div className="agent-text"><p><strong>${m.title}.</strong> ${m.text}</p></div>
    ${opts.length > 0 && html`<div className="result-list">
      ${opts.map((o) => html`<button key=${o.id} type="button" className=${`result-row ${state.activeId === o.id && !state.compare ? 'is-active' : ''}`} onClick=${() => ui.select(o.id)}>
        <${MatTile} o=${o} size="sm" />
        <span className="rr-name">${matShort(o.material)}</span>
        <span className=${`rr-v ${isBest(o, 'cost') ? 'is-best' : ''}`}>${fmt.money(o.result.metrics.cost)}</span>
        <span className=${`rr-v ${isBest(o, 'carbon') ? 'is-best' : ''}`}>${fmt.carbon(o.result.metrics.carbon)} t</span>
        <span className=${`rr-v ${isBest(o, 'weeks') ? 'is-best' : ''}`}>${fmt.weeks(o.result.metrics.weeks)} wk</span>
      </button>`)}
    </div>`}
    ${opts.length === 0 && html`<p className="hint">These options were deleted.</p>`}
    <div className="result-actions">
      ${state.options.length > 1 && html`<button type="button" className="btn btn--ghost btn--sm" onClick=${() => ui.compare(true)}><${Icon} name="split" size=${15} />Compare side by side</button>`}
      ${state.options.length > 0 && html`<button type="button" className="btn btn--ghost btn--sm" onClick=${ui.openReport}><${Icon} name="doc" size=${15} />Open report</button>`}
    </div>
  </div>`;
}

function ChangeCard({ m }) {
  return html`<div className="agent-text">
    <p>${m.text}</p>
    <div className="deltas">${m.deltas.map((d) => html`<span key=${d.label} className=${`delta ${d.pct < 0 ? 'is-down' : d.pct > 0 ? 'is-up' : ''}`}>${d.label} ${d.pct > 0 ? '+' : d.pct < 0 ? '−' : '±'}${Math.abs(d.pct)}%</span>`)}</div>
  </div>`;
}

function Chat({ state, agent, ui, composer, setComposer, composerRef }) {
  const listRef = useRef(null);
  const fileRef = useRef(null);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: REDUCED ? 'auto' : 'smooth' });
  }, [state.messages.length, state.messages[state.messages.length - 1]?.steps?.filter((s) => s.status === 'done').length, state.messages[state.messages.length - 1]?.collapsed]);
  useLayoutEffect(() => {
    const t = composerRef.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(160, t.scrollHeight)}px`;
  }, [composer]);
  const submit = (e) => {
    e?.preventDefault();
    if (!composer.trim() || state.busy) return;
    agent.send(composer);
    setComposer('');
  };
  const active = state.options.find((o) => o.id === state.activeId);
  const used = new Set(state.options.map((o) => o.material));
  const missing = MATERIAL_KEYS.find((k) => !used.has(k));
  const suggestions = !state.options.length ? [] : [
    missing ? `Try it in ${matShort(missing).toLowerCase()} as a new option` : 'Add another option',
    active && active.material !== 'steel' ? 'Switch it to steel' : 'Switch it to timber',
    active ? `Make it ${fmt.m(Math.min(120, active.spec.length + 2), 0)} m long` : null,
    state.options.length > 1 ? 'Compare options' : 'Use 4 m bays',
    'Write the report',
  ].filter(Boolean);
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (/\.json$/i.test(f.name)) {
      try {
        const j = JSON.parse(await f.text());
        const d = j.dimensions || j;
        const parts = [`${d.length ?? j.length} x ${d.width ?? j.width} m`];
        if (j.buildingType || j.type) parts.push(j.buildingType || j.type);
        if (d.height ?? j.height) parts.push(`${d.height ?? j.height} m storey height`);
        if (j.floors) parts.push(`${j.floors} storeys`);
        if (j.material) parts.push(j.material);
        agent.send(`From ${f.name}: ${parts.join(', ')}`);
      } catch {
        agent.send(`Attached ${f.name}`);
      }
    } else {
      ui.say(`I received ${f.name}. Reading IFC and Revit models is planned for phase 2, when WSP shares a model. For now, attach a JSON massing file or describe the footprint.`);
    }
  };
  return html`<section className="chat panel" aria-label="Agent chat">
    <header className="chat-head">
      <div className="chat-title">
        <span className=${`status-dot ${state.busy ? 'is-busy' : ''}`} aria-hidden="true"></span>
        <span>Agent</span>
        <span className="chat-sub">${state.busy ? state.busyLabel || 'Working' : 'Ready'}</span>
      </div>
      <span className="pill pill--outline" title="Answers come from a local script. No AI model is connected yet.">Demo mode</span>
    </header>
    <div className="chat-list" ref=${listRef} role="log" aria-live="polite">
      ${state.messages.map((m) => html`<${Message} key=${m.id} m=${m} state=${state} agent=${agent} ui=${ui} />`)}
    </div>
    <div className="composer-wrap">
      ${suggestions.length > 0 && html`<div className="suggest" aria-label="Suggestions">
        ${suggestions.map((s) => html`<button key=${s} type="button" className="chip chip--sm" onClick=${() => { setComposer(s); composerRef.current?.focus(); }}>${s}</button>`)}
      </div>`}
      <form className="composer" onSubmit=${submit}>
        <label htmlFor="composer" className="sr">Message the agent</label>
        <textarea id="composer" ref=${composerRef} rows="1" value=${composer} placeholder=${state.options.length ? 'Ask for a change or a new option' : 'Describe your building'}
          onChange=${(e) => setComposer(e.target.value)}
          onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
        <div className="composer-row">
          <button type="button" className="icon-btn" aria-label="Attach a building file" title="Attach a JSON massing file" onClick=${() => fileRef.current?.click()}><${Icon} name="clip" size=${17} /></button>
          <input id="attach-file" ref=${fileRef} type="file" accept=".json,.ifc,.rvt" hidden onChange=${onFile} />
          <span className="hint">Enter to send, Shift + Enter for a new line</span>
          <button type="submit" className="send" aria-label="Send" disabled=${!composer.trim() || state.busy}><${Icon} name="send" size=${17} stroke=${2} /></button>
        </div>
      </form>
    </div>
  </section>`;
}

// ------------------------------------------------------------ viewer -----
function OptionTab({ o, active, onSelect, onClose, busy }) {
  const ref = useRef(null);
  useEnter(ref, o.fresh, { scale: 0.92, opacity: 0 });
  const generating = o.stage !== 'ready';
  return html`<div ref=${ref} className=${`tab ${active ? 'is-active' : ''} is-${o.material}`} role="presentation">
    <button type="button" role="tab" aria-selected=${active} className="tab-btn" onClick=${onSelect}>
      <${MatTile} o=${o} size="sm" />
      <span className="tab-name">${matShort(o.material)}</span>
      ${generating && html`<span className="spin spin--sm" aria-label="Generating"></span>`}
    </button>
    <button type="button" className="tab-x" aria-label=${`Delete option ${o.letter}`} title=${`Delete option ${o.letter}`} onClick=${onClose} disabled=${busy}><${Icon} name="x" size=${13} stroke=${2} /></button>
  </div>`;
}

function AddMenu({ onPick, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const k = (e) => e.key === 'Escape' && onClose();
    setTimeout(() => document.addEventListener('pointerdown', h));
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('pointerdown', h); document.removeEventListener('keydown', k); };
  }, []);
  useEnter(ref, true, { y: -6, opacity: 0 });
  return html`<div ref=${ref} className="menu" role="menu">
    <div className="menu-title">New option from the active brief</div>
    ${MATERIAL_KEYS.map((k) => html`<button key=${k} role="menuitem" type="button" className="menu-item" onClick=${() => onPick(k)}>
      <span className=${`dot is-${k}`}></span><span>${MATERIALS[k].name}</span><span className="menu-sub">${MATERIALS[k].code}</span></button>`)}
  </div>`;
}

function Metric({ label, value, unit, sub, best, fmtFn, title }) {
  const shown = useCountUp(value, fmtFn);
  return html`<div className=${`metric ${best ? 'is-best' : ''}`} title=${title}>
    <div className="metric-label"><span className="metric-name">${label}</span>${best && html`<span className="best" title="Lowest of the open options" aria-label="Lowest of the open options"><${Icon} name="check" size=${11} stroke=${2.6} /></span>`}</div>
    <div className="metric-value"><span>${shown}</span>${unit && html`<span className="metric-unit">${unit}</span>`}</div>
    <div className="metric-sub">${sub}</div>
  </div>`;
}

function MetricsStrip({ o, state }) {
  const M = o.result.metrics;
  const ready = state.options.filter((x) => x.stage === 'ready');
  const best = ready.length > 1 ? bestOf(ready.map((x) => x.result)) : null;
  const pending = o.stage !== 'ready';
  return html`<div className=${`metrics glass ${pending ? 'is-pending' : ''}`} aria-label=${`Estimates for option ${o.letter}`}>
    <${Metric} label="Cost" value=${M.cost} fmtFn=${fmt.money} sub=${`$${fmt.int(M.costPerM2)} per m²`} best=${best && M.cost === best.cost} />
    <${Metric} label="Carbon" title="Embodied carbon, stages A1 to A3" value=${M.carbon} fmtFn=${fmt.carbon} unit="tCO₂e" sub=${`${fmt.int(M.intensity)} kg per m²`} best=${best && M.carbon === best.carbon} />
    <${Metric} label="Schedule" value=${M.weeks} fmtFn=${fmt.weeks} unit="weeks" sub=${`${fmt.int(M.days)} work days`} best=${best && M.weeks === best.weeks} />
    <${Metric} label="Bay size" value=${M.bayX} fmtFn=${() => fmt.bay(M.bayX, M.bayZ)} unit="m" sub=${`${o.result.grid.nx} × ${o.result.grid.nz} bays`} title=${o.result.manualBay ? 'Bay size set by you' : 'Bay size picked by the agent'} />
    <${Metric} label="Columns" value=${M.columns} fmtFn=${(v) => fmt.int(v)} sub=${`${fmt.int(o.result.quantities.pieces)} pieces`} best=${best && M.columns === best.columns} title="Pieces to fabricate and erect" />
    <div className="metrics-note" title="Placeholder factors stand in for WSP's cost, carbon and scheduling tools."><${Icon} name="info" size=${14} />Synthetic data</div>
  </div>`;
}

function Inspector({ o, state, dispatch, agent, ui }) {
  const [draft, setDraft] = useState(o.spec);
  useEffect(() => setDraft(o.spec), [o.id, o.version]);
  const r = o.result;
  const commitTimer = useRef(null);
  const live = (k, v) => {
    const next = normalizeSpec({ ...draft, [k]: v });
    setDraft(next);
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => apply(next, k), 140);
  };
  const apply = (spec, key) => {
    dispatch({ type: 'opt/set', id: o.id, patch: (x) => ({ ...withChange(x, spec, x.material, state.priority), stage: 'ready', animate: false }) });
    ui.noteEdit(o, key, spec);
  };
  const set = (k, v) => apply(normalizeSpec({ ...draft, [k]: v }), k);
  const sec = r.sections;
  const showFloor = o.spec.floors > 1;
  const rows = [
    ['Columns', sec.column.name],
    [o.material === 'steel' ? 'Beams' : 'Beams, long way', sec.beamX.name],
    [o.material === 'steel' ? 'Girders' : 'Beams, short way', sec.girder.name],
    o.material === 'steel' && r.infillPerBay > 0 && ['Infill beams', sec.infill.name],
    showFloor && ['Floors', sec.slab.name],
    o.spec.roof === 'gable' ? ['Rafters', sec.rafter.name] : null,
    ['Roof', sec.roofDeck.name],
    o.material === 'steel' && ['Bracing', sec.brace.name],
    ['Footings', `${r.footSide.toFixed(2)} m pads, ${r.quantities.footings} total`],
  ].filter(Boolean);
  return html`<aside className=${`inspector glass ${state.ui.inspector ? '' : 'is-collapsed'}`} aria-label=${`Option ${o.letter} properties`}>
    <button type="button" className="insp-head" onClick=${() => dispatch({ type: 'ui', patch: { inspector: !state.ui.inspector } })} aria-expanded=${state.ui.inspector}>
      <${MatTile} o=${o} />
      <span className="insp-titles"><strong>Option ${o.letter}</strong><span>${MATERIALS[o.material].name}, ${MATERIALS[o.material].code}</span></span>
      <span className=${`trace-chev ${state.ui.inspector ? 'is-open' : ''}`}><${Icon} name="chev" size=${15} /></span>
    </button>
    ${state.ui.inspector && html`<div className="insp-body">
      <section className="insp-sec">
        <h3>Structural system</h3>
        <${Segmented} label="Material" value=${o.material} onChange=${(k) => k !== o.material && !state.busy && agent.change(o.id, {}, k, 'inspector')}
          options=${MATERIAL_KEYS.map((k) => ({ value: k, label: matShort(k), dot: true, disabled: state.busy }))} />
        <p className="insp-note">${MATERIALS[o.material].system}.</p>
      </section>
      <section className="insp-sec">
        <h3>Dimensions</h3>
        <${SliderField} id="insp-len" label="Length" unit="m" min=${3} max=${120} step=${0.5} value=${draft.length} format=${(v) => fmt.m(v)} onChange=${(v) => live('length', v)} />
        <${SliderField} id="insp-wid" label="Width" unit="m" min=${3} max=${60} step=${0.5} value=${draft.width} format=${(v) => fmt.m(v)} onChange=${(v) => live('width', v)} />
        <${SliderField} id="insp-sh" label=${draft.floors > 1 ? 'Floor to floor' : 'Eaves height'} unit="m" min=${2.4} max=${8} step=${0.1} value=${draft.storeyHeight} format=${(v) => fmt.m(v)} onChange=${(v) => live('storeyHeight', v)} />
        <div className="insp-row">
          <span className="insp-label">Storeys</span>
          <div className="stepper">
            <button type="button" aria-label="Fewer storeys" onClick=${() => set('floors', draft.floors - 1)} disabled=${draft.floors <= 1}>−</button>
            <output>${draft.floors}</output>
            <button type="button" aria-label="More storeys" onClick=${() => set('floors', draft.floors + 1)} disabled=${draft.floors >= 12}>+</button>
          </div>
        </div>
        <div className="insp-row">
          <span className="insp-label">Roof</span>
          <${Segmented} small label="Roof" value=${draft.roof} onChange=${(v) => set('roof', v)} options=${[{ value: 'flat', label: 'Flat' }, { value: 'gable', label: 'Gable' }]} />
        </div>
      </section>
      <section className="insp-sec">
        <div className="insp-row insp-row--head">
          <h3>Bay spacing</h3>
          <${Segmented} small label="Bay spacing" value=${draft.bay ? 'manual' : 'auto'}
            onChange=${(v) => set('bay', v === 'auto' ? null : Math.round(Math.max(r.grid.sx, r.grid.sz) * 2) / 2)}
            options=${[{ value: 'auto', label: 'Agent' }, { value: 'manual', label: 'Manual' }]} />
        </div>
        ${draft.bay
          ? html`<${SliderField} id="insp-bay" label="Maximum span" unit="m" min=${2} max=${14} step=${0.5} value=${draft.bay} format=${(v) => fmt.m(v)} onChange=${(v) => live('bay', v)} />
            ${draft.bay > MATERIALS[o.material].maxSpan * 1.25 && html`<p className="insp-warn">Longer than a typical ${matShort(o.material).toLowerCase()} span of about ${MATERIALS[o.material].maxSpan} m, so beams get deep.</p>`}`
          : html`<p className="insp-note">The agent tried ${plural(r.study.length, 'layout')} and kept the best score for ${PRIORITIES[state.priority].label.toLowerCase()}, with a small penalty for crowded floor plates.</p>`}
        <table className="study">
          <thead><tr><th scope="col">Bays (m)</th><th scope="col">Cols</th><th scope="col">Cost</th><th scope="col">tCO₂e</th><th scope="col">Wk</th></tr></thead>
          <tbody>
            ${r.study.map((s, i) => html`<tr key=${i} className=${s.chosen ? 'is-chosen' : ''}>
              <td>${fmt.bay(s.sx, s.sz)}${s.chosen ? html`<span className="sr"> (chosen)</span>` : ''}</td>
              <td>${s.columns}</td><td>${fmt.money(s.cost)}</td><td>${fmt.carbon(s.carbon)}</td><td>${fmt.weeks(s.weeks)}</td>
            </tr>`)}
          </tbody>
        </table>
      </section>
      <section className="insp-sec">
        <h3>Members</h3>
        <dl className="members">${rows.map(([k, v]) => html`<div key=${k}><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
      </section>
    </div>`}
  </aside>`;
}

function ViewerPanel({ state, dispatch, agent, ui, viewerRef }) {
  const hostRef = useRef(null);
  const areaRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [failed, setFailed] = useState(false);
  const [menu, setMenu] = useState(false);
  const active = state.options.find((o) => o.id === state.activeId);
  const compareIds = useMemo(() => {
    if (!state.compare || state.options.length < 2) return [];
    if (state.options.length <= 4) return state.options.map((o) => o.id);
    const rest = state.options.filter((o) => o.id !== state.activeId).slice(0, 3);
    return state.options.filter((o) => o.id === state.activeId || rest.includes(o)).map((o) => o.id);
  }, [state.compare, state.options, state.activeId]);

  useEffect(() => {
    try {
      viewerRef.current = new StructureViewer(hostRef.current, {
        onBuilt: (id) => { dispatch({ type: 'opt/stageAll', ids: [id], stage: 'ready' }); agent.resolveBuilt(id); },
        onInteract: () => dispatch({ type: 'walk', key: 'viewed' }),
      });
      ui.applyTheme();
    } catch (err) {
      console.warn('3D viewer unavailable', err);
      setFailed(true);
    }
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(areaRef.current);
    return () => { ro.disconnect(); viewerRef.current?.dispose(); };
  }, []);

  useEffect(() => {
    viewerRef.current?.sync(state.options, { activeId: state.activeId, compareIds, display: state.display });
  }, [state.options, state.activeId, compareIds, state.display]);

  // Tell the viewer which parts of the canvas the glass panels cover
  useLayoutEffect(() => {
    const v = viewerRef.current, stage = areaRef.current;
    if (!v || !stage) return;
    const sr = stage.getBoundingClientRect();
    const ins = { top: 0, right: 0, bottom: 0, left: 0 };
    for (const el of stage.querySelectorAll('.inspector, .metrics')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const rightDocked = r.left > sr.left + sr.width * 0.5 && r.top < sr.top + sr.height * 0.5;
      if (rightDocked) ins.right = Math.max(ins.right, sr.right - r.left + 8);
      else ins.bottom = Math.max(ins.bottom, sr.bottom - r.top + 8);
    }
    ins.top = 52;
    v.setInsets(ins);
  });

  const rects = compareIds.length > 1 ? compareRects(size.w, size.h, compareIds.length) : [];
  const ready = state.options.filter((o) => o.stage === 'ready');
  const best = ready.length > 1 ? bestOf(ready.map((o) => o.result)) : null;
  const rank = useMemo(() => recommendation(state.options, state.priority), [state.options, state.priority]);
  const view = (v) => { viewerRef.current?.frame(true, v); dispatch({ type: 'walk', key: 'viewed' }); };

  return html`<section className="viewer" aria-label="3D viewer">
    <div className="tabbar">
      <div className="tabs" role="tablist" aria-label="Options">
        ${state.options.map((o) => html`<${OptionTab} key=${o.id} o=${o} busy=${state.busy} active=${!state.compare && o.id === state.activeId}
          onSelect=${() => ui.select(o.id)} onClose=${() => agent.remove(o.id)} />`)}
        <div className="add-wrap">
          <button type="button" className="tab-add" aria-label="New option" title="New option" disabled=${!active || state.busy || state.options.length >= MAX_OPTIONS} onClick=${() => setMenu((v) => !v)}><${Icon} name="plus" size=${16} /></button>
          ${menu && html`<${AddMenu} onClose=${() => setMenu(false)} onPick=${(k) => { setMenu(false); agent.addOption(k); }} />`}
        </div>
      </div>
      <div className="tabbar-tools">
        <label className="rank-select">
          <span>Rank by</span>
          <select id="rank-by" className="select select--sm" value=${state.priority} onChange=${(e) => dispatch({ type: 'priority', value: e.target.value })} aria-label="Rank options by" disabled=${state.busy}>
            ${Object.entries(PRIORITIES).map(([k, v]) => html`<option key=${k} value=${k}>${v.label}</option>`)}
          </select>
        </label>
        <button type="button" className=${`tool ${state.compare ? 'is-on' : ''}`} aria-pressed=${state.compare} disabled=${state.options.length < 2} onClick=${() => ui.compare(!state.compare)}>
          <${Icon} name="split" size=${16} /><span>Compare</span></button>
      </div>
    </div>
    <div className="stage" ref=${areaRef}>
      <div className="canvas-host" ref=${hostRef}></div>
      ${failed && html`<div className="empty"><div className="empty-card"><h3>3D preview is off</h3><p>This browser did not give the page a WebGL context. Turn on hardware acceleration and reload. The chat, metrics and report still work.</p></div></div>`}
      ${!state.options.length && !failed && html`<div className="empty"><div className="empty-card">
        <h3>Your options appear here</h3>
        <p>Each option gets its own tab with a 3D frame, a column grid in drafting style, and cost, carbon and schedule estimates.</p>
      </div></div>`}

      ${state.options.length > 0 && html`<div className="palette glass" role="toolbar" aria-label="View">
        <button type="button" className="pal-btn" onClick=${() => view('iso')} title="3D view (1)" aria-label="3D view"><${Icon} name="iso" /></button>
        <button type="button" className="pal-btn" onClick=${() => view('top')} title="Plan view (2)" aria-label="Plan view"><${Icon} name="top" /></button>
        <button type="button" className="pal-btn" onClick=${() => view('front')} title="Elevation (3)" aria-label="Elevation view"><${Icon} name="front" /></button>
        <span className="pal-sep"></span>
        <button type="button" className=${`pal-btn ${state.display.envelope ? 'is-on' : ''}`} aria-pressed=${state.display.envelope} onClick=${() => dispatch({ type: 'display', patch: { envelope: !state.display.envelope } })} title="Walls and roof (W)" aria-label="Show walls and roof"><${Icon} name="walls" /></button>
        <button type="button" className=${`pal-btn ${state.display.labels ? 'is-on' : ''}`} aria-pressed=${state.display.labels} onClick=${() => dispatch({ type: 'display', patch: { labels: !state.display.labels } })} title="Gridlines and dimensions (G)" aria-label="Show gridlines and dimensions"><${Icon} name="ruler" /></button>
      </div>`}

      ${state.busy && html`<div className="gen-chip glass" role="status"><span className="spin spin--sm"></span>${state.busyLabel}</div>`}

      ${active && compareIds.length < 2 && html`<${Inspector} key=${active.id} o=${active} state=${state} dispatch=${dispatch} agent=${agent} ui=${ui} />`}
      ${active && compareIds.length < 2 && html`<${MetricsStrip} o=${active} state=${state} />`}

      ${rects.map((r, i) => {
        const o = state.options.find((x) => x.id === compareIds[i]);
        if (!o) return null;
        const M = o.result.metrics;
        const place = rank ? rank.order.indexOf(o.id) + 1 : 0;
        return html`<div key=${o.id} className="cmp" style=${{ left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` }}>
          <button type="button" className="cmp-head glass" onClick=${() => { ui.select(o.id); }} title="Open this option">
            <${MatTile} o=${o} size="sm" /><span>${MATERIALS[o.material].name}</span>
            ${place === 1 && html`<span className="rank1">Ranks first</span>`}
          </button>
          <div className="cmp-foot glass">
            <div className=${best && M.cost === best.cost ? 'is-best' : ''}><span>Cost</span><strong>${fmt.money(M.cost)}</strong></div>
            <div className=${best && M.carbon === best.carbon ? 'is-best' : ''}><span>Carbon</span><strong>${fmt.carbon(M.carbon)} t</strong></div>
            <div className=${best && M.weeks === best.weeks ? 'is-best' : ''}><span>Schedule</span><strong>${fmt.weeks(M.weeks)} wk</strong></div>
            <div><span>Bays</span><strong>${fmt.bay(M.bayX, M.bayZ)}</strong></div>
          </div>
        </div>`;
      })}
      ${state.options.length > 0 && compareIds.length < 2 && html`<div className="orbit-hint">Drag to orbit, right-drag to pan, scroll to zoom</div>`}
    </div>
  </section>`;
}

// ------------------------------------------------------------- report ----
function buildReport(state) {
  const opts = state.options;
  const rec = recommendation(opts, state.priority);
  const order = rec ? rec.order.map((id) => opts.find((o) => o.id === id)) : opts;
  const best = opts.length > 1 ? bestOf(opts.map((o) => o.result)) : null;
  const sameSpec = opts.every((o) => JSON.stringify({ ...o.spec, bay: null }) === JSON.stringify({ ...opts[0].spec, bay: null }));
  const date = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const rows = [
    ['System', (o) => MATERIALS[o.material].system],
    ['Design code', (o) => MATERIALS[o.material].code],
    ...(sameSpec ? [] : [['Footprint', (o) => `${fmt.m(o.spec.length)} × ${fmt.m(o.spec.width)} m, ${storeys(o.spec.floors)}`]]),
    ['Bay size', (o) => `${fmt.bay(o.result.grid.sx, o.result.grid.sz)} m${o.result.manualBay ? ' (manual)' : ''}`],
    ['Columns', (o) => `${o.result.metrics.columns}`],
    ['Cost', (o) => fmt.money(o.result.metrics.cost), 'cost'],
    ['Cost per m²', (o) => `$${fmt.int(o.result.metrics.costPerM2)}`],
    ['Embodied carbon', (o) => `${fmt.carbon(o.result.metrics.carbon)} tCO₂e`, 'carbon'],
    ['Carbon per m²', (o) => `${fmt.int(o.result.metrics.intensity)} kgCO₂e`],
    ['Schedule', (o) => `${fmt.weeks(o.result.metrics.weeks)} weeks`, 'weeks'],
    ['Column section', (o) => o.result.sections.column.name],
  ];
  const md = [
    `# Structural options study: ${state.project.name}`,
    `Prepared ${date} in Structure Studio (prototype). All figures use synthetic factors.`,
    '',
    '## Brief',
    sameSpec && opts[0] ? `${titleCase(opts[0].spec.type)}, ${describeSpec(opts[0].spec)}. Ranked by ${PRIORITIES[state.priority].label.toLowerCase()}.` : `Options use different footprints, listed below. Ranked by ${PRIORITIES[state.priority].label.toLowerCase()}.`,
    '',
    '## Options',
    `| | ${opts.map((o) => `${o.letter} ${matShort(o.material)}`).join(' | ')} |`,
    `|---|${opts.map(() => '---').join('|')}|`,
    ...rows.map(([k, f]) => `| ${k} | ${opts.map(f).join(' | ')} |`),
    '',
    '## Recommendation',
    rec ? rec.text : 'Add a second option to get a ranking.',
    '',
    '## How the agent chose bay sizes',
    ...opts.map((o) => `- ${o.letter} ${matShort(o.material)}: tried ${o.result.study.map((s) => `${fmt.bay(s.sx, s.sz)} m`).join(', ')}. Kept ${fmt.bay(o.result.grid.sx, o.result.grid.sz)} m${o.result.manualBay ? ' (set by the user)' : ''}.`),
    '',
    '## Assumptions',
    '- Cost, embodied carbon (A1 to A3, biogenic storage excluded) and schedule use placeholder factors. WSP data replaces them later.',
    '- Members are sized with span-to-depth rules of thumb, not a structural analysis.',
    '- Schedule covers foundations and the structural frame only.',
  ].join('\n');
  return { rec, order, best, rows, md, date, sameSpec };
}

function ReportDrawer({ state, onClose, ui }) {
  const ref = useRef(null);
  const [copied, setCopied] = useState('');
  const [showMd, setShowMd] = useState(false);
  const r = useMemo(() => buildReport(state), [state.options, state.priority, state.project.name]);
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    ref.current?.querySelector('.drawer-close')?.focus();
    return () => document.removeEventListener('keydown', k);
  }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(r.md); setCopied('Copied'); }
    catch { setShowMd(true); setCopied('Select the text below to copy it'); setTimeout(() => ref.current?.querySelector('textarea')?.select(), 50); }
    setTimeout(() => setCopied(''), 2400);
  };
  const opts = state.options;
  return html`<div className="drawer-scrim" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <aside className="drawer" ref=${ref} role="dialog" aria-modal="true" aria-label="Comparison report">
      <header className="drawer-head">
        <div><h2>Structural options study</h2><p>${state.project.name}, ${r.date}</p></div>
        <div className="drawer-actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick=${copy}><${Icon} name="copy" size=${15} />${copied || 'Copy as Markdown'}</button>
          <button type="button" className="icon-btn drawer-close" aria-label="Close report" onClick=${onClose}><${Icon} name="x" /></button>
        </div>
      </header>
      <div className="drawer-body">
        ${!opts.length && html`<p className="hint">Generate an option to fill the report.</p>`}
        ${opts.length > 0 && html`<${React.Fragment}>
          <section className="rep-sec">
            <h3>Brief</h3>
            <p>${r.sameSpec ? `${titleCase(opts[0].spec.type)}, ${describeSpec(opts[0].spec)}.` : 'The options use different footprints, shown in the table.'} Ranked by ${PRIORITIES[state.priority].label.toLowerCase()}.</p>
          </section>
          ${r.rec && html`<section className="rep-sec rep-rec">
            <h3>Recommendation</h3>
            <p>${r.rec.text}</p>
          </section>`}
          <section className="rep-sec">
            <h3>Options</h3>
            <div className="table-wrap">
              <table className="rep-table">
                <thead><tr><th scope="col"><span className="sr">Metric</span></th>${opts.map((o) => html`<th key=${o.id} scope="col"><span className="th-opt"><${MatTile} o=${o} size="sm" />${matShort(o.material)}</span></th>`)}</tr></thead>
                <tbody>${r.rows.map(([k, f, key]) => html`<tr key=${k}><th scope="row">${k}</th>${opts.map((o) => html`<td key=${o.id} className=${key && r.best && o.result.metrics[key] === r.best[key] ? 'is-best' : ''}>${f(o)}</td>`)}</tr>`)}</tbody>
              </table>
            </div>
          </section>
          ${opts.length > 1 && html`<section className="rep-sec">
            <h3>Trade-offs</h3>
            <${Bars} opts=${opts} />
          </section>`}
          <section className="rep-sec">
            <h3>How the agent chose bay sizes</h3>
            <ul className="rep-list">${opts.map((o) => html`<li key=${o.id}><strong>${o.letter} ${matShort(o.material)}.</strong> Tried ${listJoin(o.result.study.map((s) => `${fmt.bay(s.sx, s.sz)} m`))}. Kept ${fmt.bay(o.result.grid.sx, o.result.grid.sz)} m${o.result.manualBay ? ', set by you' : ''}.</li>`)}</ul>
          </section>
          <section className="rep-sec">
            <h3>Assumptions</h3>
            <ul className="rep-list">
              <li>Cost, embodied carbon (A1 to A3, biogenic storage excluded) and schedule use placeholder factors. WSP data replaces them later.</li>
              <li>Members are sized with span-to-depth rules of thumb, not a structural analysis.</li>
              <li>Schedule covers foundations and the structural frame only.</li>
            </ul>
          </section>
          <section className="rep-sec">
            <button type="button" className="linkish" onClick=${() => setShowMd((v) => !v)} aria-expanded=${showMd}>${showMd ? 'Hide' : 'Show'} Markdown source</button>
            ${showMd && html`<textarea className="md" readOnly value=${r.md} aria-label="Report as Markdown"></textarea>`}
          </section>
        <//>`}
      </div>
    </aside>
  </div>`;
}

function Bars({ opts }) {
  const metrics = [['Cost', 'cost', fmt.money], ['Embodied carbon', 'carbon', (v) => `${fmt.carbon(v)} t`], ['Schedule', 'weeks', (v) => `${fmt.weeks(v)} wk`]];
  return html`<div className="bars">${metrics.map(([label, k, f]) => {
    const max = Math.max(...opts.map((o) => o.result.metrics[k]));
    const min = Math.min(...opts.map((o) => o.result.metrics[k]));
    return html`<div key=${k} className="bars-group"><div className="bars-label">${label}</div>
      ${opts.map((o) => html`<div key=${o.id} className="bar-row">
        <span className="bar-name">${o.letter}</span>
        <span className="bar-track"><span className=${`bar is-${o.material} ${o.result.metrics[k] === min ? 'is-best' : ''}`} style=${{ width: `${Math.max(4, (o.result.metrics[k] / max) * 100)}%` }}></span></span>
        <span className="bar-val">${f(o.result.metrics[k])}</span>
      </div>`)}
    </div>`;
  })}</div>`;
}

// --------------------------------------------------------- walkthrough ---
const WALK = [
  { key: 'start', title: 'Enter building requirements', body: 'Type a brief in the chat, then approve the checkpoint.', prompt: 'Generate a 6 m x 4 m wooden shed', fresh: true, done: 'generated' },
  { key: 'generated', title: 'Watch it generate', body: 'Each tool call shows in the chat while the frame builds in 3D.', done: 'generated' },
  { key: 'viewed', title: 'View the model', body: 'Drag to orbit, scroll to zoom, or use the plan and elevation buttons.', done: 'viewed' },
  { key: 'changed', title: 'Request a change', body: 'Ask in chat, or use the panel on the right.', prompt: 'Switch it to steel', done: 'changed' },
  { key: 'added', title: 'Add a second option', body: 'The first option stays in its tab.', prompt: 'Add a timber version as a new option', done: 'added' },
  { key: 'managed', title: 'Switch or delete options', body: 'Click a tab, or the × on a tab. Deletes can be undone.', done: 'managed' },
];

function Walkthrough({ state, onClose, ui }) {
  const ref = useRef(null);
  useEnter(ref, true, { y: -8, opacity: 0 });
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.('[data-walk-toggle]')) onClose(); };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, []);
  const doneCount = WALK.filter((s) => state.walk[s.done]).length;
  return html`<div className="walk glass" ref=${ref} role="dialog" aria-label="Walkthrough">
    <div className="walk-head"><strong>Walkthrough</strong><span>${doneCount} of ${WALK.length} done</span></div>
    <p className="walk-intro">The six flows from the week 2 task doc, in the order to present them.</p>
    <ol className="walk-list">
      ${WALK.map((s, i) => html`<li key=${s.key} className=${state.walk[s.done] ? 'is-done' : ''}>
        <span className="walk-n">${state.walk[s.done] ? html`<${Icon} name="check" size=${12} stroke=${2.4} />` : i + 1}</span>
        <div className="walk-main">
          <div className="walk-title">${s.title}</div>
          <div className="walk-body">${s.body}</div>
          ${s.prompt && html`<button type="button" className="linkish" onClick=${() => ui.walkTry(s)}>Fill in “${s.prompt}”</button>`}
        </div>
      </li>`)}
    </ol>
  </div>`;
}

// ---------------------------------------------------------------- app ----
function readTheme() {
  try { return localStorage.getItem('ss-theme'); } catch { return null; }
}

function App() {
  const [state, dispatch] = useReducer(reducer, null, exampleState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const viewerRef = useRef(null);
  const composerRef = useRef(null);
  const [composer, setComposer] = useState('');
  const [theme, setTheme] = useState(readTheme);
  const editNote = useRef({ timer: null });

  const isMobile = () => window.matchMedia('(max-width: 860px)').matches;
  const agent = useMemo(() => createAgent(() => stateRef.current, dispatch, {
    showModel: () => { if (isMobile()) dispatch({ type: 'ui', patch: { panel: 'model' } }); },
    openReport: () => dispatch({ type: 'ui', patch: { report: true } }),
    reset: () => resetProject(),
    undo: (t) => undoToast(t),
  }), []);

  const resetProject = useCallback(() => {
    agent.clearPending();
    dispatch({ type: 'reset' });
    setComposer('');
  }, []);
  const undoToast = useCallback((t) => {
    if (!t?.undo) return;
    if (t.undo.kind === 'option') dispatch({ type: 'opt/restore', option: t.undo.option, index: t.undo.index });
    else dispatch({ type: 'restoreProject', snapshot: t.undo.snapshot });
  }, []);

  const applyTheme = useCallback(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    viewerRef.current?.setTheme({ gridMinor: v('--grid-minor'), gridMajor: v('--grid-major'), gridline: v('--gridline'), ink3: v('--ink-3'), dark: v('--is-dark') === '1' });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.setAttribute('data-theme', theme); else root.removeAttribute('data-theme');
    try { theme ? localStorage.setItem('ss-theme', theme) : localStorage.removeItem('ss-theme'); } catch {}
    requestAnimationFrame(applyTheme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => requestAnimationFrame(applyTheme);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [theme]);

  const effectiveDark = () => getComputedStyle(document.documentElement).getPropertyValue('--is-dark').trim() === '1';

  const ui = useMemo(() => ({
    fill: (t) => { setComposer(t); requestAnimationFrame(() => composerRef.current?.focus()); },
    select: (id) => {
      dispatch({ type: 'active', id });
      dispatch({ type: 'compare', value: false });
      dispatch({ type: 'walk', key: 'managed' });
      if (isMobile()) dispatch({ type: 'ui', patch: { panel: 'model' } });
    },
    compare: (v) => { dispatch({ type: 'compare', value: v }); if (v && isMobile()) dispatch({ type: 'ui', patch: { panel: 'model' } }); },
    openReport: () => dispatch({ type: 'ui', patch: { report: true } }),
    patchMsg: (id, patch) => dispatch({ type: 'msg/patch', id, patch }),
    say: (text) => dispatch({ type: 'msg/add', msg: { id: uid('m'), role: 'agent', kind: 'text', text } }),
    applyTheme,
    noteEdit: (o, key, spec) => {
      const n = editNote.current;
      clearTimeout(n.timer);
      n.keys = new Set([...(n.optionId === o.id ? n.keys || [] : []), key]);
      n.optionId = o.id;
      n.timer = setTimeout(() => {
        const labels = { length: `length ${fmt.m(spec.length)} m`, width: `width ${fmt.m(spec.width)} m`, storeyHeight: `storey height ${fmt.m(spec.storeyHeight)} m`, floors: storeys(spec.floors), roof: `${spec.roof} roof`, bay: spec.bay ? `${fmt.m(spec.bay)} m bays` : 'agent-picked bays' };
        const cur = stateRef.current.options.find((x) => x.id === o.id);
        const s = cur?.spec || spec;
        const lab = { length: `length ${fmt.m(s.length)} m`, width: `width ${fmt.m(s.width)} m`, storeyHeight: `storey height ${fmt.m(s.storeyHeight)} m`, floors: storeys(s.floors), roof: `${s.roof} roof`, bay: s.bay ? `${fmt.m(s.bay)} m bays` : 'agent-picked bays' };
        dispatch({ type: 'msg/add', msg: { id: uid('m'), role: 'note', kind: 'note', text: `You set option ${o.letter} to ${listJoin([...n.keys].map((k) => lab[k] || labels[k]))}` } });
        dispatch({ type: 'walk', key: 'changed' });
        n.keys = new Set();
      }, 1100);
    },
    walkTry: (s) => {
      if (s.fresh && stateRef.current.options.length) resetProject();
      setComposer(s.prompt);
      dispatch({ type: 'ui', patch: { walk: false, panel: 'chat' } });
      requestAnimationFrame(() => composerRef.current?.focus());
    },
  }), []);

  // Toast auto-dismiss
  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => dispatch({ type: 'toast', toast: null }), 7000);
    return () => clearTimeout(t);
  }, [state.toast?.id]);

  // Keyboard shortcuts
  useEffect(() => {
    const k = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
      const s = stateRef.current;
      if (e.key === '/') { e.preventDefault(); composerRef.current?.focus(); }
      else if (e.key === '1') viewerRef.current?.frame(true, 'iso');
      else if (e.key === '2') viewerRef.current?.frame(true, 'top');
      else if (e.key === '3') viewerRef.current?.frame(true, 'front');
      else if (e.key === 'w' || e.key === 'W') dispatch({ type: 'display', patch: { envelope: !s.display.envelope } });
      else if (e.key === 'g' || e.key === 'G') dispatch({ type: 'display', patch: { labels: !s.display.labels } });
      else if (e.key === 'c' || e.key === 'C') ui.compare(!s.compare);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const i = s.options.findIndex((o) => o.id === s.activeId);
        const n = s.options[(i + (e.key === 'ArrowRight' ? 1 : -1) + s.options.length) % s.options.length];
        if (n) ui.select(n.id);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const hasOptions = state.options.length > 0;
  return html`<div className="app" data-panel=${state.ui.panel}>
    <header className="topbar">
      <div className="brand"><${BrandMark} /><span className="brand-name">Structure Studio</span></div>
      <span className="crumb-sep" aria-hidden="true">/</span>
      <label className="project" htmlFor="project-name">
        <span className="sr">Project name</span>
        <input id="project-name" value=${state.project.name} onChange=${(e) => dispatch({ type: 'project', patch: { name: e.target.value } })} spellCheck="false" />
        ${state.project.example && html`<span className="pill pill--outline pill--tiny">Example</span>`}
      </label>
      <div className="topbar-right">
        <div className="walk-wrap">
          <button type="button" data-walk-toggle className=${`btn btn--ghost btn--sm ${state.ui.walk ? 'is-on' : ''}`} aria-expanded=${state.ui.walk} onClick=${() => dispatch({ type: 'ui', patch: { walk: !state.ui.walk } })}>
            <${Icon} name="list" size=${16} /><span className="hide-sm">Walkthrough</span>
          </button>
          ${state.ui.walk && html`<${Walkthrough} state=${state} ui=${ui} onClose=${() => dispatch({ type: 'ui', patch: { walk: false } })} />`}
        </div>
        <button type="button" className="btn btn--ghost btn--sm" disabled=${!hasOptions} onClick=${ui.openReport}><${Icon} name="doc" size=${16} /><span className="hide-sm">Report</span></button>
        <button type="button" className="icon-btn" aria-label="Switch colour theme" title="Switch colour theme" onClick=${() => setTheme(effectiveDark() ? 'light' : 'dark')}><${Icon} name=${theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'sun' : 'moon'} /></button>
        <button type="button" className="btn btn--secondary btn--sm" onClick=${resetProject}><${Icon} name="newdoc" size=${16} /><span className="hide-sm">New project</span></button>
      </div>
    </header>
    <nav className="mobile-switch" aria-label="Panels">
      <${Segmented} label="Panel" value=${state.ui.panel} onChange=${(v) => dispatch({ type: 'ui', patch: { panel: v } })}
        options=${[{ value: 'chat', label: 'Chat' }, { value: 'model', label: hasOptions ? `Model (${state.options.length})` : 'Model' }]} />
    </nav>
    <main className="main">
      <${Chat} state=${state} agent=${agent} ui=${ui} composer=${composer} setComposer=${setComposer} composerRef=${composerRef} />
      <${ViewerPanel} state=${state} dispatch=${dispatch} agent=${agent} ui=${ui} viewerRef=${viewerRef} />
    </main>
    ${state.ui.report && html`<${ReportDrawer} state=${state} ui=${ui} onClose=${() => dispatch({ type: 'ui', patch: { report: false } })} />`}
    ${state.toast && html`<div className="toast" role="status" key=${state.toast.id}>
      <span>${state.toast.text}</span>
      ${state.toast.undo && html`<button type="button" className="toast-btn" onClick=${() => undoToast(state.toast)}><${Icon} name="undo" size=${15} />Undo</button>`}
      <button type="button" className="icon-btn icon-btn--sm" aria-label="Dismiss" onClick=${() => dispatch({ type: 'toast', toast: null })}><${Icon} name="x" size=${14} /></button>
    </div>`}
  </div>`;
}

ReactDOM.createRoot(document.getElementById('app')).render(html`<${App} />`);
