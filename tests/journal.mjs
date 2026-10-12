import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.SITE_URL||'http://127.0.0.1:4177/';
const output=process.env.SCREENSHOT_DIR||'test-results/journal';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Tokyo',reducedMotion:'no-preference',acceptDownloads:true});
const page=await context.newPage();const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(base))errors.push(`${r.status()} ${r.url()}`);});
const count=async n=>page.waitForFunction(value=>document.querySelector('#results-count b')?.textContent===String(value),n);
const scroll=async selector=>{await page.locator(selector).evaluate(el=>el.scrollIntoView({behavior:'instant',block:'start'}));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
const reset=async()=>{await page.goto(base);await count(69);};
try {
  // Existing stamps and saved places survive the richer notebook migration.
  await page.goto(base);await page.evaluate(()=>localStorage.setItem('tokyo-coffee-journal-v1',JSON.stringify({saved:['cafe-012'],visited:['cafe-043']})));
  await reset();assert.equal(await page.locator('#nav-saved').innerText(),'1');assert.equal(await page.locator('#visited-total').innerText(),'1');
  await page.evaluate(()=>localStorage.removeItem('tokyo-coffee-journal-v1'));await reset();
  const cover = async () => {
    await page.waitForFunction(()=>document.querySelectorAll('.cover-photo').length===3 && [...document.querySelectorAll('.cover-photo img')].every(i=>i.complete&&i.naturalWidth>0));
    const result = await page.evaluate(()=>{
      const shops=new Map(window.CAFE_DATA.shops.map(s=>[s.id,s]));
      const figures=[...document.querySelectorAll('[data-cover-id]')];
      return {ids:figures.map(f=>f.dataset.coverId),provenance:figures.every(f=>{
        const s=shops.get(f.dataset.coverId),image=f.querySelector('img'),credit=f.querySelector('.cover-credit');
        return s && image.getAttribute('src')===s.image && image.alt===s.imageAlt && credit.getAttribute('href')===s.imageSource && credit.textContent.includes(s.imageCredit) && f.querySelector('.cover-name span').textContent===s.name;
      })};
    });
    assert.equal(new Set(result.ids).size,3);assert.equal(result.provenance,true);return result.ids;
  };
  let previousCover=await cover();
  const savedCoverId=previousCover[0];
  await page.locator(`[data-cover-id="${savedCoverId}"] .bookmark-button`).click();
  assert.equal(await page.locator('#nav-saved').innerText(),'1');
  assert.equal(await page.evaluate(()=>document.activeElement.closest('[data-cover-id]')?.dataset.coverId),savedCoverId);
  await page.locator('#shuffle-cover').focus();await page.keyboard.press('Enter');
  let nextCover=await cover();assert.ok(nextCover.every(id=>!previousCover.includes(id)));
  assert.equal(await page.evaluate(id=>JSON.parse(localStorage.getItem('tokyo-coffee-journal-v1')).saved.includes(id),savedCoverId),true);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'shuffle-cover');
  previousCover=nextCover;
  for(let i=0;i<3;i++) {await page.reload();await count(69);nextCover=await cover();assert.ok(nextCover.every(id=>!previousCover.includes(id)));previousCover=nextCover;}
  await page.locator('.cover-photo-open').first().click();await page.locator('#shop-dialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#dialog-title').innerText(),await page.evaluate(id=>window.CAFE_DATA.shops.find(s=>s.id===id).name,previousCover[0]));await page.keyboard.press('Escape');
  await page.evaluate(()=>{sessionStorage.setItem('tokyo-coffee-cover-v1','invalid json');localStorage.removeItem('tokyo-coffee-journal-v1');});await reset();await cover();
  await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`${output}/desktop-cover.png`});
  assert.equal(await page.locator('#area-index button').count(),16);
  assert.equal(await page.locator('.main-nav a:visible').count(),4);
  assert.equal(await page.locator('#walks, #area-featured').count(),0);
  assert.doesNotMatch(await page.locator('main').innerText(),/CHAPTER|BONUS PAGES|用户更正|已更正|原始目錄/);
  const publishedNotes=await page.evaluate(()=>window.CAFE_DATA.shops.map(s=>[s.sourceNote,s.note].filter(Boolean).join(' ')).join(' '));
  assert.doesNotMatch(publishedNotes,/用户更正|用戶更正|已更正|原始目錄|原表店名|gorp\.jp/);
  assert.equal(await page.locator('.shop-card .shop-photo img').count(),6);
  assert.equal(await page.locator('#browse-options').getAttribute('open'),null);
  assert.equal(await page.locator('#sort').inputValue(),'random');
  await scroll('#directory');await page.locator('.shop-card img').first().evaluate(image=>image.decode());
  await page.screenshot({path:`${output}/photo-directory.png`});
  const initialOrder=await page.locator('.shop-card').evaluateAll(cards=>cards.map(c=>c.dataset.id));
  await page.locator('#load-more').click();assert.deepEqual(await page.locator('.shop-card').evaluateAll(cards=>cards.slice(0,6).map(c=>c.dataset.id)),initialOrder);
  await page.locator('#browse-options summary').click();await page.locator('#sort').selectOption('page');
  assert.equal(await page.locator('.shop-card').first().getAttribute('data-id'),'cafe-001');
  await page.locator('#sort').selectOption('random');assert.deepEqual(await page.locator('.shop-card').evaluateAll(cards=>cards.map(c=>c.dataset.id)),initialOrder);
  await page.locator('#sort').focus();await page.keyboard.press('Escape');assert.equal(await page.locator('#browse-options').getAttribute('open'),null);
  assert.equal(await page.locator('.card-links').first().isVisible(),false);
  await page.locator('[data-view="list"]').click();assert.equal(await page.locator('.card-links').first().isVisible(),true);
  await page.locator('[data-view="grid"]').click();assert.deepEqual(await page.locator('.shop-card').evaluateAll(cards=>cards.map(c=>c.dataset.id)),initialOrder);
  while(await page.locator('#load-more-wrap').isVisible()) await page.locator('#load-more').click();
  assert.equal(await page.locator('.shop-card').count(),69);
  const imageChecks=await page.evaluate(async()=>{
    const result=[];
    for(const s of window.CAFE_DATA.shops){const r=await fetch(s.image);result.push({id:s.id,status:r.status,type:r.headers.get('content-type'),bytes:(await r.arrayBuffer()).byteLength});}
    return result;
  });
  assert.equal(imageChecks.filter(r=>r.status!==200||!r.type.startsWith('image/')||r.bytes<1000).length,0,JSON.stringify(imageChecks.filter(r=>r.status!==200)));

  await reset();await page.locator('#neighborhoods summary').click();await page.locator('#area-index [data-area="ginza"]').click();await count(10);
  assert.equal(await page.locator('#selected-area').isVisible(),true);
  assert.match(page.url(),/area=ginza/);assert.equal(await page.locator('#map-area').inputValue(),'ginza');
  await scroll('#coffee-map');await page.waitForSelector('.coffee-pin');assert.equal(await page.locator('.coffee-pin').count(),10);
  await page.locator('#map-shop-list [data-map-shop="cafe-033"]').click();await page.locator('.map-popup').waitFor();
  assert.match(await page.locator('.map-popup').innerText(),/TORAYA GINZA/);
  await page.locator('[data-popup-shop="cafe-033"]').click();await page.locator('#shop-dialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#shop-dialog .detail-photo img').evaluate(img=>img.naturalWidth>0),true);await page.keyboard.press('Escape');
  await page.locator('#map-area').selectOption('asakusa');await count(5);assert.equal(await page.locator('.coffee-pin').count(),5);
  await page.screenshot({path:`${output}/neighborhood-map.png`});

  await reset();await page.locator('#search').fill('RBL');await count(1);await scroll('#directory');
  await page.locator('#shop-grid [data-action="visited"]').click();
  const stamp=page.locator('#shop-grid .ink-stamp');await stamp.waitFor();
  assert.equal(await stamp.evaluate(el=>getComputedStyle(el).animationName),'stamp-land');
  assert.ok(await stamp.evaluate(el=>el.getBoundingClientRect().width)>70);
  await page.screenshot({path:`${output}/stamp-in-action.png`});
  await stamp.evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
  assert.equal(await page.locator('#visited-total').innerText(),'1');
  await page.locator('#shop-grid .details-button').click();
  await page.locator('.journal-form [name="drink"]').fill('衣索比亞手沖');
  await page.locator('.journal-form [name="note"]').fill('窗邊的光很好，這一杯想再喝一次。');
  // A bookmark or stamp toggle must not destroy an unfinished field note.
  await page.locator('#dialog-content .detail-actions [data-action="saved"]').click();
  assert.equal(await page.locator('.journal-form [name="note"]').inputValue(),'窗邊的光很好，這一杯想再喝一次。');
  await page.locator('.journal-form button[type="submit"]').click();
  assert.match(await page.locator('.journal-save-status').innerText(),/已寫進手帳/);await page.keyboard.press('Escape');
  await page.reload();await count(1);
  await scroll('#notebook');await page.locator('[data-passport="visited"]').click();
  assert.match(await page.locator('#passport-content').innerText(),/衣索比亞手沖/);
  assert.match(await page.locator('#passport-content').innerText(),/窗邊的光很好/);
  assert.equal(await page.locator('#passport-content .ink-stamp').count(),1);
  await page.screenshot({path:`${output}/coffee-passport.png`});
  await page.locator('[data-passport="visited"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('[data-passport="notes"]').getAttribute('aria-selected'),'true');
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-journal').click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/^tokyo-coffee-journal-.*\.json$/);

  await reset();await scroll('#transit');await page.locator('#train-line').selectOption('G');
  assert.equal(await page.locator('[data-train-station]').count(),9);
  await page.locator('[data-train-station="三越前"]').focus();await page.keyboard.press('Enter');await count(2);
  assert.match(page.url(),/station=/);
  await scroll('#transit');await page.locator('#train-line').selectOption('TY');await page.locator('#browse-line').click();
  const expected=await page.evaluate(()=>window.CAFE_DATA.shops.filter(s=>s.lines.includes('TY')).length);await count(expected);
  await scroll('#transit');await page.locator('#train-line').selectOption('G');await page.screenshot({path:`${output}/train-reference.png`});
  await page.locator('#full-routes summary').click();
  await page.locator('.transit-reference-image').first().scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>[...document.querySelectorAll('.transit-reference-image img')].every(img=>img.complete&&img.naturalWidth>0));
  await page.locator('[data-reference="metro-map"]').click();await page.locator('#reference-dialog').waitFor({state:'visible'});
  await page.locator('#reference-plus').click();assert.equal(await page.locator('#reference-zoom').innerText(),'150%');
  assert.match(await page.locator('#reference-source').getAttribute('href'),/tokyometro/);await page.keyboard.press('Escape');

  for(const width of [768,414,390,360,320]) {
    await page.setViewportSize({width,height:900});await reset();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Page overflow at ${width}`);
    if(width===390){await page.screenshot({path:`${output}/mobile-cover.png`});await scroll('#directory');await page.screenshot({path:`${output}/mobile-photos.png`});await scroll('#coffee-map');await page.screenshot({path:`${output}/mobile-map.png`});await scroll('#notebook');await page.screenshot({path:`${output}/mobile-passport.png`});}
    await page.locator('[data-view="list"]').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`List overflow at ${width}`);
    await page.locator('#shop-grid .details-button').first().click();assert.equal(await page.locator('#shop-dialog').evaluate(dialog=>dialog.scrollWidth<=dialog.clientWidth),true,`Dialog overflow at ${width}`);await page.keyboard.press('Escape');
    await page.locator('[data-view="grid"]').click();
  }
  await page.goto(base+'?route=ginza');await count(10);assert.match(page.url(),/area=ginza/);
  await page.goto(base+'?route=constructor&area=unknown&kind=bad');await count(69);
  await page.locator('#search').fill('RBL');await page.locator('#shop-grid .details-button').click();
  assert.doesNotMatch(await page.locator('#dialog-content').innerText(),/更正|原始目錄|原書頁碼|查核|校對/);await page.keyboard.press('Escape');
  await page.locator('#about-button').click();assert.doesNotMatch(await page.locator('#about-dialog').innerText(),/Excel|目錄來自你|更正|生成|第二版/);await page.keyboard.press('Escape');
  // Respect the OS motion preference while keeping the physical stamp visible.
  await page.emulateMedia({reducedMotion:'reduce'});await reset();await page.locator('#search').fill('RBL');await page.locator('#shop-grid [data-action="visited"]').click();
  assert.equal(await page.locator('#shop-grid .ink-stamp').count(),0); // Undo existing stamp first.
  await page.locator('#shop-grid [data-action="visited"]').click();assert.equal(await page.locator('#shop-grid .ink-stamp').evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.deepEqual(errors,[]);
  console.log('PASS: changing random covers and photo credits, stable shuffled browsing, gallery/list views, 69 photos, 16 neighborhoods, maps, stamps, journal preservation, railway references, keyboard access, reduced motion and 320–1440px layouts.');
} finally {await browser.close();}
