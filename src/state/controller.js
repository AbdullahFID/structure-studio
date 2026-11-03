// One controller per page: the store, the agent and the UI commands.
// It lives outside React so the agent always reads the latest state, and the
// same object can later sit behind a real orchestrator without UI changes.
import { flushSync } from 'react-dom';
import { fmt } from '../engine/engine.js';
import { createAgent } from '../agent/agent.js';
import { REDUCED, listJoin, storeys, uid } from './helpers.js';
import { reducer, startState } from './store.js';

function createStore(reduce, init) {
  let state = init;
  const subs = new Set();
  return {
    getState: () => state,
    dispatch(a) {
      const next = reduce(state, a);
      if (next === state) return;
      state = next;
      for (const f of subs) f();
    },
    subscribe(f) {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}

// Layout-changing actions morph with the View Transitions API where it exists.
const MORPHS = new Set(['view', 'example', 'reset', 'restoreProject']);
const isNarrow = () => window.matchMedia('(max-width: 860px)').matches;

export function createController({ setComposer }) {
  const store = createStore(reducer, startState());
  const get = store.getState;
  const dispatch = (a) => {
    if (MORPHS.has(a.type) && document.startViewTransition && !REDUCED) {
      document.startViewTransition(() => flushSync(() => store.dispatch(a)));
    } else store.dispatch(a);
  };
  const composer = { el: null };
  let frameView = () => {};
  const edit = { timer: null, keys: new Set(), optionId: null };

  const ui = {
    select(id) {
      dispatch({ type: 'active', id });
      dispatch({ type: 'compare', value: false });
      dispatch({ type: 'walk', key: 'managed' });
      if (isNarrow()) dispatch({ type: 'ui', patch: { panel: 'model' } });
    },
    compare(v) {
      dispatch({ type: 'compare', value: v });
      if (v) dispatch({ type: 'ui', patch: { inspector: false } });
      if (v && isNarrow()) dispatch({ type: 'ui', patch: { panel: 'model' } });
    },
    openReport: () => dispatch({ type: 'ui', patch: { report: true } }),
    patchMsg: (id, patch) => dispatch({ type: 'msg/patch', id, patch }),
    say: (text) => dispatch({ type: 'msg/add', msg: { id: uid('m'), role: 'agent', kind: 'text', text } }),
    reset() {
      agent.clearPending();
      dispatch({ type: 'reset' });
      setComposer('');
    },
    undo(t) {
      if (!t?.undo) return;
      if (t.undo.kind === 'option') dispatch({ type: 'opt/restore', option: t.undo.option, index: t.undo.index });
      else dispatch({ type: 'restoreProject', snapshot: t.undo.snapshot });
    },
    openExample() {
      agent.clearPending();
      dispatch({ type: 'example' });
    },
    focusComposer: () => composer.el?.focus(),
    bindComposer: (el) => { composer.el = el; },
    bindView: (fn) => { frameView = fn; },
    view: (v) => frameView(v),
    async attach(f) {
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
        if (get().view === 'start') dispatch({ type: 'view', value: 'work' });
        ui.say(`I received ${f.name}. Reading IFC and Revit models is planned for phase 2, when WSP shares a model. For now, attach a JSON massing file or describe the footprint.`);
      }
    },
    // Slider edits apply instantly; one note in the chat records them once the hand stops.
    noteEdit(o, key) {
      clearTimeout(edit.timer);
      if (edit.optionId !== o.id) edit.keys = new Set();
      edit.keys.add(key);
      edit.optionId = o.id;
      edit.timer = setTimeout(() => {
        const cur = get().options.find((x) => x.id === o.id);
        if (!cur) return;
        const s = cur.spec;
        const lab = {
          length: `length ${fmt.m(s.length)} m`, width: `width ${fmt.m(s.width)} m`, storeyHeight: `storey height ${fmt.m(s.storeyHeight)} m`,
          floors: storeys(s.floors), roof: `${s.roof} roof`, bay: s.bay ? `${fmt.m(s.bay)} m bays` : 'agent-picked bays',
        };
        dispatch({ type: 'msg/add', msg: { id: uid('m'), role: 'note', kind: 'note', text: `You set option ${o.letter} to ${listJoin([...edit.keys].map((k) => lab[k]))}` } });
        dispatch({ type: 'walk', key: 'changed' });
        edit.keys = new Set();
      }, 1100);
    },
    walkTry(s) {
      if (s.fresh && get().options.length) ui.reset();
      if (get().view === 'start' && !s.fresh) dispatch({ type: 'view', value: 'work' });
      setComposer(s.prompt);
      dispatch({ type: 'ui', patch: { walk: false, panel: 'chat' } });
      requestAnimationFrame(() => composer.el?.focus());
    },
  };

  const agent = createAgent(get, dispatch, {
    showModel: () => { if (isNarrow()) dispatch({ type: 'ui', patch: { panel: 'model' } }); },
    openReport: ui.openReport,
    reset: () => ui.reset(),
    undo: (t) => ui.undo(t),
  });

  // Keyboard shortcuts
  const onKey = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
    if (e.target?.closest?.('[role="dialog"], [role="menu"], [role="slider"], [role="radiogroup"], [role="group"], [role="tablist"]')) return;
    const s = get();
    if (e.key === '/') { e.preventDefault(); composer.el?.focus(); return; }
    if (s.view !== 'work' || !s.options.length) return;
    if (e.key === '1') frameView('iso');
    else if (e.key === '2') frameView('top');
    else if (e.key === '3') frameView('front');
    else if (e.key === 'w' || e.key === 'W') dispatch({ type: 'display', patch: { envelope: !s.display.envelope } });
    else if (e.key === 'g' || e.key === 'G') dispatch({ type: 'display', patch: { labels: !s.display.labels } });
    else if (e.key === 'c' || e.key === 'C') ui.compare(!s.compare);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const i = s.options.findIndex((o) => o.id === s.activeId);
      const n = s.options[(i + (e.key === 'ArrowRight' ? 1 : -1) + s.options.length) % s.options.length];
      if (n) ui.select(n.id);
    }
  };

  return { store, dispatch, agent, ui, onKey };
}
