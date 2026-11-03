# Structure Studio: context for Claude Code

Frontend prototype for the **QMIND x WSP** student design team at Queen's. A chat agent turns a plain-English
building brief into structural options (mass timber, reinforced concrete, structural steel). A 3D viewer draws
each option as a real frame with drafting gridlines, plus cost, embodied carbon, schedule and bay size.
Everything runs in the browser. There is no backend yet, and the agent is a local script.

- Live site: https://structure-studio-lime.vercel.app/ (Vercel builds it from this repo, see "Deploy")
- GitHub: https://github.com/AbdullahFID/structure-studio (**private**, default branch `main`, remote `origin`). Keep it private. It holds WSP client material in `docs/`.
- Owner: Abdullah Khan (frontend, with Dhruv). He is the one asking you for changes.
- Status: v1 (single HTML file, htm templates) shipped for the Week 2 demo. v2 is a Vite + React 19 rebuild with a new
  design system, made after the PMs' feedback. The next demo is **Sat Nov 7, 2026**.

---

## Commit rule (must read)

**Never add a `Co-Authored-By: Claude` trailer, a "Generated with Claude Code" line, or any other Claude or
Anthropic attribution** to commits, pull requests, issues, code comments, docs or anything else in this repo.
This overrides any default attribution instructions. Commits are authored by Abdullah only.

---

## 1. Project context (read before changing scope)

**Source documents.** This section summarizes two PDFs in `docs/`. Read them directly when a question is about scope,
WSP's intent or the team plan, since they have the images and tables this summary leaves out.
- `docs/qmind-wsp-project-doc-breakdown.pdf`: the team's breakdown of WSP's brief (8 pages). Project context, the
  vision and flow, metric definitions, bay size examples, the timber vs concrete comparison mockup, what Tom wants,
  the Phase 1 vs Phase 2 access table, tech stack notes and the stretch goal table.
- `docs/week2-qmind-wsp.pdf`: the Week 2 meeting slides (11 pages). Agenda, the Structure Studio mockup slide,
  initial MVP flow (describe, generate, explore), MVP decisions, milestones and the Nov 7 task breakdown.

**Client and users.** WSP is an engineering consultancy. The end users are WSP structural engineers, who are
not very technical with software. The goal is to let owners and architects compare structural systems early,
while the design can still change. The process should be mostly autonomous, with a **human reviewing at key points**.

