import { useEffect, useLayoutEffect, useRef } from 'react';
import { ArrowUp, Paperclip } from 'lucide-react';
import { MATERIAL_KEYS, fmt } from '../engine/engine.js';
import { REDUCED, matShort } from '../state/helpers.js';
import { Message } from './messages.jsx';
import { useMedia } from './hooks.js';
import { Tip } from './ui.jsx';

const MIN_W = 300;
const maxW = () => Math.max(MIN_W, Math.min(680, window.innerWidth * 0.5));

// Drag the panel's edge to give the chat or the model more room. While dragging,
// the width is written straight to the page so React does not re-render each move.
function Splitter({ width, onWidth }) {
  const drag = useRef(null);
  const app = () => document.querySelector('.app');
  const current = () => drag.current?.w ?? width ?? document.querySelector('.convo')?.getBoundingClientRect().width ?? 392;
  const commit = (w) => onWidth(Math.round(Math.min(maxW(), Math.max(MIN_W, w))));
  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the conversation panel"
      aria-valuemin={MIN_W}
      aria-valuenow={width || undefined}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, start: current(), w: current() };
        document.documentElement.classList.add('is-resizing');
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.w = Math.min(maxW(), Math.max(MIN_W, d.start + e.clientX - d.x));
        app()?.style.setProperty('--convo-w', `${d.w}px`);
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        document.documentElement.classList.remove('is-resizing');
        if (d) commit(d.w);
      }}
      onPointerCancel={() => { drag.current = null; document.documentElement.classList.remove('is-resizing'); }}
      onDoubleClick={() => { app()?.style.removeProperty('--convo-w'); onWidth(null); }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); commit(current() + (e.key === 'ArrowRight' ? 24 : -24)); }
        else if (e.key === 'Home' || e.key === 'Enter') { e.preventDefault(); app()?.style.removeProperty('--convo-w'); onWidth(null); }
      }}
    />
  );
}

export function Conversation({ state, agent, ui, composer, setComposer, width, onWidth }) {
  const listRef = useRef(null);
  const narrow = useMedia('(max-width: 860px)');
  const last = state.messages[state.messages.length - 1];
  const progress = last?.steps?.filter((s) => s.status === 'done').length;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: REDUCED ? 'auto' : 'smooth' });
  }, [state.messages.length, progress, last?.collapsed]);

  const active = state.options.find((o) => o.id === state.activeId);
  const used = new Set(state.options.map((o) => o.material));
  const missing = MATERIAL_KEYS.find((k) => !used.has(k));
  const suggestions = !state.options.length || state.busy ? [] : [
    missing ? `Try it in ${matShort(missing).toLowerCase()} as a new option` : 'Add another option',
    active && active.material !== 'steel' ? 'Switch it to steel' : 'Switch it to timber',
    state.options.length > 1 ? 'Compare options' : active ? `Make it ${fmt.m(Math.min(120, active.spec.length + 2), 0)} m long` : null,
  ].filter(Boolean);

  return (
    // On phones the chat and the sheet take turns instead of overlapping, so the chat is never an inset there.
    <section className="convo" aria-label="Conversation with the agent" data-inset={narrow ? undefined : 'left'}>
      <ol className="convo-list" ref={listRef} aria-live="polite" aria-relevant="additions">
        {state.messages.map((m) => <Message key={m.id} m={m} state={state} agent={agent} ui={ui} />)}
      </ol>
      <div className="convo-foot">
        {suggestions.length > 0 && (
          <div className="suggest" aria-label="Suggestions">
            {suggestions.map((s, i) => (
              <button key={s} type="button" className="chip chip--sm" style={{ '--i': i }} onClick={() => { setComposer(s); ui.focusComposer(); }}>{s}</button>
            ))}
          </div>
        )}
        <Composer
          value={composer}
          onChange={setComposer}
          onBind={ui.bindComposer}
          busy={state.busy}
          placeholder={state.options.length ? 'Ask for a change or a new option' : 'Describe your building'}
          onSend={(t) => agent.send(t)}
          onFile={ui.attach}
        />
      </div>
      {onWidth && <Splitter width={width} onWidth={onWidth} />}
    </section>
  );
}

export function Composer({ value, onChange, onBind, busy, placeholder, onSend, onFile, size = 'md', autoFocus }) {
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  useLayoutEffect(() => {
    const t = inputRef.current;
    if (!t) return;
    // A hidden composer measures zero; leave it to CSS until it is visible again.
    if (!t.offsetParent) { t.style.height = ''; return; }
    t.style.height = 'auto';
    t.style.height = `${Math.min(size === 'lg' ? 200 : 160, t.scrollHeight)}px`;
  }, [value, inputRef, size]);
  const submit = (e) => {
    e?.preventDefault();
    if (!value.trim() || busy) return;
    onSend(value);
    onChange('');
  };
  return (
    <form className={`composer composer--${size}`} onSubmit={submit}>
      <label htmlFor={`composer-${size}`} className="sr">Message the agent</label>
      <textarea
        id={`composer-${size}`}
        ref={(el) => { inputRef.current = el; onBind?.(el); }}
        rows={size === 'lg' ? 2 : 1}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        }}
      />
      <div className="composer-row">
        <Tip label="Attach a JSON massing file">
          <button type="button" className="icon-btn icon-btn--sm" aria-label="Attach a building file" onClick={() => fileRef.current?.click()}>
            <Paperclip size={16} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </Tip>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.ifc,.rvt"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }}
        />
        <span className="composer-note">Demo mode: no AI model is connected yet</span>
        <button type="submit" className="send" aria-label="Send" disabled={!value.trim() || busy}>
          <ArrowUp size={17} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
