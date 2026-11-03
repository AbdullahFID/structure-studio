import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { MATERIALS, MATERIAL_KEYS, PRIORITIES, fmt, normalizeSpec } from '../engine/engine.js';
import { matShort, plural, withChange } from '../state/helpers.js';
import { IconButton, MaterialSwatch, PlanGlyph, Segmented, SliderField, Stepper } from './ui.jsx';

// Drag the header to move the panel around the sheet on desktop; double-click puts it back.
// On phones the panel is a bottom sheet, and dragging it down past a threshold closes it.
function useDragPanel({ narrow, offset, onOffset, onClose }) {
  const panel = useRef(null);
  const drag = useRef(null);
  const onPointerDown = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const el = panel.current, box = el?.offsetParent?.getBoundingClientRect();
    if (!el || !box) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    // How far the panel may travel before it leaves the sheet.
    drag.current = {
      x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y, nx: offset.x, ny: offset.y,
      minX: offset.x - (r.left - box.left) + 8, maxX: offset.x + (box.right - r.right) - 8,
      minY: offset.y - (r.top - box.top) + 8, maxY: offset.y + (box.bottom - r.bottom) - 8,
    };
    el.classList.add('is-dragging');
  };
  const onPointerMove = (e) => {
    const d = drag.current, el = panel.current;
    if (!d || !el) return;
    if (narrow) {
      d.ny = Math.max(0, e.clientY - d.y);
      el.style.translate = `0 ${d.ny}px`;
      return;
    }
    d.nx = Math.min(d.maxX, Math.max(d.minX, d.ox + e.clientX - d.x));
    d.ny = Math.min(d.maxY, Math.max(d.minY, d.oy + e.clientY - d.y));
    el.style.translate = `${d.nx}px ${d.ny}px`;
  };
  const end = () => {
    const d = drag.current, el = panel.current;
    drag.current = null;
    if (!d || !el) return;
    el.classList.remove('is-dragging');
    if (narrow) {
      if (d.ny > 90) onClose();
      else el.style.translate = '';
      return;
    }
    onOffset({ x: d.nx, y: d.ny });
  };
  const reset = () => { if (!narrow) onOffset({ x: 0, y: 0 }); };
  return { panel, handlers: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end, onDoubleClick: reset } };
}

