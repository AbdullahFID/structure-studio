import { DropdownMenu } from 'radix-ui';
import { BrickWall, Box, Building2, Columns2, Info, Plus, Ruler, SlidersHorizontal, SquareDashed, X } from 'lucide-react';
import { MATERIALS, MATERIAL_KEYS, PRIORITIES, bestOf, fmt } from '../engine/engine.js';
import { MAX_OPTIONS, matShort, recommendation } from '../state/helpers.js';
import { useCountUp } from './hooks.js';
import { IconButton, MaterialSwatch, Tip } from './ui.jsx';

export function OptionTabs({ state, ui, agent }) {
  const active = state.options.find((o) => o.id === state.activeId);
  return (
    <div className="tabs" role="tablist" aria-label="Options">
      {state.options.map((o) => {
        const on = !state.compare && o.id === state.activeId;
        return (
          <div key={o.id} className={`tab ${on ? 'is-active' : ''} ${o.fresh ? 'is-fresh' : ''}`}>
            <button type="button" role="tab" aria-selected={on} className="tab-btn" onClick={() => ui.select(o.id)}>
              <MaterialSwatch material={o.material} size={14} />
              <span className="tab-letter">{o.letter}</span>
              <span className="tab-name">{matShort(o.material)}</span>
              {o.stage !== 'ready' && <span className="tab-busy" aria-label="Generating" />}
            </button>
            <Tip label={`Delete option ${o.letter}`}>
              <button type="button" className="tab-x" aria-label={`Delete option ${o.letter}`} onClick={() => agent.remove(o.id)} disabled={state.busy}>
                <X size={13} strokeWidth={2} aria-hidden="true" />
              </button>
            </Tip>
          </div>
        );
      })}
      <DropdownMenu.Root>
        <Tip label="New option">
          <DropdownMenu.Trigger asChild>
            <button type="button" className="tab-add" aria-label="New option" disabled={!active || state.busy || state.options.length >= MAX_OPTIONS}>
              <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
        </Tip>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="menu" sideOffset={8} align="start" collisionPadding={10}>
            <DropdownMenu.Label className="menu-label">New option from the active brief</DropdownMenu.Label>
            {MATERIAL_KEYS.map((k) => (
              <DropdownMenu.Item key={k} className="menu-item" onSelect={() => agent.addOption(k)}>
                <MaterialSwatch material={k} size={14} />
                <span>{MATERIALS[k].name}</span>
                <span className="menu-sub">{MATERIALS[k].code}</span>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

export function ViewTools({ state, dispatch, ui, view, onView }) {
  const single = !state.compare;
  return (
    <div className="tools" role="toolbar" aria-label="View">
      <div className="tool-group" role="group" aria-label="Camera">
        <IconButton icon={Box} label="3D view" kbd="1" pressed={view === 'iso'} onClick={() => onView('iso')} />
        <IconButton icon={SquareDashed} label="Plan" kbd="2" pressed={view === 'top'} onClick={() => onView('top')} />
        <IconButton icon={Building2} label="Elevation" kbd="3" pressed={view === 'front'} onClick={() => onView('front')} />
      </div>
      <div className="tool-group" role="group" aria-label="Layers">
        <IconButton icon={BrickWall} label="Walls and roof" kbd="W" pressed={state.display.envelope} onClick={() => dispatch({ type: 'display', patch: { envelope: !state.display.envelope } })} />
        <IconButton icon={Ruler} label="Gridlines and dimensions" kbd="G" pressed={state.display.labels} onClick={() => dispatch({ type: 'display', patch: { labels: !state.display.labels } })} />
        <IconButton icon={Columns2} label="Compare side by side" kbd="C" pressed={state.compare} disabled={state.options.length < 2} onClick={() => ui.compare(!state.compare)} />
      </div>
      {!single && <RankSelect state={state} dispatch={dispatch} />}
      {single && (
        <button type="button" className={`btn btn--quiet btn--sm adjust ${state.ui.inspector ? 'is-on' : ''}`} aria-pressed={state.ui.inspector} onClick={() => dispatch({ type: 'ui', patch: { inspector: !state.ui.inspector } })}>
          <SlidersHorizontal size={15} strokeWidth={1.75} aria-hidden="true" />
          Adjust
        </button>
      )}
    </div>
  );
}

function Cell({ label, value, fmtFn, unit, sub, best, title, count }) {
  const shown = useCountUp(value, fmtFn);
  return (
    <div className={`tb-cell ${best ? 'is-best' : ''}`} title={title}>
      <span className="tb-label">{label}</span>
      <span className="tb-value">
        {shown}
        {unit && <span className="tb-unit">{unit}</span>}
        {best && <span className="tb-best" title={`Lowest of the ${count} options`}>lowest</span>}
      </span>
      <span className="tb-sub">{sub}</span>
    </div>
  );
}

// The title block: identity and estimates for the active option, the way a drawing sheet carries them.
export function TitleBlock({ o, state }) {
  const M = o.result.metrics;
  const ready = state.options.filter((x) => x.stage === 'ready');
  const best = ready.length > 1 ? bestOf(ready.map((x) => x.result)) : null;
  const pending = o.stage !== 'ready';
  const mat = MATERIALS[o.material];
  return (
    <div className={`titleblock ${pending ? 'is-pending' : ''}`} aria-label={`Estimates for option ${o.letter}`} data-inset="bottom">
      <div className="tb-id">
        <MaterialSwatch material={o.material} size={28} className="tb-swatch" />
        <div>
          <p className="tb-name">Option {o.letter}, {mat.name.toLowerCase()}</p>
          <p className="tb-sys">{mat.system}. {mat.code}.</p>
        </div>
      </div>
      <Cell label="Cost" value={M.cost} fmtFn={fmt.money} sub={`$${fmt.int(M.costPerM2)} per m²`} best={best && M.cost === best.cost} count={ready.length} />
      <Cell label="Embodied carbon" title="Stages A1 to A3" value={M.carbon} fmtFn={fmt.carbon} unit="t" sub={`${fmt.int(M.intensity)} kg per m²`} best={best && M.carbon === best.carbon} count={ready.length} />
      <Cell label="Schedule" value={M.weeks} fmtFn={fmt.weeks} unit="weeks" sub={`${fmt.int(M.days)} work days`} best={best && M.weeks === best.weeks} count={ready.length} />
      <Cell label="Bay size" title={o.result.manualBay ? 'Bay size set by you' : 'Bay size picked by the agent'} value={M.bayX} fmtFn={() => fmt.bay(M.bayX, M.bayZ)} unit="m" sub={`${o.result.grid.nx} × ${o.result.grid.nz} bays, ${M.columns} columns`} />
      <Tip label="Placeholder factors stand in for WSP's cost, carbon and scheduling tools." side="top">
        <span className="tb-note" tabIndex={0}>
          <Info size={14} strokeWidth={1.75} aria-hidden="true" />
          Synthetic data
        </span>
      </Tip>
    </div>
  );
}

export function CompareOverlay({ state, rects, compareIds, ui }) {
  const ready = state.options.filter((o) => o.stage === 'ready');
  const best = ready.length > 1 ? bestOf(ready.map((o) => o.result)) : null;
  const rank = recommendation(state.options, state.priority);
  return rects.map((r, i) => {
    const o = state.options.find((x) => x.id === compareIds[i]);
    if (!o) return null;
    const M = o.result.metrics;
    const first = rank && rank.order[0] === o.id;
    const cell = (k, label, v) => (
      <div className={best && M[k] === best[k] ? 'is-best' : ''}><span>{label}</span><strong>{v}</strong></div>
    );
    return (
      <div key={o.id} className="cmp" style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
        <button type="button" className="cmp-head" onClick={() => ui.select(o.id)}>
          <MaterialSwatch material={o.material} size={14} />
          <span className="cmp-letter">{o.letter}</span>
          {MATERIALS[o.material].name}
          {first && <span className="cmp-rank">Ranks first for {PRIORITIES[state.priority].label.toLowerCase()}</span>}
        </button>
        <div className="cmp-foot">
          {cell('cost', 'Cost', fmt.money(M.cost))}
          {cell('carbon', 'Carbon', `${fmt.carbon(M.carbon)} t`)}
          {cell('weeks', 'Schedule', `${fmt.weeks(M.weeks)} wk`)}
          <div><span>Bays</span><strong>{fmt.bay(M.bayX, M.bayZ)} m</strong></div>
        </div>
      </div>
    );
  });
}

export function RankSelect({ state, dispatch }) {
  const id = 'rank-by';
  return (
    <label className="rank" htmlFor={id}>
      <span>Rank by</span>
      <select id={id} className="select select--sm" value={state.priority} disabled={state.busy} onChange={(e) => dispatch({ type: 'priority', value: e.target.value })}>
        {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
    </label>
  );
}
