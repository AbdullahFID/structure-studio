# Structure Studio: context for Claude Code

Frontend prototype for the **QMIND x WSP** student design team at Queen's. A chat agent on the left
turns a plain-English building brief into structural options (mass timber, reinforced concrete,
structural steel). The 3D viewer on the right shows each option as a real frame with drafting-style gridlines,
plus cost, embodied carbon, schedule and bay size. Everything runs in the browser. There is no backend yet,
and the agent is a local script.

- Live site: https://structure-studio-lime.vercel.app/ (Vercel builds it from this repo, see "Deploy")
- Owner: Abdullah Khan (frontend, with Dhruv). He is the one asking you for changes.
- Status: the Week 2 deliverable (due **Sat Nov 7, 2026**) is done. Future work is iteration and the port to the team's real stack.

---

## 1. Project context (read before changing scope)

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
- Stretch goals: mixed materials (a concrete podium with steel above), location-based carbon, Autodesk APS/Forma, MEP.

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

---

## 2. Commands

```bash
npm i                              # local copies of the CDN libraries (tests serve these)
npx playwright install chromium    # once, for the browser tests
npm run build                      # python3 build.py -> dist/structure-studio.html and dist/index.html
npm run test:engine                # prints bay studies, metrics and parser results for sample briefs
npm run test:smoke                 # loads the page in Chromium and fails loudly on console errors
node test/flow2.cjs                # full shed walkthrough: brief, checkpoint, generate, switch to steel, add option, walls
node test/flow4.cjs                # delete and undo, slider edit, priority change, report copy, clarify flow, shortcuts
npm test                           # build plus all of the above
```

Screenshots land in `test/shots/`. **After any visual change, open the relevant screenshots and look at them.**
Check light and dark (`open({ scheme: 'dark' })`) and phone width (`open({ width: 390, height: 844, mobile: true })`).

---

## 3. Repo map

```
src/engine.js    Pure functions. Parser, bay study, member sizing, synthetic metrics, ranking, geometry description.
                 No DOM, no three.js. Must stay portable to a backend or an API route.
src/viewer.js    StructureViewer class (three.js). One scene per option, instanced members, gridlines, animation, compare.
src/app.js       React 18 UI written with htm tagged templates (no build step). Reducer, agent script, all components.
src/styles.css   Design tokens (light and dark) and component styles.
src/index.html   Page template. CDN script tags, importmap, and placeholders that build.py fills.
build.py         Inlines CSS and JS into one self-contained HTML file. Strips `export` keywords.
dist/            Build output. index.html is what Vercel serves.
test/            harness.cjs (Playwright + CDN interception), engine.test.mjs, smoke/flow*.cjs scripts.
vercel.json      buildCommand "python3 build.py", outputDirectory "dist", install skipped.
```

The three source files are concatenated into **one module scope** in this order: engine, viewer, app.
So `app.js` uses engine and viewer exports directly, with no imports. Keep names unique across files.

---

## 4. Libraries (pinned, change with care)

| Library | Version | Loaded from | Note |
|---|---|---|---|
| React, ReactDOM | 18.3.1 | cdnjs UMD | React 19 ships no UMD build. Stay on 18 unless you move to a bundler. |
| htm | 3.1.1 | jsdelivr UMD | `html` = `htm.bind(React.createElement)`. Use `className` and `htmlFor`. Components are `<${Comp} />`, and `<//>` closes. |
| three | 0.186.1 | jsdelivr via importmap | Addons: OrbitControls, CSS2DRenderer, RoomEnvironment. `PCFSoftShadowMap` was removed, so use `PCFShadowMap`. |
| gsap | 3.15.0 | jsdelivr UMD | Global `gsap`. |
| Archivo | variable, wdth 62-125, wght 100-900 | Google Fonts | Annotations use `font-stretch` around 72-88%. |

If you change a version, update **all three places**: the URL in `src/index.html`, `package.json`, and the `MAP`
regexes in `test/harness.cjs`. If you don't, the tests will serve the wrong files.

---

## 5. Engine (src/engine.js)

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

## 6. App (src/app.js)

