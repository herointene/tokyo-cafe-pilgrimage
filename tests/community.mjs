import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SITE_URL || 'http://127.0.0.1:4177/';
const output = process.env.SCREENSHOT_DIR || 'test-results/community';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Tokyo', acceptDownloads: true });
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
const privateJournal = { version: 2, saved: ['cafe-043'], visited: ['cafe-012'], entries: {
  'cafe-012': { date: '2026-10-12', drink: '測試手沖', note: '預覽文字 <img src=x onerror="window.injected=true">', updatedAt: '2026-10-12T00:00:00Z' },
  'cafe-043': { date: '2026-10-11', drink: '私人飲品', note: '這篇測試筆記不公開。', updatedAt: '2026-10-11T00:00:00Z' }
} };
const publicFixture = { version: 1, author: { name: 'Test author', url: 'https://github.com/herointene' }, entries: [
  { id: 'cafe-012--2026-10-10', shopId: 'cafe-012', date: '2026-10-10', drink: '測試飲品', note: '測試第一篇\n保留換行。', visited: true },
  { id: 'cafe-012--2026-10-11', shopId: 'cafe-012', date: '2026-10-11', drink: '', note: '<script>window.injected=true</script>', visited: true }
] };
let mocked = true;
await context.route(url => url.origin === 'https://giscus.app' && url.pathname === '/zh-TW/widget', route => {
  if (!mocked) return route.continue();
  return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="zh-TW"><body>Test widget</body></html>' });
});
const ready = async () => page.waitForFunction(() => window.CoffeeJournal && document.querySelector('#results-count b')?.textContent === '69');
const open = async id => { await page.evaluate(id => window.CoffeeJournal.openDetail(id), id); await page.locator('#shop-dialog').waitFor({ state: 'visible' }); };
const expand = async () => { await page.locator('#comment-panel summary').click(); await page.locator('#shop-comments iframe').waitFor(); };
const frameParams = async () => new URL(await page.locator('#shop-comments iframe').getAttribute('src')).searchParams;
const sendMessage = async (message, source = 'current', origin = 'https://giscus.app') => page.evaluate(({ message, source, origin }) => {
  const frame = document.querySelector('#shop-comments iframe');
  window.dispatchEvent(new MessageEvent('message', { origin, source: source === 'current' ? frame.contentWindow : source === 'old' ? window.previousTestFrame : null, data: { giscus: message } }));
}, { message, source, origin });
try {
  // Confirm the actual deployed collection has no invented author records.
  await page.goto(base); await ready();
  assert.equal(await page.locator('#journal-publisher').isVisible(), false);
  const realCollection = await page.evaluate(async () => (await fetch('data/public-journal.json')).json());
  assert.deepEqual(realCollection.entries, []);
  assert.equal(await page.locator('#public-journal').isVisible(), false);

  // Public fixtures are intercepted in the browser; no test data is published.
  await context.route('**/data/public-journal.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(publicFixture) }));
  await page.evaluate(journal => localStorage.setItem('tokyo-coffee-journal-v1', JSON.stringify(journal)), privateJournal);
  await page.goto(base + '?editor=1#notebook'); await ready();
  await page.locator('#public-journal').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#public-journal-grid .public-entry').count(), 2);
  assert.equal(await page.locator('#public-journal-grid .public-entry').first().getAttribute('data-public-id'), 'cafe-012--2026-10-11');
  assert.equal(await page.locator('#public-journal-grid script').count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.equal(await page.locator('#visited-total').innerText(), '1');
  assert.equal(await page.locator('.main-nav a:visible').count(), 5);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('tokyo-coffee-journal-v1')));
  await page.locator('#journal-publisher summary').click();
  assert.equal(await page.locator('#publisher-candidates input:checked').count(), 0);
  assert.equal(await page.locator('#export-public-journal').isDisabled(), true);
  await page.locator('#publisher-candidates input[value="cafe-012"]').check();
  assert.equal(await page.locator('#publisher-preview .public-entry').count(), 1);
  assert.equal(await page.locator('#publisher-preview img[src="x"]').count(), 0);
  assert.match(await page.locator('#publisher-preview').innerText(), /<img src=x/);
  const downloadPromise = page.waitForEvent('download'); await page.locator('#export-public-journal').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'tokyo-coffee-public-notes.json');
  const selection = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.deepEqual(Object.keys(selection).sort(), ['author', 'entries', 'version']);
  assert.equal(selection.entries.length, 1); assert.equal(selection.entries[0].shopId, 'cafe-012');
  assert.equal(selection.entries[0].visited, true);
  assert.doesNotMatch(JSON.stringify(selection), /這篇測試筆記不公開/);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('tokyo-coffee-journal-v1'))), before);
  await page.locator('#journal-publisher').screenshot({ path: `${output}/author-selection.png` });
  await page.locator('#public-journal').screenshot({ path: `${output}/public-field-notes.png` });

  await open('cafe-012');
  assert.equal(await page.locator('.shop-public-entry').count(), 2);
  assert.equal(new URL(page.url()).searchParams.get('shop'), 'cafe-012');
  await expand();
  const first = await frameParams();
  for (const [key, value] of Object.entries({ repo: 'herointene/tokyo-cafe-pilgrimage', repoId: 'R_kgDOVE4fkA', categoryId: 'DIC_kwDOVE4fkM4DID3c', term: 'tokyo-cafe:cafe-012', strict: '1', reactionsEnabled: '0', emitMetadata: '1', inputPosition: 'top', theme: 'noborder_light' })) assert.equal(first.get(key), value, key);
  assert.equal(new URL(first.get('origin')).searchParams.get('shop'), 'cafe-012');
  assert.equal(new URL(first.get('origin')).searchParams.get('editor'), '1');
  await sendMessage({ resizeHeight: 333 }); assert.equal(await page.locator('.giscus-frame').evaluate(frame => frame.style.height), '333px');
  await sendMessage({ resizeHeight: 400 }, 'none'); assert.equal(await page.locator('.giscus-frame').evaluate(frame => frame.style.height), '333px');
  await page.evaluate(() => { window.previousTestFrame = document.querySelector('.giscus-frame').contentWindow; });
  await page.keyboard.press('Escape'); await open('cafe-043'); await expand();
  assert.equal((await frameParams()).get('term'), 'tokyo-cafe:cafe-043');
  assert.equal(await page.locator('.shop-public-entry').count(), 0);
  const fallback = await page.locator('#github-discussion-link').getAttribute('href');
  await sendMessage({ discussion: { url: 'https://github.com/herointene/tokyo-cafe-pilgrimage/discussions/999' } }, 'old');
  assert.equal(await page.locator('#github-discussion-link').getAttribute('href'), fallback);
  await sendMessage({ discussion: { url: 'https://example.com/untrusted' } });
  assert.equal(await page.locator('#github-discussion-link').getAttribute('href'), fallback);
  await sendMessage({ discussion: { url: 'https://github.com/herointene/tokyo-cafe-pilgrimage/discussions/999' } });
  assert.match(await page.locator('#github-discussion-link').getAttribute('href'), /discussions\/999$/);
  await page.keyboard.press('Escape');
  assert.equal(new URL(page.url()).searchParams.get('shop'), null);
  assert.equal(new URL(page.url()).searchParams.get('editor'), '1');

  // A mock login callback is consumed once and never sent to an external service.
  await page.goto(base + '?shop=cafe-012&giscus=test-session-value'); await ready();
  await page.locator('.giscus-frame').waitFor();
  assert.equal(new URL(page.url()).searchParams.has('giscus'), false);
  assert.equal((await frameParams()).get('session'), 'test-session-value');
  assert.equal((await frameParams()).get('term'), 'tokyo-cafe:cafe-012');
  await sendMessage({ error: 'Invalid session' });
  assert.equal((await frameParams()).get('session'), '');
  assert.equal(await page.evaluate(() => localStorage.getItem('giscus-session')), null);
  await page.keyboard.press('Escape'); await open('cafe-043');
  assert.equal(await page.locator('#comment-panel').getAttribute('open'), null);
  await page.keyboard.press('Escape');

  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto(base + '?editor=1#public-journal'); await ready();
    await page.locator('#public-journal').waitFor({ state: 'visible' });
    await page.locator('#journal-publisher summary').click(); await page.locator('#publisher-candidates input[value="cafe-012"]').check();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Public/editor overflow at ${width}`);
    await open('cafe-012'); await expand();
    assert.equal(await page.locator('#shop-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true, `Public/comments dialog overflow at ${width}`);
    if (width === 390) {
      await page.locator('#comment-panel').screenshot({ path: `${output}/mobile-comments.png` });
      await page.keyboard.press('Escape'); await page.locator('#public-journal').screenshot({ path: `${output}/mobile-public-field-notes.png` });
    } else await page.keyboard.press('Escape');
  }
  // Load the actual guest widget to verify app access, repo/category resolution and reader login UI.
  mocked = false;
  await page.goto(base + '?shop=cafe-012'); await ready(); await expand();
  await page.locator('.giscus-frame').scrollIntoViewIfNeeded();
  const widget = page.frameLocator('#shop-comments iframe');
  await widget.getByText('用 GitHub 登入', { exact: true }).waitFor({ timeout: 30000 });
  assert.doesNotMatch(await widget.locator('body').innerText(), /giscus is not installed|無法載入討論|Bad credentials|Repository not found/i);
  await page.locator('#comment-panel').screenshot({ path: `${output}/live-guest-comments.png` });
  assert.deepEqual(errors, []);
  console.log('PASS: selected export privacy, non-destructive publication, escaped public prose, per-shop guest comments, trusted metadata, login return and 320–1440px public/editor layouts.');
} finally { await browser.close(); }
