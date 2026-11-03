import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { REDUCED } from '../state/helpers.js';
import { Composer } from './Conversation.jsx';
import { PlanGlyph } from './ui.jsx';
import { useMedia } from './hooks.js';

gsap.registerPlugin(SplitText);

const EXAMPLES = [
  { text: 'Generate a 6 m x 4 m wooden shed', title: 'Timber shed', sub: '6 × 4 m, gable roof', L: 6, W: 4, nx: 2, nz: 1 },
  { text: 'Single-storey workshop, 30 x 12 m, gable roof. Compare timber, concrete and steel.', title: 'Workshop', sub: '30 × 12 m, three systems', L: 30, W: 12, nx: 6, nz: 3 },
  { text: '5-storey office, 48 x 24 m, lowest carbon', title: 'Office', sub: '48 × 24 m, five storeys', L: 48, W: 24, nx: 7, nz: 4 },
];

export function StartScreen({ composer, setComposer, agent, ui, busy, look }) {
  // Tell the viewer where the copy sits so the model is framed in the clear area:
  // beside it on desktop drafting, between head and foot in studio, above it on phones.
  const stacked = useMedia('(max-width: 860px)');
  const studio = look === 'studio';
  const rootInset = studio ? undefined : stacked ? 'bottom' : 'left';
  const root = useRef(null);
  useLayoutEffect(() => {
    if (REDUCED || !root.current) return undefined;
    const ctx = gsap.context(() => {
      const title = root.current.querySelector('.start-title');
      const split = SplitText.create(title, { type: 'lines', mask: 'lines', linesClass: 'st-line' });
      // Tween a plain number and write the axis ourselves; tweening the custom property directly can leave it empty.
      const w = { v: 78 };
      const setW = () => title.style.setProperty('--wdth', w.v.toFixed(1));
      setW();
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from(split.lines, { yPercent: 105, duration: 0.9, stagger: 0.09 })
        .to(w, { v: 112, duration: 1.4, ease: 'power2.inOut', onUpdate: setW }, 0)
        .from('.start-lede, .start-box, .start-examples, .start-alt', { y: 14, opacity: 0, duration: 0.7, stagger: 0.07 }, 0.35);
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <div className="start" ref={root} data-inset={rootInset}>
      <div className="start-head" data-inset={studio ? 'top' : undefined}>
        <h1 className="start-title">Frame it in timber, concrete and steel.</h1>
        <p className="start-lede">
          Describe the building in plain words. The agent lays out a column grid for each material, sizes the members,
          and compares cost, embodied carbon and schedule before anyone opens Revit.
        </p>
      </div>
      <div className="start-foot" data-inset={studio ? 'bottom' : undefined}>
      <div className="start-box">
        <Composer
          size="lg"
          value={composer}
          onChange={setComposer}
          onBind={ui.bindComposer}
          busy={busy}
          placeholder="A two-storey library, 40 by 20 m, lowest carbon"
          onSend={(t) => agent.send(t)}
          onFile={ui.attach}
        />
      </div>
      <div className="start-examples">
        <p className="start-examples-label" id="start-ex">Or start from one of these</p>
        <ul aria-labelledby="start-ex">
          {EXAMPLES.map((e) => (
            <li key={e.title}>
              <button type="button" className="example" onClick={() => agent.send(e.text)}>
                <PlanGlyph L={e.L} W={e.W} nx={e.nx} nz={e.nz} w={46} h={30} pad={3} />
                <span className="example-text">
                  <strong>{e.title}</strong>
                  <span>{e.sub}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="start-alt">
        <button type="button" className="linkish" onClick={ui.openExample}>Open the example project</button>
        <span> with three options already generated.</span>
      </p>
      </div>
    </div>
  );
}