**State** (`useReducer`, initialised by `exampleState()`, which loads the example project so the page never opens empty):
```
project {name, example}, priority, options[], activeId, compare, display {envelope, labels},
messages[], busy, busyLabel, ui {report, inspector, panel, walk}, walk {generated, viewed, changed, added, managed}, toast
```

**Option:** `{ id, letter, material, spec, result, version, stage, animate, fresh }`.
- `version` goes up on every change, and the viewer rebuilds that option's scene when it does.
- `stage` is `footprint`, then `grid`, then `build`, then `ready`. It drives what the viewer shows (footprint outline, gridlines, animated members, final).
- Letters are never reused after a delete. The next one is whatever follows the highest letter used.

**Message kinds:** welcome, text, note, trace (tool steps with status), spec (the human checkpoint: editable,
assumed fields flagged, Generate button), result (option rows with best values in green), change (delta chips),
clarify (quick-reply chips).

**Agent** (`createAgent(get, dispatch, hooks)`): this is the only part to replace with a real orchestrator.
`send()` checks intents in this order: help, undo, reset, delete, select, report, walls, compare, priority,
pending-checkpoint guard, brief flow (if there are no options or a footprint is still missing),
multi-material brief, new option from the active spec, change the active option, then a fallback.
Tool names in the trace match the engine: `place_footprint`, `study_bays`, `size_members`, `estimate_metrics`,
`build_geometry`, `rank_options`. Keep those names when the real agent arrives so the UI still makes sense.
The build step waits for the viewer's `onBuilt(id)`, with a 6 s timeout as a fallback.

**Edits from the inspector:** sliders rebuild instantly with no animation (`stage: 'ready', animate: false`), and a
coalesced note is posted to the chat. Material changes from the inspector go through `agent.change()`, so they get a trace and the build animation.

**Keyboard:** `/` focuses the composer. `1`, `2` and `3` switch to 3D, plan and elevation. `W` toggles walls, `G` toggles gridlines,
`C` toggles compare, and the arrow keys switch tabs.

---

## 7. Viewer (src/viewer.js)

API: `new StructureViewer(host, { onBuilt, onInteract })`, `sync(options, { activeId, compareIds, display })`,
`setTheme({ gridMinor, gridMajor, gridline, ink3, dark })`, `setInsets({ top, right, bottom, left })`,
`frame(animate, 'iso'|'top'|'front'|'side')`, `dispose()`. `compareRects(w, h, n)` is shared with the React overlays,
so the labels line up with the viewports.

- One `THREE.Scene` per option. Each role is one `InstancedMesh`, built on a unit box or unit I-section (length on X, depth on Y, width on Z).
- `itemMatrix(item, progress)` grows each member from `a` toward `b`. Build progress is one GSAP tween.
- Gridline bubbles and dimension strings are CSS2D labels on the **near sides** (numbers at the front +z, letters at the right +x). Values are in mm with thin spaces, like "6 000".
- Rendering only happens when something changes (`dirty`, controls moved, or an animation is running).
- The canvas is transparent, so the CSS gradient behind it adapts to the theme.
- **Insets:** the inspector and metrics strip cover part of the canvas. `setViewOffset` shifts the projection so the model is framed in the free area. React measures the panels in a layout effect and calls `setInsets`.
- **Compare:** scissor viewports on one renderer, sharing one camera. Labels are hidden in compare mode.
- Colours of the ground grid and gridlines come from CSS tokens (`--grid-minor`, `--grid-major`, `--gridline`, `--ink-3`, `--is-dark`) through `App.applyTheme()`.

---

## 8. Design system and copy

