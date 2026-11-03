import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { computeOption } from '../engine/engine.js';
import { StructureViewer, compareRects } from '../viewer/StructureViewer.js';
import { Inspector } from './Inspector.jsx';
import { readViewerTheme } from './theme.js';
import { CompareOverlay, OptionTabs, TitleBlock, ViewTools } from './StageOverlays.jsx';

const PREVIEW_SPEC = { type: 'workshop', length: 30, width: 12, storeyHeight: 4.5, floors: 1, roof: 'gable' };

export function Stage({ state, dispatch, agent, ui, viewerRef, children }) {
  const hostRef = useRef(null);
  const areaRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState('iso');
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
    v.setPreview(computeOption(d.spec, d.material, 'balanced'), { animate: replay });
  }, [previewKey, viewerRef]);
  const waiting = state.view === 'work' && !state.options.length && !pending;

  useEffect(() => {
    viewerRef.current?.sync(state.options, { activeId: state.activeId, compareIds, display: state.display });
  }, [state.options, state.activeId, compareIds, state.display, viewerRef]);

  // Tell the viewer which parts of the canvas are covered, so the model is framed in the clear area.
  useLayoutEffect(() => {
    const v = viewerRef.current, stage = areaRef.current;
    if (!v || !stage) return;
    const sr = stage.getBoundingClientRect();
    const ins = { top: 0, right: 0, bottom: 0, left: 0 };
    for (const el of document.querySelectorAll('[data-inset]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).display === 'none') continue;
      if (r.right <= sr.left || r.left >= sr.right || r.bottom <= sr.top || r.top >= sr.bottom) continue;
      let side = el.dataset.inset;
      // A side panel that spans the sheet (the phone bottom sheet) covers the bottom, not the side.
      if ((side === 'right' || side === 'left') && r.width > sr.width * 0.6) side = 'bottom';
      if (side === 'left') ins.left = Math.max(ins.left, r.right - sr.left + 8);
      else if (side === 'right') ins.right = Math.max(ins.right, sr.right - r.left + 8);
      else if (side === 'bottom') ins.bottom = Math.max(ins.bottom, sr.bottom - r.top + 8);
      else if (side === 'top') ins.top = Math.max(ins.top, r.bottom - sr.top + 4);
    }
    v.setInsets(ins);
  });

  const onView = (v) => {
    setView(v);
    viewerRef.current?.frame(true, v);
    dispatch({ type: 'walk', key: 'viewed' });
  };
  useEffect(() => {
    ui.bindView(onView);
  });

  const rects = compareIds.length > 1 ? compareRects(size.w, size.h, compareIds.length) : [];
  const single = compareIds.length < 2;

  return (
    <section className="stage" aria-label="3D model">
      <div className="stage-canvas" ref={areaRef}>
        <div className="canvas-host" ref={hostRef} />
        {failed && (
          <div className="stage-fallback">
            <p><strong>The 3D preview is off.</strong> This browser did not give the page a WebGL context. Turn on hardware acceleration and reload. The chat, estimates and report still work.</p>
          </div>
        )}
        {working && state.options.length > 0 && (
          <>
            <div className="stage-top" data-inset="top">
              <OptionTabs state={state} ui={ui} agent={agent} />
              <ViewTools state={state} dispatch={dispatch} ui={ui} view={view} onView={onView} />
            </div>
            {single && active && <TitleBlock o={active} state={state} />}
            {single && active && state.ui.inspector && (
              <Inspector key={active.id} o={active} state={state} dispatch={dispatch} agent={agent} ui={ui} onClose={() => dispatch({ type: 'ui', patch: { inspector: false } })} />
            )}
            {!single && <CompareOverlay state={state} rects={rects} compareIds={compareIds} ui={ui} />}
          </>
        )}
        {working && state.busy && <div className="stage-status" role="status"><span className="pen" aria-hidden="true" />{state.busyLabel}</div>}
        {waiting && <p className="stage-empty">Your building appears here once the brief is clear.</p>}
        {pending && <p className="stage-empty stage-empty--ghost">Outline of the brief. Press Generate to frame it.</p>}
        {children}
      </div>
    </section>
  );
}
