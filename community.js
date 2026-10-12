(() => {
  'use strict';
  const api = window.CoffeeJournal;
  if (!api) return;
  const { byId, shops, areas, escape, icon } = api;
  const $ = selector => document.querySelector(selector);
  const repository = 'herointene/tokyo-cafe-pilgrimage';
  const github = `https://github.com/${repository}`;
  const site = 'https://blog.wulited.com/tokyo-cafe-pilgrimage/';
  const giscusOrigin = 'https://giscus.app';
  const sessionKey = 'giscus-session';
  const callback = new URL(location.href).searchParams.get('giscus');
  let session = '', activeFrame = null, activeShop = null, recoveryUsed = false, resumeComments = !!callback;
  let published = { version: 1, author: { name: 'herointene', url: 'https://github.com/herointene' }, entries: [] };
  let publicLoaded = false, publicFailed = false, publicLimit = 6;
  const selections = new Set();

  // The widget URL and message fields follow the official giscus client protocol.
  try {
    const saved = JSON.parse(localStorage.getItem(sessionKey) || '""');
    session = typeof saved === 'string' ? saved : '';
    if (callback) { session = callback; localStorage.setItem(sessionKey, JSON.stringify(session)); }
  } catch { session = callback || ''; }
  if (callback) {
    const url = new URL(location.href); url.searchParams.delete('giscus');
    history.replaceState(null, '', url);
  }

  function validDate(value) {
    if (value === '') return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0,10) === value;
  }
  function validatePublic(raw) {
    if (raw?.version !== 1 || !Array.isArray(raw.entries) || typeof raw.author?.name !== 'string' || !raw.author.name.trim() || raw.author.name.length > 60 || !/^https:\/\/github\.com\/[A-Za-z0-9-]+\/?$/.test(raw.author.url)) throw new Error('Invalid public journal');
    const ids = new Set();
    for (const entry of raw.entries) {
      if (!entry || typeof entry.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(entry.id) || ids.has(entry.id) || !byId.has(entry.shopId) || typeof entry.date !== 'string' || !validDate(entry.date) || typeof entry.visited !== 'boolean' || typeof entry.drink !== 'string' || entry.drink.length > 100 || typeof entry.note !== 'string' || entry.note.length > 800) throw new Error('Invalid public entry');
      ids.add(entry.id);
    }
    return { version:1, author:{name:raw.author.name.trim(),url:raw.author.url}, entries:raw.entries.map(entry=>({id:entry.id,shopId:entry.shopId,date:entry.date,drink:entry.drink,note:entry.note,visited:entry.visited})).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)) };
  }
  const shopLink = id => `${site}?shop=${encodeURIComponent(id)}`;
  function publicStamp(entry) {
    return entry.visited ? `<span class="ink-stamp public-ink-stamp" aria-label="已巡禮${entry.date?' '+escape(entry.date):''}"><span class="stamp-orbit">TOKYO COFFEE PILGRIMAGE</span>${icon('cup')}<strong>巡禮済</strong><small>${entry.date?escape(entry.date.replaceAll('-','.')):'一杯ずつ、街を歩く'}</small></span>` : '';
  }
  function publicCard(entry, author = published.author) {
    const shop = byId.get(entry.shopId);
    return `<article class="public-entry" data-public-id="${escape(entry.id)}"><figure class="public-entry-photo"><button type="button" data-action="details" data-id="${shop.id}" aria-label="翻開 ${escape(shop.name)}"><img src="${escape(shop.image)}" alt="${escape(shop.imageAlt)}" width="900" height="600" loading="lazy"></button>${publicStamp(entry)}<figcaption><a href="${escape(shop.imageSource)}" target="_blank" rel="noopener noreferrer">${escape(shop.imageCredit)} ↗</a></figcaption></figure><div class="public-entry-body"><p class="public-entry-date">${entry.date?escape(entry.date.replaceAll('-','.')):'旅途筆記'} <span>${escape(areas.get(shop.areaId).name)}</span></p><h3 lang="ja"><button type="button" data-action="details" data-id="${shop.id}">${escape(shop.name)}</button></h3>${entry.drink?`<p class="public-entry-drink">${icon('cup')} ${escape(entry.drink)}</p>`:''}${entry.note?`<p class="public-entry-note">${escape(entry.note)}</p>`:''}<div class="public-entry-footer"><a href="${escape(author.url)}" target="_blank" rel="noopener noreferrer">${escape(author.name)}</a><a href="${shopLink(shop.id)}">這一站的店鋪與留言 ↗</a></div></div></article>`;
  }
  function renderPublic() {
    const hasEntries = published.entries.length > 0;
    $('#public-journal').hidden = !hasEntries;
    $('#public-journal-nav').hidden = !hasEntries;
    $('#public-journal-byline').textContent = `${published.author.name} 的咖啡旅途`;
    $('#public-journal-grid').innerHTML = published.entries.slice(0,publicLimit).map(entry=>publicCard(entry)).join('');
    $('#public-journal-more').hidden = published.entries.length <= publicLimit;
    renderShopNotes();
  }
  function renderShopNotes() {
    const id = api.getOpenShop();
    if (!id) return;
    const entries = published.entries.filter(entry=>entry.shopId===id);
    $('#shop-public-notes').innerHTML = entries.length ? entries.map(entry=>`<article class="shop-public-entry"><div><span>${entry.date?escape(entry.date.replaceAll('-','.')):'旅途筆記'}</span><a href="${escape(published.author.url)}" target="_blank" rel="noopener noreferrer">${escape(published.author.name)}</a>${entry.visited?'<span class="public-visit-label">巡禮済</span>':''}</div>${entry.drink?`<p class="public-entry-drink">${icon('cup')} ${escape(entry.drink)}</p>`:''}${entry.note?`<p class="public-entry-note">${escape(entry.note)}</p>`:''}</article>`).join('') : `<p class="public-notes-empty">${publicFailed?'公開手帖暫時無法載入，稍後再試。':publicLoaded?'這一站的公開手帖，還在等第一頁。':'正在翻開旅途手帖…'}</p>`;
  }

  function candidates() {
    const journal = api.getJournal();
    return shops.filter(shop=>journal.visited.includes(shop.id)||journal.entries[shop.id]?.note||journal.entries[shop.id]?.drink).map(shop=>{
      const record = journal.entries[shop.id] || {};
      const date = record.date || '';
      return {id:`${shop.id}--${date||'note'}`,shopId:shop.id,date,drink:record.drink||'',note:record.note||'',visited:journal.visited.includes(shop.id)};
    });
  }
  function author() {
    return {name:$('#publisher-author').value.trim(),url:published.author.url};
  }
  function renderSelection() {
    const selected = candidates().filter(entry=>selections.has(entry.shopId));
    $('#publisher-status').textContent = selected.length ? `已選 ${selected.length} 篇。以下是公開後的樣子。` : '目前未選取任何紀錄。';
    $('#publisher-preview').innerHTML = selected.map(entry=>publicCard(entry,{...author(),name:author().name||'手帳署名'})).join('');
    $('#export-public-journal').disabled = !selected.length || !author().name || !publicLoaded;
  }
  function renderPublisher() {
    if (!api.editorMode) return;
    $('#journal-publisher').hidden = false;
    const entries = candidates();
    const available = new Set(entries.map(entry=>entry.shopId));
    for (const id of selections) if (!available.has(id)) selections.delete(id);
    $('#publisher-candidates').innerHTML = entries.length ? entries.map(entry=>{
      const shop = byId.get(entry.shopId);
      return `<label class="publisher-candidate"><input type="checkbox" value="${shop.id}" ${selections.has(shop.id)?'checked':''}><span><strong lang="ja">${escape(shop.name)}</strong><small>${entry.date?escape(entry.date.replaceAll('-','.')):'日期未記錄'}${entry.drink?' · '+escape(entry.drink):''}</small>${entry.note?`<span>${escape(entry.note)}</span>`:''}</span></label>`;
    }).join('') : '<p class="public-notes-empty">先在私人手帳裡寫下飲品、筆記，或蓋上一枚巡禮章，再挑選想分享的頁面。</p>';
    renderSelection();
  }
  $('#publisher-candidates').addEventListener('change',event=>{
    const checkbox=event.target.closest('input[type="checkbox"]');if(!checkbox)return;
    checkbox.checked?selections.add(checkbox.value):selections.delete(checkbox.value);renderSelection();
  });
  $('#publisher-author').addEventListener('input',renderSelection);
  $('#export-public-journal').addEventListener('click',()=>{
    const payload={version:1,author:author(),entries:candidates().filter(entry=>selections.has(entry.shopId))};
    try { validatePublic(payload); } catch { $('#publisher-status').textContent='請確認署名與巡禮日期，再下載選稿。';return; }
    if (!payload.entries.length) return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='tokyo-coffee-public-notes.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    $('#publisher-status').textContent=`已下載 ${payload.entries.length} 篇公開選稿。由倉庫管理員發佈後，讀者才會看見。`;
  });
  $('#public-journal-more').addEventListener('click',()=>{publicLimit+=6;renderPublic();});

  function discussionSearch(id) {
    return `${github}/discussions?discussions_q=${encodeURIComponent('in:title "tokyo-cafe:'+id+'"')}`;
  }
  function removeFrame() {
    activeFrame?.remove();activeFrame=null;
  }
  function mountComments(id) {
    if (!byId.has(id)) return;
    removeFrame();activeShop=id;
    const shop=byId.get(id);
    const origin=new URL(location.href);origin.search='';origin.searchParams.set('shop',id);if(api.editorMode)origin.searchParams.set('editor','1');origin.hash='shop-comments';
    const params=new URLSearchParams({origin:origin.href,session,repo:repository,repoId:'R_kgDOVE4fkA',category:'Announcements',categoryId:'DIC_kwDOVE4fkM4DID3c',term:`tokyo-cafe:${id}`,strict:'1',reactionsEnabled:'0',emitMetadata:'1',inputPosition:'top',theme:'noborder_light',description:`${shop.name} · ${areas.get(shop.areaId).name}`,backLink:shopLink(id)});
    const frame=document.createElement('iframe');activeFrame=frame;
    frame.className='giscus-frame';frame.title=`${shop.name} 的公開留言`;frame.loading='lazy';frame.allow='clipboard-write';frame.setAttribute('scrolling','no');frame.src=`${giscusOrigin}/zh-TW/widget?${params}`;
    frame.addEventListener('load',()=>{if(activeFrame===frame&&$('#comment-status').textContent==='正在翻開店鋪留言…')$('#comment-status').textContent='';});
    $('#comment-status').textContent='正在翻開店鋪留言…';$('#shop-comments').appendChild(frame);
  }
  function prepareShop(id) {
    removeFrame();activeShop=id;recoveryUsed=false;
    $('#comment-panel').open=false;$('#comment-status').textContent='';$('#github-discussion-link').href=discussionSearch(id);
    renderShopNotes();
    if(resumeComments){resumeComments=false;$('#comment-panel').open=true;mountComments(id);$('#comment-panel').scrollIntoView({behavior:'instant',block:'start'});}
  }
  $('#comment-panel').addEventListener('toggle',()=>{
    const id=api.getOpenShop();if($('#comment-panel').open&&id&&!activeFrame){mountComments(id);$('#comment-panel').scrollIntoView({behavior:'instant',block:'start'});}
  });
  window.addEventListener('message',event=>{
    if(event.origin!==giscusOrigin||!activeFrame||event.source!==activeFrame.contentWindow||!event.data?.giscus)return;
    const message=event.data.giscus;
    if(Number.isFinite(message.resizeHeight)&&message.resizeHeight>0&&message.resizeHeight<50000)activeFrame.style.height=`${message.resizeHeight}px`;
    if(message.signOut){session='';try{localStorage.removeItem(sessionKey);}catch{};mountComments(activeShop);}
    if(message.discussion?.url){
      try {
        const url=new URL(message.discussion.url);
        if(url.origin==='https://github.com'&&/^\/herointene\/tokyo-cafe-pilgrimage\/discussions\/\d+$/.test(url.pathname))$('#github-discussion-link').href=url.href;
      }catch{}
    }
    if(typeof message.error==='string'){
      if(/Bad credentials|Invalid session|Invalid state value|State has expired|Unauthenticated/i.test(message.error)&&session&&!recoveryUsed){recoveryUsed=true;session='';try{localStorage.removeItem(sessionKey);}catch{};mountComments(activeShop);}
      else if(!/Discussion not found/i.test(message.error))$('#comment-status').textContent='留言暫時無法載入，可在 GitHub 閱讀留言。';
      else $('#comment-status').textContent='還沒有留言，寫下這一杯的第一段心得吧。';
    }
  });
  document.addEventListener('coffee:detail',event=>prepareShop(event.detail.shopId));
  document.addEventListener('coffee:detail-close',()=>{removeFrame();activeShop=null;$('#comment-panel').open=false;});
  document.addEventListener('coffee:render',renderPublisher);
  if(api.getOpenShop())prepareShop(api.getOpenShop());
  renderPublisher();
  fetch('data/public-journal.json',{cache:'no-cache'}).then(response=>{if(!response.ok)throw new Error('Public journal unavailable');return response.json();}).then(raw=>{
    published=validatePublic(raw);publicLoaded=true;if($('#publisher-author').value==='herointene')$('#publisher-author').value=published.author.name;renderPublic();renderPublisher();
  }).catch(()=>{publicFailed=true;renderShopNotes();if(api.editorMode)$('#publisher-status').textContent='公開手帖暫時無法讀取，請稍後再準備選稿。';});
})();
