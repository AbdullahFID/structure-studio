import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { computeOption } from '../engine/engine.js';
import { StructureViewer } from '../viewer/StructureViewer.js';
import { Inspector } from './Inspector.jsx';
import { useLingering, useMedia, usePresence } from './hooks.js';
import { readViewerTheme } from './theme.js';
import { CompareOverlay, OptionTabs, TitleBlock, ViewTools } from './StageOverlays.jsx';

const PREVIEW_SPEC = { type: 'workshop', length: 30, width: 12, storeyHeight: 4.5, floors: 1, roof: 'gable' };
const NO_OFFSET = { x: 0, y: 0 };

export function Stage({ state, dispatch, agent, ui, viewerRef, children }) {
  const hostRef = useRef(null);
  const areaRef = useRef(null);
  const [, setSize] = useState({ w: 0, h: 0 });
  const [rects, setRects] = useState([]);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState('iso');
  const [inspOffset, setInspOffset] = useState(NO_OFFSET);
  const narrow = useMedia('(max-width: 860px)');
  const active = state.options.find((o) => o.id === state.activeId);
  const working = state.view === 'work';

  const compareIds = useMemo(() => {
    if (!state.compare || state.options.length < 2) return [];
    if (state.options.length <= 4) return state.options.map((o) => o.id);
    const rest = state.options.filter((o) => o.id !== state.activeId).slice(0, 3);
    return state.options.filter((o) => o.id === state.activeId || rest.includes(o)).map((o) => o.id);
  }, [state.compare, state.options, state.activeId]);

  useEffect(() => {
    let v;
    try {
      v = new StructureViewer(hostRef.current, {
        onBuilt: (id) => { dispatch({ type: 'opt/stageAll', ids: [id], stage: 'ready' }); agent.resolveBuilt(id); },
        onInteract: () => dispatch({ type: 'walk', key: 'viewed' }),
        // The viewer owns the compare layout; the overlays follow it.
        onLayout: (r) => setRects(r),
      });
      viewerRef.current = v;
      v.setTheme(readViewerTheme());
    } catch (err) {
      console.warn('3D viewer unavailable', err);
      queueMicrotask(() => setFailed(true));
    }
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(areaRef.current);
    return () => {
      ro.disconnect();
      v?.dispose();
      if (viewerRef.current === v) viewerRef.current = null;
    };
  }, [agent, dispatch, viewerRef]);

  // Before any option exists the sheet shows linework: the example on the start
  // screen, or a ghost of the brief while it waits for approval.
  const pending = !state.options.length && state.view === 'work' ? state.messages.findLast((m) => m.kind === 'spec' && m.state === 'pending') : null;
  const previewKey = state.options.length ? '' : state.view === 'start'
    ? JSON.stringify({ id: 'example', spec: PREVIEW_SPEC, material: 'timber' })
    : pending ? JSON.stringify({ id: pending.id, spec: pending.spec, material: pending.materials[0] }) : '';
  const lastPreview = useRef('');
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    if (!previewKey) { v.setPreview(null); lastPreview.current = ''; return; }
    const d = JSON.parse(previewKey);
    const replay = lastPreview.current !== d.id;
    lastPreview.current = d.id;
    // The example on the start screen is drawn by the crew, who then hand over to the message box.
    const crew = d.id === 'example' && replay
      ? { layer: areaRef.current, handoff: () => document.querySelector('.start-box textarea')?.getBoundingClientRect() }
      : null;
    v.setPreview(computeOption(d.spec, d.material, 'balanced'), { animate: replay, crew });
  }, [previewKey, viewerRef]);
  const waiting = state.view === 'work' && !state.options.length && !pending;

  useEffect(() => {
    viewerRef.current?.sync(state.options, { activeId: state.activeId, compareIds, display: state.display });
  }, [state.options, state.activeId, compareIds, state.display, viewerRef]);

  // On phones the chat tab hides the sheet; stop drawing frames nobody sees.
  const hidden = narrow && working && state.ui.panel === 'chat';
  useEffect(() => { viewerRef.current?.setActive(!hidden); }, [hidden, viewerRef]);

  // Tell the viewer which parts of the canvas are covered, so the model is framed in the clear area.
  useLayoutEffect(() => {
    const v = viewerRef.current, stage = areaRef.current;
    if (!v || !stage) return;
    const sr = stage.getBoundingClientRect();
    const ins = { top: 0, right: 0, bottom: 0, left: 0 };
    for (const el of document.querySelectorAll('[data-inset]')) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (r.right <= sr.left || r.left >= sr.right || r.bottom <= sr.top || r.top >= sr.bottom) continue;
      let side = el.dataset.inset;
      // A panel that moves (Adjust can be dragged) only claims room when it is parked against a side.
      // Dragged into the middle it floats, so the model does not shrink into the gap beside it.
      if (side === 'auto') {
        side = r.left - sr.left < 140 ? 'left' : sr.right - r.right < 140 ? 'right' : '';
        if (!side) continue;
      }
      // A side panel that spans the sheet (the phone bottom sheet) covers the bottom, not the side.
      if ((side === 'right' || side === 'left') && r.width > sr.width * 0.6) side = 'bottom';
      if (side === 'left') ins.left = Math.max(ins.left, r.right - sr.left + 8);
      else if (side === 'right') ins.right = Math.max(ins.right, sr.right - r.left + 8);
      else if (side === 'bottom') ins.bottom = Math.max(ins.bottom, sr.bottom - r.top + 8);
      else if (side === 'top') ins.top = Math.max(ins.top, r.bottom - sr.top + 4);
    }
    v.setInsets(ins);
    // Each compare view frames its model between its name and its figures.
    const c = stage.querySelector('.cmp:not(.is-leaving)');
    const head = c?.querySelector('.cmp-head'), foot = c?.querySelector('.cmp-foot');
    if (c && head && foot) {
      const cr = c.getBoundingClientRect();
      v.setComparePad({ top: Math.round(head.getBoundingClientRect().bottom - cr.top + 6), bottom: Math.round(cr.bottom - foot.getBoundingClientRect().top + 6) });
    }
  });

  const onView = (v) => {
    setView(v);
    viewerRef.current?.frame(true, v);
    dispatch({ type: 'walk', key: 'viewed' });
  };
  useEffect(() => {
    ui.bindView(onView);
  });

  const single = compareIds.length < 2;
  const hasOptions = working && state.options.length > 0;
  // Overlays stay mounted for a moment after they go, so they can animate out.
  const titleP = usePresence(hasOptions && single && !!active, 220);
  const inspP = usePresence(hasOptions && single && !!active && state.ui.inspector, 240);
  const cmp = useLingering(hasOptions && rects.length > 1 ? rects : null, 240);
  const status = useLingering(working && state.busy ? state.busyLabel || 'Working' : null, 200);

  return (
    <section className="stage" aria-label="3D model">
      <div className="stage-canvas" ref={areaRef}>
        <div className="canvas-host" ref={hostRef} />
        {failed && (
          <div className="stage-fallback">
            <p><strong>The 3D preview is off.</strong> This browser did not give the page a WebGL context. Turn on hardware acceleration and reload. The chat, estimates and report still work.</p>
          </div>
        )}
        {hasOptions && (
          <div className="stage-top" data-inset="top">
            <OptionTabs state={state} ui={ui} agent={agent} />
            <ViewTools state={state} dispatch={dispatch} ui={ui} view={view} onView={onView} />
          </div>
        )}
        {titleP.mounted && active && <TitleBlock o={active} state={state} leaving={titleP.leaving} />}
        {inspP.mounted && active && (
          <Inspector
            key={active.id} o={active} state={state} dispatch={dispatch} agent={agent} ui={ui}
            leaving={inspP.leaving} narrow={narrow} offset={inspOffset} onOffset={setInspOffset}
            onClose={() => dispatch({ type: 'ui', patch: { inspector: false } })}
          />
        )}
        {cmp.item && <CompareOverlay state={state} rects={cmp.item} ui={ui} leaving={cmp.leaving} />}
        {status.item && (
          <div className={`stage-status ${status.leaving ? 'is-leaving' : ''}`} role="status"><span className="pen" aria-hidden="true" />{status.item}</div>
        )}
        {waiting && <p className="stage-empty">Your building appears here once the brief is clear.</p>}
        {pending && <p className="stage-empty stage-empty--ghost">Outline of the brief. Press Generate to frame it.</p>}
        {children}
      </div>
    </section>
  );
}
