import { useState } from 'react';
import { Check, ChevronDown, Columns2, FileText } from 'lucide-react';
import { MATERIALS, MATERIAL_KEYS, PRIORITIES, bestOf, fmt, normalizeSpec, titleCase } from '../engine/engine.js';
import { capFirst, describeSpec, listJoin, matShort } from '../state/helpers.js';
import { Button, MaterialSwatch, NumberField, Segmented } from './ui.jsx';

export function Message({ m, state, agent, ui }) {
  let body;
  if (m.role === 'user') body = <p className="bubble">{m.text}</p>;
  else if (m.kind === 'note') body = <p className="note">{m.text}</p>;
  else if (m.kind === 'trace') body = <TraceLine m={m} ui={ui} />;
  else if (m.kind === 'spec') body = <SpecForm m={m} agent={agent} busy={state.busy} ui={ui} />;
  else if (m.kind === 'result') body = <ResultBlock m={m} state={state} ui={ui} />;
  else if (m.kind === 'change') body = <ChangeNote m={m} />;
  else if (m.kind === 'clarify') body = <Clarify m={m} agent={agent} />;
  else body = <Prose text={m.text} />;
  return <li className={`msg msg--${m.role} msg--${m.kind} ${m.fresh ? 'is-fresh' : ''}`}>{body}</li>;
}

function Prose({ text }) {
  return (
    <div className="prose">
      {String(text).split('\n').map((l, i) => <p key={i}>{l}</p>)}
    </div>
  );
}

function Ring({ done, total, running }) {
  const r = 7, c = 2 * Math.PI * r;
  const f = total ? done / total : 0;
  return (
    <svg className={`ring ${running ? 'is-running' : ''}`} width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r={r} className="ring-track" />
      <circle cx="9" cy="9" r={r} className="ring-fill" strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 9 9)" />
      {!running && <path d="M5.6 9.2l2.2 2.2 4.4-4.6" className="ring-check" />}
    </svg>
  );
}

