// Layout and motion checks: compare never hides a view under a panel, the splitter and the Adjust
// panel drag, indicators sit on the selected item, the theme reveal runs, and the phone dock pill glides.
import assert from 'node:assert/strict';
import { serve, open, shot, sleep, idle } from './harness.mjs';

const { url, close } = await serve();
let failed = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`  ok  ${name}`); } catch (e) { failed++; console.error(`  FAIL ${name}: ${e.message}`); }
};
const box = (page, sel) => page.locator(sel).first().boundingBox();
const overlaps = (a, b) => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
// The thumb or pill is centred on the selected item once its glide settles.
const sits = async (page, thumb, item) => {
  await sleep(600);
  const t = await box(page, thumb), i = await box(page, item);
  assert.ok(t && i, `${thumb} or ${item} missing`);
  assert.ok(Math.abs(t.x + t.width / 2 - (i.x + i.width / 2)) < 3, `${thumb} is off ${item} by ${Math.round(t.x + t.width / 2 - (i.x + i.width / 2))} px`);
};
const example = async (page) => {
  await page.click('text=Open the example project');
  await idle(page);
};
const blur = (page) => page.evaluate(() => document.activeElement?.blur());

// Compare: every view sits clear of the chat and the toolbar, in both looks and at a few widths.
for (const [look, scheme, width, height] of [['studio', 'light', 1440, 900], ['studio', 'dark', 1100, 760], ['drafting', 'light', 1440, 900], ['drafting', 'dark', 1024, 720]]) {
  const { browser, page, logs } = await open(url, { look, scheme, width, height });
  const tag = `mo-cmp-${look}-${scheme}-${width}`;
  await example(page);
  await check(`${tag} compare views clear of panels`, async () => {
    await blur(page);
    await page.keyboard.press('c');
    await page.waitForSelector('.cmp');
    await sleep(900);
    await shot(page, tag);
    const cmps = await page.locator('.cmp').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    assert.equal(cmps.length, 3);
    const convo = await box(page, '.convo');
    const top = await box(page, '.stage-top');
    for (const c of cmps) {
      assert.ok(!overlaps(c, convo), `a compare view overlaps the chat (${Math.round(c.x)} < ${Math.round(convo.x + convo.width)})`);
      assert.ok(c.y >= top.y + top.height - 2, 'a compare view starts under the toolbar');
    }
    for (const sel of ['.cmp-head', '.cmp-foot']) {
      const parts = await page.locator(sel).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
      for (const p of parts) assert.ok(!overlaps(p, convo), `${sel} hides under the chat`);
    }
  });
  await check(`${tag} leaving compare`, async () => {
    await page.keyboard.press('c');
    await sleep(120);
    await shot(page, `${tag}-leaving`);
    await sleep(700);
    assert.equal(await page.locator('.cmp').count(), 0);
    assert.equal(await page.locator('.titleblock').count(), 1);
  });
  await check(`${tag} console clean`, async () => assert.deepEqual(logs, [], logs.join('\n')));
  await browser.close();
}

