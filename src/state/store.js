import { normalizeSpec } from '../engine/engine.js';
import { LETTERS, makeOption, recommendation, traceStepsFor, uid, withChange } from './helpers.js';

const WALK_EMPTY = { generated: false, viewed: false, changed: false, added: false, managed: false };
const isNarrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches;

// The page opens on the start screen. The example project is one click away.
export function startState() {
  return {
    view: 'start',
    project: { name: 'Untitled study', example: false },
    priority: 'balanced',
    options: [],
    activeId: null,
    compare: false,
    display: { envelope: false, labels: true },
    messages: [],
    busy: false,
    busyLabel: '',
    ui: { report: false, inspector: false, panel: 'chat', walk: false },
    walk: { ...WALK_EMPTY },
    toast: null,
  };
}

export const EXAMPLE_BRIEF = 'Single-storey workshop, 30 × 12 m, 4.5 m to the eaves, gable roof. Compare timber, concrete and steel. Lowest carbon matters most.';

export function exampleState(prev) {
  const spec = { type: 'workshop', length: 30, width: 12, storeyHeight: 4.5, floors: 1, roof: 'gable' };
  const priority = 'carbon';
  const mats = ['timber', 'concrete', 'steel'];
  const options = mats.map((m, i) => ({ ...makeOption(LETTERS[i], m, spec, priority, i === 0 ? 'build' : 'ready'), fresh: false }));
  const rec = recommendation(options, priority);
  return {
    ...startState(),
    view: 'work',
    project: { name: 'Campus workshop', example: true },
    priority,
    options,
    activeId: options[0].id,
    messages: [
      { id: uid('m'), role: 'user', kind: 'text', text: EXAMPLE_BRIEF },
      { id: uid('m'), role: 'agent', kind: 'spec', spec: normalizeSpec(spec), materials: mats, priority, assumed: [], state: 'confirmed' },
      {
        id: uid('m'), role: 'agent', kind: 'trace', title: 'Generated 3 options', state: 'done', elapsed: 4.6, collapsed: true,
        steps: traceStepsFor(options, true).map((s) => ({ ...s, status: 'done' })),
      },
      { id: uid('m'), role: 'agent', kind: 'result', optionIds: options.map((o) => o.id), title: '3 options ready', text: rec.text },
    ],
    ui: { ...(prev?.ui || startState().ui), report: false, walk: false, panel: isNarrow() ? 'model' : 'chat' },
    walk: { ...WALK_EMPTY, generated: true },
  };
}

export function reducer(s, a) {
  switch (a.type) {
    case 'view': return { ...s, view: a.value };
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
      return {
        ...s, options, activeId, compare: options.length > 1 && s.compare,
        toast: { id: uid('t'), text: `Option ${removed.letter} deleted`, undo: { kind: 'option', option: { ...removed, stage: 'ready', fresh: true }, index: idx } },
      };
    }
    case 'opt/restore': {
      const options = [...s.options];
      options.splice(Math.min(a.index, options.length), 0, a.option);
      return { ...s, options, activeId: a.option.id, toast: null };
    }
    case 'active': return { ...s, activeId: a.id };
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
    case 'example': return exampleState(s);
    case 'reset': return {
      ...startState(), ui: { ...startState().ui },
      toast: s.options.length || s.messages.length ? { id: uid('t'), text: 'Started a new study', undo: { kind: 'project', snapshot: s } } : null,
    };
    case 'restoreProject': return { ...a.snapshot, toast: null, ui: { ...a.snapshot.ui, report: false } };
    default: return s;
  }
}
