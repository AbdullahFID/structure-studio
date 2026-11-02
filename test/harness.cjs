const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SHOTS = '/tmp/claude-0/-home-claude/194e1fa8-ad9b-59d9-a62f-fd1a42465fe8/scratchpad/shots';
const MAP = [
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.186\.1\/(.*)$/, 'node_modules/three/'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@3\.15\.0\/(.*)$/, 'node_modules/gsap/'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/htm@3\.1\.1\/(.*)$/, 'node_modules/htm/'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/react\/18\.3\.1\/(.*)$/, 'node_modules/react/'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/react-dom\/18\.3\.1\/(.*)$/, 'node_modules/react-dom/'],
];
async function open({ width = 1440, height = 900, scheme = 'light', mobile = false } = {}) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: scheme, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('https://studio.test/')) return route.fulfill({ path: path.join(ROOT, 'test/page.html'), contentType: 'text/html' });
    for (const [re, dir] of MAP) {
      const m = url.match(re);
      if (m) {
        const f = path.join(ROOT, dir, m[1]);
        if (!fs.existsSync(f)) { logs.push(`[missing] ${url}`); return route.fulfill({ status: 404, body: '' }); }
        return route.fulfill({ path: f, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
      }
    }
    if (url.includes('fonts.googleapis.com')) return route.fulfill({ body: '', contentType: 'text/css' });
    if (url.includes('fonts.gstatic.com')) return route.abort();
    logs.push(`[blocked] ${url}`);
    return route.abort();
  });
  await page.goto('https://studio.test/page.html');
  return { browser, page, logs };
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function send(page, text) {
  await page.fill('#composer', text);
  await page.keyboard.press('Enter');
}
async function idle(page, ms = 20000) {
  await sleep(400);
  await page.waitForFunction(() => !document.querySelector('.gen-chip'), null, { timeout: ms });
  await sleep(300);
}
module.exports = { open, shot, sleep, send, idle, SHOTS };
