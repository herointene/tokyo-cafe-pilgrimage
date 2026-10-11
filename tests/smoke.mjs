import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Point PLAYWRIGHT_MODULE at an existing install, or install playwright locally.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SITE_URL || 'http://127.0.0.1:4177/';
const output = process.env.SCREENSHOT_DIR || 'test-results';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  if (response.status() >= 400 && response.url().startsWith(base)) errors.push(`${response.status()} ${response.url()}`);
});
const count = async expected => {
  await page.waitForFunction(value => document.querySelector('#results-count b')?.textContent === String(value), expected);
};
const reset = async () => {
  await page.goto(base);
  await count(69);
};
try {
  const response = await page.goto(base);
  assert.equal(response.status(), 200);
  await count(69);
  assert.equal(await page.locator('.shop-card').count(), 12);
  assert.equal(await page.locator('#ward option').count(), 21);
  assert.equal(await page.locator('.photo-frame img').evaluate(image => image.complete && image.naturalWidth > 0), true);
  await page.screenshot({ path: `${output}/desktop.png` });

  // Every Excel record can actually be reached from the public directory.
  while (await page.locator('#load-more-wrap').isVisible()) await page.locator('#load-more').click();
  assert.equal(await page.locator('.shop-card').count(), 69);
  assert.equal(await page.locator('.card-links a').count(), 138);
  const ids = await page.locator('.shop-card').evaluateAll(cards => cards.map(card => card.dataset.id));
  assert.equal(new Set(ids).size, 69);
  const unsafeLinks = await page.locator('.card-links a').evaluateAll(links => links.filter(link => !/^https?:/.test(link.href) || link.rel !== 'noopener noreferrer').length);
  assert.equal(unsafeLinks, 0);

  await reset();
  await page.locator('[data-kind="sweets"]').click();
  await count(5);
  await page.locator('#ward').selectOption('中央区');
  await count(2);
  await page.locator('#reset-filters').click();
  await count(69);
  await page.locator('#search').fill('RBL');
  await count(1);
  assert.match(await page.locator('.shop-card').innerText(), /RBL CAFE/);
  await page.locator('[data-action="details"]').click();
  await page.locator('#shop-dialog').waitFor({ state: 'visible' });
  assert.match(await page.locator('#dialog-content').innerText(), /21/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#shop-dialog').isVisible(), false);
  assert.equal(await page.locator('[data-action="details"]').evaluate(button => button === document.activeElement), true);

  // Saved and visited are separate, persistent states, not decorative controls.
  await page.locator('#shop-grid [data-action="saved"]').click();
  assert.equal(await page.locator('#nav-saved').textContent(), '1');
  await page.locator('#shop-grid [data-action="visited"]').click();
  assert.equal(await page.locator('#visited-total').textContent(), '1');
  await page.reload();
  await count(1);
  assert.equal(await page.locator('#shop-grid [data-action="saved"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#shop-grid [data-action="visited"]').getAttribute('aria-pressed'), 'true');
  await page.locator('.main-nav [data-diary-link]').click();
  await count(1);
  assert.match(page.url(), /status=saved/);
  await page.locator('#shop-grid [data-action="saved"]').click();
  await count(0);
  assert.equal(await page.locator('#empty-state').isVisible(), true);
  await page.locator('#empty-reset').click();
  await count(69);
  await page.locator('#status').selectOption('visited');
  await count(1);
  await page.locator('#shop-grid [data-action="visited"]').click();
  await count(0);

  await reset();
  await page.locator('#search').fill('半月');
  await count(1);
  await page.locator('[data-action="details"]').click();
  assert.match(await page.locator('#dialog-content').innerText(), /4-14-11/);
  assert.match(await page.locator('#dialog-content').innerText(), /4-31-11/);
  await page.keyboard.press('Escape');
  await page.locator('#search').fill('this cafe does not exist');
  await count(0);
  assert.equal(await page.locator('#empty-state').isVisible(), true);
  await page.locator('#empty-reset').click();
  await page.locator('[data-route="ginza"]').click();
  await count(6);
  assert.match(page.url(), /route=ginza/);
  await page.locator('[data-view="list"]').click();
  assert.equal(await page.locator('#shop-grid').evaluate(grid => grid.classList.contains('list-view')), true);
  await page.locator('#sort').selectOption('name');
  await count(6);
  await page.reload();
  await count(6);
  assert.equal(await page.locator('[data-view="list"]').getAttribute('aria-pressed'), 'true');

  await reset();
  await page.locator('#directory').evaluate(section => section.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: `${output}/directory.png` });
  for (const width of [768, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base);
    await count(69);
    await page.evaluate(() => scrollTo(0, 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}px`);
    if (width === 390) {
      await page.screenshot({ path: `${output}/mobile-hero.png` });
      await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
      await page.locator('#directory').evaluate(section => section.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: `${output}/mobile-directory.png` });
    }
    await page.locator('[data-action="details"]').first().click();
    assert.equal(await page.locator('#shop-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true, `Dialog overflow at ${width}px`);
    await page.keyboard.press('Escape');
  }

  // A damaged browser record must not break the directory.
  await page.evaluate(key => localStorage.setItem(key, '{bad json'), 'tokyo-coffee-journal-v1');
  await reset();
  assert.equal(await page.locator('#nav-saved').textContent(), '0');
  await page.locator('#about-button').click();
  assert.match(await page.locator('#about-dialog').innerText(), /11 家店鋪/);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  console.log('PASS: 69 shops, filters, source notes, map links, diary persistence, routes, keyboard dialogs, mobile widths, and zero browser errors.');
} finally {
  await browser.close();
}
