// ============================================================================
// The "agent" is a local script that calls the engine the way tools would.
// A real orchestrator replaces createAgent() and streams the same message
// kinds (trace, spec, result, change, clarify, text), so the UI stays as is.
// Tool names match the engine: place_footprint, study_bays, size_members,
// estimate_metrics, build_geometry, rank_options.
// ============================================================================
import { MATERIALS, MATERIAL_KEYS, PRIORITIES, normalizeSpec, parseBrief, fmt } from '../engine/engine.js';
import {
  MAX_OPTIONS, listJoin, makeOption, matShort, memberCount, nextLetter, optLabel, recommendation,
  storeys, traceStepsFor, typeDefaults, uid, wait, withChange,
} from '../state/helpers.js';

export function createAgent(get, dispatch, hooks) {
  const builtWaiters = new Map();
  let pending = null; // partial brief waiting for a footprint

  const say = (text, extra = {}) => dispatch({ type: 'msg/add', msg: { id: uid('m'), role: 'agent', kind: 'text', text, ...extra } });

  const waitBuilt = (id) => new Promise((resolve) => {
    builtWaiters.set(id, resolve);
    setTimeout(() => {
      if (builtWaiters.get(id) === resolve) {
        builtWaiters.delete(id);
        dispatch({ type: 'opt/stageAll', ids: [id], stage: 'ready' });
        resolve();
      }
    }, 6000);
  });

  async function runTrace(title, steps) {
    const id = uid('m');
    const t0 = performance.now();
    dispatch({ type: 'msg/add', msg: { id, role: 'agent', kind: 'trace', title, state: 'running', steps: steps.map(({ run: _r, ms: _m, ...s }) => ({ ...s, status: 'pending', detail: '' })) } });
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
    const steps = traceStepsFor(opts, multi).map((s) => ({ ...s, ms: { footprint: 700, bays: 1300, size: 600, estimate: 520, build: 120, rank: 420 }[s.key] }));
    steps[1].run = async () => dispatch({ type: 'opt/stageAll', ids, stage: 'grid' });
    steps[4].run = async () => {
      dispatch({ type: 'opt/stageAll', ids, stage: 'build', animate: true });
      await Promise.all(ids.map(waitBuilt));
    };
    let rec = null;
    if (multi) {
      rec = recommendation(all, priority);
      const lead = all.find((o) => o.id === rec.leadId);
      steps[5].detail = `${PRIORITIES[priority].label}: ${optLabel(lead)} ranks first`;
    }
    const title = opts.length > 1 ? `Generating ${opts.length} options` : added ? `Adding option ${opts[0].letter}` : `Generating option ${opts[0].letter}`;
    await runTrace(title, steps);
    const kept = st.options.length && added
      ? ` Option${st.options.length > 1 ? 's' : ''} ${listJoin(st.options.map((o) => o.letter))} ${st.options.length > 1 ? 'are' : 'is'} still in ${st.options.length > 1 ? 'their tabs' : 'its tab'}.`
      : '';
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

  async function change(optionId, patch, material) {
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
        label: next.manualBay ? 'Lay out your bay grid' : 'Re-run bay study', tool: 'study_bays', ms: 1100,
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
    if (viaChat) say(`Deleted option ${optLabel(o)}. Use Undo on the notice if you need it back.`);
    else dispatch({ type: 'msg/add', msg: { id: uid('m'), role: 'note', kind: 'note', text: `You deleted option ${optLabel(o)}` } });
  }

  function startBrief(p) {
    const st = get();
    const merged = pending
      ? { ...pending, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))) }
      : p;
    if (!merged.length || !merged.width) {
      pending = merged;
      dispatch({
        type: 'msg/add',
        msg: {
          id: uid('m'), role: 'agent', kind: 'clarify',
          text: merged.type
            ? `What footprint should the ${merged.type} have? Pick one or type your own, like "8 x 5 m".`
            : merged.hasSpec || merged.materials?.length
              ? 'What footprint should I use? Pick one or type your own, like "8 x 5 m".'
              : 'Describe the building you want to study. Pick a starting point or type your own.',
          chips: merged.type ? ['6 x 4 m', '12 x 8 m', '30 x 12 m'] : ['6 x 4 m shed', '30 x 12 m workshop', '48 x 24 m office, 5 storeys'],
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
    if (st.view === 'start') dispatch({ type: 'view', value: 'work' });
    dispatch({ type: 'msg/add', msg: { id: uid('m'), role: 'user', kind: 'text', text } });
    if (st.busy) return say('I am still working on the last request. Send that again once it finishes.');
    await wait(280);
    const p = parseBrief(text);
    const active = st.options.find((o) => o.id === st.activeId);
    const letterOpt = (L) => (L === 'ACTIVE' ? active : st.options.find((o) => o.letter === L));

    if (p.help) {
      return say('I lay out a column grid, size the members and estimate cost, embodied carbon and schedule for each structural system. Try:\n"Generate a 6 m x 4 m wooden shed"\n"Switch it to steel"\n"Add a concrete version as a new option"\n"Use 8 m bays" or "Make it two storeys"\n"Compare options" or "Write the report"');
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
      return say('The comparison report is open. You can copy it as Markdown or print it from there.');
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
    if (!st.options.length || pending) return startBrief(p);
    if (p.length && p.width && p.materials.length >= 2 && !p.newOption) return startBrief(p);

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
    resolveBuilt(id) {
      const r = builtWaiters.get(id);
      if (r) { builtWaiters.delete(id); r(); }
    },
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
