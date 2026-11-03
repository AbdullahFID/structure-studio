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
import { useMedia } from './hooks.js';
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
  const toggleDark = useCallback(() => setThemePref(dark ? 'light' : 'dark'), [dark]);

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

  const working = state.view === 'work';
  return (
    <Tooltip.Provider delayDuration={350} skipDelayDuration={200}>
      <div className="app" data-view={state.view} data-panel={state.ui.panel}>
        <TopBar state={state} dispatch={dispatch} ui={ui} look={look} setLook={setLook} dark={dark} toggleDark={toggleDark} />
        <main className="work">
          {working && <Conversation state={state} agent={agent} ui={ui} composer={composer} setComposer={setComposer} />}
          <Stage state={state} dispatch={dispatch} agent={agent} ui={ui} viewerRef={viewerRef}>
            {!working && <StartScreen composer={composer} setComposer={setComposer} agent={agent} ui={ui} busy={state.busy} look={look} />}
          </Stage>
        </main>
        {working && (
          <nav className="dock" aria-label="Panels">
            <button type="button" aria-pressed={state.ui.panel === 'chat'} onClick={() => dispatch({ type: 'ui', patch: { panel: 'chat' } })}>
              <MessageSquare size={17} strokeWidth={1.7} aria-hidden="true" />Chat
            </button>
            <button type="button" aria-pressed={state.ui.panel === 'model'} onClick={() => dispatch({ type: 'ui', patch: { panel: 'model' } })}>
              <Box size={17} strokeWidth={1.7} aria-hidden="true" />Model{state.options.length > 0 && <span className="dock-count">{state.options.length}</span>}
            </button>
            <button type="button" disabled={!state.options.length} onClick={ui.openReport}>
              <FileText size={17} strokeWidth={1.7} aria-hidden="true" />Report
            </button>
          </nav>
        )}
        <ReportDialog state={state} open={state.ui.report} onOpenChange={(v) => dispatch({ type: 'ui', patch: { report: v } })} viewerRef={viewerRef} />
        {state.toast && (
          <div className="toast" role="status" key={state.toast.id}>
            <span>{state.toast.text}</span>
            {state.toast.undo && (
              <button type="button" className="toast-btn" onClick={() => ui.undo(state.toast)}>
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
