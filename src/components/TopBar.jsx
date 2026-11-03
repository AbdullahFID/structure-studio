import { DropdownMenu, Popover } from 'radix-ui';
import { Check, Ellipsis, FilePlus2, FileText, ListChecks, Moon, Sun } from 'lucide-react';
import { BrandMark, Button, IconButton, Segmented, Tip } from './ui.jsx';

const WALK = [
  { key: 'start', title: 'Enter building requirements', body: 'Type a brief, then approve the checkpoint.', prompt: 'Generate a 6 m x 4 m wooden shed', fresh: true, done: 'generated' },
  { key: 'generated', title: 'Watch it generate', body: 'Each tool call shows in the chat while the frame is drawn in 3D.', done: 'generated' },
  { key: 'viewed', title: 'View the model', body: 'Drag to orbit, scroll to zoom, or switch to plan and elevation.', done: 'viewed' },
  { key: 'changed', title: 'Request a change', body: 'Ask in chat, or open Adjust on the model.', prompt: 'Switch it to steel', done: 'changed' },
  { key: 'added', title: 'Add a second option', body: 'The first option stays in its tab.', prompt: 'Add a timber version as a new option', done: 'added' },
  { key: 'managed', title: 'Switch or delete options', body: 'Click a tab, or the cross on a tab. Deletes can be undone.', done: 'managed' },
];

export const SHORTCUTS = [
  ['/', 'Focus the message box'],
  ['1, 2, 3', '3D, plan and elevation'],
  ['W', 'Walls and roof'],
  ['G', 'Gridlines and dimensions'],
  ['C', 'Compare side by side'],
  ['← →', 'Previous or next option'],
];

export function TopBar({ state, dispatch, ui, look, setLook, dark, toggleDark }) {
  const hasOptions = state.options.length > 0;
  const working = state.view === 'work';
  const doneCount = WALK.filter((s) => state.walk[s.done]).length;
  return (
    <header className="topbar" data-inset="top">
      <div className="brand">
        <BrandMark />
        <span className="wordmark">Structure Studio</span>
      </div>
      {working && (
        <div className="project">
          <label htmlFor="project-name" className="sr">Project name</label>
          <input id="project-name" value={state.project.name} spellCheck="false" onChange={(e) => dispatch({ type: 'project', patch: { name: e.target.value } })} />
          {state.project.example && <span className="tag">Example</span>}
        </div>
      )}
      <div className="topbar-right">
        <div className="look-switch">
          <span className="look-label" id="look-label">Look</span>
          <Segmented size="sm" label="Look" value={look} onChange={setLook} options={[{ value: 'drafting', label: 'Drafting' }, { value: 'studio', label: 'Studio' }]} />
        </div>

        <Popover.Root open={state.ui.walk} onOpenChange={(v) => dispatch({ type: 'ui', patch: { walk: v } })}>
          <Tip label="The six flows from the week 2 task">
            <Popover.Trigger asChild>
              <button type="button" className={`btn btn--quiet btn--sm ${state.ui.walk ? 'is-on' : ''}`}>
                <ListChecks size={15} strokeWidth={1.75} aria-hidden="true" />
                <span className="hide-sm">Walkthrough</span>
                <span className="count" aria-label={`${doneCount} of ${WALK.length} done`}>{doneCount}/{WALK.length}</span>
              </button>
            </Popover.Trigger>
          </Tip>
          <Popover.Portal>
            <Popover.Content className="walk" sideOffset={10} align="end" collisionPadding={12}>
              <p className="walk-title">Walkthrough</p>
              <p className="walk-intro">The six flows from the week 2 task, in the order to present them.</p>
              <ol className="walk-list">
                {WALK.map((s, i) => {
                  const done = state.walk[s.done];
                  return (
                    <li key={s.key} className={done ? 'is-done' : ''}>
                      <span className="walk-n" aria-hidden="true">{done ? <Check size={12} strokeWidth={2.4} /> : i + 1}</span>
                      <div>
                        <p className="walk-step">{s.title}<span className="sr">{done ? ', done' : ''}</span></p>
                        <p className="walk-body">{s.body}</p>
                        {s.prompt && <button type="button" className="linkish" onClick={() => ui.walkTry(s)}>Fill in “{s.prompt}”</button>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        {working && <Button size="sm" icon={FileText} className="hide-narrow" disabled={!hasOptions} onClick={ui.openReport}>Report</Button>}
        {working && <Button size="sm" icon={FilePlus2} onClick={ui.reset}><span className="hide-sm">New study</span></Button>}
        <IconButton icon={dark ? Sun : Moon} label={dark ? 'Light theme' : 'Dark theme'} onClick={toggleDark} size={17} />

        <DropdownMenu.Root>
          <Tip label="More">
            <DropdownMenu.Trigger asChild>
              <button type="button" className="icon-btn" aria-label="More">
                <Ellipsis size={18} strokeWidth={1.6} aria-hidden="true" />
              </button>
            </DropdownMenu.Trigger>
          </Tip>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu" sideOffset={8} align="end" collisionPadding={10}>
              <DropdownMenu.Label className="menu-label">Look</DropdownMenu.Label>
              <DropdownMenu.RadioGroup value={look} onValueChange={setLook}>
                <DropdownMenu.RadioItem className="menu-item" value="drafting">
                  <span className="menu-check"><DropdownMenu.ItemIndicator><Check size={14} strokeWidth={2} /></DropdownMenu.ItemIndicator></span>
                  Drafting<span className="menu-sub">Linework on paper</span>
                </DropdownMenu.RadioItem>
                <DropdownMenu.RadioItem className="menu-item" value="studio">
                  <span className="menu-check"><DropdownMenu.ItemIndicator><Check size={14} strokeWidth={2} /></DropdownMenu.ItemIndicator></span>
                  Studio<span className="menu-sub">Model under light</span>
                </DropdownMenu.RadioItem>
              </DropdownMenu.RadioGroup>
              <DropdownMenu.Separator className="menu-sep" />
              <DropdownMenu.Label className="menu-label">Keyboard</DropdownMenu.Label>
              {SHORTCUTS.map(([k, v]) => (
                <div key={k} className="menu-kbd"><kbd>{k}</kbd><span>{v}</span></div>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
