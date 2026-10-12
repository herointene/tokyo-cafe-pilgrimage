(() => {
  'use strict';
  const api=window.CoffeeJournal;
  if(!api) return;
  const {data,shops,byId,areas,lines,escape,external}=api;
  const $=s=>document.querySelector(s);
  let map=null,markerLayer=null,matched=api.filteredShops(),markers=new Map(),selectedMarker=null,referenceZoom=1;
  const cityBounds=[[35.53,139.58],[35.79,139.88]];

  function mapPopup(shop) {
    return `<div class="map-popup"><img src="${escape(shop.image)}" alt="${escape(shop.imageAlt)}" width="450" height="300"><a class="map-popup-credit" href="${escape(shop.imageSource)}" target="_blank" rel="noopener noreferrer">${escape(shop.imageCredit)} ↗</a><h3>${escape(shop.name)}</h3><p>${escape(areas.get(shop.areaId).name)} · ${escape(shop.station)} 站</p><p>${shop.coordinatePrecision==='shop'?'已核對店鋪座標':shop.coordinatePrecision==='approximate'?'街區約略位置，請由 Google Maps 確認店址':'地址定位，入口請參考 Google Maps'}${api.isVisited(shop.id)?' · 已蓋巡禮章':''}</p><div class="map-popup-actions"><button type="button" data-popup-shop="${shop.id}">照片與店鋪筆記 ↗</button>${external(shop.mapUrl,'Google Maps')}</div></div>`;
  }
  function initializeMap() {
    if(map||!window.L) return;
    map=L.map('shop-map',{scrollWheelZoom:false,zoomControl:true,minZoom:7,maxZoom:19,preferCanvas:true}).fitBounds(cityBounds,{padding:[12,12],animate:false});
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'}).addTo(map).on('tileerror',()=>{$('#map-unavailable').hidden=false;}).on('load',()=>{$('#map-unavailable').hidden=true;});
    markerLayer=L.layerGroup().addTo(map);
    map.on('popupopen',event=>{
      const element=event.popup.getElement();
      element.querySelector('[data-popup-shop]')?.addEventListener('click',e=>api.openDetail(e.currentTarget.dataset.popupShop,e.currentTarget));
    });
    renderMarkers(true);
  }
  function fitCurrent() {
    if(!map) return;
    if(matched.length) map.fitBounds(L.latLngBounds(matched.map(s=>[s.lat,s.lng])),{padding:[38,38],maxZoom:15,animate:!api.reduced()});
  }
  function renderMarkers(initial=false) {
    if(!map) return;
    markerLayer.clearLayers();markers=new Map();
    for(const shop of matched) {
      const visited=api.isVisited(shop.id);
      const icon=L.divIcon({className:`coffee-pin${visited?' visited':''}${shop.coordinatePrecision==='approximate'?' approximate':''}`,html:`<span><b>${shop.id.slice(-2)}</b></span>`,iconSize:[30,35],iconAnchor:[14,31],popupAnchor:[0,-29]});
      const marker=L.marker([shop.lat,shop.lng],{icon,title:shop.name,alt:`${shop.name}${visited?'，已巡禮':''}`,keyboard:true}).bindPopup(mapPopup(shop),{maxWidth:265,minWidth:235}).addTo(markerLayer);
      marker.on('click',()=>selectListItem(shop.id));markers.set(shop.id,marker);
    }
    const state=api.getState();
    if(state.area||state.line||state.station||state.q||state.ward||state.status!=='all'||state.kind!=='all'||state.route) fitCurrent();
    else if(initial) map.fitBounds(cityBounds,{padding:[12,12],animate:false});
    if(selectedMarker&&markers.has(selectedMarker))markers.get(selectedMarker).openPopup();
  }
  function selectListItem(id) {
    selectedMarker=id;
    $('#map-shop-list').querySelectorAll('.map-list-item').forEach(b=>b.classList.toggle('selected',b.dataset.mapShop===id));
  }
  function focusShop(id) {
    initializeMap();const marker=markers.get(id);if(!marker)return;
    selectListItem(id);map.setView(marker.getLatLng(),Math.max(map.getZoom(),15),{animate:!api.reduced()});marker.openPopup();
  }
  function renderMapList() {
    $('#map-count').textContent=`${matched.length} 家咖啡座標`;
    $('#map-list-total').textContent=matched.length;
    $('#map-shop-list').innerHTML=matched.length?matched.map(s=>`<button type="button" class="map-list-item" data-map-shop="${s.id}"><img src="${escape(s.image)}" alt="${escape(s.imageAlt)}" width="100" height="100" loading="lazy"><span><strong>${escape(s.name)}</strong><small>${escape(s.station)} 站 · ${escape(areas.get(s.areaId).name)}</small>${api.isVisited(s.id)?'<span class="map-visited-label">巡禮済</span>':''}</span></button>`).join(''):'<p class="map-list-empty">這片範圍暫時沒有店鋪。換一片街區，或清除目錄篩選。</p>';
  }
  $('#map-shop-list').addEventListener('click',event=>{const b=event.target.closest('[data-map-shop]');if(b)focusShop(b.dataset.mapShop);});
  $('#map-city').addEventListener('click',()=>{initializeMap();map?.fitBounds(cityBounds,{padding:[12,12],animate:!api.reduced()});});
  $('#map-fit').addEventListener('click',()=>{initializeMap();fitCurrent();});
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){initializeMap();observer.disconnect();}},{rootMargin:'150px'});
  observer.observe($('#coffee-map'));
  window.addEventListener('resize',()=>map?.invalidateSize({animate:false}));
  document.addEventListener('coffee:render',event=>{matched=event.detail.shops;renderMapList();renderMarkers();});
  renderMapList();

  function stationShops(station) {return shops.filter(s=>s.stationLines.some(st=>st.station===station));}
  function lineShops(id) {return shops.filter(s=>s.lines.includes(id));}
  const lineSelect=$('#train-line');
  lineSelect.innerHTML=data.lines.map(l=>`<option value="${l.id}">${l.id} · ${escape(l.name)} (${lineShops(l.id).length} 家)</option>`).join('');
  lineSelect.value=api.getState().line||'G';
  function drawLine() {
    const line=lines.get(lineSelect.value),stations=line.coffeeStations;
    $('#line-shop-count').textContent=`· ${lineShops(line.id).length} 家`;
    const cols=5,rows=Math.ceil(stations.length/cols),height=90+rows*105;
    const points=stations.map((station,i)=>{const row=Math.floor(i/cols),position=i%cols;return {station,x:90+(row%2?cols-1-position:position)*185,y:60+row*105};});
    let path='';
    points.forEach((point,i)=>{path+=i?` L${point.x} ${point.y}`:`M${point.x} ${point.y}`;});
    const last=points.at(-1),first=points[0];
    let loop='';
    if(line.isLoop&&last&&points.length>1)loop=`<path d="M${last.x} ${last.y} L45 ${last.y} L45 ${first.y} L${first.x} ${first.y}" fill="none" stroke="${line.color}" stroke-width="5" stroke-dasharray="4 5" opacity=".6"/>`;
    $('#line-diagram').innerHTML=`<svg viewBox="0 0 960 ${height}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="${escape(line.name)} 咖啡車站示意"><title>${escape(line.name)}：點選車站可查找附近店鋪</title><path d="${path}" fill="none" stroke="${line.color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>${loop}${points.map((point,i)=>{
      const count=stationShops(point.station).length,name=point.station.replace(/〈.*?〉/g,''),rest=point.station.match(/〈(.*?)〉/)?.[1];
      return `<g class="line-station" role="button" tabindex="0" data-train-station="${escape(point.station)}" aria-label="${escape(point.station)} 站，附近 ${count} 家店鋪"><circle class="station-halo" cx="${point.x}" cy="${point.y}" r="20" fill="${line.color}" opacity=".15"/><circle cx="${point.x}" cy="${point.y}" r="11" fill="white" stroke="${line.color}" stroke-width="4"/><text class="station-name" x="${point.x}" y="${point.y+32}" text-anchor="middle">${escape(name)}</text>${rest?`<text class="station-name" x="${point.x}" y="${point.y+47}" text-anchor="middle" style="font-size:9px">${escape(rest)}</text>`:''}<text class="station-count" x="${point.x}" y="${point.y+(rest?64:51)}" text-anchor="middle">${count} 家咖啡店 ↗</text></g>`;
    }).join('')}<text x="90" y="${height-15}" fill="${line.color}" font-family="monospace" font-size="9">${escape(line.id)} / COFFEE STATIONS · ${line.isLoop?'LOOP LINE / 環狀線參照':'SCHEMATIC / NOT TO SCALE'}</text></svg>`;
    const note=line.note||((line.id==='JC')?'高圓寺站：中央線快速週末與假日不停靠，請搭中央・總武線各站停車。':'');
    $('#line-note').hidden=!note;$('#line-note').textContent=note;
  }
  function browseStation(station) {api.setFilter({...api.blankFilters,station},true);}
  $('#line-diagram').addEventListener('click',event=>{const node=event.target.closest('[data-train-station]');if(node)browseStation(node.dataset.trainStation);});
  $('#line-diagram').addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key))return;const node=event.target.closest('[data-train-station]');if(node){event.preventDefault();browseStation(node.dataset.trainStation);}});
  lineSelect.addEventListener('change',drawLine);
  $('#browse-line').addEventListener('click',()=>api.setFilter({...api.blankFilters,line:lineSelect.value},true));
  drawLine();

  const referenceSources=data.transitSources.filter(s=>s.type==='pdf').slice(0,2);
  const referenceTitle=source=>source.id==='metro-map'?'東京地下鐵・都營線路參照':'JR East 東京近郊線路參照';
  $('#transit-references').innerHTML=referenceSources.map(source=>`<article class="transit-reference-card"><button type="button" class="transit-reference-image" data-reference="${source.id}" aria-label="放大 ${escape(referenceTitle(source))}"><img src="${escape(source.preview)}" width="1300" height="900" alt="${escape(source.previewCaption||referenceTitle(source))}" loading="lazy"><span>放大路線圖 ＋</span></button><h3>${escape(referenceTitle(source))}</h3><p>${escape(source.previewCaption)}<br>${source.previewSourceUrl?external(source.previewSourceUrl,source.previewAttribution||'預覽圖來源'):''}</p>${external(source.url,source.id==='metro-map'?'開啟官方繁體中文 PDF':'開啟官方完整 PDF','text-button')}</article>`).join('')+`<div class="transit-small-sources"><span>其他沿線參照</span>${data.transitSources.filter(s=>s.type!=='pdf').map(s=>external(s.url,s.title.replace(/官方|路線與車站|路線圖與車站/g,''))).join('')}</div>`;
  function zoomReference(delta) {referenceZoom=Math.max(1,Math.min(3,referenceZoom+delta));$('#reference-image').style.width=`${referenceZoom*100}%`;$('#reference-zoom').textContent=`${Math.round(referenceZoom*100)}%`;$('#reference-minus').disabled=referenceZoom<=1;$('#reference-plus').disabled=referenceZoom>=3;}
  $('#transit-references').addEventListener('click',event=>{
    const button=event.target.closest('[data-reference]');if(!button)return;
    const source=referenceSources.find(s=>s.id===button.dataset.reference);if(!source)return;
    $('#reference-title').textContent=referenceTitle(source);$('#reference-caption').textContent=source.previewCaption;$('#reference-source').href=source.url;$('#reference-image').src=source.preview;$('#reference-image').alt=source.previewCaption;referenceZoom=1;zoomReference(0);$('#reference-dialog').showModal();$('#reference-viewer').scrollTo(0,0);
  });
  $('#reference-plus').addEventListener('click',()=>zoomReference(.5));$('#reference-minus').addEventListener('click',()=>zoomReference(-.5));
})();
