// Quick visual pass: start screen and example project in both looks and themes.
import { serve, open, shot, sleep, idle } from './harness.mjs';

const only = process.argv[2];
const { url, close } = await serve();
const runs = [
  ['drafting', 'light'], ['drafting', 'dark'], ['studio', 'dark'], ['studio', 'light'],
].filter(([l]) => !only || l === only);
for (const [look, scheme] of runs) {
  const { browser, page, logs } = await open(url, { look, scheme });
  await sleep(4500);
  await shot(page, `${look}-${scheme}-1-start`);
  await page.click('text=Open the example project');
  await idle(page);
  await shot(page, `${look}-${scheme}-2-example`);
  console.log(`${look}/${scheme}:`, logs.length ? logs.join('\n') : 'no console errors');
  await browser.close();
}
await close();
