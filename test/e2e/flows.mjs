// The six Week 2 flows end to end, with assertions and screenshots at each step.
//   node test/e2e/flows.mjs [drafting|studio] [light|dark]
import assert from 'node:assert/strict';
import { serve, open, shot, sleep, send, idle } from './harness.mjs';

const look = process.argv[2] || 'drafting';
const scheme = process.argv[3] || 'light';
const tag = `${look}-${scheme}`;
const { url, close } = await serve();
const { browser, page, logs } = await open(url, { look, scheme });
const tabs = () => page.locator('.tab').count();
const step = (name) => console.log(`  ${name}`);

try {
  // 1. Enter requirements, then approve the checkpoint
  step('enter a brief');
  await send(page, 'Generate a 6 m x 4 m wooden shed');
  await page.waitForSelector('form.brief');
  await sleep(500);
  await shot(page, `${tag}-3-checkpoint`);
  assert.equal(await page.locator('.brief .nf input').first().inputValue(), '6');

  // 2. Watch it generate
  step('generate');
  await page.click('form.brief button[type=submit]');
  await page.waitForSelector('.stage-status');
  await sleep(900);
  await shot(page, `${tag}-4-footprint`);
  await page.waitForFunction(() => /bay/i.test(document.querySelector('.stage-status')?.textContent || ''), null, { timeout: 15000 });
  await sleep(1200);
  await shot(page, `${tag}-5-grid`);
  await page.waitForFunction(() => /build/i.test(document.querySelector('.stage-status')?.textContent || ''), null, { timeout: 15000 });
  await sleep(1500);
  await shot(page, `${tag}-6-building`);
  await idle(page);
  await shot(page, `${tag}-7-shed`);
  assert.equal(await tabs(), 1);
  assert.match(await page.locator('.tab.is-active').innerText(), /Timber/);

  // 3. View the model: plan and elevation
  step('views');
  const blur = () => page.evaluate(() => document.activeElement?.blur());
  await blur();
  await page.keyboard.press('2');
  await sleep(1400);
  await shot(page, `${tag}-8-plan`);
  await page.click('button[aria-label="3D view"]');
  await sleep(1200);

  // 4. Request a change
  step('switch to steel');
  await send(page, 'Switch it to steel');
  await idle(page);
  await shot(page, `${tag}-9-steel`);
  assert.match(await page.locator('.tab.is-active').innerText(), /Steel/);

  // 5. Add a second option without losing the first
  step('add an option');
  await send(page, 'Add a timber version as a new option');
  await idle(page);
  assert.equal(await tabs(), 2);
  await shot(page, `${tag}-10-added`);

  // Walls on, then compare
  step('walls and compare');
  await blur();
  await page.keyboard.press('w');
  await sleep(700);
  await shot(page, `${tag}-11-walls`);
  await page.keyboard.press('w');
  await page.click('button[aria-label="Compare side by side"]');
  await sleep(1500);
  assert.equal(await page.locator('.cmp').count(), 2);
  await shot(page, `${tag}-12-compare`);
  await page.click('button[aria-label="Compare side by side"]');
  await sleep(600);

  // Inspector: slider edit and bay study pick
  step('adjust');
  await page.click('button.adjust');
  await page.waitForSelector('.inspector');
  await sleep(500);
  await shot(page, `${tag}-13-adjust`);
  const thumb = page.locator('.inspector .slider-thumb').first();
  await thumb.focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
  await sleep(1600);
  assert.match(await page.locator('.msg--note').last().innerText(), /length 10\.0 m/);
  await page.locator('.study-run:not(.is-current)').first().click();
  await sleep(800);
  await shot(page, `${tag}-14-bay-pick`);
  await page.click('.inspector button[aria-label="Close"]');

  // 6. Switch and delete options, then undo
  step('delete and undo');
  await page.locator('.tab-btn').first().click();
  await sleep(400);
  await page.locator('.tab-x').first().click();
  await page.waitForSelector('.toast');
  assert.equal(await tabs(), 1);
  await shot(page, `${tag}-15-deleted`);
  await page.click('.toast-btn');
  await sleep(500);
  assert.equal(await tabs(), 2);

  // Report
  step('report');
  await page.click('.topbar button:has-text("Report")');
  await page.waitForSelector('.report .rep-shot img', { timeout: 15000 });
  await sleep(700);
  await shot(page, `${tag}-16-report`);
  await page.keyboard.press('Escape');
  await sleep(400);

  // Walkthrough reaches all six
  step('walkthrough');
  await page.click('.topbar button:has-text("Walkthrough")');
  await sleep(400);
  await shot(page, `${tag}-17-walkthrough`);
  const done = await page.locator('.walk-list li.is-done').count();
  assert.equal(done, 6, `walkthrough shows ${done} of 6 done`);
  await page.keyboard.press('Escape');

  // New study, then the clarify flow
  step('new study and clarify');
  await page.click('.topbar button:has-text("New study")');
  await sleep(900);
  await send(page, 'a warehouse in steel');
  await page.waitForSelector('.msg--clarify .chip');
  await sleep(400);
  await shot(page, `${tag}-18-clarify`);

  assert.deepEqual(logs, [], `console problems:\n${logs.join('\n')}`);
  console.log(`${tag}: all flows passed`);
} catch (e) {
  await shot(page, `${tag}-FAIL`);
  console.error(`${tag}: FAILED\n`, e.message, logs.length ? `\nconsole:\n${logs.join('\n')}` : '');
  process.exitCode = 1;
} finally {
  await browser.close();
  await close();
}
