import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { Tooltip } from 'radix-ui';
import { Box, FileText, MessageSquare, Undo2, X } from 'lucide-react';
import { createController } from '../state/controller.js';
import { REDUCED } from '../state/helpers.js';
import { Conversation } from './Conversation.jsx';
import { ReportDialog } from './ReportDialog.jsx';
import { Stage } from './Stage.jsx';
import { StartScreen } from './StartScreen.jsx';
import { TopBar } from './TopBar.jsx';
import { useGlide, useLingering, useMedia } from './hooks.js';
import { readViewerTheme } from './theme.js';

const save = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };
const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

export function App() {
  const [composer, setComposer] = useState('');
  const [ctl] = useState(() => createController({ setComposer }));
  const { store, dispatch, agent, ui } = ctl;
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const viewerRef = useRef(null);

  // Look (design direction) and colour theme
  const [look, setLookState] = useState(() => document.documentElement.dataset.look || 'drafting');
  const [themePref, setThemePref] = useState(() => load('ss-theme'));
  const systemDark = useMedia('(prefers-color-scheme: dark)');
  const dark = themePref ? themePref === 'dark' : systemDark;

  // Width of the conversation panel, set by dragging its edge on desktop
  const [convoW, setConvoW] = useState(() => +load('ss-convo') || null);
  const setConvoWidth = useCallback((w) => { setConvoW(w); save('ss-convo', w); }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.look = look;
    if (themePref) root.dataset.theme = themePref; else delete root.dataset.theme;
    save('ss-look', look);
    save('ss-theme', themePref);
    viewerRef.current?.setTheme(readViewerTheme());
  }, [look, themePref, dark]);

  const setLook = useCallback((l) => {
    const run = () => flushSync(() => setLookState(l));
    if (document.startViewTransition && !REDUCED) document.startViewTransition(run); else run();
  }, []);

  // The new theme spreads out from the button as a circle. Without view transitions, colours ease across instead.
  const toggleDark = useCallback((ev) => {
    const next = dark ? 'light' : 'dark';
    const root = document.documentElement;
    const apply = () => flushSync(() => setThemePref(next));
    if (REDUCED) { apply(); return; }
    if (!document.startViewTransition) {
      root.classList.add('theme-fade');
      apply();
      setTimeout(() => root.classList.remove('theme-fade'), 420);
      return;
    }
    const b = ev?.currentTarget?.getBoundingClientRect();
    const x = b ? b.left + b.width / 2 : window.innerWidth - 40;
    const y = b ? b.top + b.height / 2 : 28;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    root.classList.add('vt-theme');
    const vt = document.startViewTransition(apply);
    vt.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 620, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    }).catch(() => {});
    vt.finished.finally(() => root.classList.remove('vt-theme'));
  }, [dark]);

  useEffect(() => {
    window.addEventListener('keydown', ctl.onKey);
    return () => window.removeEventListener('keydown', ctl.onKey);
  }, [ctl]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!state.toast) return undefined;
    const t = setTimeout(() => dispatch({ type: 'toast', toast: null }), 7000);
    return () => clearTimeout(t);
  }, [state.toast, dispatch]);
  const toast = useLingering(state.toast, 200);

  const working = state.view === 'work';
  return (
    <Tooltip.Provider delayDuration={350} skipDelayDuration={200}>
      <div className="app" data-view={state.view} data-panel={state.ui.panel} style={convoW ? { '--convo-w': `${convoW}px` } : undefined}>
        <TopBar state={state} dispatch={dispatch} ui={ui} look={look} setLook={setLook} dark={dark} toggleDark={toggleDark} />
        <main className="work">
          {working && <Conversation state={state} agent={agent} ui={ui} composer={composer} setComposer={setComposer} width={convoW} onWidth={setConvoWidth} />}
          <Stage state={state} dispatch={dispatch} agent={agent} ui={ui} viewerRef={viewerRef}>
            {!working && <StartScreen composer={composer} setComposer={setComposer} agent={agent} ui={ui} busy={state.busy} look={look} />}
          </Stage>
        </main>
        {working && <Dock state={state} dispatch={dispatch} ui={ui} />}
        <ReportDialog state={state} open={state.ui.report} onOpenChange={(v) => dispatch({ type: 'ui', patch: { report: v } })} viewerRef={viewerRef} />
        {toast.item && (
          <div className={`toast ${toast.leaving ? 'is-leaving' : ''}`} role="status" key={toast.item.id}>
            <span>{toast.item.text}</span>
            {toast.item.undo && (
              <button type="button" className="toast-btn" disabled={toast.leaving} onClick={() => ui.undo(toast.item)}>
                <Undo2 size={15} strokeWidth={1.8} aria-hidden="true" />Undo
              </button>
            )}
            <button type="button" className="toast-x" aria-label="Dismiss" onClick={() => dispatch({ type: 'toast', toast: null })}>
              <X size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </Tooltip.Provider>
  );
}

// Phone panel switcher. The pill glides between Chat and Model instead of jumping.
function Dock({ state, dispatch, ui }) {
  const nav = useRef(null);
  const pill = useRef(null);
  const panel = state.ui.panel;
  useGlide(nav, pill, 'button[aria-pressed="true"]', `${panel}|${state.options.length}`);
  return (
    <nav className="dock" aria-label="Panels" ref={nav}>
      <span className="dock-pill" ref={pill} aria-hidden="true" />
      <button type="button" aria-pressed={panel === 'chat'} onClick={() => dispatch({ type: 'ui', patch: { panel: 'chat' } })}>
        <MessageSquare size={17} strokeWidth={1.7} aria-hidden="true" />Chat
      </button>
      <button type="button" aria-pressed={panel === 'model'} onClick={() => dispatch({ type: 'ui', patch: { panel: 'model' } })}>
        <Box size={17} strokeWidth={1.7} aria-hidden="true" />Model{state.options.length > 0 && <span className="dock-count">{state.options.length}</span>}
      </button>
      <button type="button" disabled={!state.options.length} onClick={ui.openReport}>
        <FileText size={17} strokeWidth={1.7} aria-hidden="true" />Report
      </button>
    </nav>
  );
}
