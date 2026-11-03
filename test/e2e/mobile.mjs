// Phone width in WebKit, plus a reduced-motion pass in Chromium.
import { serve, open, shot, sleep, idle } from './harness.mjs';

const look = process.argv[2] || 'drafting';
const scheme = process.argv[3] || 'light';
const tag = `m-${look}-${scheme}`;
const { url, close } = await serve();
const { browser, page, logs } = await open(url, { width: 390, height: 844, mobile: true, engine: 'webkit', look, scheme });
try {
  await sleep(2500);
  await shot(page, `${tag}-1-start`);
  await page.click('text=Open the example project');
  await idle(page);
  await shot(page, `${tag}-2-model`);
  await page.click('.dock button:has-text("Chat")');
  await sleep(600);
  await shot(page, `${tag}-3-chat`);
  await page.click('.dock button:has-text("Model")');
  await sleep(400);
  await page.click('button.adjust');
  await sleep(700);
  await shot(page, `${tag}-4-adjust`);
  await page.click('.inspector button[aria-label="Close"]');
  await page.click('.dock button:has-text("Report")');
  await page.waitForSelector('.report .rep-shot img', { timeout: 15000 });
  await sleep(600);
  await shot(page, `${tag}-5-report`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(`${tag}: horizontal overflow ${overflow}`, logs.length ? logs.join('\n') : 'no console errors');
} finally {
  await browser.close();
}

const r = await open(url, { reduced: true, look, scheme });
await sleep(1200);
await shot(r.page, `rm-${look}-${scheme}-1-start`);
await r.page.click('text=Open the example project');
await sleep(1500);
await shot(r.page, `rm-${look}-${scheme}-2-example`);
console.log('reduced motion:', r.logs.length ? r.logs.join('\n') : 'no console errors');
await r.browser.close();
await close();
