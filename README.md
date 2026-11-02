# Structure Studio (QMIND x WSP frontend prototype)

Frontend-only demo for the Week 2 task: chatbot on the left, 3D viewer on the right.
No backend. The "agent" is a local script that calls the engine the way real tools would.

## Files
- `src/engine.js`: pure functions: brief parser, bay study, member sizing, synthetic cost / carbon / schedule, ranking, geometry description. No DOM, so it can move to a Next.js API route or backend as is.
- `src/viewer.js`: three.js viewer: one scene per option, instanced members, drafting gridlines (CSS2D), build animation, split-screen compare.
- `src/app.js`: React 18 UI (htm tagged templates, no build step). `createAgent()` is the only part to swap for a real orchestrator.
- `src/styles.css`: design tokens (light + dark) and components.
- `build.py`: inlines everything into `dist/structure-studio.html`.

## Porting to Next.js
1. `engine.js` → `lib/engine.ts` (add types, logic unchanged).
2. `viewer.js` → keep as a class and mount it in a client component, or rewrite the scene in React Three Fiber.
3. `app.js` components → `.tsx` files (htm templates map 1:1 to JSX).
4. Replace `createAgent()` with calls to your agent API. Keep the same message kinds (trace, spec, result, change) so the UI does not change.

All numbers are synthetic placeholders until WSP shares real data.
