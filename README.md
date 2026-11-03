# Structure Studio (QMIND x WSP frontend prototype)

Describe a building in plain words. A scripted agent lays out a column grid for mass timber, reinforced concrete
and structural steel, sizes the members, and compares cost, embodied carbon and schedule. Each option is drawn in 3D
with drafting gridlines and dimensions. There is no backend yet and all figures are synthetic.

- Live: https://structure-studio-lime.vercel.app
- Two looks to choose from: **Drafting** (linework on a paper sheet) and **Studio** (the model under light with glass
  panels). Switch in the top bar, or open `?look=studio`.

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:5199
pnpm build          # production build in dist/
pnpm test           # lint, engine checks, build, browser checks
```

Browser checks need `pnpm exec playwright install chromium webkit` once. Screenshots land in `test/shots/`.

## Layout

- `src/engine/engine.js`: pure functions (parser, bay study, member sizing, synthetic metrics, geometry). Moves to a backend or API route as is.
- `src/viewer/`: the three.js viewer and its colour palette.
- `src/agent/agent.js`: the scripted agent. `createAgent()` is the only part to swap for a real orchestrator; keep the same message kinds and tool names.
- `src/state/`, `src/components/`, `src/styles/`: React 19 UI, store and design tokens.

## Deploy

Vercel builds from `vercel.json` (`pnpm build`, output `dist/`). Pushing `main` deploys production; other branches get a preview URL.
