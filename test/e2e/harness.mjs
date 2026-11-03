// Serves the production build with `vite preview` and drives it with Playwright.
// Headless WebGL runs on SwiftShader, so animations are slow; tests wait for state, not time.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { preview } from 'vite';
import { chromium, webkit } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SHOTS = path.join(ROOT, 'test/shots');
mkdirSync(SHOTS, { recursive: true });

export async function serve() {
  const server = await preview({ root: ROOT, preview: { port: 0, strictPort: false, open: false }, logLevel: 'silent' });
  const url = server.resolvedUrls.local[0];
  return { url, close: () => new Promise((r) => server.httpServer.close(r)) };
}

const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export async function open(base, { width = 1440, height = 900, scheme = 'light', look = 'drafting', mobile = false, engine = 'chromium', reduced = false, query = '' } = {}) {
  const browserType = engine === 'webkit' ? webkit : chromium;
  const browser = await browserType.launch(engine === 'chromium' ? { args: GL_ARGS } : {});
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, colorScheme: scheme,
    isMobile: mobile, hasTouch: mobile, reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  await ctx.addInitScript((l) => { try { localStorage.setItem('ss-look', l); } catch { /* ignore */ } }, look);
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => {
    // SwiftShader reports pipeline stalls whenever a screenshot reads the canvas; those are not app errors.
    if (['error', 'warning'].includes(m.type()) && !m.text().includes('GL Driver Message')) logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${base}${query}`);
  await page.waitForSelector('.app');
  return { browser, page, logs };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

export async function send(page, text) {
  const box = page.locator('textarea:visible').first();
  await box.fill(text);
  await box.press('Enter');
}

// Waits until the agent is idle and no option is still drawing.
export async function idle(page, ms = 60000) {
  await sleep(300);
  await page.waitForFunction(() => !document.querySelector('.stage-status') && !document.querySelector('.tab-busy') && !document.querySelector('.trace.is-running'), null, { timeout: ms });
  await sleep(500);
}