// Desktop interactions in both looks
for (const [look, scheme] of [['drafting', 'light'], ['studio', 'dark']]) {
  const { browser, page, logs } = await open(url, { look, scheme });
  const tag = `mo-${look}-${scheme}`;
  await example(page);

  await check(`${tag} tab underline and camera thumb`, async () => {
    await sits(page, '.tabs-ink', '.tab.is-active');
    await page.locator('.tab-btn').nth(2).click();
    await sleep(120);
    await shot(page, `${tag}-tab-glide`);
    await sits(page, '.tabs-ink', '.tab.is-active');
    await page.click('button[aria-label="Plan"]');
    await sits(page, '.tool-thumb', 'button[aria-label="Plan"]');
    await page.click('button[aria-label="3D view"]');
    await sits(page, '.tool-thumb', 'button[aria-label="3D view"]');
  });

  await check(`${tag} look switch thumb`, async () => {
    if (!(await page.locator('.look-switch').isVisible())) return;
    await sits(page, '.look-switch .seg-thumb', '.look-switch .seg-btn[data-state="on"]');
  });

  await check(`${tag} walls fade and gridlines draw back`, async () => {
    await blur(page);
    await page.keyboard.press('w');
    await sleep(200);
    await shot(page, `${tag}-walls-mid`);
    await sleep(600);
    await page.keyboard.press('w');
    await page.keyboard.press('g');
    await sleep(500);
    assert.equal(await page.locator('.gl-bubble').evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== 'none').length), 0, 'gridline bubbles still showing with gridlines off');
    await page.keyboard.press('g');
    await sleep(350);
    await shot(page, `${tag}-grid-drawing`);
    await sleep(900);
    assert.ok(await page.locator('.gl-bubble').evaluateAll((els) => els.some((e) => getComputedStyle(e).display !== 'none')), 'gridline bubbles did not come back');
  });

  await check(`${tag} splitter resizes the chat`, async () => {
    const before = (await box(page, '.convo')).width;
    const s = await box(page, '.splitter');
    await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
    await page.mouse.down();
    await page.mouse.move(s.x + 140, s.y + s.height / 2, { steps: 8 });
    await page.mouse.up();
    await sleep(900);
    const after = (await box(page, '.convo')).width;
    assert.ok(after > before + 100, `chat width ${before} -> ${after}`);
    await shot(page, `${tag}-split-wide`);
    assert.equal(await page.evaluate(() => localStorage.getItem('ss-convo')), String(Math.round(after)));
    await page.dblclick('.splitter');
    await sleep(700);
    assert.ok(Math.abs((await box(page, '.convo')).width - before) < 2, 'double-click did not reset the width');
  });

  await check(`${tag} Adjust drags and resets`, async () => {
    await page.click('button.adjust');
    await page.waitForSelector('.inspector');
    await sleep(500);
    const a = await box(page, '.inspector');
    const h = await box(page, '.insp-titles');
    await page.mouse.move(h.x + 20, h.y + 8);
    await page.mouse.down();
    await page.mouse.move(h.x - 380, h.y + 60, { steps: 10 });
    await page.mouse.up();
    await sleep(1000);
    const b = await box(page, '.inspector');
    assert.ok(b.x < a.x - 300, `Adjust moved from ${a.x} to ${b.x}`);
    await shot(page, `${tag}-adjust-moved`);
    await page.dblclick('.insp-titles');
    await sleep(600);
    assert.ok(Math.abs((await box(page, '.inspector')).x - a.x) < 2, 'double-click did not put Adjust back');
    await page.click('.inspector button[aria-label="Close"]');
    await sleep(80);
    assert.equal(await page.locator('.inspector.is-leaving').count(), 1, 'Adjust did not animate out');
    await sleep(400);
    assert.equal(await page.locator('.inspector').count(), 0);
  });

  await check(`${tag} theme reveal`, async () => {
    const was = await page.evaluate(() => document.documentElement.dataset.theme || '');
    await page.click('.theme-btn');
    await sleep(230);
    await shot(page, `${tag}-theme-mid`);
    await sleep(800);
    const now = await page.evaluate(() => document.documentElement.dataset.theme);
    assert.notEqual(now, was);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('vt-theme')), false, 'vt-theme class left behind');
    await shot(page, `${tag}-theme-after`);
    await page.click('.theme-btn');
    await sleep(900);
  });

  await check(`${tag} toast leaves smoothly`, async () => {
    await page.locator('.tab-x').last().click();
    await page.waitForSelector('.toast');
    await page.click('.toast-x');
    await sleep(60);
    assert.equal(await page.locator('.toast.is-leaving').count(), 1);
    await sleep(300);
    assert.equal(await page.locator('.toast').count(), 0);
  });
  await check(`${tag} console clean`, async () => assert.deepEqual(logs, [], logs.join('\n')));
  await browser.close();
}

// Phone: the dock pill glides, the panels cross over, Adjust swipes away
for (const [look, scheme] of [['drafting', 'light'], ['studio', 'dark']]) {
  const { browser, page, logs } = await open(url, { look, scheme, width: 390, height: 844, mobile: true, engine: 'webkit' });
  const tag = `mo-m-${look}-${scheme}`;
  await example(page);
  await check(`${tag} dock pill`, async () => {
    await sits(page, '.dock-pill', '.dock button[aria-pressed="true"]');
    await page.click('.dock button:has-text("Chat")');
    await sleep(140);
    await shot(page, `${tag}-pill-glide`);
    await sits(page, '.dock-pill', '.dock button:has-text("Chat")');
    await shot(page, `${tag}-chat`);
    await page.click('.dock button:has-text("Model")');
    await sits(page, '.dock-pill', '.dock button:has-text("Model")');
    await sleep(300);
    await shot(page, `${tag}-model`);
  });
  await check(`${tag} model framed in the clear`, async () => {
    // With the chat hidden, the sheet must not reserve room for it.
    const r = await page.evaluate(() => document.querySelector('.convo') && getComputedStyle(document.querySelector('.convo')).visibility);
    assert.equal(r, 'hidden');
  });
  await check(`${tag} Adjust sheet swipes down`, async () => {
    await page.click('button.adjust');
    await page.waitForSelector('.inspector');
    await sleep(600);
    const h = await box(page, '.insp-head');
    await page.mouse.move(h.x + h.width / 2, h.y + 10);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2, h.y + 160, { steps: 8 });
    await page.mouse.up();
    await sleep(500);
    assert.equal(await page.locator('.inspector').count(), 0, 'swipe did not close the sheet');
  });
  await check(`${tag} compare stacks`, async () => {
    await page.click('button[aria-label="Compare side by side"]');
    await sleep(1200);
    await shot(page, `${tag}-compare`);
    const cmps = await page.locator('.cmp').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    assert.equal(cmps.length, 3);
    assert.ok(cmps.every((c) => c.width > 300), 'compare views are not full width on a phone');
  });
  await check(`${tag} console clean`, async () => assert.deepEqual(logs, [], logs.join('\n')));
  await browser.close();
}

await close();
if (failed) { console.error(`${failed} motion check(s) failed`); process.exitCode = 1; } else console.log('all motion checks passed');
