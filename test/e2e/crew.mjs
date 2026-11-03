// The drafting crew on the start screen: three cursors draw the example, then hand over to the message box.
//   node test/e2e/crew.mjs [drafting|studio] [light|dark]
import assert from 'node:assert/strict';
import { serve, open, shot, sleep } from './harness.mjs';

const look = process.argv[2] || 'drafting';
const scheme = process.argv[3] || 'light';
const { url, close } = await serve();
const sizes = [['desk', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844, mobile: true, engine: 'webkit' }]];
let failed = false;

for (const [name, opts] of sizes) {
  const tag = `crew-${look}-${scheme}-${name}`;
  const { browser, page, logs } = await open(url, { ...opts, look, scheme });
  try {
    const t0 = Date.now();
    const at = async (s) => { const wait = s * 1000 - (Date.now() - t0); if (wait > 0) await sleep(wait); };
    await page.waitForSelector('.vw-crew .crew-cur', { state: 'attached', timeout: 5000 });
    assert.equal(await page.locator('.crew-cur').count(), 3);
    for (const [s, label] of [[1.4, 'a-footprint'], [2.9, 'b-grid'], [4.6, 'c-members'], [6.6, 'd-roof'], [8.0, 'e-handoff']]) {
      await at(s);
      await shot(page, `${tag}-${label}`);
    }
    const reads = await page.locator('.crew-tag b').allInnerTexts();
    assert.deepEqual(reads, ['place_footprint', 'study_bays', 'size_members']);
    await page.waitForSelector('.vw-crew', { state: 'detached', timeout: 8000 });
    await shot(page, `${tag}-f-after`);
    assert.deepEqual(logs, [], logs.join('\n'));
    console.log(`${tag}: ok`);
  } catch (e) {
    failed = true;
    await shot(page, `${tag}-FAIL`);
    console.error(`${tag}: FAILED`, e.message);
  } finally {
    await browser.close();
  }
}

// A key press hurries the crew along; reduced motion skips it entirely.
{
  const { browser, page } = await open(url, { look, scheme });
  await page.waitForSelector('.vw-crew', { state: 'attached', timeout: 5000 });
  await sleep(600);
  await page.keyboard.press('Shift');
  const t = Date.now();
  await page.waitForSelector('.vw-crew', { state: 'detached', timeout: 8000 });
  console.log(`hurry: crew left ${((Date.now() - t) / 1000).toFixed(1)} s after a key press`);
  await browser.close();
}
{
  const { browser, page } = await open(url, { look, scheme, reduced: true });
  await sleep(1500);
  const n = await page.locator('.vw-crew').count();
  if (n) { failed = true; console.error('reduced motion: the crew still ran'); } else console.log('reduced motion: no crew');
  await browser.close();
}
await close();
if (failed) process.exitCode = 1;