- Concept: a drafting table. The chrome stays quiet, and the one loud element is the 3D frame with blueprint-blue gridlines.
- Accent: Prussian blue `#1f4f94` in light mode and `#8fb2f0` in dark. Material colours are timber `#b8783a`, concrete `#7d868c` and steel `#ad4c36` (the red of steel primer).
- Neutrals have a cool green-grey bias. Every colour is a token on `:root`, redefined in both dark blocks. Never put a literal colour in a component rule.
- Glass panels (`.glass`) are used only over the 3D canvas. Radii are 7, 10, 14 and 20 px by hierarchy. Do not give every card the same radius and shadow.
- Copy: sentence case, plain verbs, Canadian spelling, SI units. **No em dashes. No all-caps labels. No "→" in buttons.** A button names the action it performs, and its result uses the same word ("Generate", then "Generated").
- Keep the **"Demo mode"** and **"Synthetic data"** labels until a real agent and WSP data are connected. The team should not present this as a working AI.
- Real engineering details are part of the design: CSA codes (O86, A23.3, S16), section names, mm dimensions, gridline lettering. Keep them accurate.
- Accessibility: visible focus rings, aria labels on icon buttons, `prefers-reduced-motion` respected (GSAP waits shortened, CSS animations off).

---

## 9. Deploy

- **Vercel** builds from this repo using `vercel.json` (build command `python3 build.py`, output folder `dist`). Push to the connected branch and it redeploys. Always run `npm run build` and the tests before committing.
- A copy was also published as a private claude.ai artifact. Claude Code cannot update that copy, so Vercel is the source of truth.
- If it ever goes back to claude.ai, its sandbox only allows scripts from cdnjs, jsdelivr and unpkg, and no `alert` or `window.print`. Clipboard calls must run inside a click handler.

---

## 10. Gotchas we already hit

1. **Camera tween race:** every camera move must go through `frame()`, which kills the previous tween. An insets tween once overrode the compare framing.
2. **Leftover labels:** when the active option changes, call `detachLabels(prevId)`, or that scene's CSS2D labels stay on screen.
3. **CSS2D transforms:** CSS2DRenderer writes `transform` on the label element. To rotate a label, rotate an inner span instead.
4. **Grid rows:** `.app` uses `auto minmax(0,1fr)` on desktop, because `.mobile-switch` is `display:none` there. Phone uses `auto auto minmax(0,1fr)`. Getting this wrong leaves a dead band at the bottom.
5. **Grid shader colours:** the custom `ShaderMaterial` needs `#include <colorspace_fragment>` or its colours come out too dark.
6. **Hover picking:** hover skips the see-through roof in frame mode. Otherwise the roof deck steals every hover.
7. **Slow headless browser:** with software WebGL, GSAP's lag smoothing stretches the build animation to about 9 s. Tests wait for `.tab .spin` to disappear instead of using fixed sleeps.
8. **Camera after edits:** the viewer keeps the camera when dimensions change. That is intentional; the view buttons reframe.

---

## 11. Roadmap and open decisions

- **Port to Next.js** (the team's likely stack):
  1. `engine.js` becomes `lib/engine.ts` with types and no logic changes.
  2. Mount the viewer class in a `'use client'` component, or rewrite it in React Three Fiber.
  3. The htm templates become JSX one-to-one.
- **Real agent:** replace `createAgent()` with an API call that streams the same message kinds. Use the LLM for parsing and reasoning, and keep every number in engine code. Start with one orchestrator calling tools, then test a multi-agent version against it as a research result for WSP.
- **Input:** a JSON massing file works today through the attach button. IFC import (web-ifc in the browser or IfcOpenShell on a server) is phase 2, once WSP shares a model.
- **Data:** put the factors behind an adapter so WSP's carbon and cost APIs can replace `MATERIALS` without touching the UI.
- **Stretch goals:** mixed-material podium, a web vs desktop write-up (a Revit add-in in C# is the desktop alternative), and an Autodesk APS Viewer comparison for Karim's research.

---

## 12. How to work in this repo

- Keep `engine.js` pure. Put UI state in the reducer and three.js work in the viewer. Don't reach across.
- Plan before big visual changes. Prefer small, reviewable diffs, and show Abdullah screenshots of what changed.
- Run the build and the relevant tests after every change, then look at the screenshots. Fix any console errors the harness reports.
- Commit only when asked. Keep commit messages short and plain.
- For any writing Abdullah submits (reports, slides, messages to the team): no em dashes, no "Moreover/Furthermore/Additionally" openers, simple verbs, 8-25 word sentences, Canadian spelling, and a natural student tone.
