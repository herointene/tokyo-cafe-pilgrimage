(() => {
  'use strict';
  const data = window.CAFE_DATA;
  if (!data || !Array.isArray(data.shops)) return;
  const shops = data.shops;
  const byId = new Map(shops.map(shop => [shop.id, shop]));
  const $ = selector => document.querySelector(selector);
  const storageKey = 'tokyo-coffee-journal-v1';
  const kinds = { cafe: '咖啡館', kissaten: '喫茶店', sweets: '甜點時間' };
  const linkLabels = {
    website: '官方網站', instagram: '官方 Instagram', social: '官方社群',
    facility: '設施官方介紹', blog: '官方部落格', unconfirmed: '店鋪資訊'
  };
  const routes = {
    ginza: { name: '銀座，喫茶的老時光', ids: [33, 35, 44, 45, 53, 66] },
    east: { name: '藏前與淺草，路地裡', ids: [18, 31, 32, 43, 49, 65] },
    aoyama: { name: '青山，綠意與香氣', ids: [4, 10, 23, 26, 34] }
  };
  for (const route of Object.values(routes)) route.ids = new Set(route.ids.map(n => `cafe-${String(n).padStart(3, '0')}`));
  const wards = [...new Set(shops.map(shop => shop.ward))];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const external = (url, text, className = '') => `<a class="${className}" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(text)} ${icon('external')}</a>`;
  let storageAvailable = true;
  let toastTimer;
  let limit = 12;
  let dialogShop = null;
  let returnFocus = null;

  function readJournal() {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const valid = value => new Set((Array.isArray(value) ? value : []).filter(id => byId.has(id)));
      return { saved: valid(raw?.saved), visited: valid(raw?.visited) };
    } catch {
      return { saved: new Set(), visited: new Set() };
    }
  }
  let journal = readJournal();

  function showToast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('visible'), 2800);
  }

  function saveJournal() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ saved: [...journal.saved], visited: [...journal.visited] }));
      storageAvailable = true;
    } catch {
      storageAvailable = false;
    }
  }

  function readFilters() {
    const params = new URLSearchParams(location.search);
    const known = (key, values, fallback) => values.includes(params.get(key)) ? params.get(key) : fallback;
    return {
      q: (params.get('q') || '').slice(0, 150),
      kind: known('kind', ['all', ...Object.keys(kinds)], 'all'),
      ward: known('ward', wards, ''),
      status: known('status', ['all', 'saved', 'visited', 'unvisited'], 'all'),
      sort: known('sort', ['page', 'ward', 'name'], 'page'),
      view: known('view', ['grid', 'list'], 'grid'),
      route: known('route', Object.keys(routes), '')
    };
  }
  let state = readFilters();

  function writeFilters() {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(state)) {
      if (value && value !== ({ kind: 'all', status: 'all', sort: 'page', view: 'grid' })[key]) params.set(key, value);
    }
    const query = params.toString();
    history.replaceState(null, '', `${location.pathname}${query ? '?' + query : ''}${location.hash}`);
  }

  function normalize(value) {
    return String(value).normalize('NFKC').toLocaleLowerCase('ja').replace(/澀谷/g, '渋谷').replace(/藏前/g, '蔵前').replace(/淺草/g, '浅草').replace(/惠比壽/g, '恵比寿').replace(/學藝大學/g, '学芸大学').replace(/亀戶/g, '亀戸');
  }
  const searchText = new Map(shops.map(shop => [shop.id, normalize([shop.name, shop.ward, shop.neighborhood, shop.station, shop.description, shop.address].join(' '))]));

  function filteredShops() {
    const tokens = normalize(state.q).trim().split(/\s+/).filter(Boolean);
    const result = shops.filter(shop =>
      (state.kind === 'all' || state.kind === shop.kind) &&
      (!state.ward || state.ward === shop.ward) &&
      (!state.route || routes[state.route].ids.has(shop.id)) &&
      (state.status !== 'saved' || journal.saved.has(shop.id)) &&
      (state.status !== 'visited' || journal.visited.has(shop.id)) &&
      (state.status !== 'unvisited' || !journal.visited.has(shop.id)) &&
      tokens.every(token => searchText.get(shop.id).includes(token))
    );
    if (state.sort === 'ward') result.sort((a, b) => a.ward.localeCompare(b.ward, 'ja') || a.page - b.page);
    if (state.sort === 'name') result.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    return result;
  }

  function bookmarkButton(shop, withText = false) {
    const saved = journal.saved.has(shop.id);
    return `<button type="button" class="bookmark-button" data-action="saved" data-id="${shop.id}" aria-pressed="${saved}" aria-label="${escape(shop.name)}：${saved ? '取消收藏' : '收藏想去'}">${icon('bookmark')}${withText ? (saved ? '已收藏，取消收藏' : '收藏想去的店') : ''}</button>`;
  }

  function visitButton(shop) {
    const visited = journal.visited.has(shop.id);
    return `<button type="button" class="visit-button" data-action="visited" data-id="${shop.id}" aria-pressed="${visited}" aria-label="${escape(shop.name)}：${visited ? '取消已巡禮' : '標記已巡禮'}">${icon('check')} ${visited ? '已巡禮' : '蓋上巡禮章'}</button>`;
  }

  function card(shop) {
    const ordinal = shop.id.slice(-3);
    return `<article class="shop-card" data-id="${shop.id}" data-kind="${shop.kind}" aria-labelledby="name-${shop.id}">
      <div class="card-top"><span class="category-label"><span class="category-dot" aria-hidden="true"></span>${kinds[shop.kind]} / ${shop.kind === 'cafe' ? 'CAFÉ' : shop.kind === 'kissaten' ? 'KISSATEN' : 'SWEETS'}</span>${bookmarkButton(shop)}</div>
      <div class="card-name-row"><span class="shop-number" aria-hidden="true">${ordinal.slice(1)}</span><h3 id="name-${shop.id}" lang="ja">${escape(shop.name)}</h3></div>
      <p class="card-location">${escape(shop.ward)} · ${escape(shop.neighborhood)}</p>
      <p class="card-station">${icon('pin')} ${escape(shop.station)}${shop.station ? ' 站' : ''}</p>
      <p class="card-description">${escape(shop.description)}</p>
      <div class="card-links">${external(shop.infoUrl, linkLabels[shop.linkType])}${external(shop.mapUrl, 'Google Maps')}</div>
      <div class="card-bottom">${visitButton(shop)}<button type="button" class="details-button" data-action="details" data-id="${shop.id}" aria-label="查看 ${escape(shop.name)} 的店鋪資訊">店鋪筆記 ${icon('arrow')}</button></div>
      <div class="card-page"><span>BOOK / P.${String(shop.page).padStart(2, '0')}</span><span>NO. ${ordinal}</span></div>
    </article>`;
  }

  function updateProgress() {
    $('#nav-saved').textContent = journal.saved.size;
    $('#saved-total').textContent = journal.saved.size;
    $('#visited-total').textContent = journal.visited.size;
    $('#progress-bar').setAttribute('aria-valuenow', journal.visited.size);
    $('#progress-fill').style.width = `${journal.visited.size / shops.length * 100}%`;
    $('#progress-fraction').textContent = `${journal.visited.size} / ${shops.length}`;
    $('#progress-caption').textContent = journal.visited.size ? '每一枚章，都是一段咖啡回憶。' : '每一段旅程，都從第一杯開始。';
  }

  function syncControls() {
    $('#search').value = state.q;
    for (const key of ['ward', 'status', 'sort']) $(`#${key}`).value = state[key];
    document.querySelectorAll('[data-kind]').forEach(element => {
      if (element.tagName === 'BUTTON') element.setAttribute('aria-pressed', element.dataset.kind === state.kind);
    });
    document.querySelectorAll('[data-view]').forEach(element => element.setAttribute('aria-pressed', element.dataset.view === state.view));
  }

  function render() {
    const matched = filteredShops();
    const shown = matched.slice(0, limit);
    $('#shop-grid').classList.toggle('list-view', state.view === 'list');
    $('#shop-grid').innerHTML = shown.map(card).join('');
    $('#results-count').innerHTML = `找到 <b>${matched.length}</b> 家店鋪 <span>／手帖共 ${shops.length} 家</span>`;
    $('#empty-state').hidden = matched.length > 0;
    $('#empty-copy').textContent = state.status === 'saved' && journal.saved.size === 0
      ? '在店鋪卡片按下書籤，把下一杯想去的地方收進手帖。'
      : state.status === 'visited' && journal.visited.size === 0
        ? '在店鋪卡片蓋上巡禮章，記下已經喝過的那一杯。'
        : '換個車站、街區或關鍵字，再找找下一杯。';
    $('#load-more-wrap').hidden = matched.length <= shown.length;
    $('#page-count').textContent = `已翻閱 ${shown.length} / ${matched.length} 家`;
    $('#load-more span').textContent = `＋${Math.min(12, matched.length - shown.length)} 家`;
    const filters = [];
    if (state.q.trim()) filters.push(`「${state.q.trim()}」`);
    if (state.kind !== 'all') filters.push(kinds[state.kind]);
    if (state.ward) filters.push(state.ward);
    if (state.route) filters.push(routes[state.route].name);
    if (state.status !== 'all') filters.push({ saved: '想去的店', visited: '已巡禮', unvisited: '還沒去過' }[state.status]);
    $('#active-filters').hidden = filters.length === 0;
    $('#filter-summary').textContent = filters.join(' · ');
    updateProgress();
  }

  function setFilter(changes, scroll = false) {
    Object.assign(state, changes);
    limit = 12;
    syncControls();
    writeFilters();
    render();
    if (scroll) $('#directory').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }

  function resetFilters() {
    setFilter({ q: '', kind: 'all', ward: '', status: 'all', route: '' });
    $('#search').focus({ preventScroll: true });
  }

  function detailContent(shop) {
    const fields = [
      ['街區', `${shop.ward} · ${shop.neighborhood}`],
      ['最近車站', shop.station],
      ['店鋪地址', shop.address],
      ['原書頁碼', `P.${shop.page} / ${shop.category}`],
      ['交通備註', shop.sourceNote || '原始目錄未另列備註。']
    ];
    return `<p class="eyebrow">FIELD NOTE / NO. ${shop.id.slice(-3)} · ${kinds[shop.kind]}</p>
      <h2 id="dialog-title" lang="ja">${escape(shop.name)}</h2>
      <p class="detail-description">${escape(shop.description)}</p>
      <dl class="detail-fields">${fields.map(([term, value]) => `<div><dt>${term}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>
      ${shop.note ? `<p class="detail-note">${escape(shop.note)}</p>` : ''}
      <div class="detail-links">${external(shop.mapUrl, 'Google Maps', 'button button-dark')}${external(shop.infoUrl, linkLabels[shop.linkType], 'button button-outline')}</div>
      <p class="detail-map-note">${shop.mapType === 'place' ? '地圖連結來自店家或公開店鋪資料。' : 'Google Maps 以店名與完整地址開啟搜尋。'}</p>
      <div class="detail-actions">${bookmarkButton(shop, true)}${visitButton(shop)}</div>
      <p class="source-line">資料校對：${escape(shop.checkedAt)} · ${external(shop.sourceUrl, '查看資料來源')}<br>營業時間與店休請查看店家的最新公告。</p>`;
  }

  function openDetail(shop, trigger) {
    dialogShop = shop.id;
    returnFocus = trigger;
    $('#dialog-content').innerHTML = detailContent(shop);
    $('#shop-dialog').showModal();
  }

  function act(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, id } = button.dataset;
    const shop = byId.get(id);
    if (!shop) return;
    if (action === 'details') {
      openDetail(shop, button);
      return;
    }
    if (!['saved', 'visited'].includes(action)) return;
    const set = journal[action];
    const adding = !set.has(id);
    adding ? set.add(id) : set.delete(id);
    saveJournal();
    render();
    if ($('#shop-dialog').open && dialogShop === id) {
      $('#dialog-content').innerHTML = detailContent(shop);
      $(`#dialog-content [data-action="${action}"]`).focus({ preventScroll: true });
    } else {
      $(`#shop-grid [data-id="${id}"][data-action="${action}"]`)?.focus({ preventScroll: true });
    }
    showToast(storageAvailable
      ? action === 'saved' ? (adding ? '已收進手帖，留給下一次散步。' : '已取消收藏。') : (adding ? '巡禮章已蓋上，記下這一杯。' : '已取消這枚巡禮章。')
      : '瀏覽器無法儲存紀錄；本次開啟期間仍可使用。');
  }

  const wardCounts = new Map(wards.map(ward => [ward, shops.filter(shop => shop.ward === ward).length]));
  $('#ward').innerHTML += wards.map(ward => `<option value="${escape(ward)}">${escape(ward)} · ${wardCounts.get(ward)} 家</option>`).join('');
  $('#search').addEventListener('input', event => setFilter({ q: event.target.value }));
  for (const key of ['ward', 'status', 'sort']) $(`#${key}`).addEventListener('change', event => setFilter({ [key]: event.target.value }));
  document.querySelectorAll('.category-filters [data-kind]').forEach(button => button.addEventListener('click', () => setFilter({ kind: button.dataset.kind })));
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setFilter({ view: button.dataset.view })));
  $('#reset-filters').addEventListener('click', resetFilters);
  $('#empty-reset').addEventListener('click', resetFilters);
  $('#load-more').addEventListener('click', () => {
    const previous = limit;
    limit += 12;
    render();
    const firstNew = $('#shop-grid').children[previous];
    if (firstNew) {
      firstNew.querySelector('.bookmark-button').focus({ preventScroll: true });
      firstNew.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
    }
  });
  document.querySelectorAll('[data-route]').forEach(button => button.addEventListener('click', () => setFilter({ route: button.dataset.route, q: '', kind: 'all', ward: '', status: 'all' }, true)));
  document.querySelectorAll('[data-diary-link]').forEach(element => element.addEventListener('click', event => {
    event.preventDefault();
    setFilter({ status: 'saved', route: '', q: '', kind: 'all', ward: '' }, true);
  }));
  $('#shop-grid').addEventListener('click', act);
  $('#dialog-content').addEventListener('click', act);

  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
    dialog.addEventListener('close', () => {
      if (dialog.id === 'shop-dialog') {
        const fallback = $(`#shop-grid [data-id="${dialogShop}"][data-action="details"]`);
        (returnFocus?.isConnected ? returnFocus : fallback || $('#search')).focus({ preventScroll: true });
        dialogShop = null;
      }
    });
  }
  $('#about-button').addEventListener('click', () => $('#about-dialog').showModal());
  window.addEventListener('popstate', () => { state = readFilters(); limit = 12; syncControls(); render(); });
  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) {
      journal = readJournal();
      render();
      if (dialogShop && $('#shop-dialog').open) $('#dialog-content').innerHTML = detailContent(byId.get(dialogShop));
    }
  });
  syncControls();
  render();
})();