**What WSP asked for** (from the team's scope doc):
- Input: a basic building model (shape, size, height, floors). It does not say how the building is supported.
- Agent: iterates structural framing options, with **bay sizes optimized per material**. The doc gives typical bays of about 6 m for timber, 8 m for concrete and 10 m for steel.
- Output: a 3D visual of each option, ideally **side by side**, plus a **comparison report**.
- Metrics: **cost, embodied carbon, schedule, bay size**.
- The material changes the structural system. It is not only a visual reskin.
- Data is synthetic until WSP provides real data or APIs. Results do not need to be accurate.
- Tom (WSP manager) suggested a **chat panel beside a 3D workspace, similar to Claude's artifacts**. He also asked the team to assess web vs desktop.
- Agent architecture is the team's call. WSP values research, system architecture and a working proof of concept over polish.
- Stretch goals: mixed materials (a concrete podium with steel above), schedule vs material cost (a 4D model outside Revit),
  location-based carbon, cloud model automation (Autodesk Design Automation API, Forma round trip), a platform-path
  recommendation (Autodesk cloud vs a platform-agnostic web viewer), a conversational agent, and MEP and building science.
  Structural design comes first.

**Access and data by phase** (from the scope doc's table):
- Phase 1: no WSP accounts, network or API source code. WSP shares API documentation, synthetic input and output data, and an architectural model. Students use their own Queen's accounts and AI tools. A WSP Forma dev project is optional.
- Phase 2: live WSP APIs through a hosted endpoint (inputs in, results out, no code shared), with several weeks of IT lead time. A real architectural model if available. Possibly an AI service API key with WSP covering token costs.

**MVP decisions** (Week 2 slides): web-based app is confirmed. Simple structures like sheds, basic interactive 3D and
visual material switching are agreed MVP scope. Still open: form vs chat input, the AI approach, frontend and backend
tech, and 3D rendering tech.

**Team** (Discord): PMs Abdullah Mohsin and Zaid Alam. Frontend: Abdullah Khan and Dhruv.
Data input and backend: Tharun and Yaseen. 3D rendering research: Karim. Geometry generation: PM.

**Week 2 frontend task** (the task doc, Devs 1-2): a Figma mockup or a coded React/Next.js demo with the chatbot on the left
and the 3D viewer on the right. It needs option tabs and basic material and dimension controls. It must show these UX flows:
enter requirements, see generation, view the model, request a change (wood to steel), add a second option without
losing the first, and delete or switch options. No backend is needed. The **Walkthrough** popover in the app lists these six flows.

**Scope tension to keep in mind.** The team's MVP slides say "simple single-floor structure like a shed" with
"visual material switching". WSP's doc wants real structural options with metrics. This prototype does both: a shed
works, and a 5-storey office works too, and switching material changes the grid, the sections and the numbers.
Do not cut the metrics or the bay study to "simplify". They are what ties the demo to WSP's brief.

**Milestones (team slides):** Nov 7 research and mockup, Nov 14 repo and static 3D, Nov 21 resize a single-floor build,
Nov 28 chatbot triggers generation, Dec 5 material switch and viewer, Dec 12 options and buffer, Dec 19 MVP freeze,
Dec 26 testing. Finals run Dec 10-23, so expect the team to slip after Dec 5.

**Feedback on the first build (Nov 2, 2026), from the PMs:** "a bit overwhelming", "take a more simplistic
approach", "looks like a very generic vibe coded site", "make a couple iterations to choose from", and include
your own artistic ideas. The v2 redesign answers this: a calm start screen, progressive disclosure (the adjust
panel is closed by default), and two looks (Drafting and Studio) that the team can switch between live.


---

## 2. Commands

Use **pnpm** (pinned in `package.json` as `packageManager`).

```bash
pnpm install                                  # dependencies
pnpm exec playwright install chromium webkit  # once, for the browser checks
pnpm dev                                      # Vite dev server on http://localhost:5199
pnpm build                                    # production build into dist/
pnpm preview                                  # serve dist/ on http://localhost:4199
pnpm lint                                     # ESLint with the React hooks rules (must be clean)
pnpm test:engine                              # bay studies, metrics and parser results for sample briefs
pnpm test:e2e                                 # every browser check below, against the production build
pnpm test                                     # lint, engine, build and e2e
node test/e2e/flows.mjs drafting light        # the six Week 2 flows with assertions (any look and theme)
node test/e2e/mobile.mjs studio dark          # 390 px in WebKit, then a reduced-motion pass
node test/e2e/look.mjs                        # start screen and example project in all four look/theme pairs
node test/e2e/edge.mjs                        # 320 px, keyboard focus
```

The e2e scripts start `vite preview` on a free port, so run `pnpm build` first. Screenshots land in `test/shots/`
(ignored by git). **After any visual change, open the screenshots and look at them**, in both looks, both themes
and at phone width. Headless WebGL runs on SwiftShader, so builds animate slowly; the harness waits for state, not time.

---

## 3. Repo map

```
index.html                   Vite entry. Applies the saved look and theme before first paint.
src/main.jsx                 Mounts <App /> and imports the fonts and stylesheets.
src/engine/engine.js         Pure functions: parser, bay study, member sizing, synthetic metrics, ranking, geometry. No DOM.
src/viewer/StructureViewer.js  three.js viewer: one scene per option, instanced members and instanced ink edges,
                             chain gridlines that draw on, compare viewports, start-screen preview, report thumbnails.
src/viewer/palette.js        Material colours and how each look mixes them toward paper. All 3D colour lives here.
src/state/store.js           Reducer, startState() (calm start screen) and exampleState() (the campus workshop).
src/state/helpers.js         Option helpers, recommendation text, trace steps. Shared by agent, UI and report.
src/state/controller.js      One controller per page: store, agent, UI commands and keyboard shortcuts, outside React.
src/agent/agent.js           createAgent(): the scripted agent. The only part to replace with a real orchestrator.
src/report/report.js         buildReport(): the comparison report data and its Markdown.
src/components/              React UI. App, TopBar, StartScreen, Conversation + messages, Stage, StageOverlays
                             (tabs, view tools, title block, compare), Inspector (Adjust), ReportDialog, ui.jsx primitives.
src/styles/                  tokens.css (both looks, both themes), base, layout, components, stage, report.
test/engine.test.mjs         Engine printout. test/e2e/: Playwright harness and browser checks.
docs/                        Source PDFs: WSP brief breakdown and Week 2 slides (see section 1). Not part of the build.
vercel.json                  Vite build, pnpm install, output dist/.
```

---

## 4. Libraries (pinned in pnpm-lock.yaml)

| Library | Version | Use |
|---|---|---|
| react, react-dom | 19.3 | UI. StrictMode is on, so effects must survive a double run. |
| vite, @vitejs/plugin-react | 8.3, 6.2 | Dev server and build. |
| three | 0.187 | Viewer. Addons from `three/addons/...`: OrbitControls, CSS2DRenderer, RoomEnvironment. Use `PCFShadowMap` (`PCFSoftShadowMap` was removed). |
| gsap | 3.15 | All motion. SplitText (now free) for the start headline. Import from `gsap` and `gsap/SplitText`. |
| radix-ui | 1.8 | Accessible primitives: Tooltip, Popover, DropdownMenu, Dialog, ToggleGroup, Slider. One package, named imports. |
| lucide-react | 1.66 | Icons. Never use emoji. |
| @fontsource-variable/mona-sans, hubot-sans | 5.3 | Self-hosted variable fonts with a width axis (`wdth.css`). |
| eslint + eslint-plugin-react-hooks | 10.14, 7.1 | The hooks rules include set-state-in-effect and refs-in-render. Keep it at zero problems. |
| playwright | 1.64 | Browser checks in Chromium and WebKit. |

---

## 5. Engine (src/engine/engine.js)

**Spec** (`normalizeSpec`): `{ type, length, width, storeyHeight, floors, roof: 'flat'|'gable', bay: null|number }`.
Limits: length 3-120 m, width 3-60 m, storey height 2.4-8 m, floors 1-12, bay 2-14 m.

**Grid** (`layoutGrid`): `nx = ceil(L / span)`, `nz = ceil(W / span)`, `sx = L / nx`, `sz = W / nz`.
Numbered gridlines run along the length and lettered gridlines run across. Letters skip I and O, as on drawings.

**Bay study** (`studyBays`), which is the agent's main job: it tries `[0.6, 0.8, 1.0, 1.2] × maxSpan`
(timber 6, concrete 8, steel 10) rounded to 0.5 m, and drops duplicate grids. Each run is scored by `scoreSet`
(weighted ratio to the best run for cost, carbon and schedule) plus an operations penalty of
`0.25 × max(0, maxSpan / sqrt(sx·sz) − 1)²`, so crowded floor plates lose. The lowest score wins.
A manual `spec.bay` skips the pick but still runs the study for display.

**Priorities** (`PRIORITIES`): balanced 1/1/1, carbon 0.6/2.2/0.6, cost 2.2/0.6/0.6, schedule 0.6/0.6/2.2
(order: cost, carbon, schedule). Changing the priority re-runs every option's bay study.

**Sections** (rules of thumb, not analysis):
- Glulam: width from the standard list (130, 175, 215, 265, 315, 365 mm, and wider for columns). Depth = span/14 rounded up to 38 mm laminations. Named "Glulam 265 × 456".
- CLT: 3, 5, 7 or 9 ply at 35 mm per ply, with switch points at 4.2, 6.4 and 8 m spans.
- Concrete: beam depth = span/12 (25 mm steps), slab = span/33 (150-320 mm), columns grow with tributary area × floors.
- Steel: W-shapes named `W{nominal depth}×{kg/m}`. Beam depth = span/22. Area is about 0.045·d² for beams and 0.12·d² for columns. Girders use span × 1.25. Infill beams sit at 3.2 m or less. Braces are HSS 127×127×8 in the end bays.

**Synthetic factors** (all in `MATERIALS` and `SHARED`; change them only there):

| | Timber | Concrete | Steel |
|---|---|---|---|
| Carbon | 240 kgCO₂e/m³ | 520 kgCO₂e/m³ | 1.25 kgCO₂e/kg; composite deck 68/m², roof deck 14/m² |
| Cost | col 3600, beam 3300, slab 1750 $/m³ | 2100, 1850, 1000 $/m³ | $6.40/kg; deck $165/m², roof deck $48/m² |
| Per piece / per column | $1400 / $1200 | $1100 / $2200 | $2100 / $1400 |
| Erection | 240 m²/day + 26 pieces/day, min 3 days per floor | 130 m²/day + 16 pieces/day, min 7, plus 7 days cure | 260 m²/day + 30 pieces/day, min 4 |

Footings cost $780/m³ and carry 360 kgCO₂e/m³, with size growing with tributary load. Piece costs scale by
`clamp(trib·floors / 90, 0.25, 1)` so small sheds stay cheap. Mobilization takes `1 + min(4, GFA/400)` days and
footings take `2 + 0.35 × count` days. A week is 5 working days.

**Sanity anchors** (from `npm run test:engine`; if a change moves these a lot, say so):
- Office 48×24 m, 5 storeys, balanced: timber about 6.9×6.0 m bays, $4.3M, 395 t, 13 wk. Concrete about 8×8 m, $3.7M, 1190 t, 18 wk. Steel about 9.6×8 m, $3.9M, 754 t, 11 wk.
- Workshop 30×12 m gable, carbon first (the example project): timber 5.0×4.0 m, $242k, 24 t. Concrete 6.0×6.0 m, $257k, 74 t. Steel 7.5×6.0 m, $236k, 35 t.

**Geometry** (`buildGeometry`): returns `parts[role] = items[]` with roles footing, column, beam, girder, infill,
brace, slab, roofslab, rafter, purlin, roofdeck, wall, glass and door. Each item is
`{ a, b, w, d, delay, shape?: 'I', roll?, meta: { title, sub } }`, a segment from a to b with a cross-section of w × d.
`delay` (0 to 1) sets the build order: footings first, then each level's columns, beams, infill and braces, then slabs.
The gable roof stacks rafters, then purlins on the slope normal, then the deck.

**Parser** (`parseBrief`): regex-based. Handles footprints like "6 x 4 m", "20 by 12 ft" (converts and flags feet),
height, floors (digits or words), materials in order of mention, roof, type, priority, bay ("8 m bays", "auto bays"),
and intents: newOption, deleteLetter (or 'ACTIVE'), selectLetter, compare, report, reset, help, undo and envelope on/off.
Add parser cases to `test/engine.test.mjs` when you extend it.

---

## 6. App (src/state, src/agent, src/components)

**State** lives in a small external store (`controller.js`), read with `useSyncExternalStore`. The agent reads the latest
state through `get()`, so it never sees a stale closure. Shape:
```
view ('start' | 'work'), project {name, example}, priority, options[], activeId, compare, display {envelope, labels},
messages[], busy, busyLabel, ui {report, inspector, panel, walk}, walk {generated, viewed, changed, added, managed}, toast
```
The page opens on the **start screen** (`startState()`). "Open the example project" loads `exampleState()`.
Sending any brief switches `view` to `'work'`. `view`, `example`, `reset` and `restoreProject` morph with the View
Transitions API where the browser has it.

**Option:** `{ id, letter, material, spec, result, version, stage, animate, fresh }`.
- `version` goes up on every change; the viewer rebuilds that option's scene when it does.
- `stage` runs `footprint`, `grid`, `build`, `ready`. The viewer draws the footprint, then the chain gridlines and bubbles, then grows the members.
- Letters are never reused after a delete.

**Message kinds:** text, note, trace (one quiet line with a progress ring while running, expandable steps after),
spec (the human checkpoint, editable; edits flow back to the message so the ghost on the sheet follows them), result
(a small table, best values in green), change (delta figures), clarify (quick-reply chips).

**Agent** (`createAgent(get, dispatch, hooks)`): same intent order and the same tool names as v1:
`place_footprint`, `study_bays`, `size_members`, `estimate_metrics`, `build_geometry`, `rank_options`.
The build step waits for the viewer's `onBuilt(id)` with a 6 s fallback.

**Adjust (Inspector):** closed by default. Sliders rebuild instantly (`stage: 'ready', animate: false`) and post one
coalesced note. The bay study is a list of runs drawn as small to-scale plans; clicking one sets a manual bay.
Material changes go through `agent.change()` so they get a trace and the build animation.

**Keyboard:** `/` focuses the composer. `1`, `2`, `3` switch to 3D, plan and elevation. `W` walls, `G` gridlines, `C` compare,
arrow keys switch options. Shortcuts are listed in the More menu. They are ignored inside inputs, menus and sliders.

---

## 7. Viewer (src/viewer/StructureViewer.js)

API: `new StructureViewer(host, { onBuilt, onInteract })`, `sync(options, { activeId, compareIds, display })`,
`setTheme({ look, dark, gridline, ink, ink3, gridMinor, gridMajor })`, `setInsets({ top, right, bottom, left })`,
`setPreview(result, { animate })`, `frame(animate, 'iso'|'top'|'front'|'side')`, `thumbnail(id, { w, h })`, `dispose()`.

- Members are one `InstancedMesh` per role. **Ink edges** are an `InstancedBufferGeometry` of `EdgesGeometry` lines that
  reuses the mesh's `instanceMatrix` as an attribute, so outlines grow with the frame at no extra CPU cost.
  Faces use `polygonOffset` so the edges win the depth test.
- Drafting lines use one shader with modes: chain line (long dash, dot) for gridlines, short dash for the footprint, solid.
  A `uProgress` uniform with per-line delays draws them on from the centre out.
- Looks: `palette.js` mixes each material toward the paper colour and sets edge weight. Drafting is light faces with
  heavy ink; Studio is full colour with faint edges. Steel keeps more colour on paper so red oxide does not turn pink.
- The **preview** entry (`PREVIEW_ID`) is linework only: the example turning slowly on the start screen, or a ghost of
  the brief while the checkpoint waits. Edits to the brief swap it without replaying the animation.
- **Insets:** any element with `data-inset="left|right|top|bottom"` that overlaps the canvas shifts the projection
  (`setViewOffset`) so the model is framed in the clear area. A side panel wider than 60% of the sheet counts as bottom.
- Gridline bubbles and dimension strings are CSS2D labels on the near sides, in mm with thin spaces ("6 000").
  Their entrance is a CSS transition on an inner span, delayed per label.
- Rendering only happens when something changes. Compare uses scissor viewports with one shared camera.

---

## 8. Design system and copy

- **Concept: the drawing sheet.** The app is a sheet of drawing paper. The model is drawn on it in ink with chain
  gridlines, the estimates sit in a **title block** along the bottom, and colour comes only from the three materials.
- **Two looks, one codebase** (the "couple of iterations" the PMs asked for). Switch in the top bar, the More menu, or
  with `?look=studio` in the URL. The choice is saved in `localStorage` (`ss-look`).
  - **Drafting:** a framed paper sheet beside the conversation, linework with a light material wash. Quiet and technical.
  - **Studio:** the model fills the screen under light, with frosted glass panels floating over it. Closer to an Apple product page.
- **Colour:** all colours are tokens in `src/styles/tokens.css`, defined for both looks and both themes. Dark uses a slate-950
  base (`#020617`). The one accent is cyanotype blue (`--gridline`, `--accent`), the pigment of real blueprints; use it
  for the drafting layer and focus only. Primary buttons are ink, not blue. Materials: timber `#b97b3d`, concrete
  `#8d9498`, steel `#ad4c36` (primer red). Material swatches use section hatches (wood grain, aggregate, diagonal).
- **Glass** only in Studio and on the phone dock: `backdrop-filter: blur(16px) saturate(140%)`, a translucent fill, a
  1 px border, a solid fallback under `@supports not`. Nav glass is lighter than card glass.
- **Type:** Hubot Sans (display: headline, wordmark, panel titles, width animated on the start screen) and Mona Sans
  (everything else). Scale 12/14/16/20/28/40/64, body line height 1.6. **Do not use `tabular-nums` or Hubot for figures:**
  both switch to a slashed zero that reads as code. Figures are set in Mona Sans with proportional digits.
- **Radii** 4, 7, 10, 14, 20 px by hierarchy. Shadows are soft and rare. No gradient text, no glow, no bento grid,
  no three-equal-cards hero, no emoji.
- **Motion:** GSAP for the draw-on sequence and number count-ups, CSS for small transitions, View Transitions for
  layout changes. Every animation respects `prefers-reduced-motion`.
- **Copy:** sentence case, plain verbs, Canadian spelling, SI units. **No em dashes. No all-caps labels. No "→" in buttons.**
  A button names the action it performs, and its result uses the same word ("Generate", then "Generated").
- Keep **"Demo mode"** (under the composer) and **"Synthetic data"** (title block) until a real agent and WSP data are connected.
- Real engineering details are part of the design: CSA codes (O86, A23.3, S16), section names, mm dimensions, gridline lettering.
- Accessibility: visible focus rings, labels on icon buttons, tooltips that also show on focus, every hover action
  reachable by keyboard and touch, WCAG AA contrast for muted text, layouts down to 320 px.

---

## 9. Deploy

- **GitHub** is `AbdullahFID/structure-studio`, a private repo. Push to `origin main`. Use `gh` for repo, PR and issue work.
- **Vercel** builds from this repo using `vercel.json` (`pnpm install --frozen-lockfile`, `pnpm build`, output `dist`).
  Pushing `main` deploys production; other branches get a preview URL. Run `pnpm test` before pushing.
- v1 is preserved in git history (commit `d4ec393` and earlier) if the single-file version is ever needed again.

---

## 10. Gotchas we already hit

1. **Camera tween race:** every camera move goes through `frame()`, which kills the previous tween.
2. **Resize before frame:** the canvas and the panels change in the same frame. `setInsets` measures the canvas first,
   and `resize()` re-aims an in-flight camera tween, or the model lands off centre.
3. **Leftover labels:** when the active option changes, call `detachLabels(prevId)`.
4. **CSS2D z-index:** CSS2DRenderer writes a z-index on every label. `.canvas-host` has `z-index: 0` to contain them,
   or gridline bubbles float over the Adjust sheet.
5. **CSS2D transforms:** the renderer owns `transform` on the label element. Style and animate an inner span.
6. **Grid min-content:** `.app` sets `grid-template-columns: minmax(0, 1fr)`. Without it, the top bar's minimum width
   stretches the whole page on phones.
7. **Hidden textarea:** the composer measures zero height while its panel is hidden on phones. The autosize skips
   hidden elements and CSS gives it a minimum height.
8. **Shader colours:** custom `ShaderMaterial`s need `#include <colorspace_fragment>` or colours come out too dark.
9. **Hover picking:** hover skips the see-through roof in frame mode, or the roof deck steals every hover.
10. **GSAP and CSS variables:** do not tween a custom property directly. Tween a plain number and call `setProperty`.
11. **Slashed zeros:** see the type rule in section 8.
12. **SwiftShader noise:** headless Chromium logs "GPU stall due to ReadPixels" on screenshots. The harness filters it.

---

## 11. Roadmap and open decisions

- **Port to Next.js** (the team's likely stack): the app is already React with JSX, so it moves as is. Mount the viewer
  in a `'use client'` component. `engine.js` can become `lib/engine.ts` with types and no logic changes.
- **Real agent:** replace `createAgent()` with an API call that streams the same message kinds. Use the LLM for parsing and
  reasoning, and keep every number in engine code. Start with one orchestrator calling tools, then test a multi-agent
  version against it as a research result for WSP.
- **Input:** a JSON massing file works today through the attach button. IFC import (web-ifc in the browser or IfcOpenShell
  on a server) is phase 2, once WSP shares a model.
- **Data:** put the factors behind an adapter so WSP's carbon and cost APIs can replace `MATERIALS` without touching the UI.
- **Stretch goals:** mixed-material podium, a web vs desktop write-up (a Revit add-in in C# is the desktop alternative),
  and an Autodesk APS Viewer comparison for Karim's research.

---

## 12. How to work in this repo

- Keep `engine.js` pure. UI state goes through the store, three.js work stays in the viewer, colour in `palette.js` and tokens.
- Prefer small, reviewable diffs. Show Abdullah screenshots of what changed, in both looks.
- After every change: `pnpm lint`, `pnpm build`, the relevant e2e script, then look at the screenshots. Fix any console error.
- Commit only when asked. Keep commit messages short and plain. No `Co-Authored-By` or any Claude attribution (see the commit rule at the top).
- For any writing Abdullah submits (reports, slides, messages to the team): no em dashes, no "Moreover/Furthermore/Additionally"
  openers, simple verbs, 8-25 word sentences, Canadian spelling, and a natural student tone.