function TraceLine({ m, ui }) {
  const running = m.state === 'running';
  const done = m.steps.filter((s) => s.status === 'done').length;
  const current = m.steps.find((s) => s.status === 'running');
  const open = !running && !m.collapsed;
  return (
    <div className={`trace ${running ? 'is-running' : ''}`}>
      <button
        type="button"
        className="trace-head"
        onClick={() => !running && ui.patchMsg(m.id, { collapsed: !m.collapsed })}
        aria-expanded={open}
        disabled={running}
      >
        <Ring done={done} total={m.steps.length} running={running} />
        <span className="trace-title">{running ? current?.label || m.title : m.title}</span>
        <span className="trace-meta">
          {running ? `${done + 1} of ${m.steps.length}` : `${m.steps.length} tool calls in ${m.elapsed?.toFixed(1)} s`}
        </span>
        {!running && <ChevronDown className={`trace-chev ${open ? 'is-open' : ''}`} size={15} strokeWidth={1.75} aria-hidden="true" />}
      </button>
      {running && current && <code className="trace-tool">{current.tool}</code>}
      {!running && (
        <div className={`collapse ${open ? 'is-open' : ''}`} inert={!open}>
          <div className="collapse-inner">
            <ol className="trace-steps">
              {m.steps.map((s, i) => (
                <li key={i}>
                  <div className="step-row">
                    <span className="step-label">{s.label}</span>
                    <code className="step-tool">{s.tool}</code>
                  </div>
                  {s.detail && <p className="step-detail">{s.detail}</p>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

function SpecForm({ m, agent, busy, ui }) {
  const [spec, setSpec] = useState(m.spec);
  const [mats, setMats] = useState(m.materials);
  const [priority, setPriority] = useState(m.priority);
  const [assumed, setAssumed] = useState(m.assumed || []);
  const locked = m.state !== 'pending';
  // Edits flow back to the message so the ghost on the sheet follows them.
  const set = (k, v) => {
    const next = normalizeSpec({ ...spec, [k]: v });
    setSpec(next);
    setAssumed((a) => a.filter((x) => x !== k));
    ui.patchMsg(m.id, { spec: next });
  };
  const toggleMat = (k) => {
    const next = mats.includes(k) ? (mats.length > 1 ? mats.filter((x) => x !== k) : mats) : MATERIAL_KEYS.filter((x) => mats.includes(x) || x === k);
    setMats(next);
    setAssumed((a) => a.filter((x) => x !== 'materials'));
    ui.patchMsg(m.id, { materials: next });
  };
  if (locked) {
    return (
      <div className="brief brief--locked">
        <p className="brief-title">
          <Check size={14} strokeWidth={2.2} aria-hidden="true" />
          Brief approved
        </p>
        <p>{titleCase(m.spec.type)}, {describeSpec(m.spec)}.</p>
        <p className="muted">
          {capFirst(listJoin(m.materials.map((k) => MATERIALS[k].name.toLowerCase())))}, ranked by {PRIORITIES[m.priority].label.toLowerCase()}.
        </p>
      </div>
    );
  }
  return (
    <form className="brief" onSubmit={(e) => { e.preventDefault(); agent.confirmSpec(m.id, spec, mats, priority); }}>
      <div className="brief-head">
        <p className="brief-title">Check the brief</p>
        <span className="brief-state">Waiting for you</span>
      </div>
      <p className="brief-intro">
        This is what I read from your message.
        {assumed.length > 0 && ' Fields marked assumed were not in it, so I used typical values.'}
        {m.units === 'ft' && ' I converted feet to metres.'}
      </p>
      <div className="brief-grid">
        <NumberField label="Length" unit="m" value={spec.length} min={3} max={120} onChange={(v) => set('length', v)} />
        <NumberField label="Width" unit="m" value={spec.width} min={3} max={60} onChange={(v) => set('width', v)} />
        <NumberField label="Storeys" value={spec.floors} min={1} max={12} onChange={(v) => set('floors', Math.round(v))} assumed={assumed.includes('floors')} />
        <NumberField
          label={spec.floors > 1 ? 'Floor to floor' : 'Eaves height'} unit="m" value={spec.storeyHeight} min={2.4} max={8}
          onChange={(v) => set('storeyHeight', v)} assumed={assumed.includes('storeyHeight')}
        />
      </div>
      <div className="brief-row">
        <span className="brief-label">Roof{assumed.includes('roof') && <em className="assumed">assumed</em>}</span>
        <Segmented size="sm" label="Roof" value={spec.roof} onChange={(v) => set('roof', v)} options={[{ value: 'flat', label: 'Flat' }, { value: 'gable', label: 'Gable' }]} />
      </div>
      <div className="brief-row">
        <span className="brief-label">Systems{assumed.includes('materials') && <em className="assumed">all three</em>}</span>
        <div className="toggles" role="group" aria-label="Structural systems">
          {MATERIAL_KEYS.map((k) => (
            <button key={k} type="button" aria-pressed={mats.includes(k)} className={`toggle ${mats.includes(k) ? 'is-on' : ''}`} onClick={() => toggleMat(k)}>
              <MaterialSwatch material={k} size={13} />
              {MATERIALS[k].short}
            </button>
          ))}
        </div>
      </div>
      <div className="brief-row">
        <label className="brief-label" htmlFor={`${m.id}-rank`}>Rank by</label>
        <select id={`${m.id}-rank`} className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
          {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div className="brief-actions">
        <button type="submit" className="btn btn--primary btn--md" disabled={busy}>
          Generate {mats.length > 1 ? `${mats.length} options` : `${MATERIALS[mats[0]].short.toLowerCase()} option`}
        </button>
        <span className="hint">You can change any of this later.</span>
      </div>
    </form>
  );
}

function ResultBlock({ m, state, ui }) {
  const opts = m.optionIds.map((id) => state.options.find((o) => o.id === id)).filter(Boolean);
  const live = state.options.filter((o) => o.stage === 'ready');
  const best = live.length > 1 ? bestOf(live.map((o) => o.result)) : null;
  const isBest = (o, k) => best && o.result.metrics[k] === best[k];
  return (
    <div className="result">
      <div className="prose">
        <p><strong>{m.title}.</strong> {m.text}</p>
      </div>
      {opts.length > 0 ? (
        <table className="result-table">
          <thead>
            <tr><th scope="col">Option</th><th scope="col">Cost</th><th scope="col">Carbon</th><th scope="col">Schedule</th></tr>
          </thead>
          <tbody>
            {opts.map((o) => (
              <tr key={o.id} className={state.activeId === o.id && !state.compare ? 'is-active' : ''}>
                <th scope="row">
                  <button type="button" className="rt-opt" onClick={() => ui.select(o.id)}>
                    <MaterialSwatch material={o.material} size={13} />
                    <span className="rt-letter">{o.letter}</span>
                    {matShort(o.material)}
                  </button>
                </th>
                <td className={isBest(o, 'cost') ? 'is-best' : ''}>{fmt.money(o.result.metrics.cost)}</td>
                <td className={isBest(o, 'carbon') ? 'is-best' : ''}>{fmt.carbon(o.result.metrics.carbon)} t</td>
                <td className={isBest(o, 'weeks') ? 'is-best' : ''}>{fmt.weeks(o.result.metrics.weeks)} wk</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="hint">These options were deleted.</p>
      )}
      <div className="result-actions">
        {state.options.length > 1 && <Button size="sm" icon={Columns2} onClick={() => ui.compare(true)}>Compare side by side</Button>}
        {state.options.length > 0 && <Button size="sm" icon={FileText} onClick={ui.openReport}>Open report</Button>}
      </div>
    </div>
  );
}

function ChangeNote({ m }) {
  return (
    <div className="prose">
      <p>{m.text}</p>
      <ul className="deltas" aria-label="Change against the previous version">
        {m.deltas.map((d) => (
          <li key={d.label} className={d.pct < 0 ? 'is-down' : d.pct > 0 ? 'is-up' : ''}>
            {d.label} <strong>{d.pct > 0 ? '+' : d.pct < 0 ? '−' : '±'}{Math.abs(d.pct)}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Clarify({ m, agent }) {
  return (
    <div className="prose">
      <p>{m.text}</p>
      <div className="chips">
        {m.chips.map((c) => <button key={c} type="button" className="chip" onClick={() => agent.send(c)}>{c}</button>)}
      </div>
    </div>
  );
}
