(() => {
  'use strict';
  const data = window.CAFE_DATA;
  if (!data?.shops) return;
  const shops = data.shops;
  const byId = new Map(shops.map(s => [s.id, s]));
  const areas = new Map(data.areas.map(a => [a.id, a]));
  const lines = new Map(data.lines.map(l => [l.id, l]));
  const $ = selector => document.querySelector(selector);
  const storageKey = 'tokyo-coffee-journal-v1';
  const kinds = { cafe: '咖啡館', kissaten: '喫茶店', sweets: '甜點時間' };
  const linkLabels = { website: '官方網站', instagram: '官方 Instagram', social: '官方社群', facility: '設施官方介紹', blog: '官方部落格', unconfirmed: '店鋪資訊' };
  const photoLabels = { interior: '店內風景', exterior: '門面風景', menu: '這家店的一杯', collage: '店鋪風景', food: '餐點與甜品' };
  const routes = { ginza: { name: '銀座，喫茶的老時光', ids: [33,35,44,45,53,66] }, east: { name: '藏前與淺草，路地裡', ids: [18,31,32,43,49,65] }, aoyama: { name: '青山，綠意與香氣', ids: [4,10,23,26,34] } };
  for (const r of Object.values(routes)) r.ids = new Set(r.ids.map(n => `cafe-${String(n).padStart(3,'0')}`));
  const wards = [...new Set(shops.map(s => s.ward))];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const external = (url, text, cls = '') => `<a class="${cls}" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(text)} ${icon('external')}</a>`;
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let limit = 12, dialogShop = null, returnFocus = null, toastTimer, storageAvailable = true, passportTab = 'saved';

  function cleanEntries(raw) {
    const entries = {};
    if (!raw || typeof raw !== 'object') return entries;
    for (const [id, record] of Object.entries(raw)) {
      if (!byId.has(id) || !record || typeof record !== 'object') continue;
      const text = (key, max) => typeof record[key] === 'string' ? record[key].slice(0,max) : '';
      entries[id] = { date: /^\d{4}-\d{2}-\d{2}$/.test(record.date) ? record.date : '', drink: text('drink',100), note: text('note',800), updatedAt: text('updatedAt',40) };
    }
    return entries;
  }
  function readJournal() {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const valid = list => new Set((Array.isArray(list) ? list : []).filter(id => byId.has(id)));
      return { saved: valid(raw?.saved), visited: valid(raw?.visited), entries: cleanEntries(raw?.entries) };
    } catch { return { saved: new Set(), visited: new Set(), entries: {} }; }
  }
  let journal = readJournal();
  if (journal.visited.size && !journal.saved.size) passportTab = 'visited';
  function saveJournal() {
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 2, saved: [...journal.saved], visited: [...journal.visited], entries: journal.entries })); storageAvailable = true; }
    catch { storageAvailable = false; }
  }
  function showToast(message) {
    $('#toast').textContent = message; $('#toast').classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3000);
  }
  function readFilters() {
    const p = new URLSearchParams(location.search);
    const known = (key, choices, fallback) => choices.includes(p.get(key)) ? p.get(key) : fallback;
    const stations = [...new Set(shops.flatMap(s => s.stationLines.map(st => st.station)))];
    return { q:(p.get('q')||'').slice(0,150), kind:known('kind',['all',...Object.keys(kinds)],'all'), ward:known('ward',wards,''), area:known('area',[...areas.keys()],''), line:known('line',[...lines.keys()],''), station:known('station',stations,''), status:known('status',['all','saved','visited','unvisited'],'all'), sort:known('sort',['page','ward','name'],'page'), view:known('view',['grid','list'],'grid'), route:known('route',Object.keys(routes),'') };
  }
  let state = readFilters();
  function writeFilters() {
    const p = new URLSearchParams();
    for (const [key,value] of Object.entries(state)) if (value && value !== ({kind:'all',status:'all',sort:'page',view:'grid'})[key]) p.set(key,value);
    history.replaceState(null,'',`${location.pathname}${p.size?'?'+p:''}${location.hash}`);
  }
  function normalize(value) {
    return String(value).normalize('NFKC').toLocaleLowerCase('ja').replace(/澀谷/g,'渋谷').replace(/藏前/g,'蔵前').replace(/淺草/g,'浅草').replace(/惠比壽/g,'恵比寿').replace(/學藝大學/g,'学芸大学').replace(/亀戶|龜戶/g,'亀戸').replace(/下北澤/g,'下北沢').replace(/高圓寺/g,'高円寺').replace(/御茶之水/g,'御茶ノ水');
  }
  const searchText = new Map(shops.map(s => [s.id,normalize([s.name,s.ward,s.neighborhood,s.station,s.description,s.address,areas.get(s.areaId)?.name,...s.lines.map(id=>lines.get(id)?.name)].join(' '))]));
  function filteredShops() {
    const tokens = normalize(state.q).trim().split(/\s+/).filter(Boolean);
    const result = shops.filter(s => (state.kind==='all'||state.kind===s.kind) && (!state.ward||state.ward===s.ward) && (!state.area||state.area===s.areaId) && (!state.line||s.lines.includes(state.line)) && (!state.station||s.stationLines.some(st=>st.station===state.station)) && (!state.route||routes[state.route].ids.has(s.id)) && (state.status!=='saved'||journal.saved.has(s.id)) && (state.status!=='visited'||journal.visited.has(s.id)) && (state.status!=='unvisited'||!journal.visited.has(s.id)) && tokens.every(t=>searchText.get(s.id).includes(t)));
    if (state.sort==='ward') result.sort((a,b)=>a.ward.localeCompare(b.ward,'ja')||a.page-b.page);
    if (state.sort==='name') result.sort((a,b)=>a.name.localeCompare(b.name,'ja'));
    return result;
  }
  function bookmarkButton(shop, withText = false) {
    const saved = journal.saved.has(shop.id);
    return `<button type="button" class="bookmark-button" data-action="saved" data-id="${shop.id}" aria-pressed="${saved}" aria-label="${escape(shop.name)}：${saved?'取消收藏':'收藏想去'}">${icon('bookmark')}${withText?(saved?'已收藏，取消收藏':'收藏想去的店'):''}</button>`;
  }
  function visitButton(shop) {
    const visited = journal.visited.has(shop.id);
    return `<button type="button" class="visit-button" data-action="visited" data-id="${shop.id}" aria-pressed="${visited}" aria-label="${escape(shop.name)}：${visited?'取消已巡禮':'標記已巡禮'}">${icon('cup')} ${visited?'已蓋章 · 巡禮済':'蓋下巡禮章'}</button>`;
  }
  function stamp(shop, ghost = false) {
    const date = journal.entries[shop.id]?.date;
    return `<span class="ink-stamp${ghost?' stamp-ghost':''}" data-stamp-id="${shop.id}" aria-label="${escape(shop.name)} 已巡禮${date?' '+date:''}"><span class="stamp-orbit">TOKYO COFFEE PILGRIMAGE</span>${icon('cup')}<strong>巡禮済</strong><small>${date?escape(date.replaceAll('-','.')):'一杯ずつ、街を歩く'}</small></span>`;
  }
  function photo(shop, cls = '', stampVisible = true) {
    const detail = cls.includes('detail-photo');
    return `<figure class="shop-photo ${cls}">${detail?'<div class="photo-open">':`<button type="button" class="photo-open" data-action="details" data-id="${shop.id}" aria-label="查看 ${escape(shop.name)} 的照片與店鋪筆記">`}<img src="${escape(shop.image)}" alt="${escape(shop.imageAlt)}" width="900" height="600" loading="lazy" decoding="async"><span class="photo-kind">${photoLabels[shop.imageType]||'店鋪實景'}</span>${detail?'</div>':'</button>'}${stampVisible&&journal.visited.has(shop.id)?stamp(shop):''}<figcaption>${external(shop.imageSource,shop.imageCredit)}</figcaption></figure>`;
  }
  function card(shop) {
    const ordinal=shop.id.slice(-3);
    return `<article class="shop-card${journal.visited.has(shop.id)?' has-visited':''}" data-id="${shop.id}" data-kind="${shop.kind}" aria-labelledby="name-${shop.id}">
      ${photo(shop)}<div class="card-body"><div class="card-top"><span class="category-label"><span class="category-dot" aria-hidden="true"></span>${kinds[shop.kind]} / ${shop.kind==='cafe'?'CAFÉ':shop.kind==='kissaten'?'KISSATEN':'SWEETS'}</span>${bookmarkButton(shop)}</div>
      <div class="card-name-row"><span class="shop-number" aria-hidden="true">${ordinal.slice(1)}</span><h3 id="name-${shop.id}" lang="ja">${escape(shop.name)}</h3></div>
      <p class="card-location">${escape(areas.get(shop.areaId).name)}</p><p class="card-station">${icon('pin')} ${escape(shop.station)} 站</p><p class="card-description">${escape(shop.description)}</p>
      <div class="card-links">${external(shop.infoUrl,linkLabels[shop.linkType])}${external(shop.mapUrl,'Google Maps')}</div><div class="card-bottom">${visitButton(shop)}<button type="button" class="details-button" data-action="details" data-id="${shop.id}" aria-label="查看 ${escape(shop.name)} 的店鋪資訊">寫一頁筆記 ${icon('arrow')}</button></div><div class="card-page"><span>BOOK / P.${String(shop.page).padStart(2,'0')}</span><span>NO. ${ordinal}</span></div></div></article>`;
  }
  function renderAreas() {
    const featuredIds=['ginza','asakusa','aoyama','ueno-yanesen','setagaya','akigawa'];
    $('#area-featured').innerHTML=featuredIds.map((id,i)=>{const area=areas.get(id);const picks=area.shopIds.slice(0,3).map(id=>byId.get(id));return `<button type="button" class="area-card" data-area="${area.id}" style="--area-accent:${area.accent}" aria-label="翻閱${escape(area.name)}，${area.count}家店"><span class="area-card-photos">${picks.map(s=>`<img src="${escape(s.image)}" alt="${escape(s.imageAlt)}" width="450" height="300" loading="lazy">`).join('')}</span><span class="area-card-note"><span class="area-number">AREA ${String(i+1).padStart(2,'0')}</span><strong>${escape(area.name)}</strong><span>${escape(area.subtitle)}</span><span class="area-card-count">${area.count} 家小店 <span aria-hidden="true">↗</span></span></span></button>`;}).join('');
    $('#area-index').innerHTML=data.areas.map(a=>`<button type="button" data-area="${a.id}" aria-pressed="${state.area===a.id}" style="--area-accent:${a.accent}"><span class="area-index-dot"></span><span>${escape(a.name)}</span><b>${a.count}</b></button>`).join('');
    $('#hero-shop-strip').innerHTML=[43,13,53].map(n=>byId.get(`cafe-${String(n).padStart(3,'0')}`)).map(s=>`<button class="hero-polaroid" type="button" data-action="details" data-id="${s.id}"><img src="${escape(s.image)}" alt="${escape(s.imageAlt)}" width="200" height="150"><span>${escape(s.name)}</span></button>`).join('');
  }
  function renderSelectedArea() {
    const area=areas.get(state.area);$('#selected-area').hidden=!area;
    if (!area) return;
    $('#selected-area').innerHTML=`<div><p class="eyebrow">TODAY'S NEIGHBORHOOD / ${escape(area.jaName)}</p><h3>${escape(area.name)}</h3><p>${escape(area.description)}</p></div><span class="neighborhood-sticker" style="--area-accent:${area.accent}"><b>${area.count}</b> COFFEE STOPS</span>`;
  }
  function updateProgress() {
    $('#nav-saved').textContent=journal.saved.size;$('#saved-total').textContent=journal.saved.size;$('#visited-total').textContent=journal.visited.size;
    $('#progress-bar').setAttribute('aria-valuenow',journal.visited.size);$('#progress-fill').style.width=`${journal.visited.size/shops.length*100}%`;$('#progress-fraction').textContent=`${journal.visited.size} / ${shops.length}`;
    $('#progress-caption').textContent=journal.visited.size?'每一枚章，都是一段咖啡回憶。':'每一段旅程，都從第一杯開始。';
  }
  function renderPassport() {
    const notes=shops.filter(s=>journal.entries[s.id]?.note||journal.entries[s.id]?.drink);
    $('#tab-saved-count').textContent=journal.saved.size;$('#tab-visited-count').textContent=journal.visited.size;$('#tab-notes-count').textContent=notes.length;
    document.querySelectorAll('[data-passport]').forEach(b=>{const active=b.dataset.passport===passportTab;b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;});
    const selected=passportTab==='notes'?notes:shops.filter(s=>journal[passportTab].has(s.id));
    $('#passport-content').setAttribute('aria-label',{saved:'想去清單',visited:'巡禮章集',notes:'咖啡筆記'}[passportTab]);
    $('#passport-content').innerHTML=selected.length?`<div class="passport-grid">${selected.map(s=>{const e=journal.entries[s.id]||{};return `<article class="passport-card"><div class="passport-photo">${photo(s,'',true)}</div><div class="passport-entry"><span class="passport-entry-location">${escape(areas.get(s.areaId).name)}</span><h3>${escape(s.name)}</h3>${e.date&&journal.visited.has(s.id)?`<p class="entry-date">${escape(e.date.replaceAll('-','.'))} · 留下了一杯回憶</p>`:''}${e.drink?`<p class="entry-drink">${icon('cup')} ${escape(e.drink)}</p>`:''}<p class="entry-note">${e.note?escape(e.note):journal.visited.has(s.id)?'這枚章的故事，等你寫下。':'先收進手帳，留給下一次小小的出走。'}</p><button type="button" class="text-button" data-action="details" data-id="${s.id}">翻開這頁筆記 ${icon('arrow')}</button></div></article>`;}).join('')}</div>`:`<div class="passport-empty">${stamp(shops[0],true)}<div><h3>${passportTab==='visited'?'第一枚巡禮章，等你蓋下。':passportTab==='notes'?'把那一杯的故事，寫在這裡。':'把下一次想去的地方，收進手帳。'}</h3><p>${passportTab==='saved'?'在店鋪圖鑑按下書籤，把喜歡的東京一間一間收起來。':'在店鋪筆記裡記錄飲品、日期和感想，慢慢寫成自己的咖啡旅程。'}</p><a class="text-button" href="#directory">從一杯咖啡開始 ${icon('arrow')}</a></div></div>`;
  }
  function syncControls() {
    $('#search').value=state.q;for(const key of ['ward','area','status','sort']) $(`#${key}`).value=state[key];$('#map-area').value=state.area;
    document.querySelectorAll('.category-filters [data-kind]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.kind===state.kind));
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===state.view));
    document.querySelectorAll('[data-area]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.area===state.area));
  }
  function render() {
    const matched=filteredShops(),shown=matched.slice(0,limit);
    $('#shop-grid').classList.toggle('list-view',state.view==='list');$('#shop-grid').innerHTML=shown.map(card).join('');
    $('#results-count').innerHTML=`找到 <b>${matched.length}</b> 家店鋪 <span>／手帖共 ${shops.length} 家</span>`;
    $('#empty-state').hidden=matched.length>0;
    $('#empty-copy').textContent=state.status==='saved'&&!journal.saved.size?'按下照片旁的書籤，把下一杯想去的地方收進手帖。':state.status==='visited'&&!journal.visited.size?'蓋下第一枚巡禮章，記下已經喝過的那一杯。':'換個車站、街區或關鍵字，再找找下一杯。';
    $('#load-more-wrap').hidden=matched.length<=shown.length;$('#page-count').textContent=`已翻閱 ${shown.length} / ${matched.length} 家`;$('#load-more span').textContent=`＋${Math.min(12,matched.length-shown.length)} 家`;
    const labels=[];if(state.q.trim()) labels.push(`「${state.q.trim()}」`);if(state.kind!=='all') labels.push(kinds[state.kind]);if(state.ward) labels.push(state.ward);if(state.area) labels.push(areas.get(state.area).name);if(state.line) labels.push(lines.get(state.line).name);if(state.station) labels.push(state.station+' 站');if(state.route) labels.push(routes[state.route].name);if(state.status!=='all') labels.push({saved:'想去的店',visited:'已巡禮',unvisited:'還沒去過'}[state.status]);
    $('#active-filters').hidden=!labels.length;$('#filter-summary').textContent=labels.join(' · ');
    renderSelectedArea();updateProgress();renderPassport();
    document.dispatchEvent(new CustomEvent('coffee:render',{detail:{shops:matched,state:{...state}}}));
  }
  function setFilter(changes,scroll=false) {
    Object.assign(state,changes);limit=12;syncControls();writeFilters();render();
    if(scroll) $('#directory').scrollIntoView({behavior:reduced()?'instant':'smooth'});
  }
  const blankFilters={q:'',kind:'all',ward:'',area:'',line:'',station:'',status:'all',route:''};
  function resetFilters() {setFilter(blankFilters);$('#search').focus({preventScroll:true});}
  function detailContent(shop) {
    const entry=journal.entries[shop.id]||{};
    const fields=[['街區',areas.get(shop.areaId).name],['最近車站',shop.station],['店鋪地址',shop.address],['原書頁碼',`P.${shop.page} / ${shop.category}`],['交通備註',shop.sourceNote||'原始目錄未另列備註。']];
    return `<div class="detail-cover">${photo(shop,'detail-photo')}</div><p class="eyebrow">FIELD NOTE / NO. ${shop.id.slice(-3)} · ${kinds[shop.kind]}</p><h2 id="dialog-title" lang="ja">${escape(shop.name)}</h2><p class="detail-description">${escape(shop.description)}</p>
      <dl class="detail-fields">${fields.map(([term,value])=>`<div><dt>${term}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl><div class="detail-line-tags">${shop.lines.map(id=>{const l=lines.get(id);return `<button type="button" data-line-filter="${id}" style="--line-color:${l.color}"><span>${id}</span>${escape(l.name)}</button>`;}).join('')}</div>
      ${shop.note?`<p class="detail-note">${escape(shop.note)}</p>`:''}<div class="detail-links">${external(shop.mapUrl,'Google Maps','button button-dark')}${external(shop.infoUrl,linkLabels[shop.linkType],'button button-outline')}</div><p class="detail-map-note">${shop.coordinatePrecision==='shop'?'店鋪座標已依公開地圖核對。':'圖釘為地址定位，請由 Google Maps 確認入口。'} ${shop.mapType==='place'?'地圖連結來自店家或公開資料。':'Google Maps 以店名與完整地址搜尋。'}</p>
      <div class="detail-actions">${bookmarkButton(shop,true)}${visitButton(shop)}</div>
      <form class="journal-form" data-shop-id="${shop.id}"><div class="journal-form-title"><span>MY FIELD NOTES</span><h3>留一頁，給這一杯。</h3></div><div class="journal-form-row"><label>巡禮日期<input type="date" name="date" max="${today()}" value="${escape(entry.date||today())}"></label><label>這一杯喝了什麼？<input name="drink" maxlength="100" placeholder="例如：手沖、拿鐵、喫茶店布丁…" value="${escape(entry.drink||'')}"></label></div><label>想記住的小事<textarea name="note" rows="4" maxlength="800" placeholder="窗邊的光、喜歡的杯子，或那天的心情…">${escape(entry.note||'')}</textarea></label><label class="journal-visited-check"><input type="checkbox" name="visited" ${journal.visited.has(shop.id)?'checked':''}> 我已巡禮這家店</label><button type="submit" class="button button-dark">收進我的手帳 ${icon('arrow')}</button><span class="journal-save-status" role="status"></span></form>
      <p class="source-line">店鋪資料校對：${escape(shop.checkedAt)} · ${external(shop.sourceUrl,'資料來源')}<br>照片：${external(shop.imageSource,shop.imageCredit)}${shop.imageNote?`<br>${escape(shop.imageNote)}`:''}<br>營業時間與店休請查看店家的最新公告。</p>`;
  }
  function openDetail(shop,trigger) {
    dialogShop=shop.id;returnFocus=trigger;$('#dialog-content').innerHTML=detailContent(shop);$('#shop-dialog').showModal();$('#shop-dialog').scrollTop=0;
  }
  function playStamp(id) {
    if(reduced()) return;
    document.querySelectorAll(`[data-stamp-id="${id}"]`).forEach(el=>{el.classList.add('stamp-arriving');el.addEventListener('animationend',()=>el.classList.remove('stamp-arriving'),{once:true});});
    document.querySelectorAll(`.shop-card[data-id="${id}"]`).forEach(el=>{el.classList.add('paper-impact');setTimeout(()=>el.classList.remove('paper-impact'),1000);});
  }
  function act(event) {
    const button=event.target.closest('button[data-action]');if(!button) return;
    const {action,id}=button.dataset,shop=byId.get(id);if(!shop) return;
    if(action==='details'){openDetail(shop,button);return;}
    if(!['saved','visited'].includes(action)) return;
    const adding=!journal[action].has(id);adding?journal[action].add(id):journal[action].delete(id);
    if(action==='visited'&&adding) {journal.entries[id]||={};journal.entries[id].date||=today();journal.entries[id].updatedAt=new Date().toISOString();passportTab='visited';}
    saveJournal();render();
    if($('#shop-dialog').open&&dialogShop===id){
      const content=$('#dialog-content'),cover=content.querySelector('.shop-photo');
      content.querySelector('.detail-actions .bookmark-button').outerHTML=bookmarkButton(shop,true);
      content.querySelector('.detail-actions .visit-button').outerHTML=visitButton(shop);
      cover.querySelector('.ink-stamp')?.remove();if(journal.visited.has(id))cover.insertAdjacentHTML('beforeend',stamp(shop));
      const form=content.querySelector('.journal-form');form.elements.visited.checked=journal.visited.has(id);
      $(`#dialog-content .detail-actions [data-action="${action}"]`).focus({preventScroll:true});
    }
    else $(`#shop-grid [data-id="${id}"][data-action="${action}"]`)?.focus({preventScroll:true});
    if(action==='visited'&&adding) playStamp(id);
    showToast(storageAvailable?(action==='saved'?(adding?'已收進手帖，留給下一次散步。':'已取消收藏。'):(adding?'咚！巡禮章已蓋下，記住這一杯。':'已取消這枚巡禮章。')):'瀏覽器無法儲存紀錄；本次開啟期間仍可使用。');
  }
  $('#dialog-content').addEventListener('submit',event=>{
    const form=event.target.closest('.journal-form');if(!form) return;event.preventDefault();if(!form.reportValidity()) return;
    const id=form.dataset.shopId,marked=form.elements.visited.checked,newStamp=marked&&!journal.visited.has(id);
    journal.entries[id]={date:marked?(form.elements.date.value||today()):'',drink:form.elements.drink.value.trim().slice(0,100),note:form.elements.note.value.trim().slice(0,800),updatedAt:new Date().toISOString()};
    marked?journal.visited.add(id):journal.visited.delete(id);if(!marked) journal.saved.add(id);passportTab=marked?'visited':'notes';saveJournal();render();
    form.querySelector('.journal-save-status').textContent=storageAvailable?'已寫進手帳。':'這次筆記尚無法永久保存。';
    const cover=$('#dialog-content .shop-photo');cover.querySelector('.ink-stamp')?.remove();if(marked) cover.insertAdjacentHTML('beforeend',stamp(byId.get(id)));if(newStamp)playStamp(id);
    $('#dialog-content .visit-button').outerHTML=visitButton(byId.get(id));showToast(storageAvailable?'這一杯的故事，已收進你的手帳。':'瀏覽器無法儲存紀錄，請下載手帳備份。');
  });
  $('#ward').innerHTML+=wards.map(ward=>`<option value="${escape(ward)}">${escape(ward)} · ${shops.filter(s=>s.ward===ward).length} 家</option>`).join('');
  for(const id of ['area','map-area']) $(`#${id}`).innerHTML+=data.areas.map(a=>`<option value="${a.id}">${escape(a.name)} · ${a.count} 家</option>`).join('');
  renderAreas();
  $('#search').addEventListener('input',e=>setFilter({q:e.target.value}));
  for(const key of ['ward','area','status','sort']) $(`#${key}`).addEventListener('change',e=>setFilter({[key]:e.target.value,...(key==='area'?{route:'',line:'',station:''}:{})}));
  $('#map-area').addEventListener('change',e=>setFilter({...blankFilters,area:e.target.value}));
  document.querySelectorAll('.category-filters [data-kind]').forEach(b=>b.addEventListener('click',()=>setFilter({kind:b.dataset.kind})));
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setFilter({view:b.dataset.view})));
  document.querySelectorAll('[data-area]').forEach(b=>b.addEventListener('click',()=>setFilter({...blankFilters,area:b.dataset.area},true)));
  $('#all-areas').addEventListener('click',()=>setFilter(blankFilters,true));
  $('#reset-filters').addEventListener('click',resetFilters);$('#empty-reset').addEventListener('click',resetFilters);
  $('#load-more').addEventListener('click',()=>{const previous=limit;limit+=12;render();const first=$('#shop-grid').children[previous];if(first){first.querySelector('.bookmark-button').focus({preventScroll:true});first.scrollIntoView({behavior:reduced()?'instant':'smooth',block:'nearest'});}});
  document.querySelectorAll('[data-route]').forEach(b=>b.addEventListener('click',()=>setFilter({...blankFilters,route:b.dataset.route},true)));
  document.querySelectorAll('[data-diary-link]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();$('#notebook').scrollIntoView({behavior:reduced()?'instant':'smooth'});}));
  document.body.addEventListener('click',act);
  document.body.addEventListener('click',e=>{const b=e.target.closest('[data-line-filter]');if(b){$('#shop-dialog').close();setFilter({...blankFilters,line:b.dataset.lineFilter},true);}});
  document.querySelectorAll('[data-passport]').forEach(b=>b.addEventListener('click',()=>{passportTab=b.dataset.passport;renderPassport();b.focus({preventScroll:true});}));
  $('.passport-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...document.querySelectorAll('[data-passport]')];let i=tabs.findIndex(b=>b.dataset.passport===passportTab);i=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[i].click();});
  $('#export-journal').addEventListener('click',()=>{const payload={title:'東京咖啡巡禮手帳',version:2,exportedAt:new Date().toISOString(),saved:[...journal.saved],visited:[...journal.visited],entries:journal.entries};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`tokyo-coffee-journal-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('手帳備份已準備好，帶走這段咖啡旅程。');});
  for(const dialog of document.querySelectorAll('dialog')) {
    dialog.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))dialog.close();});
    dialog.addEventListener('close',()=>{if(dialog.id==='shop-dialog'){const fallback=$(`#shop-grid [data-id="${dialogShop}"][data-action="details"]`);(returnFocus?.isConnected?returnFocus:fallback||$('#search')).focus({preventScroll:true});dialogShop=null;}});
  }
  $('#about-button').addEventListener('click',()=>$('#about-dialog').showModal());
  window.addEventListener('popstate',()=>{state=readFilters();limit=12;syncControls();render();});
  window.addEventListener('storage',e=>{if(e.key===storageKey||e.key===null){journal=readJournal();render();if(dialogShop&&$('#shop-dialog').open)$('#dialog-content').innerHTML=detailContent(byId.get(dialogShop));}});
  window.CoffeeJournal={data,shops,byId,areas,lines,escape,icon,external,filteredShops,setFilter,blankFilters,getState:()=>({...state}),isVisited:id=>journal.visited.has(id),openDetail:(id,trigger)=>openDetail(byId.get(id),trigger),showToast,reduced};
  syncControls();render();
})();