export function Inspector({ o, state, dispatch, agent, ui, onClose, leaving, narrow, offset, onOffset }) {
  const { panel, handlers } = useDragPanel({ narrow, offset, onOffset, onClose });
  // The draft follows the option until the user starts dragging; a new version from anywhere resets it.
  const [local, setLocal] = useState({ v: o.version, spec: o.spec });
  const draft = local.v === o.version ? local.spec : o.spec;
  const setDraft = (spec) => setLocal({ v: o.version, spec });
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const r = o.result;

  const apply = (spec, key) => {
    dispatch({ type: 'opt/set', id: o.id, patch: (x) => ({ ...withChange(x, spec, x.material, state.priority), stage: 'ready', animate: false }) });
    ui.noteEdit(o, key);
  };
  const live = (k, v) => {
    const next = normalizeSpec({ ...draft, [k]: v });
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => apply(next, k), 120);
  };
  const set = (k, v) => apply(normalizeSpec({ ...draft, [k]: v }), k);

  const sec = r.sections;
  const rows = [
    ['Columns', sec.column.name],
    [o.material === 'steel' ? 'Beams' : 'Beams, long way', sec.beamX.name],
    [o.material === 'steel' ? 'Girders' : 'Beams, short way', sec.girder.name],
    o.material === 'steel' && r.infillPerBay > 0 && ['Infill beams', sec.infill.name],
    o.spec.floors > 1 && ['Floors', sec.slab.name],
    o.spec.roof === 'gable' && ['Rafters', sec.rafter.name],
    ['Roof', sec.roofDeck.name],
    o.material === 'steel' && ['Bracing', sec.brace.name],
    ['Footings', `${r.footSide.toFixed(2)} m pads, ${r.quantities.footings} total`],
  ].filter(Boolean);
  const maxSpan = MATERIALS[o.material].maxSpan;

  return (
    <aside
      ref={panel}
      className={`inspector ${leaving ? 'is-leaving' : ''}`}
      aria-label={`Adjust option ${o.letter}`}
      data-inset={leaving ? undefined : narrow ? 'right' : 'auto'}
      style={!narrow && (offset.x || offset.y) ? { translate: `${offset.x}px ${offset.y}px` } : undefined}
    >
      <header className="insp-head" title={narrow ? 'Drag down to close' : 'Drag to move. Double-click to put it back.'} {...handlers}>
        {narrow && <span className="insp-grab" aria-hidden="true" />}
        <MaterialSwatch material={o.material} size={20} />
        <div className="insp-titles">
          <h2>Adjust option {o.letter}</h2>
          <p>{MATERIALS[o.material].name}, {MATERIALS[o.material].code}</p>
        </div>
        <IconButton icon={X} label="Close" onClick={onClose} size={17} />
      </header>
      <div className="insp-body">
        <section className="insp-sec" aria-labelledby="insp-sys">
          <h3 id="insp-sys">Structural system</h3>
          <Segmented
            label="Material"
            className="seg--fill"
            value={o.material}
            onChange={(k) => k !== o.material && !state.busy && agent.change(o.id, {}, k)}
            options={MATERIAL_KEYS.map((k) => ({ value: k, label: matShort(k), icon: <MaterialSwatch material={k} size={13} />, disabled: state.busy }))}
          />
          <p className="insp-note">{MATERIALS[o.material].system}.</p>
        </section>

        <section className="insp-sec" aria-labelledby="insp-dim">
          <h3 id="insp-dim">Dimensions</h3>
          <SliderField label="Length" unit="m" min={3} max={120} step={0.5} value={draft.length} format={(v) => fmt.m(v)} onChange={(v) => live('length', v)} />
          <SliderField label="Width" unit="m" min={3} max={60} step={0.5} value={draft.width} format={(v) => fmt.m(v)} onChange={(v) => live('width', v)} />
          <SliderField label={draft.floors > 1 ? 'Floor to floor' : 'Eaves height'} unit="m" min={2.4} max={8} step={0.1} value={draft.storeyHeight} format={(v) => fmt.m(v)} onChange={(v) => live('storeyHeight', v)} />
          <div className="insp-row">
            <span className="insp-label">Storeys</span>
            <Stepper label="Storeys" value={draft.floors} min={1} max={12} onChange={(v) => set('floors', v)} />
          </div>
          <div className="insp-row">
            <span className="insp-label">Roof</span>
            <Segmented size="sm" label="Roof" value={draft.roof} onChange={(v) => set('roof', v)} options={[{ value: 'flat', label: 'Flat' }, { value: 'gable', label: 'Gable' }]} />
          </div>
        </section>

        <section className="insp-sec" aria-labelledby="insp-bay">
          <div className="insp-row">
            <h3 id="insp-bay">Bay spacing</h3>
            <Segmented
              size="sm"
              label="Bay spacing"
              value={draft.bay ? 'manual' : 'auto'}
              onChange={(v) => set('bay', v === 'auto' ? null : Math.round(Math.max(r.grid.sx, r.grid.sz) * 2) / 2)}
              options={[{ value: 'auto', label: 'Agent' }, { value: 'manual', label: 'Manual' }]}
            />
          </div>
          {draft.bay ? (
            <>
              <SliderField label="Maximum span" unit="m" min={2} max={14} step={0.5} value={draft.bay} format={(v) => fmt.m(v)} onChange={(v) => live('bay', v)} />
              {draft.bay > maxSpan * 1.25 && (
                <p className="insp-warn">Longer than a typical {matShort(o.material).toLowerCase()} span of about {maxSpan} m, so beams get deep.</p>
              )}
            </>
          ) : (
            <p className="insp-note">
              The agent tried {plural(r.study.length, 'layout')} and kept the best score for {PRIORITIES[state.priority].label.toLowerCase()}, with a small penalty for crowded floor plates. Pick another to try it.
            </p>
          )}
          <ul className="study" aria-label="Bay study">
            {r.study.map((s, i) => {
              const current = Math.abs(s.sx - r.grid.sx) < 1e-6 && Math.abs(s.sz - r.grid.sz) < 1e-6;
              return (
                <li key={i}>
                  <button
                    type="button"
                    className={`study-run ${current ? 'is-current' : ''}`}
                    aria-pressed={current}
                    onClick={() => !current && set('bay', s.span)}
                  >
                    <PlanGlyph L={o.spec.length} W={o.spec.width} nx={s.nx} nz={s.nz} w={58} h={38} />
                    <span className="study-main">
                      <span className="study-bay">{fmt.bay(s.sx, s.sz)} m</span>
                      <span className="study-sub">{s.columns} columns, beams {Math.round(s.depth * 1000)} mm deep</span>
                    </span>
                    <span className="study-nums">
                      <span>{fmt.money(s.cost)}</span>
                      <span>{fmt.carbon(s.carbon)} t</span>
                      <span>{fmt.weeks(s.weeks)} wk</span>
                    </span>
                    {s.chosen && <span className="study-flag">Agent pick</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="insp-sec" aria-labelledby="insp-mem">
          <h3 id="insp-mem">Members</h3>
          <dl className="members">
            {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </section>
      </div>
    </aside>
  );
}
