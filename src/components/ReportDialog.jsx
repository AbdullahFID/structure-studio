import { useEffect, useMemo, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Copy, Printer, X } from 'lucide-react';
import { MATERIALS, fmt } from '../engine/engine.js';
import { matShort } from '../state/helpers.js';
import { ASSUMPTIONS, buildReport } from '../report/report.js';
import { Button, IconButton, MaterialSwatch, PlanGlyph } from './ui.jsx';

export function ReportDialog({ state, open, onOpenChange, viewerRef }) {
  const r = useMemo(() => buildReport(state), [state]);
  const [shots, setShots] = useState({});
  const [copied, setCopied] = useState('');
  const [showMd, setShowMd] = useState(false);
  const opts = state.options;

  // Render each option once the dialog is up, so the live view never stalls on open.
  const shotKey = opts.map((o) => `${o.id}:${o.version}`).join('|');
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => {
      const v = viewerRef.current;
      if (!v) return;
      const next = {};
      for (const o of opts) next[o.id] = v.thumbnail(o.id, { w: 520, h: 340 });
      setShots(next);
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shotKey]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(r.md);
      setCopied('Copied');
    } catch {
      setShowMd(true);
      setCopied('Select the text below to copy it');
    }
    setTimeout(() => setCopied(''), 2400);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content className="report" aria-describedby="report-brief">
          <header className="report-head">
            <div>
              <Dialog.Title className="report-title">Structural options study</Dialog.Title>
              <p className="report-meta">{state.project.name}, {r.date}. Prepared in Structure Studio with synthetic factors.</p>
            </div>
            <div className="report-actions">
              <Button size="sm" icon={Copy} onClick={copy}>{copied || 'Copy as Markdown'}</Button>
              <Button size="sm" icon={Printer} onClick={() => window.print()}>Print</Button>
              <Dialog.Close asChild>
                <IconButton icon={X} label="Close report" />
              </Dialog.Close>
            </div>
          </header>

          <div className="report-body">
            {!opts.length && <p className="hint">Generate an option to fill the report.</p>}
            {opts.length > 0 && (
              <>
                <section className="rep-lead">
                  <p id="report-brief" className="rep-brief">{r.brief}</p>
                  <p className="rep-rec">{r.rec ? r.rec.text : 'Add a second option to get a ranking.'}</p>
                </section>

                <section className="rep-sheets" aria-label="Options">
                  {r.order.map((o, i) => (
                    <figure key={o.id} className={`rep-sheet ${r.rec && i === 0 ? 'is-first' : ''}`}>
                      <div className="rep-shot">
                        {shots[o.id] ? <img src={shots[o.id]} alt={`3D frame of option ${o.letter}, ${MATERIALS[o.material].name.toLowerCase()}`} /> : <span className="rep-shot-wait" />}
                        <PlanGlyph L={o.spec.length} W={o.spec.width} nx={o.result.grid.nx} nz={o.result.grid.nz} w={92} h={56} className="rep-plan" />
                      </div>
                      <figcaption>
                        <p className="rep-sheet-name">
                          <MaterialSwatch material={o.material} size={14} />
                          Option {o.letter}, {matShort(o.material).toLowerCase()}
                          {r.rec && i === 0 && <span className="rep-first">Ranks first</span>}
                        </p>
                        <dl className="rep-figs">
                          <div className={r.best && o.result.metrics.cost === r.best.cost ? 'is-best' : ''}><dt>Cost</dt><dd>{fmt.money(o.result.metrics.cost)}</dd></div>
                          <div className={r.best && o.result.metrics.carbon === r.best.carbon ? 'is-best' : ''}><dt>Carbon</dt><dd>{fmt.carbon(o.result.metrics.carbon)} t</dd></div>
                          <div className={r.best && o.result.metrics.weeks === r.best.weeks ? 'is-best' : ''}><dt>Schedule</dt><dd>{fmt.weeks(o.result.metrics.weeks)} wk</dd></div>
                          <div><dt>Bays</dt><dd>{fmt.bay(o.result.grid.sx, o.result.grid.sz)} m</dd></div>
                        </dl>
                      </figcaption>
                    </figure>
                  ))}
                </section>

                <section className="rep-sec">
                  <h3>Comparison</h3>
                  <div className="table-wrap">
                    <table className="rep-table">
                      <thead>
                        <tr>
                          <th scope="col"><span className="sr">Item</span></th>
                          {opts.map((o) => <th key={o.id} scope="col"><span className="th-opt"><MaterialSwatch material={o.material} size={13} />{o.letter} {matShort(o.material)}</span></th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {r.rows.map(([k, f, key]) => (
                          <tr key={k}>
                            <th scope="row">{k}</th>
                            {opts.map((o) => <td key={o.id} className={key && r.best && o.result.metrics[key] === r.best[key] ? 'is-best' : ''}>{f(o)}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {opts.length > 1 && (
                  <section className="rep-sec">
                    <h3>Trade-offs</h3>
                    <Bars opts={opts} />
                  </section>
                )}

                <section className="rep-sec">
                  <h3>How the agent chose bay sizes</h3>
                  <ul className="rep-study">
                    {r.study.map(({ o, text }) => (
                      <li key={o.id}>
                        <div className="rep-study-plans" aria-hidden="true">
                          {o.result.study.map((s, i) => (
                            <PlanGlyph key={i} L={o.spec.length} W={o.spec.width} nx={s.nx} nz={s.nz} w={50} h={32} pad={3} className={Math.abs(s.sx - o.result.grid.sx) < 1e-6 && Math.abs(s.sz - o.result.grid.sz) < 1e-6 ? 'is-kept' : ''} />
                          ))}
                        </div>
                        <p><strong>{o.letter} {matShort(o.material)}.</strong> {text}</p>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="rep-sec">
                  <h3>Assumptions</h3>
                  <ul className="rep-list">{ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
                </section>

                <section className="rep-sec rep-md no-print">
                  <button type="button" className="linkish" onClick={() => setShowMd((v) => !v)} aria-expanded={showMd}>
                    {showMd ? 'Hide' : 'Show'} the Markdown source
                  </button>
                  {showMd && <textarea className="md" readOnly value={r.md} aria-label="Report as Markdown" />}
                </section>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Bars({ opts }) {
  const metrics = [['Cost', 'cost', fmt.money], ['Embodied carbon', 'carbon', (v) => `${fmt.carbon(v)} t`], ['Schedule', 'weeks', (v) => `${fmt.weeks(v)} wk`]];
  return (
    <div className="bars">
      {metrics.map(([label, k, f]) => {
        const max = Math.max(...opts.map((o) => o.result.metrics[k]));
        const min = Math.min(...opts.map((o) => o.result.metrics[k]));
        return (
          <div key={k} className="bars-group">
            <p className="bars-label">{label}</p>
            {opts.map((o) => (
              <div key={o.id} className="bar-row">
                <span className="bar-name">{o.letter}</span>
                <span className="bar-track">
                  <span className={`bar is-${o.material} ${o.result.metrics[k] === min ? 'is-best' : ''}`} style={{ width: `${Math.max(4, (o.result.metrics[k] / max) * 100)}%` }} />
                </span>
                <span className="bar-val">{f(o.result.metrics[k])}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
