// 320 px width, keyboard focus, and the studio look in light.
import { serve, open, shot, sleep, idle } from './harness.mjs';
const { url, close } = await serve();

const a = await open(url, { width: 320, height: 640, mobile: true });
await sleep(1500);
await shot(a.page, 'e-320-start');
await a.page.click('text=Open the example project');
await idle(a.page);
await shot(a.page, 'e-320-model');
console.log('320 overflow:', await a.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), a.logs);
await a.browser.close();

const b = await open(url, {});
await b.page.click('text=Open the example project');
await idle(b.page);
await b.page.evaluate(() => document.activeElement?.blur());
for (let i = 0; i < 4; i++) await b.page.keyboard.press('Tab');
await sleep(300);
await shot(b.page, 'e-focus');
console.log('focused:', await b.page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim().slice(0, 40)));
await b.browser.close();
await close();
