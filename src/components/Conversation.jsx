import { useEffect, useLayoutEffect, useRef } from 'react';
import { ArrowUp, Paperclip } from 'lucide-react';
import { MATERIAL_KEYS, fmt } from '../engine/engine.js';
import { REDUCED, matShort } from '../state/helpers.js';
import { Message } from './messages.jsx';
import { Tip } from './ui.jsx';

export function Conversation({ state, agent, ui, composer, setComposer }) {
  const listRef = useRef(null);
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
    <section className="convo" aria-label="Conversation with the agent" data-inset="left">
      <ol className="convo-list" ref={listRef} aria-live="polite" aria-relevant="additions">
        {state.messages.map((m) => <Message key={m.id} m={m} state={state} agent={agent} ui={ui} />)}
      </ol>
      <div className="convo-foot">
        {suggestions.length > 0 && (
          <div className="suggest" aria-label="Suggestions">
            {suggestions.map((s) => (
              <button key={s} type="button" className="chip chip--sm" onClick={() => { setComposer(s); ui.focusComposer(); }}>{s}</button>
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
