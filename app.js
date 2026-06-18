// ══════════════════════════════════════════
//  ⚙️  GOOGLE SHEETS CONFIG
//  Set your Apps Script Web App URL in config.js (see config.example.js).
//  config.js is gitignored — never committed. For GitHub Pages, add it as a
//  repository secret named SHEET_URL (the deploy workflow injects it).
//  Leave empty / unset to use offline mode (localStorage only).
// ══════════════════════════════════════════
const SHEET_URL = (typeof window !== 'undefined' && window.BTB_SHEET_URL) || '';

// Use JSONP on file:// (fetch can't read cross-origin responses there);
// use fetch+CORS on http/https and fall back to JSONP on failure.
const USE_JSONP = location.protocol === 'file:';

// ══════════════════════════════════════════
//  SEED DATA
// ══════════════════════════════════════════
const SEED=[];

// ══════════════════════════════════════════
//  STRINGS
// ══════════════════════════════════════════
const S={
  secRev:'To Review',secWl:'Wishlist',secRm:'Removed',secBacklog:'Your Backlog',
  bdgBt:'IN COLLECTION',bdgRm:'Removed',bdgRev:'To Review',
  pHi:'High',pMe:'Medium',pLo:'Low',
  stTot:'total',stWl:'wishlist',stBt:'bought',stRm:'removed',stVal:'total value',
  pHotness:'Hotness',pDetails:'Details',pDev:'Developer',pPub:'Publisher',pRel:'Release',
  pGenre:'Genre',pPlatform:'Platform',pPrice:'Price',pTags:'Tags',pNotes:'Notes',
  pLinks:'Links',pSteam:'Steam',pGG:'gg.deals',pSDB:'SteamDB',pPriority:'Priority',
  pActions:'Actions',pEdit:'Edit',pMarkBt:'Add to Collection',pMarkWl:'Move to Wishlist',pRemove:'Remove',pReinstate:'Reinstate',
  pReview:'My Review',pSaveRev:'Save review',pRmNote:'Removed — reason:',
  noGames:'No games here yet.',noHint:'Press + Add game to start!',
  mBt:'Add to Collection',mWl:'Move to Wishlist'
};
const t=k=>S[k]||k;

// ══════════════════════════════════════════
//  THEME
// ══════════════════════════════════════════
let theme=localStorage.getItem('btb_theme')||'dark';
function applyTheme(){
  document.documentElement.setAttribute('data-theme',theme);
  ['hmThemeLight','dhThemeLight'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.toggle('on',theme==='light');});
  ['hmThemeDark','dhThemeDark'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.toggle('on',theme==='dark');});
}
applyTheme();
function toggleTheme(){theme=theme==='dark'?'light':'dark';localStorage.setItem('btb_theme',theme);applyTheme()}
function applyVm(){
  ['hmViewGrid','dhViewGrid'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.toggle('on',vm==='grid');});
  ['hmViewList','dhViewList'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.toggle('on',vm==='list');});
}

// ══════════════════════════════════════════
//  SYNC STATUS UI
// ══════════════════════════════════════════
function setSyncStatus(state, msg){
  // ── Desktop header span ──
  const hdr = document.getElementById('syncStatus');
  if(hdr){
    const icons = {idle:'', syncing:'⟳', ok:'✓', err:'⚠', offline:'⊘'};
    const colors = {idle:'var(--t3)', syncing:'var(--amber)', ok:'var(--green)', err:'var(--pink)', offline:'var(--t3)'};
    hdr.textContent = (icons[state]||'') + (msg?' '+msg:'');
    hdr.style.color = colors[state]||'var(--t3)';
    hdr.onclick = null;
    hdr.style.cursor = '';
    // After success/error, show re-sync button
    if(state==='ok'||state==='err'){
      clearTimeout(setSyncStatus._resyncTimer);
      setSyncStatus._resyncTimer = setTimeout(()=>{
        hdr.textContent = '⟳ Re-sync';
        hdr.style.color = 'var(--t3)';
        hdr.style.cursor = 'pointer';
        hdr.onclick = ()=>resync();
      }, state==='ok' ? 2500 : 0);
    }
  }
  // ── Mobile floating pill ──
  const pill = document.getElementById('syncPill');
  const pillTxt = document.getElementById('syncPillTxt');
  if(pill && pillTxt){
    const labels = {idle:'', syncing:'Saving…', ok:'Saved', err:'Sync failed', offline:'Offline'};
    pillTxt.textContent = msg || labels[state] || '';
    pill.className = state==='idle' ? 'hidden' : 'sp-'+state;
    if(state==='ok'){
      clearTimeout(setSyncStatus._hideTimer);
      setSyncStatus._hideTimer = setTimeout(()=>{ pill.className='hidden'; },2500);
    }
  }
  // ── Mobile hamburger Re-sync button ──
  const hmResync = document.getElementById('hmResyncBtn');
  if(hmResync){
    if(state==='ok'||state==='err'||state==='offline'){
      hmResync.style.display='';
      hmResync.textContent = state==='err' ? '⚠ Re-sync (failed)' : state==='offline' ? '⊘ Offline mode' : '⟳ Re-sync';
      hmResync.style.color = state==='err' ? 'var(--pink)' : state==='offline' ? 'var(--t3)' : '';
    } else if(state==='syncing'){
      hmResync.textContent='⟳ Syncing…';
      hmResync.style.display='';
      hmResync.style.color='var(--amber)';
    }
  }
}

// Re-sync: fetch from Sheet, merge (Sheet wins), re-render
async function resync(){
  if(OFFLINE) return;
  setSyncStatus('syncing','Syncing…');
  try{
    const data = await loadFromSheet();
    const incoming = data.map(g=>normalise(g));
    // Sheet wins: build map of incoming by id
    const inMap = {};
    incoming.forEach(g=>{ inMap[String(g.id)]=g; });
    // Keep local games not in Sheet, overwrite rest with Sheet version
    const localOnly = games.filter(g=>!inMap[String(g.id)]);
    games = [...incoming, ...localOnly.filter(g=>!inMap[String(g.id)])];
    // Actually: Sheet is source of truth — just replace entirely
    games = incoming;
    localStorage.setItem(KEY, JSON.stringify(games));
    setSyncStatus('ok','Synced');
    dispatchRender();
    fetchMeta();
  } catch(err){
    setSyncStatus('err','Re-sync failed');
    console.error('BTB resync error:', err);
  }
}

// ══════════════════════════════════════════
//  DATA
// ══════════════════════════════════════════
const KEY='btb_v4';
const META_KEY='btb_meta';
const OFFLINE = !SHEET_URL;

// ── METADATA (genres/tags descriptions) ─────────────────────
let metaMap={}; // keyed by lowercase name
function loadMetaCache(){
  try{const s=localStorage.getItem(META_KEY);if(s)metaMap=JSON.parse(s);}catch(e){}
}
function saveMetaCache(){localStorage.setItem(META_KEY,JSON.stringify(metaMap));}
function metaDesc(name){return metaMap[name.toLowerCase()]||null;}
function _applyMeta(data){
  if(Array.isArray(data)){
    metaMap={};
    data.forEach(row=>{if(row.name)metaMap[String(row.name).toLowerCase()]={type:row.type||'',desc:row.description||''};});
    saveMetaCache();
    dispatchRender();
  }
}
function fetchMeta(force){
  if(!SHEET_URL)return Promise.resolve();
  if(USE_JSONP){
    return new Promise((resolve)=>{
      const cbName='_btbMeta'+Date.now();
      const script=document.createElement('script');
      const timeout=setTimeout(()=>{
        delete window[cbName];try{document.head.removeChild(script)}catch(e){}
        resolve();
      },12000);
      window[cbName]=(data)=>{
        clearTimeout(timeout);
        delete window[cbName];try{document.head.removeChild(script)}catch(e){}
        _applyMeta(data);resolve();
      };
      script.src=SHEET_URL+'?action=getMeta&callback='+cbName+'&_='+Date.now();
      script.onerror=()=>{clearTimeout(timeout);delete window[cbName];resolve();};
      document.head.appendChild(script);
    });
  }
  return fetch(SHEET_URL+'?action=getMeta&_='+Date.now(),{mode:'cors'})
    .then(r=>r.json()).then(_applyMeta).catch(()=>{});
}
loadMetaCache();

function normalise(g){
  if(!Array.isArray(g.genres)){
    if(g.genres&&typeof g.genres==='string'){try{g.genres=JSON.parse(g.genres)}catch(e){g.genres=g.genres.split(',').map(s=>s.trim()).filter(Boolean)}}
    else{g.genres=g.genre?g.genre.split(',').map(s=>s.trim()).filter(Boolean):[]}
  }
  if(!Array.isArray(g.platforms)){
    if(g.platforms&&typeof g.platforms==='string'){try{g.platforms=JSON.parse(g.platforms)}catch(e){g.platforms=g.platforms.split(',').map(s=>s.trim()).filter(Boolean)}}
    else{g.platforms=g.platform?g.platform.split(',').map(s=>s.trim()).filter(Boolean):[]}
  }
  if(!Array.isArray(g.tags)){
    if(g.tags&&typeof g.tags==='string'){try{g.tags=JSON.parse(g.tags)}catch(e){g.tags=g.tags.split(',').map(s=>s.trim()).filter(Boolean)}}
    else{g.tags=[]}
  }
  if(g.status)g.status=String(g.status).toLowerCase().trim();
  if(!g.status)g.status='wishlist';
  g.id=g.id!==undefined&&g.id!==null&&g.id!==''?String(g.id):gid();
  if(!g.added)g.added=Date.now();
  if(g.releaseDate)g.releaseDate=normaliseDate(g.releaseDate);
  // Sheet Date cells in tbaText column come back as ISO strings — move to releaseDate
  if(g.tbaText&&/^\d{4}-\d{2}-\d{2}[T ]/.test(String(g.tbaText))){
    if(!g.releaseDate)g.releaseDate=normaliseDate(String(g.tbaText));
    g.tbaText='';
  }
  // Google Sheets auto-converts "Month YYYY" text to a Date cell; Code.gs returns it as
  // YYYY-MM-01. Restore it to a human-readable "Month YYYY" label.
  if(g.tbaText&&/^\d{4}-\d{2}-01$/.test(String(g.tbaText))){
    const p=g.tbaText.split('-');
    g.tbaText=['January','February','March','April','May','June','July','August','September','October','November','December'][parseInt(p[1])-1]+' '+p[0];
  }
  g.steamAppId=(g.steamAppId!==undefined&&g.steamAppId!==null&&g.steamAppId!=='')?String(g.steamAppId):'';
  delete g.played; // field removed — no longer used

  // steamCollection: parse JSON array string or comma-separated from Sheet
  if(g.steamCollection&&typeof g.steamCollection==='string'){
    try{g.steamCollection=JSON.parse(g.steamCollection)}
    catch(e){g.steamCollection=g.steamCollection.split(',').map(s=>s.trim()).filter(Boolean)}
  }
  if(!Array.isArray(g.steamCollection))g.steamCollection=[];
  // notes: parse JSON array of {id,date,text} objects from Sheet string
  if(!Array.isArray(g.notes)){
    if(g.notes&&typeof g.notes==='string'){try{g.notes=JSON.parse(g.notes)}catch(e){g.notes=[]}}
    else{g.notes=[]}
  }
  // Normalise purchaseDate to dd/mm/yyyy
  if(g.purchaseDate){const pf=fmtDate(String(g.purchaseDate));if(pf&&pf!==String(g.purchaseDate))g.purchaseDate=pf;}
  // parentAppId: ensure string or null
  if(g.parentAppId!==undefined&&g.parentAppId!==null&&g.parentAppId!=='')
    g.parentAppId=String(g.parentAppId);
  else g.parentAppId=null;
  return g;
}
let games=[];
function gid(){return Date.now()+Math.random().toString(36).slice(2,6)}
function nid(){return'n'+Date.now()+Math.random().toString(36).slice(2,5)}
function todayStr(){const d=new Date();return`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`}

// ── OFFLINE FALLBACK ──────────────────────
function loadOffline(){
  const stored=localStorage.getItem(KEY);
  if(stored){try{return JSON.parse(stored).map(g=>normalise(g))}catch(e){}}
  return SEED.map(g=>normalise(g));
}
function saveOffline(){localStorage.setItem(KEY,JSON.stringify(games))}

function _jsonpLoad(action){
  return new Promise((resolve,reject)=>{
    const cbName='_btbLoad'+Date.now();
    const script=document.createElement('script');
    const timeout=setTimeout(()=>{
      delete window[cbName];
      try{document.head.removeChild(script)}catch(e){}
      reject(new Error('timeout'));
    },14000);
    window[cbName]=function(data){
      clearTimeout(timeout);
      delete window[cbName];
      try{document.head.removeChild(script)}catch(e){}
      if(data&&data.error)reject(new Error(data.error));
      else resolve(Array.isArray(data)?data:[]);
    };
    script.crossOrigin='anonymous';
    script.src=SHEET_URL+'?action='+action+'&callback='+cbName+'&_='+Date.now();
    script.onerror=()=>{
      clearTimeout(timeout);
      delete window[cbName];
      try{document.head.removeChild(script)}catch(e){}
      reject(new Error('script load error — check SHEET_URL and deployment'));
    };
    document.head.appendChild(script);
  });
}

function loadFromSheet(){
  if(USE_JSONP) return _jsonpLoad('getAll');
  const timeout=new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),14000));
  return Promise.race([
    fetch(SHEET_URL+'?action=getAll&_='+Date.now(),{mode:'cors'}).then(r=>r.json()),
    timeout
  ]).catch(()=>_jsonpLoad('getAll'));
}

// ── SHEETS: SAVE ─────────────────────────
let _saveQueue=[];
let _saveFlushing=false;
// Partial save: changed game IDs queued, flushed as individual row updates
// Falls back to full setAll if Apps Script doesn't support setRow
const _changedIds=new Set();
function save(changedId){
  if(OFFLINE){saveOffline();return}
  localStorage.setItem(KEY,JSON.stringify(games));
  if(changedId)_changedIds.add(changedId);
  clearTimeout(save._debounce);
  save._debounce=setTimeout(flushSave,400);
}
function flushSave(){
  if(_saveFlushing){_saveQueue.push(true);return}
  _saveFlushing=true;
  setSyncStatus('syncing','Saving…');
  // Try partial save first if only a few rows changed
  if(_changedIds.size>0&&_changedIds.size<=5){
    const ids=[..._changedIds];
    _changedIds.clear();
    const rows=ids.map(id=>games.find(g=>g.id===id)).filter(Boolean);
    if(rows.length){
      postToSheet({action:'setRows',data:JSON.stringify(rows)})
        .then(()=>{_saveFlushing=false;setSyncStatus('ok','Saved');if(_saveQueue.length){_saveQueue=[];flushSave()}})
        .catch(()=>{
          // Apps Script doesn't support setRows — fall back to full save
          _saveFlushing=false;
          _changedIds.clear();
          postToSheet({action:'setAll',data:JSON.stringify(games)})
            .then(()=>{_saveFlushing=false;setSyncStatus('ok','Saved');if(_saveQueue.length){_saveQueue=[];flushSave()}})
            .catch(err=>{_saveFlushing=false;setSyncStatus('err','Save failed — check console');console.error('BTB save error:',err)});
        });
      return;
    }
  }
  _changedIds.clear();
  postToSheet({action:'setAll',data:JSON.stringify(games)})
    .then(()=>{
      _saveFlushing=false;
      setSyncStatus('ok','Saved');
      if(_saveQueue.length){_saveQueue=[];flushSave()}
    })
    .catch(err=>{
      _saveFlushing=false;
      setSyncStatus('err','Save failed — check console');
      console.error('BTB save error:',err);
    });
}

// POST via fetch — no URL length limit, works cross-origin because
// Apps Script returns the CORS header Access-Control-Allow-Origin: *
function postToSheet(params){
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('timeout')),18000);
    const qs=Object.entries(params)
      .filter(([k])=>k!=='data')
      .map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v))
      .join('&');
    const url=SHEET_URL+(qs?'?'+qs:'');
    const body=params.data!==undefined?params.data:null;
    fetch(url,{
      method: body!==null?'POST':'GET',
      mode:'cors',
      headers:body!==null?{'Content-Type':'text/plain'}:{},
      body:body!==null?body:undefined
    })
    .then(r=>r.json())
    .then(resp=>{
      clearTimeout(timeout);
      if(resp&&resp.error)reject(new Error(resp.error));
      else resolve(resp);
    })
    .catch(err=>{clearTimeout(timeout);reject(err)});
  });
}

// ══════════════════════════════════════════
//  RELEASE CALENDAR
// ══════════════════════════════════════════
let calYear=0,calMonth=0,calView='grid',calShowTba=false;

function openCalendar(){
  const now=new Date();
  calYear=now.getFullYear();
  calMonth=now.getMonth();
  calShowTba=false;
  // Force list view on mobile
  if(window.innerWidth<=640){
    calView='list';
    const _cg=document.getElementById('calGridBtn');if(_cg)_cg.classList.remove('on');
    const _cl=document.getElementById('calListBtn');if(_cl)_cl.classList.add('on');
  }
  document.getElementById('calOv').classList.add('on');
  document.getElementById('calOv').style.display='flex';
  populateCalSelects();
  renderCalendar();
}
function closeCalendar(){
  document.getElementById('calOv').classList.remove('on');
  document.getElementById('calOv').style.display='none';
  calShowTba=false;
}

function populateCalSelects(){
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const mSel=document.getElementById('calMonthSel');
  const ySel=document.getElementById('calYearSel');
  if(!mSel||!ySel)return;
  mSel.innerHTML=MONTHS.map((m,i)=>`<option value="${i}"${i===calMonth?' selected':''}>${m}</option>`).join('');
  const curY=new Date().getFullYear();
  let yHTML='';
  for(let y=1951;y<=curY+10;y++) yHTML+=`<option value="${y}"${y===calYear?' selected':''}>${y}</option>`;
  ySel.innerHTML=yHTML;
}

function calendarGames(){
  return games.filter(g=>g.title&&(g.releaseDate||g.tbaText)&&!isCancelled(g));
}

function renderCalendar(){
  // Keep selects in sync
  const mSel=document.getElementById('calMonthSel');
  const ySel=document.getElementById('calYearSel');
  if(mSel)mSel.value=calMonth;
  if(ySel)ySel.value=calYear;

  const allCal=calendarGames();
  const tbaGames=allCal.filter(g=>!g.releaseDate&&g.tbaText);
  const datedGames=allCal.filter(g=>g.releaseDate);

  // TBA list — paginated sidebar
  const TBA_PAGE_SIZE=20;
  let tbaPage=0;
  function renderTbaList(){
    const track=document.getElementById('calTbaTrack');
    const pagination=document.getElementById('tbaPagination');
    if(!track)return;
    if(tbaGames.length===0){
      track.innerHTML=`<div class="tba-list-page"><div style="font-size:.68rem;color:var(--t3)">None</div></div>`;
      if(pagination)pagination.style.display='none';
      return;
    }
    const totalPages=Math.ceil(tbaGames.length/TBA_PAGE_SIZE);
    let pagesHTML='';
    for(let p=0;p<totalPages;p++){
      const slice=tbaGames.slice(p*TBA_PAGE_SIZE,(p+1)*TBA_PAGE_SIZE);
      pagesHTML+=`<div class="tba-list-page"><div class="cal-tba-grid">${slice.map(g=>`
        <div class="cal-tba-chip" title="${esc(g.title)} — ${esc(g.tbaText)}" onclick="closeCalendar();openPanel('${g.id}')"><span class="cal-tba-chip-title">${esc(g.title)}</span><span class="cal-tba-chip-sub">${esc(g.tbaText)}</span></div>
      `).join('')}</div></div>`;
    }
    track.innerHTML=pagesHTML;
    track.style.width=(totalPages*100)+'%';
    track.querySelectorAll('.tba-list-page').forEach(p=>{
      p.style.width=(100/totalPages)+'%';
      p.style.minWidth=(100/totalPages)+'%';
    });
    track.style.transform=`translateX(-${tbaPage*(100/totalPages)}%)`;
  }
  renderTbaList();

  // Wire swipe/drag on TBA viewport
  const viewport=document.getElementById('calTbaViewport');
  if(viewport){
    let dragStartX=null,isDragging=false,liveOffset=0,dragMoved=false;
    function getTotalPages(){return Math.ceil(tbaGames.length/TBA_PAGE_SIZE)}
    function goToPage(p){
      const track=document.getElementById('calTbaTrack');
      const total=getTotalPages();
      tbaPage=Math.max(0,Math.min(total-1,p));
      if(track){track.classList.remove('no-transition');track.style.transform=`translateX(-${tbaPage*(100/total)}%)`}
      renderTbaDots();
    }
    function renderTbaDots(){
      const pagination=document.getElementById('tbaPagination');
      const total=getTotalPages();
      if(!pagination||total<=1){if(pagination)pagination.style.display='none';return}
      pagination.style.display='flex';
      const MAX_DOTS=6;
      let html=`<button class="tba-page-btn" id="tbaDotPrev" ${tbaPage===0?'disabled':''} style="flex-shrink:0">‹</button>`;
      if(total<=MAX_DOTS){
        for(let i=0;i<total;i++)html+=`<div class="tba-page-dot${i===tbaPage?' active':''}" data-p="${i}" style="cursor:pointer"></div>`;
      } else {
        let start=Math.max(0,Math.min(tbaPage-2,total-MAX_DOTS));
        let end=start+MAX_DOTS;
        if(start>0)html+=`<div class="tba-page-dot" style="opacity:.3;cursor:default"></div>`;
        for(let i=start;i<end;i++)html+=`<div class="tba-page-dot${i===tbaPage?' active':''}" data-p="${i}" style="cursor:pointer"></div>`;
        if(end<total)html+=`<div class="tba-page-dot" style="opacity:.3;cursor:default"></div>`;
      }
      html+=`<button class="tba-page-btn" id="tbaDotNext" ${tbaPage===total-1?'disabled':''} style="flex-shrink:0">›</button>`;
      pagination.innerHTML=html;
      pagination.querySelectorAll('.tba-page-dot[data-p]').forEach(dot=>{dot.onclick=()=>goToPage(parseInt(dot.dataset.p))});
      const prevBtn=document.getElementById('tbaDotPrev');
      const nextBtn=document.getElementById('tbaDotNext');
      if(prevBtn)prevBtn.onclick=()=>goToPage(tbaPage-1);
      if(nextBtn)nextBtn.onclick=()=>goToPage(tbaPage+1);
    }
    viewport.addEventListener('mousedown',e=>{
      if(getTotalPages()<=1)return;
      dragStartX=e.clientX;isDragging=true;dragMoved=false;liveOffset=0;
      const track=document.getElementById('calTbaTrack');if(track)track.classList.add('no-transition');
      e.preventDefault();
    });
    document.addEventListener('mousemove',e=>{
      if(!isDragging||dragStartX===null)return;
      liveOffset=e.clientX-dragStartX;
      if(Math.abs(liveOffset)>4){dragMoved=true;viewport.classList.add('dragging')}
      const track=document.getElementById('calTbaTrack');if(!track)return;
      const total=getTotalPages();
      track.style.transform=`translateX(calc(-${tbaPage*(100/total)}% + ${liveOffset}px))`;
    });
    document.addEventListener('mouseup',e=>{
      if(!isDragging)return;
      isDragging=false;viewport.classList.remove('dragging');
      const threshold=viewport.offsetWidth*0.25;
      if(liveOffset<-threshold)goToPage(tbaPage+1);
      else if(liveOffset>threshold)goToPage(tbaPage-1);
      else goToPage(tbaPage);
      dragStartX=null;
      if(dragMoved)document.addEventListener('click',e=>e.stopPropagation(),{capture:true,once:true});
      dragMoved=false;
    });
    let touchStartX=null;
    viewport.addEventListener('touchstart',e=>{
      if(getTotalPages()<=1)return;
      touchStartX=e.touches[0].clientX;
      const track=document.getElementById('calTbaTrack');if(track)track.classList.add('no-transition');
    },{passive:true});
    viewport.addEventListener('touchmove',e=>{
      if(touchStartX===null)return;
      const track=document.getElementById('calTbaTrack');if(!track)return;
      const dx=e.touches[0].clientX-touchStartX;
      const tot=getTotalPages();
      track.style.transform=`translateX(calc(-${tbaPage*(100/tot)}% + ${dx}px))`;
    },{passive:true});
    viewport.addEventListener('touchend',e=>{
      if(touchStartX===null)return;
      const dx=e.changedTouches[0].clientX-touchStartX;
      const threshold=viewport.offsetWidth*0.25;
      if(dx<-threshold)goToPage(tbaPage+1);
      else if(dx>threshold)goToPage(tbaPage-1);
      else goToPage(tbaPage);
      touchStartX=null;
    },{passive:true});
    renderTbaDots();
  }

  // Update TBA button badge on mobile
  const tbaBtn=document.getElementById('calTbaBtn');
  if(tbaBtn){
    tbaBtn.textContent=tbaGames.length?`TBA (${tbaGames.length})`:'TBA';
    tbaBtn.classList.toggle('on',calShowTba);
  }

  const main=document.getElementById('calMain');
  const calTbaEl=document.getElementById('calTba');
  const isMobile=window.innerWidth<=640;

  // Mobile TBA panel toggle
  if(isMobile&&calShowTba){
    calTbaEl.style.cssText='display:flex;flex-direction:column;width:100%;border-left:none;padding:.85rem 1rem;min-height:300px';
    main.style.display='none';
    const vp=document.getElementById('calTbaViewport');
    if(vp)vp.style.height='280px';
    return;
  } else {
    if(isMobile)calTbaEl.style.display='none';
    else calTbaEl.style.cssText='';// use .cal-tba-wide CSS
    main.style.display='';
  }

  // Mobile: list view for current month only
  if(isMobile){
    const monthGames=datedGames
      .filter(g=>{const d=normaliseDate(g.releaseDate);return d.startsWith(`${calYear}-${String(calMonth+1).padStart(2,'0')}`)})
      .sort((a,b)=>normaliseDate(a.releaseDate).localeCompare(normaliseDate(b.releaseDate)));
    if(!monthGames.length){
      main.innerHTML=`<div style="color:var(--t3);font-size:.8rem;padding:1rem 0">No releases this month.</div>`;
    } else {
      main.innerHTML=monthGames.map(g=>`
        <div class="cal-list-item${isPreOrder(g)?' pre':''}" onclick="closeCalendar();openPanel('${g.id}')">
          <div class="cal-list-date">${fmtDate(g.releaseDate)}</div>
          <div class="cal-list-title">${esc(g.title)}</div>
          ${isPreOrder(g)?'<span style="font-size:.6rem;background:var(--amber);color:#031329;border-radius:4px;padding:1px 5px;font-weight:700;flex-shrink:0">PRE</span>':''}
        </div>`).join('');
    }
    return;
  }

  // Desktop: 3-month stacked grid view
  const DAYS=['M','T','W','T','F','S','S'];
  const todayISOs=todayISO();
  const byDate={};
  datedGames.forEach(g=>{
    const d=normaliseDate(g.releaseDate);
    if(!byDate[d])byDate[d]=[];
    byDate[d].push(g);
  });

  const MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const nowISO=todayISO();
  const nowYear=new Date().getFullYear();
  const nowMonth=new Date().getMonth();

  function renderMonthGrid(year,month){
    const isCurrentMonth=(year===nowYear&&month===nowMonth);
    const firstDow=(new Date(year,month,1).getDay()+6)%7;
    const daysInMonth=new Date(year,month+1,0).getDate();
    const daysInPrev=new Date(year,month,0).getDate();
    let html=`<div class="cal-month-block">`;
    html+=`<div class="cal-month-label${isCurrentMonth?' is-current':''}">${MONTH_NAMES[month]} ${year}</div>`;
    html+=`<div class="cal-grid">`;
    DAYS.forEach(d=>html+=`<div class="cal-dow">${d}</div>`);
    for(let i=0;i<firstDow;i++){
      html+=`<div class="cal-cell other-month"><div class="cal-dn">${daysInPrev-firstDow+1+i}</div></div>`;
    }
    for(let day=1;day<=daysInMonth;day++){
      const dateStr=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const isToday=dateStr===todayISOs;
      const isPast=dateStr<todayISOs;
      const cellGames=byDate[dateStr]||[];
      const hasPre=cellGames.some(g=>isPreOrder(g));
      const countBadge=cellGames.length>0
        ?`<div class="cal-count${hasPre?' has-pre':''}" data-date="${dateStr}">${cellGames.length}</div>
          <div class="cal-pop" id="pop-${dateStr}">
            ${cellGames.map(g=>`<div class="cal-pop-item${isPreOrder(g)?' pre':''}" onclick="closeCalendar();openPanel('${g.id}')">${esc(g.title)}</div>`).join('')}
          </div>`
        :'';
      html+=`<div class="cal-cell${isToday?' today':''}${isPast?' past':''}">
        <div class="cal-dn">${day}</div>${countBadge}
      </div>`;
    }
    const totalCells=firstDow+daysInMonth;
    const remaining=(7-totalCells%7)%7;
    for(let i=1;i<=remaining;i++)html+=`<div class="cal-cell other-month"><div class="cal-dn">${i}</div></div>`;
    html+=`</div></div>`;
    return html;
  }

  // Render 2 months stacked vertically
  let mo0=calMonth, yr0=calYear;
  let mo1=calMonth+1, yr1=calYear;
  if(mo1>11){mo1-=12;yr1++}
  let html='<div class="cal-2stack"><div class="cal-months-col">';
  html+=renderMonthGrid(yr0,mo0);
  html+=renderMonthGrid(yr1,mo1);
  html+='</div></div>';
  main.innerHTML=html;

  // Sync TBA viewport height
  requestAnimationFrame(()=>{
    const vp=document.getElementById('calTbaViewport');
    if(vp&&main){
      const availH=Math.max(120,main.offsetHeight-68);
      vp.style.height=availH+'px';
      vp.style.overflow='hidden';
    }
    renderTbaList();
  });

  // Wire count badge clicks
  main.querySelectorAll('.cal-count').forEach(badge=>{
    badge.addEventListener('click',function(e){
      e.stopPropagation();
      const dateStr=this.dataset.date;
      const pop=document.getElementById('pop-'+dateStr);
      main.querySelectorAll('.cal-pop.open').forEach(p=>{if(p!==pop)p.classList.remove('open')});
      pop.classList.toggle('open');
    });
  });
}

// Calendar controls
document.getElementById('calClose').addEventListener('click',closeCalendar);
document.getElementById('calOv').addEventListener('click',e=>{if(e.target===document.getElementById('calOv'))closeCalendar()});
document.getElementById('calPrev').addEventListener('click',()=>{
  calMonth--;if(calMonth<0){calMonth=11;calYear--}populateCalSelects();renderCalendar();
});
document.getElementById('calNext').addEventListener('click',()=>{
  calMonth++;if(calMonth>11){calMonth=0;calYear++}populateCalSelects();renderCalendar();
});
document.getElementById('calMonthSel').addEventListener('change',function(){
  calMonth=parseInt(this.value);renderCalendar();
});
document.getElementById('calYearSel').addEventListener('change',function(){
  calYear=parseInt(this.value);renderCalendar();
});
document.getElementById('calTbaBtn').addEventListener('click',()=>{
  calShowTba=!calShowTba;
  renderCalendar();
});
// Close calendar popovers when clicking outside — single listener, never accumulates
document.addEventListener('click',function(e){
  if(!e.target.closest('.cal-count')&&!e.target.closest('.cal-pop')){
    document.querySelectorAll('.cal-pop.open').forEach(p=>p.classList.remove('open'));
  }
});

// ── SYNC PILL TAP TO RETRY ───────────────
document.addEventListener('DOMContentLoaded',()=>{
  const pill = document.getElementById('syncPill');
  if(pill) pill.addEventListener('click',()=>{
    if(!OFFLINE) initData();
  });
});

// ── INIT: LOAD ON OPEN ────────────────────
async function initData(){
  if(OFFLINE){
    games=loadOffline();
    setSyncStatus('offline','Offline mode');
    dispatchRender();
    return;
  }
  setSyncStatus('syncing','Loading…');
  try{
    const data=await loadFromSheet();
    games=data.map(g=>normalise(g));
    // Also cache locally for resilience
    localStorage.setItem(KEY,JSON.stringify(games));
    setSyncStatus('ok','Loaded');
    dispatchRender();
    // Fetch metadata in background (non-blocking)
    fetchMeta();
  }catch(err){
    console.warn('BTB: Could not load from Sheet, falling back to localStorage.',err);
    games=loadOffline();
    setSyncStatus('err','Sheet unavailable — using local cache');
    dispatchRender();
  }
}

// ══════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════
let af='all',vm='grid',openId=null,editId=null,rmId=null,riId=null;
let appMode='wishlist'; // 'wishlist' | 'collection'
let cfPlayStatus=new Set(),cfSteamCol=new Set(),cfSteamColLogic='or';
let hrMinVal=0,hrMaxVal=100;

let cGenres=[],cTags=[],cStars=0;
let fGenres=new Set(),fTags=new Set(),fPrios=new Set(),fPlats=new Set();
let fGenreLogic='or',fTagLogic='or';
let cfGenres=new Set(),cfGenreLogic='or',cfPlats=new Set();

// ══════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════
const esc=s=>s?String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'):'';
const nr=g=>g.hotness===''||g.hotness===null||g.hotness===undefined;
const isUnreleased=g=>isGameUnreleased(g); // alias
const sc=id=>`https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`;

function prioColor(p){return p==='high'?'var(--cyan)':p==='low'?'var(--lime)':'var(--magenta)'}
const PLAT_COLORS={'Steam':'#66c0f4','Epic Games':'#101014','GOG':'#9b4dca','Other PC':'#555','PS':'#003791','Xbox':'#107c10','Nintendo':'#e4000f'};
function platColor(p){return PLAT_COLORS[p]||'#555'}
function platTextColor(p){return p==='Epic Games'?'#fff':p==='GOG'?'#fff':p==='PS'?'#fff':p==='Xbox'?'#fff':p==='Nintendo'?'#fff':'#031329'}
function platBadgesHTML(g){
  const ps=g.platforms&&g.platforms.length?g.platforms:(g.platform?g.platform.split(',').map(s=>s.trim()).filter(Boolean):[]);
  if(!ps.length)return'';
  return`<div class="cc-plats">${ps.map(p=>`<span class="b-plat" style="background:${platColor(p)};color:${platTextColor(p)}">${esc(p)}</span>`).join('')}</div>`;
}
function prioLabel(p){return t(p==='high'?'pHi':p==='low'?'pLo':'pMe')}

// ── DATE HELPERS ─────────────────────────
// Normalise any date format to YYYY-MM-DD string
function normaliseDate(raw){
  if(!raw)return'';
  const s=String(raw).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  // ISO 8601 or SQL datetime — slice the date part, no timezone conversion
  if(/^\d{4}-\d{2}-\d{2}[T ]/.test(s))return s.slice(0,10);
  // Numeric epoch: 10 digits = seconds, 13 digits = milliseconds
  if(/^\d{10,13}$/.test(String(raw))){
    const ms=String(raw).length<=10?Number(raw)*1000:Number(raw);
    const d=new Date(ms);
    if(!isNaN(d))return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  const m=String(raw).match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2}|\d{4})$/);
  if(m){let[,d,mo,y]=m;if(y.length===2)y=(parseInt(y)<50?'20':'19')+y;return`${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`}
  // Google Visualization API date format: "Date(2024,3,25)" — month is 0-based
  const gv=String(raw).match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})\)$/);
  if(gv){const[,y,mo,d]=gv;return`${y}-${String(Number(mo)+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
  // Last resort: try native Date parsing (handles "Mon Apr 25 2024 ..." etc.)
  const fd=new Date(String(raw));
  if(!isNaN(fd)&&fd.getFullYear()>1900){return`${fd.getFullYear()}-${String(fd.getMonth()+1).padStart(2,'0')}-${String(fd.getDate()).padStart(2,'0')}`}
  return String(raw);
}
function isTodayDate(raw){return normaliseDate(raw)===todayISO()}
function fmtDate(d){
  if(!d)return'';
  const n=normaliseDate(d);
  if(/^\d{4}-\d{2}-\d{2}$/.test(n)){const[y,mo,dd]=n.split('-');return`${dd}/${mo}/${y}`}
  return '';
}
function parseDate(raw){return normaliseDate(raw)}
function todayISO(){const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function isFutureDate(raw){
  const n=normaliseDate(raw);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(n))return false;
  return n>todayISO();
}
// A game is "unreleased" if it has tbaText OR a future releaseDate
function isGameUnreleased(g){
  return !!(g.tbaText||isFutureDate(g.releaseDate));
}
// A game is a pre-order if: status=bought AND future releaseDate
function isPreOrder(g){
  return g.status==='bought'&&isGameUnreleased(g);
}
// A game is cancelled if tbaText is "cancelled" (case-insensitive)
function isCancelled(g){
  return typeof g.tbaText==='string'&&g.tbaText.trim().toLowerCase()==='cancelled';
}
function daysAgo(ts){
  if(!ts)return null;
  return Math.floor((Date.now()-ts)/(1000*60*60*24));
}
const _months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtAdded(d,val){
  if(d===null)return'—';
  if(d===0)return'Today';
  if(d===1)return'Yesterday';
  if(d<=7)return`${d} days ago`;
  const dt=new Date(val);
  return`${dt.getDate()} ${_months[dt.getMonth()]} ${dt.getFullYear()}`;
}
function addedTip(g){
  const d=daysAgo(g.added);
  if(d===null)return'';
  const label=fmtAdded(d,g.added);
  return`Added ${label}`;
}

const FAV_STEAM='https://store.steampowered.com/favicon.ico';
const FAV_GG='https://gg.deals/favicon.ico';
const FAV_SDB="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%231b2838'/%3E%3Ctext x='16' y='22' text-anchor='middle' font-family='Arial' font-weight='bold' font-size='16' fill='%2366c0f4'%3EDB%3C/text%3E%3C/svg%3E";
function favImg(src,alt){return`<img src="${src}" alt="${alt}" width="13" height="13" onerror="this.style.opacity='.3'">`}

// ══════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════
let toastTimer=null;
function showToast(msg,type=''){
  const el=document.getElementById('toast');
  el.textContent=msg;el.className='on'+(type?' '+type:'');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{el.className=''},3200);
}

// ══════════════════════════════════════════
//  GENRE SUGGESTIONS
// ══════════════════════════════════════════
function allGenres(){
  const set=new Set();
  games.forEach(g=>(g.genres||[]).forEach(x=>{if(x)set.add(x)}));
  return[...set].sort();
}
function allDevPub(field){
  const set=new Set();
  games.forEach(g=>{if(g[field])set.add(g[field])});
  return[...set].sort();
}
function allTagsSorted(){
  const freq={};
  games.forEach(g=>(g.tags||[]).forEach(t=>{if(t)freq[t]=(freq[t]||0)+1}));
  return Object.keys(freq).sort((a,b)=>freq[b]-freq[a]||a.localeCompare(b));
}
function allSteamCollections(){
  // Merge Sheet data values + hardcoded seed, deduplicated + sorted
  const set=new Set(STEAM_COLLECTIONS);
  games.forEach(g=>(g.steamCollection||[]).forEach(c=>{if(c)set.add(c)}));
  return[...set].sort();
}

// ══════════════════════════════════════════
//  FILTER + SORT
// ══════════════════════════════════════════
function collectionFiltered(){
  const _si=document.getElementById('searchInput');const _sm=document.getElementById('searchInputMob');
  const q=((_si&&_si.value)||(_sm&&_sm.value)||'').trim().toLowerCase();
  return games.filter(g=>{
    if(g.status!=='bought')return false;
    if(q&&!(g.title||'').toLowerCase().includes(q)&&!(g.steamAppId&&String(g.steamAppId)===q.replace(/\D/g,'')))return false;
    if(cfPlayStatus.size>0&&!cfPlayStatus.has(g.playStatus||'Unplayed'))return false;
    if(cfSteamCol.size>0){
      const gc2=(g.steamCollection||[]).map(colLabel);
      const colMatch=cfSteamColLogic==='and'?[...cfSteamCol].every(c=>gc2.includes(c)):[...cfSteamCol].some(c=>gc2.includes(c));
      if(!colMatch)return false;
    }
    if(cfGenres.size>0){
      const gg=g.genres&&g.genres.length?g.genres:(g.genre?[g.genre]:[]);
      const genreMatch=cfGenreLogic==='and'?[...cfGenres].every(x=>gg.includes(x)):[...cfGenres].some(x=>gg.includes(x));
      if(!genreMatch)return false;
    }
    if(cfPlats.size>0){
      const gp=g.platforms&&g.platforms.length?g.platforms:(g.platform?g.platform.split(',').map(s=>s.trim()).filter(Boolean):[]);
      if(!gp.some(p=>cfPlats.has(p)))return false;
    }
    return true;
  });
}

function collectionSorted(list){
  const s=document.getElementById('cSortSel').value;
  return[...list].sort((a,b)=>{
    if(s==='title')return(a.title||'').localeCompare(b.title||'');
    if(s==='playstatus'){
      const order=['In Progress','Completed','Unplayed','Superseded','Unfinishable','Played on Different Platform','Will Never Complete','Will Never Play'];
      return(order.indexOf(a.playStatus||'Unplayed'))-(order.indexOf(b.playStatus||'Unplayed'));
    }
    if(s==='cost-desc')return(parseFloat(b.cost)||0)-(parseFloat(a.cost)||0);
    if(s==='cost-asc')return(parseFloat(a.cost)||0)-(parseFloat(b.cost)||0);
    if(s==='purchaseDate'){
      function _pdKey(d){if(!d)return'';const m=d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:''}
      return _pdKey(b.purchaseDate).localeCompare(_pdKey(a.purchaseDate));
    }
    // default: steamcol — group by first collection, then title
    const ca=(a.steamCollection&&a.steamCollection[0])||'zzz';
    const cb2=(b.steamCollection&&b.steamCollection[0])||'zzz';
    return ca!==cb2?ca.localeCompare(cb2):(a.title||'').localeCompare(b.title||'');
  });
}

function filtered(){
  const _si=document.getElementById('searchInput');const _sm=document.getElementById('searchInputMob');
  const q=((_si&&_si.value)||(_sm&&_sm.value)||'').trim();
  const ql=q.toLowerCase();
  const isNumeric=/^\d+$/.test(q);
  return games.filter(g=>{
    if(q){
      const titleMatch=(g.title||'').toLowerCase().includes(ql);
      const appIdMatch=isNumeric&&g.steamAppId&&String(g.steamAppId)===q;
      if(!titleMatch&&!appIdMatch)return false;
    }
    if(af==='wishlist'){if(!(g.status==='wishlist'&&!isCancelled(g)))return false;}
    // Bought/collection games never appear in wishlist tabs
    if(af==='all'&&g.status==='bought')return false;
    else if(af==='cancelled'){if(!isCancelled(g))return false;}
    else if(af==='removed'){if(g.status!=='removed')return false;}
    else if(af==='review'){if(!(g.status==='wishlist'&&!isCancelled(g)&&nr(g)))return false;}
    else if(af==='unreleased'){if(!((g.status==='wishlist'||g.status==='bought')&&isGameUnreleased(g)&&!isCancelled(g)))return false;}
    else{
      if(hrMinVal>0||hrMaxVal<100){
        if(!nr(g)){const h=parseInt(g.hotness)||0;if(h<hrMinVal||h>hrMaxVal)return false}
      }
    }
    if(fGenres.size>0){
      const gg=g.genres&&g.genres.length?g.genres:(g.genre?[g.genre]:[]);
      const match=fGenreLogic==='and'?[...fGenres].every(x=>gg.includes(x)):[...fGenres].some(x=>gg.includes(x));
      if(!match)return false;
    }
    if(fTags.size>0){
      const gt=g.tags||[];
      const match=fTagLogic==='and'?[...fTags].every(x=>gt.includes(x)):[...fTags].some(x=>gt.includes(x));
      if(!match)return false;
    }
    if(fPrios.size>0){
      const p=g.priority||'medium';
      if(!fPrios.has(p))return false;
    }
    if(fPlats.size>0){
      const gp=g.platforms&&g.platforms.length?g.platforms:(g.platform?g.platform.split(',').map(s=>s.trim()).filter(Boolean):[]);
      if(!gp.some(p=>fPlats.has(p)))return false;
    }
    return true;
  });
}
function sorted(list){
  const s=document.getElementById('sortSel').value;
  const prioOrder={high:0,medium:1,low:2};
  return[...list].sort((a,b)=>{
    if(s==='title')return a.title.localeCompare(b.title);
    if(s==='price-asc')return(parseFloat(a.price)||0)-(parseFloat(b.price)||0);
    if(s==='price-desc')return(parseFloat(b.price)||0)-(parseFloat(a.price)||0);
    if(s==='added')return b.added-a.added;
    if(s==='priority'){
      const pa=prioOrder[a.priority||'medium']!==undefined?prioOrder[a.priority||'medium']:1;
      const pb=prioOrder[b.priority||'medium']!==undefined?prioOrder[b.priority||'medium']:1;
      return pa!==pb?pa-pb:b.added-a.added;
    }
    if(s==='release-asc'){
      const da=normaliseDate(a.releaseDate)||'9999-99-99';
      const db=normaliseDate(b.releaseDate)||'9999-99-99';
      return da!==db?da.localeCompare(db):a.title.localeCompare(b.title);
    }
    const ha=nr(a)?null:parseInt(a.hotness)||0;
    const hb=nr(b)?null:parseInt(b.hotness)||0;
    if(ha===null&&hb===null)return b.added-a.added;
    if(ha===null)return-1;if(hb===null)return 1;
    return hb-ha;
  });
}

// ══════════════════════════════════════════
//  STATS
// ══════════════════════════════════════════
function fmtNum(n){return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')}
function fmtEur(n){
  const parts=n.toFixed(2).split('.');
  return '€'+fmtNum(parts[0])+'.'+parts[1];
}
function baselineGames(){
  return games.filter(g=>{
    if(af==='wishlist')return g.status==='wishlist'&&!isCancelled(g);
    if(af==='all')return g.status!=='bought';
    if(af==='cancelled')return isCancelled(g);
    if(af==='removed')return g.status==='removed';
    if(af==='review')return g.status==='wishlist'&&!isCancelled(g)&&nr(g);
    if(af==='unreleased')return(g.status==='wishlist'||g.status==='bought')&&isGameUnreleased(g)&&!isCancelled(g);
    return g.status!=='bought';
  });
}
function renderStats(){
  const cur=filtered();
  const baseline=baselineGames();
  const total=baseline.length;
  const isFiltered=cur.length!==total;
  const totVal=baseline.filter(g=>g.price).reduce((s,g)=>s+parseFloat(g.price),0);
  const curVal=cur.filter(g=>g.price).reduce((s,g)=>s+parseFloat(g.price),0);
  let countChip;
  if(isFiltered){
    countChip=`<div class="chip"><b>${fmtNum(cur.length)}</b><span style="color:var(--muted)">/${fmtNum(total)}</span> games</div>`;
  } else {
    countChip=`<div class="chip"><b>${fmtNum(total)}</b> games</div>`;
  }
  let valChip;
  if(isFiltered){
    valChip=`<div class="chip"><b>${fmtEur(curVal)}</b><span style="color:var(--muted)">/${fmtEur(totVal)}</span></div>`;
  } else {
    valChip=`<div class="chip"><b>${fmtEur(totVal)}</b></div>`;
  }
  document.getElementById('statChips').innerHTML=countChip+valChip;
}

// ══════════════════════════════════════════
//  CARD
// ══════════════════════════════════════════
// ── FLOATING META TOOLTIP ────────────────────────────────────
(function(){
  const tip=document.getElementById('metaFloatTip');
  if(!tip)return;
  // Mouse hover (desktop)
  document.addEventListener('mouseover',e=>{
    const icon=e.target.closest('.meta-tip-icon');
    if(!icon)return;
    const desc=icon.dataset.desc;
    if(!desc)return;
    tip.textContent=desc;
    tip.style.display='block';
    const r=icon.getBoundingClientRect();
    const tw=180,th=tip.offsetHeight||60;
    let top=r.top-th-6;
    if(top<6)top=r.bottom+6;
    let left=r.left+r.width/2-tw/2;
    if(left<6)left=6;
    if(left+tw>window.innerWidth-6)left=window.innerWidth-tw-6;
    tip.style.top=top+'px';
    tip.style.left=left+'px';
  });
  document.addEventListener('mouseout',e=>{
    if(e.target.closest('.meta-tip-icon'))tip.style.display='none';
  });
  // Touch — show on tap, dismiss on next tap anywhere
  document.addEventListener('touchend',e=>{
    const icon=e.target.closest('.meta-tip-icon');
    if(icon){
      e.preventDefault();
      e.stopPropagation();
      const desc=icon.dataset.desc;
      if(!desc){tip.style.display='none';return}
      tip.textContent=desc;
      tip.style.display='block';
      const r=icon.getBoundingClientRect();
      const tw=180,th=tip.offsetHeight||60;
      let top=r.top-th-6;
      if(top<6)top=r.bottom+6;
      let left=r.left+r.width/2-tw/2;
      if(left<6)left=6;
      if(left+tw>window.innerWidth-6)left=window.innerWidth-tw-6;
      tip.style.top=top+'px';
      tip.style.left=left+'px';
      // Dismiss on next tap outside the icon
      setTimeout(()=>{
        document.addEventListener('touchend',function dismiss(){
          tip.style.display='none';
          document.removeEventListener('touchend',dismiss);
        });
      },0);
    } else {
      // Any tap outside closes it
      if(tip.style.display!=='none')tip.style.display='none';
    }
  },{capture:true,passive:false});
  document.addEventListener('scroll',()=>{tip.style.display='none';},{capture:true,passive:true});
})();

// Returns an ⓘ icon with tooltip if metadata exists for this name
function metaTipHTML(name){
  const m=metaDesc(name);
  if(!m||!m.desc)return'';
  return`<span class="meta-tip-icon" tabindex="0" data-desc="${esc(m.desc)}">ⓘ</span>`;
}

function cardHTML(g){
  const isNR=nr(g);
  const h=isNR?0:Math.min(100,Math.max(0,parseInt(g.hotness)||0));
  const coverUrl=g.cover||(g.steamAppId?sc(g.steamAppId):'');
  const cImg=coverUrl?`<img src="${esc(coverUrl)}" alt="${esc(g.title)}" onerror="this.style.display='none';this.previousElementSibling.style.display='flex'">`:'';
  const phStyle=coverUrl?'style="display:none"':'';

  // Left badge — pre-order replaces bought badge
  let lBdg='';
  if(isCancelled(g))             lBdg=`<span class="b-cancelled">CANCELLED</span>`;
  else if(isPreOrder(g))         lBdg=`<span class="bdg b-pre">PRE-ORDER</span>`;
  else if(g.status==='bought')   lBdg=`<span class="bdg b-bt">${t('bdgBt')}</span>`;
  else if(g.status==='removed')  lBdg=`<span class="bdg b-rm">${t('bdgRm')}</span>`;
  else if(isNR)                  lBdg=`<span class="b-rev">${t('bdgRev')}</span>`;
  else                           lBdg=`<span class="bdg b-hot">${h}</span>`;

  // Priority label badge (right side of pill bar)
  const prioLbl=`<span class="b-prio" style="background:${prioColor(g.priority)}">${prioLabel(g.priority)}</span>`;

  // Price / date / unreleased display
  let priceEl;
  if(isFutureDate(g.releaseDate)){
    const days=Math.ceil((new Date(normaliseDate(g.releaseDate))-new Date(todayISO()))/(1000*60*60*24));
    const cd=days===1?'tomorrow':days<=30?`in ${days}d`:null;
    const cdLabel=cd?` <span style="color:var(--amber);font-size:.6rem;font-weight:700">${cd}</span>`:'';
    priceEl=`<span class="b-unrel-card">${fmtDate(g.releaseDate)}${cdLabel}</span>`;
  } else if(g.tbaText){
    priceEl=`<span class="b-unrel-card">${esc(g.tbaText)}</span>`;
  } else if(g.price){
    priceEl=`<span class="cprice">€${parseFloat(g.price).toFixed(2)}</span>`;
  } else {
    priceEl=`<span class="cprice" style="color:var(--t3)">—</span>`;
  }

  const ggUrl=g.steamAppId?`https://gg.deals/steam/app/${g.steamAppId}/`:`https://gg.deals/search/?title=${encodeURIComponent(g.title||'')}`;
  const sdbUrl=g.steamAppId?`https://www.steamdb.info/app/${g.steamAppId}/`:`https://www.steamdb.info/search/?q=${encodeURIComponent(g.title||'')}`;
  const stUrl=g.storeLink||(g.steamAppId?`https://store.steampowered.com/app/${g.steamAppId}/`:`https://store.steampowered.com/search/?term=${encodeURIComponent(g.title||'')}`);
  const ba=g.status==='bought'?' ba':'';

  const gid_s=String(g.id);
  const tip=addedTip(g);


  // Remove/Reinstate button: removed→reinstate, bought→disabled, else→remove
  let rmBtn='';
  if(g.status==='removed'){
    rmBtn=`<button class="qb qri" title="Reinstate" onclick="event.stopPropagation();startReinstate('${gid_s}')">↩</button>`;
  } else if(g.status!=='bought'){
    rmBtn=`<button class="qb qr" title="Remove" onclick="event.stopPropagation();startRemove('${gid_s}')">✕</button>`;
  }

  return`<div class="gc st-${g.status||'wishlist'}${g.status==='bought'?' sb2':''}${isCancelled(g)?' cancelled':''}" data-id="${gid_s}" tabindex="0" role="button" aria-label="${esc(g.title)}"${tip?` data-added-tip="${esc(tip)}"`:''}>
    <div class="cc">
      <div class="cph" ${phStyle}>🎮</div>${cImg}
      <div class="cg"></div>
      <div class="hb2"><div class="hf" style="width:${h}%"></div></div>
      ${platBadgesHTML(g)}
    </div>
    <div class="pb">${lBdg}<div class="pb-r">${prioLbl}</div></div>
    <div class="cb">
      <div class="ct">${esc(g.title)}</div>
      <div class="cbot">
        ${priceEl}
        <div class="cq">
          <a href="${stUrl}" class="qb" title="Steam" target="_blank" onclick="event.stopPropagation()">${favImg(FAV_STEAM,'steam')}</a>
          <a href="${ggUrl}" class="qb" title="gg.deals" target="_blank" onclick="event.stopPropagation()">${favImg(FAV_GG,'gg')}</a>
          <a href="${sdbUrl}" class="qb" title="SteamDB" target="_blank" onclick="event.stopPropagation()">${favImg(FAV_SDB,'sdb')}</a>
          <button class="qb${ba}" title="${t('mBt')}" onclick="event.stopPropagation();handleMarkBought('${gid_s}')">✓</button>
          <button class="qb" title="Edit" onclick="event.stopPropagation();closePanel();openEdit('${gid_s}')">✏</button>
          ${rmBtn}
        </div>
      </div>
    </div>
  </div>`;
}

// ══════════════════════════════════════════
//  COLLECTION CARD + LIST ROW
// ══════════════════════════════════════════

function colLabel(s){return s?s.replace(/^[\dA-Za-z]+_/,''):s;}
const PS_META={
  'Unplayed':       {code:'UP',  cls:'ps-UP'},
  'In Progress':    {code:'IP',  cls:'ps-IP'},
  'Completed':      {code:'COM', cls:'ps-COM'},
  'Superseded':     {code:'SUP', cls:'ps-SUP'},
  'Unfinishable':   {code:'UF',  cls:'ps-UF'},
  'Played on Different Platform':{code:'PDP',cls:'ps-PDP'},
  'Will Never Complete':{code:'WNC',cls:'ps-WNC'},
  'Will Never Play':    {code:'WNP',cls:'ps-WNP'},
};

function psBadgeHTML(status){
  const m=PS_META[status]||{code:'?',cls:'ps-UP'};
  return`<span class="col-ps-badge ${m.cls}">${m.code}<span class="ps-tip">${esc(status||'Unplayed')}</span></span>`;
}

// Find parent game by steamAppId matching parentAppId
function findParentGame(g){
  if(!g.parentAppId)return null;
  return games.find(x=>x.steamAppId&&String(x.steamAppId)===String(g.parentAppId)&&x.status==='bought')||null;
}

// Find DLCs belonging to a given game
function findDlcs(g){
  if(!g.steamAppId)return[];
  return games.filter(x=>x.type==='dlc'&&x.parentAppId&&String(x.parentAppId)===String(g.steamAppId)&&x.status==='bought');
}


function colTypeBadge(g){
  if(g.type==='dlc') return '';
  const cols=g.steamCollection&&g.steamCollection.length?g.steamCollection:[];
  if(!cols.length) return '';
  const first=colLabel(cols[0]);
  const truncated=first.length>18?first.slice(0,17)+'…':first;
  const extra=cols.length>1?` +${cols.length-1}`:'';
  return`<span class="col-type-badge" title="${esc(cols.map(colLabel).join(', '))}">${esc(truncated)}${extra}</span>`;
}
function colCardHTML(g){
  const coverUrl=g.cover||(g.steamAppId?sc(g.steamAppId):'');
  const cImg=coverUrl?`<img src="${esc(coverUrl)}" alt="${esc(g.title)}" onerror="this.style.display='none';this.previousElementSibling.style.display='flex'">`:'';
  const phStyle=coverUrl?'style="display:none"':'';
  const sdbUrl=g.steamAppId?`https://www.steamdb.info/app/${g.steamAppId}/`:`https://www.steamdb.info/search/?q=${encodeURIComponent(g.title||'')}`;
  const stUrl=g.storeLink||(g.steamAppId?`https://store.steampowered.com/app/${g.steamAppId}/`:`https://store.steampowered.com/search/?term=${encodeURIComponent(g.title||'')}`);
  const gid_s=String(g.id);
  const ps=g.playStatus||'Unplayed';
  const psM=PS_META[ps]||{code:'UP',cls:'ps-UP'};
  const psBadgeCard=`<span class="col-ps-badge ${psM.cls} ps-card-badge" data-id="${gid_s}" title="Click to change status">${psM.code}<span class="ps-tip">${esc(ps)}</span></span>`;
  const _costNum=g.cost!==undefined&&g.cost!==''?parseFloat(g.cost):null;
  const costEl=_costNum===null
    ?'<span class="cprice" style="color:var(--t3)">—</span>'
    :_costNum===0
      ?'<span class="cprice" style="color:var(--lime);font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em">FREE</span>'
      :'<span class="cprice">€'+_costNum.toFixed(2)+'</span>';
  const dlcs=g.type!=='dlc'?findDlcs(g):[];
  const dlcBadge=dlcs.length?`<span class="dlc-count-badge" data-id="${gid_s}">DLC (${dlcs.length})</span>`:'';

  return`<div class="gc col-card st-bought" data-id="${gid_s}" tabindex="0" role="button" aria-label="${esc(g.title)}">
    <div class="cc">
      <div class="cph" ${phStyle}>🎮</div>${cImg}
      <div class="cg"></div>
      <div class="hb2" style="display:none"></div>
      ${platBadgesHTML(g)}
    </div>
    <div class="pb">${psBadgeCard}<div class="pb-r">${colTypeBadge(g)}</div></div>
    <div class="cb">
      <div class="ct">${esc(g.title)}</div>
      <div class="cbot">
        ${costEl}
        ${dlcBadge}
        <div class="cq">
          <a href="${stUrl}" class="qb" title="Steam" target="_blank" onclick="event.stopPropagation()">${favImg(FAV_STEAM,'steam')}</a>
          <a href="${sdbUrl}" class="qb" title="SteamDB" target="_blank" onclick="event.stopPropagation()">${favImg(FAV_SDB,'sdb')}</a>
          <button class="qb ba" title="Move back to Wishlist" onclick="event.stopPropagation();handleMarkBought('${gid_s}')">↩</button>
          <button class="qb" title="Edit" onclick="event.stopPropagation();closePanel();openEdit('${gid_s}')">✏</button>
        </div>
      </div>
    </div>
  </div>`;
}

function colRowHTML(g){
  const coverUrl=g.cover||(g.steamAppId?sc(g.steamAppId):'');
  const gid_s=String(g.id);
  const thumb=coverUrl
    ?`<img class="col-row-thumb" src="${esc(coverUrl)}" alt="" onerror="this.style.display='none'">`
    :`<div class="col-row-thumb-ph">🎮</div>`;
  const tags=(g.steamCollection&&g.steamCollection.length)
    ?g.steamCollection.slice(0,3).map(s=>`<span class="col-row-tag">${esc(colLabel(s))}</span>`).join('')
    :'';
  const ps=g.playStatus||'Unplayed';
  const isDlcRow=g.type==='dlc'&&findParentGame(g);
  return`<div class="col-row${isDlcRow?' dlc-row':''}" data-id="${gid_s}" tabindex="0" role="button" aria-label="${esc(g.title)}">
    ${thumb}
    <span class="col-row-title">${esc(g.title)}</span>
    <div class="col-row-tags">${tags}</div>
    ${psBadgeHTML(ps)}
  </div>`;
}

// ══════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════

// ══════════════════════════════════════════
//  TODAY'S RELEASES TICKER
// ══════════════════════════════════════════
function renderTicker(){
  const today=todayISO();
  const hits=games.filter(g=>normaliseDate(g.releaseDate)===today&&g.title);
  const ticker=document.getElementById('todayTicker');
  const inner=document.getElementById('tickerInner');
  if(!hits.length){ticker.classList.remove('active');return}
  ticker.classList.add('active');
  inner.innerHTML=hits.map(g=>`<span class="ticker-item" onclick="openPanel('${g.id}')">${g.title}</span>`).join('');
}

// ══════════════════════════════════════════
//  COLLAPSIBLE SECTIONS
// ══════════════════════════════════════════
const COLLAPSED_KEY='btb_collapsed';
function getCollapsed(){try{return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY))||[])}catch(e){return new Set()}}
function setCollapsed(s){localStorage.setItem(COLLAPSED_KEY,JSON.stringify([...s]))}

// ── BATCH / VIRTUAL RENDER STATE ─────────────────────
const BATCH=40; // cards per render chunk
const sectionState=new Map(); // sectionEl → {cards,rendered,gcls}
let batchObserver=null;

function initBatchObserver(){
  if(batchObserver)batchObserver.disconnect();
  const root=document.getElementById('content');
  batchObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      const sentinel=entry.target;
      const sb=sentinel.closest('.sb');
      if(!sb)return;
      const state=sectionState.get(sb);
      if(!state)return;
      renderNextBatch(sb,state);
    });
  },{root,rootMargin:'200px 0px',threshold:0});
}

function renderNextBatch(sb,state){
  const grid=sb.querySelector('.gg,.gg.lv');
  if(!grid)return;
  const sentinel=sb.querySelector('.batch-sentinel');
  if(sentinel)batchObserver&&batchObserver.unobserve(sentinel);
  const next=state.cards.slice(state.rendered,state.rendered+BATCH);
  if(!next.length)return;
  const fn=state.cardFn||cardHTML;

  {
    const frag=document.createDocumentFragment();
    const tmp=document.createElement('div');
    tmp.innerHTML=next.map(fn).join('');
    while(tmp.firstChild)frag.appendChild(tmp.firstChild);
    if(sentinel)grid.removeChild(sentinel);
    grid.appendChild(frag);
  }

  state.rendered+=next.length;
  bindNewCards(grid,next.length);
  if(state.rendered<state.cards.length){
    const s=sentinel||makeSentinel();
    grid.appendChild(s);
    batchObserver&&batchObserver.observe(s);
  }
  // Update sb-body maxHeight after adding content
  const body=sb.querySelector('.sb-body');
  if(body&&body.style.maxHeight&&body.style.maxHeight!=='0px'&&body.style.maxHeight!=='none'){
    body.style.maxHeight=body.scrollHeight+'px';
  }
}

function makeSentinel(){
  const s=document.createElement('div');
  s.className='batch-sentinel';
  s.style.cssText='height:1px;width:100%;grid-column:1/-1;pointer-events:none';
  return s;
}

function bindNewCards(container,count){
  const all=container.querySelectorAll(':scope>.gc');
  const start=Math.max(0,all.length-count);
  // Bind ps picker badges FIRST so stopPropagation fires before card click
  bindPsPickerCards(container);
  for(let i=start;i<all.length;i++){
    const c=all[i];
    c.addEventListener('click',()=>openPanel(c.dataset.id));
    c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')openPanel(c.dataset.id)});
    scaleTitleFont(c);
  }
}

function makeSection(label,cards,gcls){
  const collapsed=getCollapsed().has(label);
  const bodyH=collapsed?'max-height:0':'';
  const displayLabel=colLabel(label);
  return`<div class="sb${collapsed?' collapsed':''}" data-section="${esc(label)}">
    <div class="sl">
      ${displayLabel}
      <span class="sl-count" style="font-family:'Inter',sans-serif;font-size:.6rem;font-weight:400;letter-spacing:0;text-transform:none;color:var(--t3)">${cards.length}</span>
      <span class="sl-toggle">▾</span>
    </div>
    <div class="sb-body" style="${bodyH}"><div class="${gcls}"></div></div>
  </div>`;
}

function initSection(sb,cards,gcls,cardFn){
  const state={cards,rendered:0,gcls,cardFn:cardFn||null};
  sectionState.set(sb,state);
  if(sb.classList.contains('collapsed'))return; // defer until expanded
  renderNextBatch(sb,state);
}

// bindSectionToggle — wires collapse/expand for a single sb element
// Also triggers deferred batch rendering when a collapsed section is expanded.
function bindSectionToggle(sb){
  const sl=sb.querySelector('.sl');
  const body=sb.querySelector('.sb-body');
  if(!sl||!body)return;
  if(!sb.classList.contains('collapsed')){
    body.style.maxHeight=body.scrollHeight+'px';
    body.classList.add('expanded');
  }
  sl.addEventListener('click',()=>{
    const label=sb.dataset.section;
    const col=getCollapsed();
    const isNowCollapsed=!sb.classList.contains('collapsed');
    if(isNowCollapsed){
      body.classList.remove('expanded');
      body.style.maxHeight=body.scrollHeight+'px';
      requestAnimationFrame(()=>{body.style.maxHeight='0';sb.classList.add('collapsed');});
      col.add(label);
    } else {
      sb.classList.remove('collapsed');
      // If this section was deferred (collapsed at render time), render first batch now
      const state=sectionState.get(sb);
      if(state&&state.rendered===0)renderNextBatch(sb,state);
      body.style.maxHeight=body.scrollHeight+'px';
      body.addEventListener('transitionend',()=>{
        if(!sb.classList.contains('collapsed')){body.style.maxHeight='none';body.classList.add('expanded');}
      },{once:true});
      col.delete(label);
    }
    setCollapsed(col);
  });
}

// Legacy bindSections kept for any call sites outside renderAll
function bindSections(container){
  container.querySelectorAll('.sb[data-section]').forEach(sb=>bindSectionToggle(sb));
}

function renderCollectionStats(list){
  const el=document.getElementById('cStatChips');if(!el)return;
  const allCol=games.filter(g=>g.status==='bought');
  const totalGames=allCol.filter(g=>g.type!=='dlc').length;
  const totalDlcs=allCol.filter(g=>g.type==='dlc').length;
  const totalCost=allCol.filter(g=>g.cost).reduce((s,g)=>s+parseFloat(g.cost),0);
  const isFiltered=list.length!==allCol.length;
  const filtGames=list.filter(g=>g.type!=='dlc').length;
  const filtDlcs=list.filter(g=>g.type==='dlc').length;
  const filtCost=list.filter(g=>g.cost).reduce((s,g)=>s+parseFloat(g.cost),0);
  const gameChip=isFiltered
    ?`<span class="sc-chip"><b>${filtGames}</b>/<span style="color:var(--muted)">${totalGames}</span> games</span>`
    :`<span class="sc-chip"><b>${totalGames}</b> games</span>`;
  const dlcChip=totalDlcs
    ?(isFiltered
      ?`<span class="sc-chip"><b>${filtDlcs}</b>/<span style="color:var(--muted)">${totalDlcs}</span> DLC</span>`
      :`<span class="sc-chip"><b>${totalDlcs}</b> DLC</span>`)
    :'';
  const costChip=totalCost
    ?(isFiltered
      ?`<span class="sc-chip"><b>${fmtEur(filtCost)}</b>/<span style="color:var(--muted)">${fmtEur(totalCost)}</span></span>`
      :`<span class="sc-chip"><b>${fmtEur(totalCost)}</b></span>`)
    :'';
  el.innerHTML=gameChip+dlcChip+costChip;
}

// cvm removed — collection uses shared vm variable

function renderCollection(){
  const gc=document.getElementById('gc');
  const list=collectionFiltered();
  renderCollectionStats(list);
  sectionState.clear();
  initBatchObserver();
  gc.innerHTML='';

  if(!list.length){
    gc.innerHTML=`<div class="gg"><div class="empty"><div class="ei">📦</div><p>No games in your collection yet.</p></div></div>`;
    return;
  }

  const sorted2=collectionSorted(list);
  const sortBy=document.getElementById('cSortSel').value;

  if(vm==='list'){
    // Two-column list — no batching needed at this density
    const wrapper=document.createElement('div');
    wrapper.className='col-list';
    wrapper.innerHTML=sorted2.map(colRowHTML).join('');
    gc.appendChild(wrapper);
    wrapper.querySelectorAll('.col-row').forEach(r=>{
      r.addEventListener('click',()=>openPanel(r.dataset.id));
      r.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')openPanel(r.dataset.id)});
    });
    return;
  }

  // Grid — group by steamcol when sort=steamcol, else flat batched
  if(sortBy==='steamcol'){
    const groups={};
    // Only top-level games (non-DLC or DLCs without a parent in collection)
    sorted2.forEach(g=>{
      if(g.type==='dlc'&&findParentGame(g))return; // skip — will render under parent
      const keys=(g.steamCollection&&g.steamCollection.length)?g.steamCollection:['Uncategorised'];
      keys.forEach(k=>{if(!groups[k])groups[k]=[];groups[k].push(g)});
    });
    Object.keys(groups).sort().forEach(k=>{
      const html=makeSection(k,groups[k],'gg');
      const tmp=document.createElement('div');tmp.innerHTML=html;
      const sb=tmp.firstElementChild;
      gc.appendChild(sb);
      const state={cards:groups[k],rendered:0,gcls:'gg',cardFn:colCardHTML};
      sectionState.set(sb,state);
      if(!sb.classList.contains('collapsed'))renderNextBatch(sb,state);
      bindSectionToggle(sb);
    });
  } else {
    // Group into sections based on sort type
    const groups = {};
    const groupOrder = [];

    function addToGroup(key, game) {
      if(!groups[key]) { groups[key] = []; groupOrder.push(key); }
      groups[key].push(game);
    }

    sorted2.forEach(g => {
      if(sortBy === 'title') {
        const first = (g.title||'').trim()[0]?.toUpperCase() || '#';
        const bucket = /^[A-Z]$/.test(first) ? first : '#';
        addToGroup(bucket, g);
      } else if(sortBy === 'playstatus') {
        addToGroup(g.playStatus || 'Unplayed', g);
      } else if(sortBy === 'purchaseDate') {
        if(!g.purchaseDate) { addToGroup('Unknown', g); return; }
        const m = g.purchaseDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        const yr = m ? m[3] : g.purchaseDate.slice(0,4) || 'Unknown';
        addToGroup(yr, g);
      } else if(sortBy === 'cost-desc' || sortBy === 'cost-asc') {
        const c = parseFloat(g.cost) || 0;
        const bucket = c === 0 ? 'Free' : c < 10 ? '< €10' : c < 25 ? '€10–25' : c < 50 ? '€25–50' : '€50+';
        addToGroup(bucket, g);
      } else {
        addToGroup('', g);
      }
    });

    // Determine ordered keys
    let keys;
    if(sortBy === 'title') {
      // '#' first, then A-Z
      const alphaKeys = groupOrder.filter(k => k !== '#').sort();
      keys = groups['#'] ? ['#', ...alphaKeys] : alphaKeys;
    } else if(sortBy === 'playstatus') {
      const psOrder = ['In Progress','Completed','Unplayed','Superseded','Unfinishable','Played on Different Platform','Will Never Complete','Will Never Play','Unknown'];
      keys = psOrder.filter(k => groups[k]);
    } else if(sortBy === 'purchaseDate') {
      // Sort years descending (most recent first), Unknown last
      keys = groupOrder.filter(k => k !== 'Unknown').sort((a,b) => b.localeCompare(a));
      if(groups['Unknown']) keys.push('Unknown');
    } else if(sortBy === 'cost-desc') {
      keys = ['€50+','€25–50','€10–25','< €10','Free'].filter(k => groups[k]);
    } else if(sortBy === 'cost-asc') {
      keys = ['Free','< €10','€10–25','€25–50','€50+'].filter(k => groups[k]);
    } else {
      keys = groupOrder;
    }

    keys.forEach(k => {
      if(!groups[k]) return;
      const label = k || 'All';
      const html = makeSection(label, groups[k], 'gg');
      const tmp = document.createElement('div'); tmp.innerHTML = html;
      const sb = tmp.firstElementChild;
      gc.appendChild(sb);
      const state = {cards: groups[k], rendered: 0, gcls: 'gg', cardFn: colCardHTML};
      sectionState.set(sb, state);
      if(!sb.classList.contains('collapsed')) renderNextBatch(sb, state);
      bindSectionToggle(sb);
    });
  }
  saveHash();
}

function renderAll(){
  renderTicker();
  const gc=document.getElementById('gc');
  const grp=document.getElementById('groupSel').value;
  const list=filtered();
  renderStats();
  const lv=vm==='list';
  const gcls=`gg${lv?' lv':''}`;

  // Clear previous batch state and observer
  sectionState.clear();
  initBatchObserver();

  // Helper: build section HTML, insert into gc, then init batch rendering
  function addSection(label,cards){
    const html=makeSection(label,cards,gcls);
    const tmp=document.createElement('div');
    tmp.innerHTML=html;
    const sb=tmp.firstElementChild;
    gc.appendChild(sb);
    initSection(sb,cards,gcls);
    bindSectionToggle(sb);
  }

  // Helper: no-section flat list — still batched via a synthetic section wrapper
  function addFlat(cards){
    const wrapper=document.createElement('div');
    wrapper.className='sb'; // reuse sb for state keying; no header
    const grid=document.createElement('div');
    grid.className=gcls;
    wrapper.appendChild(grid);
    gc.appendChild(wrapper);
    const state={cards,rendered:0,gcls};
    sectionState.set(wrapper,state);
    renderNextBatch(wrapper,state);
  }

  gc.innerHTML='';

  // Empty states
  const empty=(icon,msg)=>{gc.innerHTML=`<div class="${gcls}"><div class="empty"><div class="ei">${icon}</div><p>${msg}</p></div></div>`};

  // Dedicated removed tab
  if(af==='removed'){
    if(!list.length){empty('🗑️',t('noGames'));return}
    addSection(t('secRm'),sorted(list));return;
  }
  // Dedicated cancelled tab
  if(af==='cancelled'){
    if(!list.length){empty('🚫','No cancelled games');return}
    addSection('CANCELLED',sorted(list));return;
  }

  if(!list.length){empty('🎮',`${t('noGames')}
${t('noHint')}`);return}

  if(grp==='none'){
    if(af==='all'){
      const wishlist=list.filter(g=>g.status==='wishlist'&&!isCancelled(g));
      const bought=list.filter(g=>g.status==='bought');
      const cancelled=list.filter(g=>isCancelled(g));
      const removed=list.filter(g=>g.status==='removed');
      const rev=wishlist.filter(g=>nr(g));
      const wlRest=sorted(wishlist.filter(g=>!nr(g)));
      if(rev.length)       addSection(t('secRev'),rev);
      if(wlRest.length)    addSection(t('secWl'),wlRest);
      if(cancelled.length) addSection('CANCELLED',sorted(cancelled));
      if(removed.length)   addSection(t('secRm'),sorted(removed));
      if(bought.length)    addSection(t('secBacklog'),sorted(bought));
    } else {
      addFlat(sorted(list));
    }
  } else {
    const groups={};
    sorted(list).forEach(g=>{
      let keys=[];
      if(grp==='genre')keys=g.genres&&g.genres.length?g.genres:[g.genre||'—'];
      else if(grp==='platform')keys=(g.platforms&&g.platforms.length?g.platforms:[g.platform||'—']);
      else if(grp==='year'){const yr=g.releaseDate?g.releaseDate.slice(0,4):g.tbaText?'TBA':'—';keys=[yr]}
      else if(grp==='priority')keys=[g.priority||'medium'];
      keys.forEach(k=>{if(!groups[k])groups[k]=[];groups[k].push(g)});
    });
    const priorityGroupOrder=['high','medium','low'];
    const sortKeys=grp==='priority'
      ?priorityGroupOrder.filter(k=>groups[k])
      :Object.keys(groups).sort();
    sortKeys.forEach(k=>{
      const label=grp==='priority'?prioLabel(k):esc(k);
      addSection(label,groups[k]);
    });
  }
  saveHash();
}
function bindCards(gc){
  // Legacy full-bind — used only when all cards are rendered at once (small sets)
  gc.querySelectorAll('.gc').forEach(c=>{
    c.addEventListener('click',()=>openPanel(c.dataset.id));
    c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')openPanel(c.dataset.id)});
    scaleTitleFont(c);
  });
}

function scaleTitleFont(card){
  const ct=card.querySelector('.ct');
  if(!ct||card.closest('.gg.lv'))return; // skip list view
  ct.style.fontSize='';
  // Step down from default until it fits or hits floor
  const sizes=['.9rem','.82rem','.74rem','.67rem','.62rem'];
  for(const sz of sizes){
    ct.style.fontSize=sz;
    if(ct.scrollWidth<=ct.clientWidth+2) break;
  }
}

// ── TILT + SHINE ─────────────────────────
function bindTilt(card){
  const MAX=12; // max tilt degrees
  function applyTilt(x,y){
    const r=card.getBoundingClientRect();
    const cx=(x-r.left)/r.width;   // 0..1
    const cy=(y-r.top)/r.height;   // 0..1
    const rx=(cy-0.5)*MAX*-1;      // rotate around X
    const ry=(cx-0.5)*MAX;         // rotate around Y
    const shine=card.querySelector('.gc-shine');
    card.style.transform=`perspective(600px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.03)`;
    card.style.boxShadow=`0 10px 32px rgba(2,179,252,.18), 0 2px 8px rgba(0,0,0,.3)`;
    card.style.borderColor='var(--blue)';
    card.classList.add('tilt-active');
    if(shine){
      // Move the radial highlight to follow the cursor
      shine.style.background=`radial-gradient(circle at ${cx*100}% ${cy*100}%,rgba(255,255,255,.22) 0%,rgba(255,255,255,.05) 45%,transparent 70%)`;
    }
  }
  function resetTilt(){
    card.style.transform='';
    card.style.boxShadow='';
    card.style.borderColor='';
    card.classList.remove('tilt-active');
  }
  // Mouse
  card.addEventListener('mousemove',e=>{
    // Skip if list view
    if(card.closest('.gg.lv'))return;
    applyTilt(e.clientX,e.clientY);
  });
  card.addEventListener('mouseleave',resetTilt);
  // Touch (mobile)
  card.addEventListener('touchmove',e=>{
    if(card.closest('.gg.lv'))return;
    const t=e.touches[0];
    applyTilt(t.clientX,t.clientY);
  },{passive:true});
  card.addEventListener('touchend',resetTilt);
  card.addEventListener('touchcancel',resetTilt);
}

// ══════════════════════════════════════════
//  MARK BOUGHT — with unreleased warning
// ══════════════════════════════════════════
function handleMarkBought(id){
  const g=games.find(x=>x.id===id);if(!g)return;
  if(g.status==='bought'){
    // One-click unmark → back to wishlist, clear collection fields
    g.status='wishlist';
    delete g.store;delete g.cost;delete g.purchaseDate;delete g.playStatus;delete g.steamCollection;
    save(id);dispatchRender();if(openId===id)openPanel(id);return;
  }
  if(isGameUnreleased(g)){
    const ok=confirm(`"${g.title}" hasn't been released yet.\n\nAdd to Collection? It will show as PRE-ORDER until the release date.`);
    if(!ok)return;
  }
  openCollectionModal(id);
}

let btcId=null,cBtcCol=[];

const STEAM_COLLECTIONS=[
  '001_TO TRY NEXT','002A_STARTED',"002B_DOESN'T FINISH",'002C_ROGUELIKE',
  '003_STEAM DECK','004_CIUCIO <3','005_TOGETHER <3','006_BOARD, CARD & DICE GAMES',
  '007_PARTY GAMES','008_DEMOS','009_BORDERLANDS','009_CIVILIZATION','009_DIVINITY SIN',
  '009_FALLOUT','009_FOOTBALL MANAGER','009_IDLER','009_KINGDOM HEARTS','009_LEGO',
  '009_MONKEY ISLAND','009_MONSTER HUNTER','009_ODDWORLD','009_RUSTY LAKE','009_VALVE',
  '009_YAKUZA','010_UNPLAYED','011_COMPLETED','012_BETAS & PLAYTESTS','013_VR',
  '014A_WILL NEVER PLAY','014B_TRIED BUT NO','014C_NEW ITERATION'
];

function openCollectionModal(id){
  btcId=id;cBtcCol=[];
  const g=games.find(x=>x.id===id);
  document.getElementById('btcTitle').textContent=g?g.title:'';
  document.getElementById('btcStore').value='Steam'; // sensible default
  document.getElementById('btcCost').value='';
  // Default purchase date to today
  const n=new Date();
  document.getElementById('btcDate').value=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
  document.getElementById('btcPlayStatus').value='Unplayed';
  renderBtcCol();
  document.getElementById('btcov').classList.add('on');
  // Pre-fill cost from game price if available
  if(g&&g.price)document.getElementById('btcCost').value=parseFloat(g.price).toFixed(2);
}

// ── PLAY STATUS QUICK PICKER (item 7) ────────────────────────────────────────
// Single shared picker element — positioned near the clicked badge
let _psPicker=null;
function getOrCreatePicker(){
  if(_psPicker)return _psPicker;
  const el=document.createElement('div');
  el.id='psQuickPicker';el.className='ps-picker';
  document.body.appendChild(el);
  _psPicker=el;
  document.addEventListener('click',e=>{
    if(!e.target.closest('#psQuickPicker')&&!e.target.closest('.ps-card-badge'))
      el.classList.remove('on');
  });
  return el;
}

function openPsPicker(badge,gameId){
  const picker=getOrCreatePicker();
  const g=games.find(x=>x.id===gameId);if(!g)return;
  const cur=g.playStatus||'Unplayed';
  const statuses=Object.keys(PS_META);
  picker.innerHTML=statuses.map(s=>{
    const m=PS_META[s];
    return'<div class="ps-pick-opt'+(s===cur?' active':'')+'" data-s="'+esc(s)+'">'+
      '<span class="col-ps-badge '+m.cls+'" style="font-size:.52rem;padding:1px 5px;flex-shrink:0">'+m.code+'</span>'+
      '<span class="ps-pick-label">'+esc(s)+'</span>'+
    '</div>';
  }).join('');
  picker.querySelectorAll('.ps-pick-opt').forEach(opt=>{
    opt.addEventListener('click',e=>{
      e.stopPropagation();
      const g2=games.find(x=>x.id===gameId);if(!g2)return;
      g2.playStatus=opt.dataset.s;
      save(gameId);dispatchRender();if(openId===gameId)openPanel(gameId);
      picker.classList.remove('on');
    });
  });
  // Position near badge
  const rect=badge.getBoundingClientRect();
  picker.style.top=(rect.bottom+window.scrollY+4)+'px';
  picker.style.left=Math.min(rect.left+window.scrollX,window.innerWidth-200)+'px';
  picker.classList.add('on');
}

// Modal play status fancy picker
function _syncModalPsBtn(val){
  const btn=document.getElementById('fColPlayStatusBtn');if(!btn)return;
  const m=PS_META[val]||{code:'UP',cls:'ps-UP'};
  btn.className='col-ps-badge '+m.cls;
  btn.style.cssText='font-size:.72rem;padding:4px 10px;cursor:pointer;align-self:flex-start';
  btn.innerHTML=m.code+'<span style="font-weight:400;text-transform:none;letter-spacing:0;margin-left:4px">'+esc(val)+'</span>';
}
(function(){
  function getModalPicker(){
    let p=document.getElementById('modalPsPicker');
    if(!p){
      p=document.createElement('div');p.id='modalPsPicker';p.className='ps-picker';
      document.body.appendChild(p);
      document.addEventListener('click',e=>{
        if(!e.target.closest('#modalPsPicker')&&!e.target.closest('#fColPlayStatusBtn'))
          p.classList.remove('on');
      });
    }
    return p;
  }
  document.addEventListener('click',e=>{
    const btn=e.target.closest('#fColPlayStatusBtn');if(!btn)return;
    const picker=getModalPicker();
    const cur=document.getElementById('fColPlayStatus').value||'Unplayed';
    picker.innerHTML=Object.keys(PS_META).map(s=>{
      const m=PS_META[s];
      return'<div class="ps-pick-opt'+(s===cur?' active':'')+'" data-s="'+esc(s)+'">'+
        '<span class="col-ps-badge '+m.cls+'" style="font-size:.52rem;padding:1px 5px;flex-shrink:0">'+m.code+'</span>'+
        '<span class="ps-pick-label">'+esc(s)+'</span>'+
      '</div>';
    }).join('');
    picker.querySelectorAll('.ps-pick-opt').forEach(opt=>{
      opt.addEventListener('click',e2=>{
        e2.stopPropagation();
        const val=opt.dataset.s;
        document.getElementById('fColPlayStatus').value=val;
        _syncModalPsBtn(val);
        picker.classList.remove('on');
      });
    });
    const rect=btn.getBoundingClientRect();
    picker.style.top=(rect.bottom+window.scrollY+4)+'px';
    picker.style.left=Math.min(rect.left+window.scrollX,window.innerWidth-220)+'px';
    picker.classList.toggle('on');
    e.stopPropagation();
  });
})();

// Wire picker on rendered cards (called from bindNewCards)
function bindPsPickerCards(container,start){
  const badges=container.querySelectorAll('.ps-card-badge');
  // Only bind badges that haven't been bound yet (data-ps-bound not set)
  badges.forEach(badge=>{
    if(badge.dataset.psBound)return;
    badge.dataset.psBound='1';
    // Use capture phase so this fires BEFORE the card's bubble-phase click
    badge.addEventListener('click',e=>{
      e.stopPropagation();
      e.preventDefault();
      openPsPicker(badge,badge.dataset.id);
    },true);
  });
}

function closeCollectionModal(){
  document.getElementById('btcov').classList.remove('on');
  document.getElementById('btcColDd').classList.remove('on');
  btcId=null;cBtcCol=[];
}

document.getElementById('btcCancel').onclick=closeCollectionModal;
document.getElementById('btcov').onclick=e=>{if(e.target===e.currentTarget)closeCollectionModal()};

document.getElementById('btcConfirm').onclick=()=>{
  const g=games.find(x=>x.id===btcId);if(!g)return;
  g.status='bought';
  g.store=document.getElementById('btcStore').value||'';
  const costRaw=document.getElementById('btcCost').value.trim();
  g.cost=costRaw!==''?parseFloat(costRaw).toFixed(2):'';
  g.purchaseDate=document.getElementById('btcDate').value||'';
  g.playStatus=document.getElementById('btcPlayStatus').value||'Unplayed';
  g.steamCollection=[...cBtcCol];
  save(btcId);closeCollectionModal();dispatchRender();if(openId===btcId)openPanel(btcId);
};

// ══════════════════════════════════════════
//  SIDE PANEL
// ══════════════════════════════════════════
function openPanel(id){
  const sid=String(id);
  const g=games.find(x=>String(x.id)===sid);if(!g)return;
  id=g.id; // normalise to stored type
  openId=id;
  if(!(history.state&&history.state.panelOpen)){history.pushState({panelOpen:true},'');}
  const _ctb=document.getElementById("ctb");if(_ctb)_ctb.style.zIndex="80";cStars=g.myRating||0;
  const cu=g.cover||(g.steamAppId?sc(g.steamAppId):'');
  const pi=document.getElementById('pimg'),pp=document.getElementById('pph');
  if(cu){pi.src=cu;pi.style.display='block';pp.style.display='none'}else{pi.style.display='none';pp.style.display='flex'}
  const isNR=nr(g);const h=isNR?0:Math.min(100,parseInt(g.hotness)||0);
  const sl=encodeURIComponent(g.title||'');
  const ggUrl=g.steamAppId?`https://gg.deals/steam/app/${g.steamAppId}/`:`https://gg.deals/search/?title=${sl}`;
  const sdbUrl=g.steamAppId?`https://www.steamdb.info/app/${g.steamAppId}/`:`https://www.steamdb.info/search/?q=${sl}`;
  const stUrl=g.storeLink||(g.steamAppId?`https://store.steampowered.com/app/${g.steamAppId}/`:`https://store.steampowered.com/search/?term=${sl}`);
  const sh=[1,2,3,4,5].map(i=>`<span class="star${cStars>=i?' on':''}" data-s="${i}">★</span>`).join('');
  const _plats=g.platforms&&g.platforms.length?g.platforms:(g.platform?g.platform.split(',').map(s=>s.trim()).filter(Boolean):[]);
  const genreD=(g.genres||[]).join(', ')||g.genre||'';
  const dateD=g.tbaText||fmtDate(g.releaseDate)||'—';

  let b=`<div class="pt">${esc(g.title)}</div>
    <div class="pm">
      ${isPreOrder(g)?`<span class="bdg b-pre">PRE-ORDER</span>`:g.status==='bought'?`<span class="bdg b-bt">${t('bdgBt')}</span>`:''}
      ${g.status==='removed'?`<span class="bdg b-rm">${t('bdgRm')}</span>`:''}
      ${isCancelled(g)?`<span class="b-cancelled">CANCELLED</span>`:''}
      ${isNR&&g.status==='wishlist'&&!isCancelled(g)?`<span class="b-rev">${t('bdgRev')}</span>`:''}
      <span class="bdg" style="background:${prioColor(g.priority)};color:#031329">${prioLabel(g.priority)}</span>
      ${_plats.map(p=>`<span class="b-plat" style="background:${platColor(p)};color:${platTextColor(p)}">${esc(p)}</span>`).join('')}
      ${g.type==='dlc'?`<span class="bdg" style="background:#3a1a6e;color:#c4a0ff">DLC</span>`:''}
    </div>`;

  b+=`<div class="ps"><div class="psl">${t('pHotness')}</div>`;
  if(isNR)b+=`<div class="pv" style="color:var(--amber)">${t('bdgRev')}</div>`;
  else b+=`<div class="hr2"><div class="ht"><div class="htf" style="width:${h}%"></div></div><div class="hn">${h}</div></div>`;
  b+=`</div>`;

  const det=[
    `<div><span style="color:var(--t3)">${t('pDev')}: </span>${esc(g.developer||'—')}</div>`,
    `<div><span style="color:var(--t3)">${t('pPub')}: </span>${esc(g.publisher||'—')}</div>`,
    (()=>{
      let relStr=esc(dateD);
      if(isFutureDate(g.releaseDate)){
        const dys=Math.ceil((new Date(normaliseDate(g.releaseDate))-new Date(todayISO()))/(1000*60*60*24));
        const lbl=dys===1?'tomorrow':dys<=30?`in ${dys}d`:dys<=365?`in ${Math.ceil(dys/7)}w`:null;
        if(lbl)relStr+=` <span style="color:var(--amber);font-size:.65rem;font-weight:700">${lbl}</span>`;
      }
      return `<div><span style="color:var(--t3)">${t('pRel')}: </span>${relStr}</div>`;
    })(),
    `<div><span style="color:var(--t3)">${t('pGenre')}: </span>${genreD?genreD.split(',').map(s=>s.trim()).map(s=>`<span style="display:inline-flex;align-items:center;gap:.1rem">${esc(s)}${metaTipHTML(s)}</span>`).join(', '):'—'}</div>`,
    
    `<div><span style="color:var(--t3)">${t('pPrice')}: </span>${g.price?`<b style="color:var(--blue)">€${parseFloat(g.price).toFixed(2)}</b>`:`<span style="color:var(--lime);font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Unreleased</span>`}</div>`,
    `<div><span style="color:var(--t3)">Added: </span><span style="color:var(--t2)">${fmtAdded(daysAgo(g.added),g.added)}</span></div>`,
  ];
  b+=`<div class="ps"><div class="psl">${t('pDetails')}</div><div class="pv" style="display:grid;grid-template-columns:1fr 1fr;gap:.28rem .55rem">${det.join('')}</div></div>`;

  // Base game link — shown for DLCs that have a parent in the collection
  if(g.type==='dlc'&&g.parentAppId){
    const parent=findParentGame(g);
    if(parent){
      const pCover=parent.cover||(parent.steamAppId?sc(parent.steamAppId):'');
      const pThumb=pCover?`<img class="panel-base-thumb" src="${esc(pCover)}" alt="">`:`<div class="panel-base-thumb" style="background:var(--base);display:flex;align-items:center;justify-content:center;font-size:.8rem;color:var(--t3)">🎮</div>`;
      b+=`<div class="ps"><div class="psl">Base Game</div>
        <div class="panel-base-game" data-pid="${esc(parent.id)}">
          ${pThumb}
          <div class="panel-base-info">
            <span class="panel-base-title">${esc(parent.title)}</span>
            <span class="panel-base-arrow">›</span>
          </div>
        </div></div>`;
    }
  }
  // DLC section — shown for parent games that have DLCs
  if(g.type!=='dlc'){
    const gameDlcs=findDlcs(g);
    if(gameDlcs.length){
      const dlcCards=gameDlcs.map(d=>{
        const dCover=d.cover||(d.steamAppId?sc(d.steamAppId):'');
        const dThumb=dCover?`<img class="panel-base-thumb" src="${esc(dCover)}" alt="">`:`<div class="panel-base-thumb" style="background:var(--base);display:flex;align-items:center;justify-content:center;font-size:.8rem;color:var(--t3)">🎮</div>`;
        return`<div class="panel-dlc-item panel-base-game" data-did="${esc(d.id)}">
          ${dThumb}
          <div class="panel-base-info">
            <span class="panel-base-title">${esc(d.title)}</span>
            <span class="panel-base-arrow">›</span>
          </div>
        </div>`;
      }).join('');
      b+=`<div class="ps"><div class="psl">DLC (${gameDlcs.length})</div>${dlcCards}</div>`;
    }
  }
  if(g.shortDescription)b+=`<div class="ps"><div class="psl">About</div><div class="pv" style="color:var(--t2);font-size:.78rem;line-height:1.55">${esc(g.shortDescription)}</div></div>`;
  if(g.tags&&g.tags.length)b+=`<div class="ps"><div class="psl">${t('pTags')}</div><div style="display:flex;gap:.28rem;flex-wrap:wrap">${g.tags.map(x=>`<span class="cich" style="display:inline-flex;align-items:center;gap:.15rem">${esc(x)}${metaTipHTML(x)}</span>`).join('')}</div></div>`;
  // Collection details — only for bought games (with inline edit for play status + steam collection)
  if(g.status==='bought'){
    const colDets=[];
    if(g.store)colDets.push(`<div><span style="color:var(--t3)">Store: </span>${esc(g.store)}</div>`);
    if(g.cost!==undefined&&g.cost!==''){
      const cn=parseFloat(g.cost);
      colDets.push(`<div><span style="color:var(--t3)">Cost: </span>${cn===0?`<span style="color:var(--lime);font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em">FREE</span>`:`<b style="color:var(--blue)">€${cn.toFixed(2)}</b>`}</div>`);
    }
    if(g.purchaseDate)colDets.push(`<div><span style="color:var(--t3)">Purchased: </span>${esc(g.purchaseDate)}</div>`);
    if(colDets.length)b+=`<div class="ps"><div class="psl">Collection</div><div class="pv" style="display:grid;grid-template-columns:1fr 1fr;gap:.28rem .55rem">${colDets.join('')}</div></div>`;
    // Inline editable: play status — styled picker button
    const _curPs=g.playStatus||'Unplayed';
    const _curPsM=PS_META[_curPs]||{code:'UP',cls:'ps-UP'};
    b+=`<div class="ps" id="psInlineWrap"><div class="psl">Play Status</div>
      <div class="ps-inline-edit">
        <button id="psInlineBtn" class="col-ps-badge ${_curPsM.cls}" style="font-size:.72rem;padding:4px 10px;cursor:pointer;align-self:flex-start">
          ${_curPsM.code} <span style="font-size:.68rem;font-weight:400;margin-left:4px">${esc(_curPs)}</span>
        </button>
        <input type="hidden" id="psInlineSel" value="${esc(_curPs)}">
        <div class="ps-picker" id="psInlinePickerPanel" style="position:relative;box-shadow:none;border-color:var(--bd);margin-top:.3rem;display:none;flex-direction:column"></div>
      </div></div>`;
    // Inline editable: steam collection (chip input)
    const colChips=(g.steamCollection||[]).map(s=>`<span class="cich" style="background:#1a0a3a;border-color:#4a2080;color:#c4a0ff">${esc(colLabel(s))}</span>`).join('');
    b+=`<div class="ps" id="colInlineWrap"><div class="psl">Steam Collections</div>
      <div style="display:flex;gap:.28rem;flex-wrap:wrap;margin-bottom:.4rem" id="colInlineChips">${colChips}</div>
      <div class="genre-wrap">
        <div class="ciw" id="colInlineWrapInput"><input type="text" class="cir" id="colInlineInput" placeholder="Type to add…" autocomplete="off"></div>
        <div class="genre-dd" id="colInlineDd"></div>
      </div>
    </div>`;
  }
  // Notes — multi-note with add/edit/delete
  const notes=Array.isArray(g.notes)?g.notes:(g.notes?[{id:nid(),date:todayStr(),text:g.notes}]:[]);
  const todayIso=(()=>{const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`})();
  b+=`<div class="ps"><div class="psl">Notes</div>
    <div class="note-compose">
      <input type="date" id="noteNewDate" class="note-compose-date" value="${todayIso}">
      <textarea class="note-add" id="noteNewTxt" placeholder="Add a note…" style="margin-bottom:0;min-height:36px;resize:none"></textarea>
    </div>
    <button class="note-save-btn" id="noteAddBtn">＋ Save note</button>
    <div id="noteList" style="margin-top:.45rem">
    ${[...notes].reverse().map(n=>`
      <div class="note-entry" data-nid="${esc(n.id)}">
        <div class="note-date">${esc(fmtDate(n.date)||n.date||'')}</div>
        <div class="note-text">${esc(n.text)}</div>
        <div class="note-edit-wrap" style="display:none">
          <div class="note-compose" style="margin-bottom:.25rem">
            <input type="date" class="note-compose-date note-edit-date">
            <textarea class="note-edit-area" style="display:block;margin-bottom:0;min-height:50px">${esc(n.text)}</textarea>
          </div>
        </div>
        <div class="note-actions">
          <button class="note-btn edit-btn">Edit</button>
          <button class="note-btn save save-btn" style="display:none">Save</button>
          <button class="note-btn del-btn del">Delete</button>
        </div>
      </div>`).join('')}
    </div>
  </div>`;
  if(g.status==='removed'&&g.removeNote)b+=`<div class="ps"><div class="psl" style="color:var(--pink)">${t('pRmNote')}</div><div class="pv" style="color:var(--muted)">${esc(g.removeNote)}</div></div>`;

  b+=`<div class="ps"><div class="psl">${t('pLinks')}</div><div class="plks">
    <a href="${stUrl}" class="plk" target="_blank">${favImg(FAV_STEAM,'steam')} ${t('pSteam')}</a>
    <a href="${ggUrl}" class="plk" target="_blank">${favImg(FAV_GG,'gg')} ${t('pGG')}</a>
    <a href="${sdbUrl}" class="plk" target="_blank">${favImg(FAV_SDB,'sdb')} ${t('pSDB')}</a>
  </div></div>`;

  if(g.status==='bought'){
    b+=`<div class="ps"><div class="psl">${t('pReview')}</div>
      <div class="stars" id="pstars">${sh}</div>
      <textarea class="rta" id="prevta" placeholder="Your thoughts…">${esc(g.myReview||'')}</textarea>
      <button class="pa s" style="width:100%;margin-top:.35rem" id="psrv">${t('pSaveRev')}</button>
    </div>`;
  }

  const bl=g.status==='bought'?'Move to Wishlist':'Add to Collection';
  // Bought games cannot be removed
  const actionBtns=g.status==='removed'
    ?`<button class="pa s" id="pri">↩ ${t('pReinstate')}</button>`
    :g.status==='bought'
      ?``  // no remove button for bought
      :`<button class="pa d" id="prm">${t('pRemove')}</button>`;

  b+=`<div class="ps"><div class="psl">${t('pActions')}</div><div class="pac">
    <button class="pa" id="ped">${t('pEdit')}</button>
    <button class="pa ${g.status==='bought'?'s':''}" id="pbt">${g.status==='bought'?'↩ ':''} ${bl}</button>
    ${actionBtns}
  </div></div>`;

  document.getElementById('pbody').innerHTML=b;

  // Base game link click (DLC panel)
  const bgEl=document.querySelector('.panel-base-game');
  if(bgEl)bgEl.addEventListener('click',()=>openPanel(bgEl.dataset.pid));

  // DLC items click (parent game panel)
  document.querySelectorAll('.panel-dlc-item').forEach(el=>{
    el.addEventListener('click',()=>openPanel(el.dataset.did));
  });

  // Inline play status save
  const psInlineBtn=document.getElementById('psInlineBtn');
  const psInlinePickerPanel=document.getElementById('psInlinePickerPanel');
  const psInlineSel=document.getElementById('psInlineSel');
  const psInlineSave=document.getElementById('psInlineSave');
  if(psInlineBtn&&psInlinePickerPanel){
    // Build picker options inline (not floating)
    const _buildInlinePicker=()=>{
      const cur=psInlineSel?psInlineSel.value:'Unplayed';
      psInlinePickerPanel.innerHTML=Object.keys(PS_META).map(s=>{
        const m=PS_META[s];
        return'<div class="ps-pick-opt'+(s===cur?' active':'')+'" data-s="'+esc(s)+'">'+
          '<span class="col-ps-badge '+m.cls+'" style="font-size:.52rem;padding:1px 5px;flex-shrink:0">'+m.code+'</span>'+
          '<span class="ps-pick-label">'+esc(s)+'</span>'+
        '</div>';
      }).join('');
      psInlinePickerPanel.querySelectorAll('.ps-pick-opt').forEach(opt=>{
        opt.addEventListener('click',()=>{
          if(psInlineSel)psInlineSel.value=opt.dataset.s;
          const m=PS_META[opt.dataset.s]||{code:'UP',cls:'ps-UP'};
          psInlineBtn.className='col-ps-badge '+m.cls+' '+'';
          psInlineBtn.style.cssText='font-size:.72rem;padding:4px 10px;cursor:pointer;align-self:flex-start';
          psInlineBtn.innerHTML=m.code+' <span style="font-size:.68rem;font-weight:400;margin-left:4px">'+esc(opt.dataset.s)+'</span>';
          psInlinePickerPanel.style.display='none';
          // Auto-save immediately
          const gg=games.find(x=>x.id===openId);if(gg){gg.playStatus=opt.dataset.s;save(openId);dispatchRender();}
          _buildInlinePicker();
        });
      });
    };
    psInlineBtn.addEventListener('click',()=>{
      const isOpen=psInlinePickerPanel.style.display!=='none';
      psInlinePickerPanel.style.display=isOpen?'none':'flex';
      if(!isOpen)_buildInlinePicker();
    });
    // Close picker when clicking outside
    document.addEventListener('click',function _psOutsideClick(e){
      if(!psInlinePickerPanel.isConnected){document.removeEventListener('click',_psOutsideClick);return;}
      if(psInlinePickerPanel.style.display==='none')return;
      if(!e.target.closest('#psInlinePickerPanel')&&!e.target.closest('#psInlineBtn'))
        psInlinePickerPanel.style.display='none';
    });
    _buildInlinePicker();
  }
  if(psInlineSave){psInlineSave.style.display='none';}

  // Inline steam collection chip input
  const colInlineInput=document.getElementById('colInlineInput');
  const colInlineDd=document.getElementById('colInlineDd');
  if(colInlineInput&&colInlineDd){
    let _panelCols=[...(g.steamCollection||[])];
    function _saveColsNow(){const gg=games.find(x=>x.id===openId);if(!gg)return;gg.steamCollection=[..._panelCols];save(openId);dispatchRender();}
    function renderPanelColChips(){
      const wrap=document.getElementById('colInlineChips');if(!wrap)return;
      wrap.innerHTML=_panelCols.map(s=>`<span class="cich" style="background:#1a0a3a;border-color:#4a2080;color:#c4a0ff;cursor:pointer" data-col="${esc(s)}">${esc(colLabel(s))} <span style="opacity:.6;margin-left:2px">✕</span></span>`).join('');
      wrap.querySelectorAll('.cich').forEach(chip=>{
        chip.addEventListener('click',()=>{_panelCols=_panelCols.filter(x=>x!==chip.dataset.col);renderPanelColChips();updatePanelColDd();_saveColsNow();});
      });
    }
    function updatePanelColDd(){
      const q=(colInlineInput.value||'').toLowerCase().trim();
      const opts=allSteamCollections().filter(s=>!_panelCols.includes(s)&&(!q||s.toLowerCase().includes(q)));
      if(!opts.length){colInlineDd.classList.remove('on');return}
      colInlineDd.innerHTML=opts.map(s=>`<div class="genre-opt" data-v="${esc(s)}">${esc(colLabel(s))}</div>`).join('');
      colInlineDd.querySelectorAll('.genre-opt').forEach(el=>{
        el.addEventListener('click',()=>{_panelCols.push(el.dataset.v);colInlineInput.value='';renderPanelColChips();colInlineDd.classList.remove('on');_saveColsNow();});
      });
      colInlineDd.classList.add('on');
    }
    renderPanelColChips();
    colInlineInput.addEventListener('input',updatePanelColDd);
    colInlineInput.addEventListener('focus',updatePanelColDd);
  }

  // Notes wiring
  function getNotes(){const gg=games.find(x=>x.id===openId);return gg?(Array.isArray(gg.notes)?gg.notes:(gg.notes?[{id:nid(),date:todayStr(),text:gg.notes}]:[])):[]}
  function saveNotes(arr){const gg=games.find(x=>x.id===openId);if(gg){gg.notes=arr;save()}}
  document.getElementById('noteAddBtn').onclick=()=>{
    const txt=document.getElementById('noteNewTxt').value.trim();if(!txt)return;
    const ndVal=document.getElementById('noteNewDate').value;
    const noteDate=ndVal?fmtDate(ndVal):todayStr();
    const arr=getNotes();arr.push({id:nid(),date:noteDate,text:txt});
    saveNotes(arr);openPanel(openId);
  };
  document.querySelectorAll('.note-entry').forEach(entry=>{
    const nidVal=entry.dataset.nid;
    const textEl=entry.querySelector('.note-text');
    const dateEl=entry.querySelector('.note-date');
    const editWrap=entry.querySelector('.note-edit-wrap');
    const editArea=entry.querySelector('.note-edit-area');
    const editDateInp=entry.querySelector('.note-edit-date');
    const editBtn=entry.querySelector('.edit-btn');
    const saveBtn=entry.querySelector('.save-btn');
    const delBtn=entry.querySelector('.del-btn');
    // Pre-fill edit date from displayed date (convert dd/mm/yyyy → yyyy-mm-dd)
    const rawDate=dateEl.textContent.trim();
    const dm=rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(editDateInp&&dm)editDateInp.value=`${dm[3]}-${dm[2]}-${dm[1]}`;
    editBtn.onclick=()=>{
      textEl.style.display='none';editWrap.style.display='block';
      editBtn.style.display='none';saveBtn.style.display='';
    };
    saveBtn.onclick=()=>{
      const arr=getNotes();const i=arr.findIndex(n=>n.id===nidVal);
      if(i>-1){
        arr[i].text=editArea.value.trim();
        if(editDateInp&&editDateInp.value)arr[i].date=fmtDate(editDateInp.value);
        saveNotes(arr);
      }
      openPanel(openId);
    };
    delBtn.onclick=()=>{
      if(!confirm('Delete this note?'))return;
      const arr=getNotes().filter(n=>n.id!==nidVal);saveNotes(arr);openPanel(openId);
    };
  });
  if(g.status==='bought'){
    document.querySelectorAll('#pstars .star').forEach(s=>{
      s.onclick=()=>{cStars=parseInt(s.dataset.s);document.querySelectorAll('#pstars .star').forEach((x,i)=>x.classList.toggle('on',i<cStars))};
    });
    document.getElementById('psrv').onclick=()=>{const gg=games.find(x=>x.id===openId);if(gg){gg.myRating=cStars;gg.myReview=document.getElementById('prevta').value;save()}};
  }
  document.getElementById('ped').onclick=()=>{closePanel();openEdit(id)};
  document.getElementById('pbt').onclick=()=>handleMarkBought(id);
  const prm=document.getElementById('prm');if(prm)prm.onclick=()=>startRemove(id);
  const pri=document.getElementById('pri');if(pri)pri.onclick=()=>startReinstate(id);
  document.getElementById('pov').classList.add('on');
  document.getElementById('panel').classList.add('on');
}
function closePanel(){
  const pov=document.getElementById('pov');
  const panel=document.getElementById('panel');
  panel.classList.remove('on');
  openId=null;
  setTimeout(()=>pov.classList.remove('on'),290);
  if(history.state&&history.state.panelOpen){history.back();}
}
// Android back-swipe / browser back closes panel instead of exiting
window.addEventListener('popstate',function(){
  if(document.getElementById('panel').classList.contains('on')){
    const pov=document.getElementById('pov');
    document.getElementById('panel').classList.remove('on');
    openId=null;
    setTimeout(()=>pov.classList.remove('on'),290);
  }
});

// ── PANEL DRAG RESIZE (desktop only) ──────────────────────────
(function(){
  const PANEL_MIN=600, PANEL_MAX=900, STORAGE_KEY='btb_panel_w', DEFAULT_W=600;
  const root=document.documentElement;
  const handle=document.getElementById('panel-drag-handle');
  if(!handle)return;

  // Restore saved width
  const saved=parseInt(localStorage.getItem(STORAGE_KEY));
  if(saved>=PANEL_MIN&&saved<=PANEL_MAX) root.style.setProperty('--pw',saved+'px');

  function setWidth(w){
    const clamped=Math.max(PANEL_MIN,Math.min(PANEL_MAX,w));
    root.style.setProperty('--pw',clamped+'px');
    localStorage.setItem(STORAGE_KEY,clamped);
  }

  // Double-click resets to default
  handle.addEventListener('dblclick',()=>{
    setWidth(DEFAULT_W);
  });

  // Only wire drag on desktop
  if(window.innerWidth<=640)return;

  let dragging=false, startX=0, startW=0;

  handle.addEventListener('mousedown',e=>{
    dragging=true;
    startX=e.clientX;
    startW=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--pw'))||DEFAULT_W;
    handle.classList.add('dragging');
    document.body.style.userSelect='none';
    document.body.style.cursor='ew-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove',e=>{
    if(!dragging)return;
    // Dragging left = panel grows (right-anchored panel)
    const delta=startX-e.clientX;
    setWidth(startW+delta);
  });

  document.addEventListener('mouseup',()=>{
    if(!dragging)return;
    dragging=false;
    handle.classList.remove('dragging');
    document.body.style.userSelect='';
    document.body.style.cursor='';
  });
})();
document.getElementById('pclose').onclick=closePanel;
document.getElementById('pov').onclick=closePanel;

// ══════════════════════════════════════════
//  REMOVE / REINSTATE
// ══════════════════════════════════════════
function startRemove(id){rmId=id;document.getElementById('rmNote').value='';document.getElementById('rmov').classList.add('on')}
document.getElementById('rmCancel').onclick=()=>document.getElementById('rmov').classList.remove('on');
document.getElementById('rmConfirm').onclick=()=>{
  const g=games.find(x=>x.id===rmId);
  if(g){g.status='removed';g.removeNote=document.getElementById('rmNote').value.trim();save()}
  document.getElementById('rmov').classList.remove('on');closePanel();renderAll();
};
function startReinstate(id){riId=id;document.getElementById('riov').classList.add('on')}
document.getElementById('riCancel').onclick=()=>document.getElementById('riov').classList.remove('on');
function doReinstate(status){
  const g=games.find(x=>x.id===riId);
  if(g){g.status=status;delete g.removeNote;save()}
  document.getElementById('riov').classList.remove('on');closePanel();renderAll();
}
document.getElementById('riWl').onclick=()=>doReinstate('wishlist');
document.getElementById('riBt').onclick=()=>doReinstate('bought');

// ══════════════════════════════════════════
//  CHIP INPUT
// ══════════════════════════════════════════
function makeChip(wrapId,inputId,getA,setA,renderCb,labelFn){
  function render(){
    const w=document.getElementById(wrapId),inp=document.getElementById(inputId);
    w.querySelectorAll('.cich').forEach(e=>e.remove());
    getA().forEach((v,i)=>{
      const c=document.createElement('span');c.className='cich';
      c.innerHTML=`${esc(labelFn?labelFn(v):v)}<button type="button" data-i="${i}">✕</button>`;
      c.querySelector('button').onclick=e=>{const a=getA();a.splice(parseInt(e.target.dataset.i),1);setA(a);render();if(renderCb)renderCb()};
      w.insertBefore(c,inp);
    });
  }
  document.getElementById(inputId).addEventListener('keydown',e=>{
    if((e.key==='Enter'||e.key===',')&&e.target.value.trim()){
      e.preventDefault();const a=getA();a.push(e.target.value.trim());setA(a);e.target.value='';render();if(renderCb)renderCb();
    }
    if(e.key==='Backspace'&&!e.target.value&&getA().length){const a=getA();a.pop();setA(a);render();if(renderCb)renderCb()}
  });
  document.getElementById(wrapId).onclick=()=>document.getElementById(inputId).focus();
  return render;
}
const renderGenres=makeChip('genreWrap','genreInput',()=>cGenres,v=>{cGenres=v},updateGenreDd);
const renderTags=makeChip('tagsWrap','tagsInput',()=>cTags,v=>{cTags=v});
const renderBtcCol=makeChip('btcColWrap','btcColInput',()=>cBtcCol,v=>{cBtcCol=v},updateBtcColDd,colLabel);
let cModalCol=[];
const renderModalCol=makeChip('fColColWrap','fColColInput',()=>cModalCol,v=>{cModalCol=v},updateModalColDd,colLabel);
function updateModalColDd(){
  const dd=document.getElementById('fColColDd');
  const q=(document.getElementById('fColColInput').value||'').toLowerCase().trim();
  const opts=allSteamCollections().filter(s=>!cModalCol.includes(s)&&(!q||s.toLowerCase().includes(q)));
  if(!opts.length){dd.classList.remove('on');return}
  dd.innerHTML=opts.map(s=>`<div class="genre-opt" data-v="${esc(s)}">${esc(colLabel(s))}</div>`).join('');
  dd.querySelectorAll('.genre-opt').forEach(el=>{
    el.onclick=()=>{cModalCol.push(el.dataset.v);document.getElementById('fColColInput').value='';renderModalCol();dd.classList.remove('on')};
  });
  dd.classList.add('on');
}
document.getElementById('fColColInput').addEventListener('input',updateModalColDd);
document.getElementById('fColColInput').addEventListener('focus',updateModalColDd);

function updateBtcColDd(){
  const dd=document.getElementById('btcColDd');
  const q=(document.getElementById('btcColInput').value||'').toLowerCase().trim();
  const opts=allSteamCollections().filter(s=>!cBtcCol.includes(s)&&(!q||s.toLowerCase().includes(q)));
  if(!opts.length){dd.classList.remove('on');return}
  dd.innerHTML=opts.map(s=>`<div class="genre-opt" data-v="${esc(s)}">${esc(colLabel(s))}</div>`).join('');
  dd.querySelectorAll('.genre-opt').forEach(el=>{
    el.onclick=()=>{cBtcCol.push(el.dataset.v);document.getElementById('btcColInput').value='';renderBtcCol();dd.classList.remove('on')};
  });
  dd.classList.add('on');
}

document.getElementById('btcColInput').addEventListener('input',updateBtcColDd);
document.getElementById('btcColInput').addEventListener('focus',updateBtcColDd);

function updateGenreDd(){
  const dd=document.getElementById('genreDd');
  const q=document.getElementById('genreInput').value.toLowerCase();
  const opts=allGenres().filter(g=>!cGenres.includes(g)&&(q===''||g.toLowerCase().includes(q)));
  if(!opts.length){dd.classList.remove('on');return}
  dd.innerHTML=opts.map(g=>`<div class="genre-opt" data-g="${esc(g)}">${esc(g)}</div>`).join('');
  dd.classList.add('on');
  dd.querySelectorAll('.genre-opt').forEach(el=>{
    el.onclick=()=>{cGenres.push(el.dataset.g);document.getElementById('genreInput').value='';renderGenres();dd.classList.remove('on')};
  });
}
document.getElementById('genreInput').addEventListener('input',updateGenreDd);
document.getElementById('genreInput').addEventListener('focus',updateGenreDd);

// ── Tags dropdown (sorted by most-used) ──
function updateTagsDd(){
  const dd=document.getElementById('tagsDd');
  const q=(document.getElementById('tagsInput').value||'').toLowerCase().trim();
  const all=allTagsSorted().filter(t=>!cTags.includes(t)&&(!q||t.toLowerCase().includes(q)));
  if(!all.length){dd.classList.remove('on');return}
  dd.innerHTML=all.map(t=>`<div class="genre-opt" data-t="${esc(t)}">${esc(t)}</div>`).join('');
  dd.classList.add('on');
  dd.querySelectorAll('.genre-opt').forEach(el=>{
    el.onclick=()=>{
      cTags.push(el.dataset.t);
      document.getElementById('tagsInput').value='';
      renderTags();
      dd.classList.remove('on');
    };
  });
}
document.getElementById('tagsInput').addEventListener('input',updateTagsDd);
document.getElementById('tagsInput').addEventListener('focus',updateTagsDd);
document.addEventListener('click',e=>{
  if(!e.target.closest('.genre-wrap')){document.getElementById('genreDd').classList.remove('on');document.getElementById('tagsDd').classList.remove('on');const bdd=document.getElementById('btcColDd');if(bdd)bdd.classList.remove('on');const mdd=document.getElementById('fColColDd');if(mdd)mdd.classList.remove('on');const idd=document.getElementById('colInlineDd');if(idd)idd.classList.remove('on');}
  if(!e.target.closest('#fDev')&&!e.target.closest('#devDd'))document.getElementById('devDd').classList.remove('on');
  if(!e.target.closest('#fPub')&&!e.target.closest('#pubDd'))document.getElementById('pubDd').classList.remove('on');
});

// ══════════════════════════════════════════
//  DEV / PUB AUTOCOMPLETE
// ══════════════════════════════════════════
function makeAcField(inputId,ddId,field){
  const inp=document.getElementById(inputId);
  const dd=document.getElementById(ddId);
  function update(){
    const q=inp.value.toLowerCase();
    const opts=allDevPub(field).filter(v=>v.toLowerCase().includes(q)&&v!==inp.value);
    if(!opts.length){dd.classList.remove('on');return}
    dd.innerHTML=opts.map(v=>`<div class="ac-opt">${esc(v)}</div>`).join('');
    dd.classList.add('on');
    dd.querySelectorAll('.ac-opt').forEach(el=>{
      el.onclick=()=>{inp.value=el.textContent;dd.classList.remove('on')};
    });
  }
  inp.addEventListener('input',update);
  inp.addEventListener('focus',update);
}
makeAcField('fDev','devDd','developer');
makeAcField('fPub','pubDd','publisher');

// ══════════════════════════════════════════
//  COVER PREVIEW
// ══════════════════════════════════════════
function setCoverPreview(url){
  const prev=document.getElementById('cprev');
  const hint=document.getElementById('coverHint');
  if(!url){prev.style.display='none';hint.style.display='none';return}
  prev.src=url;
  prev.onload=()=>{prev.style.display='block';hint.style.display='none'};
  prev.onerror=()=>{prev.style.display='none';hint.style.display='block'};
}
function tryAutoFillCover(appId){
  const fc=document.getElementById('fCover');
  const isAutoUrl=!fc.value||
    fc.value.startsWith('https://cdn.cloudflare.steamstatic.com/steam/apps/')||
    fc.value.startsWith('https://shared.fastly.steamstatic.com/');
  if(isAutoUrl){const url=sc(appId);fc.value=url;setCoverPreview(url)}
  else setCoverPreview(fc.value);
}

// App ID duplicate check
function checkAppIdDup(){
  const id=document.getElementById('fAppId').value.trim();
  const errEl=document.getElementById('appIdErr');
  const inp=document.getElementById('fAppId');
  if(!id){errEl.classList.remove('on');inp.classList.remove('err');return false}
  const dup=games.find(g=>g.steamAppId&&String(g.steamAppId)===id&&g.id!==editId);
  if(dup){
    errEl.textContent=`"${dup.title}" already uses this App ID.`;
    errEl.classList.add('on');inp.classList.add('err');return true;
  }
  errEl.classList.remove('on');inp.classList.remove('err');
  return false;
}
// ══════════════════════════════════════════
//  STEAM AUTOFILL via Cloudflare Worker
// ══════════════════════════════════════════
const STEAM_WORKER='https://steam-proxy-cm26.carmine-migliore26.workers.dev';

// Parse a Steam date string ("13 Aug, 2026", "Aug 13 2026", "2026-08-13", etc.)
// Returns an ISO "YYYY-MM-DD" string if the input contains day+month+year, else null.
function parseSteamDateStr(raw){
  if(!raw)return null;
  const s=raw.trim();
  const M={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
    january:1,february:2,march:3,april:4,june:6,july:7,august:8,
    september:9,october:10,november:11,december:12};
  function iso(d,m,y){const yr=y<100?2000+y:y;return`${yr}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
  let r;
  // 2026-08-13
  r=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(r)return iso(+r[3],+r[2],+r[1]);
  // 13/08/2026 or 13/08/26
  r=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(r)return iso(+r[1],+r[2],+r[3]);
  // 13 Aug, 2026 / 13 Aug 2026 / 13 August 2026 / 13 Aug 26
  r=s.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{2,4})$/);
  if(r){const m=M[r[2].toLowerCase()];if(m)return iso(+r[1],m,+r[3]);}
  // Aug 13, 2026 / August 13, 2026 / Aug 13 2026
  r=s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if(r){const m=M[r[1].toLowerCase()];if(m)return iso(+r[2],m,+r[3]);}
  return null;
}

function steamStatus(msg,type){
  // type: 'loading' | 'ok' | 'err' | ''
  const el=document.getElementById('steamStatus');
  if(!msg){el.style.display='none';el.textContent='';return}
  el.style.display='block';
  el.textContent=msg;
  el.style.color=type==='ok'?'var(--green)':type==='err'?'var(--pink)':'var(--t3)';
}

// Returns appId string if input is a full Steam URL or a pure numeric ID, else null
function extractAppId(input){
  if(!input)return null;
  // Full Steam store URL
  const m=input.match(/store\.steampowered\.com\/app\/(\d+)/);
  if(m)return m[1];
  // Pure numeric App ID (at least 4 digits to avoid accidents)
  if(/^\d{4,}$/.test(input))return input;
  return null;
}

// fromUrl: when triggered by a URL paste, always overwrite the title from the API
async function steamAutoFill(appId,{fromUrl=false}={}){
  if(!appId)return;
  steamStatus('Fetching from Steam…','loading');
  try{
    const res=await fetch(`${STEAM_WORKER}/?appid=${appId}`);
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const json=await res.json();
    const entry=json[appId];
    if(!entry||!entry.success||!entry.data){steamStatus('No data found for this App ID.','err');return}
    const d=entry.data;
    const filled=[];

    // Title — always overwrite when triggered from a URL (slug mangling); else only if empty
    const titleEl=document.getElementById('fTitle');
    if(d.name&&(fromUrl||!titleEl.value.trim())){titleEl.value=d.name;filled.push('title')}

    // Cover — use header_image directly from the API (correct CDN + cache-busting timestamp)
    const fc=document.getElementById('fCover');
    const isSteamCover=!fc.value||
      fc.value.startsWith('https://cdn.cloudflare.steamstatic.com/steam/apps/')||
      fc.value.startsWith('https://shared.akamai.steamstatic.com/store_item_assets/')||
      fc.value.startsWith('https://shared.fastly.steamstatic.com/');
    if(d.header_image&&isSteamCover){fc.value=d.header_image;setCoverPreview(d.header_image);filled.push('cover')}

    // Store link — populate when triggered from App ID field (not URL, which already set it)
    const storeEl=document.getElementById('fStore');
    if(!fromUrl&&!storeEl.value.trim()){
      storeEl.value=`https://store.steampowered.com/app/${appId}/`;filled.push('store link');
    }

    // Genres — push into chip array, skip dupes
    if(d.genres&&d.genres.length){
      const incoming=d.genres.map(g=>g.description).filter(Boolean);
      const added=incoming.filter(g=>!cGenres.includes(g));
      if(added.length){cGenres.push(...added);renderGenres();filled.push('genres')}
    }

    // Developer (all, comma-separated)
    const devEl=document.getElementById('fDev');
    if(!devEl.value.trim()&&d.developers&&d.developers.length){devEl.value=d.developers.join(', ');filled.push('developer')}

    // Publisher (all, comma-separated)
    const pubEl=document.getElementById('fPub');
    if(!pubEl.value.trim()&&d.publishers&&d.publishers.length){pubEl.value=d.publishers.join(', ');filled.push('publisher')}

    // Release date
    const isTba=d.release_date&&d.release_date.coming_soon;
    const dateStr=d.release_date&&d.release_date.date;
    if(dateStr){
      if(isTba){
        setTbaState(true);
        const tbaEl=document.getElementById('fTbaText');
        if(!tbaEl.value.trim()){tbaEl.value=dateStr;filled.push('release')}
      } else {
        const dateEl=document.getElementById('fDate');
        if(!dateEl.value){
          const iso=parseSteamDateStr(dateStr);
          if(iso){dateEl.value=iso;filled.push('release');}
        }
      }
    }

    // Price — comes in cents, convert to euros (2 decimals)
    const priceEl=document.getElementById('fPrice');
    if(!priceEl.value.trim()&&d.price_overview&&d.price_overview.initial!=null){
      priceEl.value=(d.price_overview.initial/100).toFixed(2);filled.push('price');
    } else if(!priceEl.value.trim()&&d.is_free){
      priceEl.value='0.00';filled.push('price');
    }

    // Type — game / dlc (auto from Steam)
    if(d.type&&(d.type==='game'||d.type==='dlc')){
      setGameType(d.type);
      // Auto-populate parentAppId from fullgame.appid
      if(d.type==='dlc'&&d.fullgame&&d.fullgame.appid){
        const parAppId=String(d.fullgame.appid);
        const parHidden=document.getElementById('fParentAppId');
        const parSearch=document.getElementById('fParentSearch');
        if(parHidden)parHidden.value=parAppId;
        if(parSearch){
          const par=games.find(x=>x.steamAppId&&String(x.steamAppId)===parAppId);
          parSearch.value=par?par.title:'App ID: '+parAppId;
        }
        filled.push('parentAppId');
      }
    }

    // Short description — plain text, populate textarea directly
    if(d.short_description){
      const plain=d.short_description.replace(/<[^>]+>/g,'').trim();
      if(plain){
        const _fsd2=document.getElementById('fShortDesc');
        if(_fsd2&&!_fsd2.value.trim())_fsd2.value=plain;
        window._pendingShortDesc=plain;
      }
    }

    steamStatus(filled.length?`✓ Filled: ${filled.join(', ')}`:'✓ Fetched — fields already filled','ok');
  }catch(err){
    steamStatus(`Could not fetch Steam data (${err.message})`,'err');
  }
}

document.getElementById('fAppId').addEventListener('blur',()=>{
  const raw=document.getElementById('fAppId').value.trim();
  checkAppIdDup();
  const id=extractAppId(raw);
  if(id){
    // If user pasted a full URL into the App ID field, extract and clean it up
    if(raw.includes('store.steampowered.com'))document.getElementById('fAppId').value=id;
    steamAutoFill(id,{fromUrl:false});
  }
});
document.getElementById('fCover').addEventListener('blur',()=>{
  setCoverPreview(document.getElementById('fCover').value.trim());
});

// ══════════════════════════════════════════
//  TBA TOGGLE — button stays put, just swaps input
// ══════════════════════════════════════════
function setTbaState(on){
  document.getElementById('tbaBtn').classList.toggle('on',on);
  document.getElementById('dateRow').style.display=on?'none':'grid';
  document.getElementById('tbaTxtRow').style.display=on?'grid':'none';
}
document.getElementById('tbaBtn').addEventListener('click',()=>setTbaState(true));
document.getElementById('tbaBtnOff').addEventListener('click',()=>setTbaState(false));

function setGameType(v){
  document.getElementById('fType').value=v;
  document.getElementById('fTypeGame').classList.toggle('on',v!=='dlc');
  document.getElementById('fTypeDlc').classList.toggle('on',v==='dlc');
  const parRow=document.getElementById('parentAppIdRow');
  if(parRow)parRow.style.display=v==='dlc'?'':'none';
  if(v!=='dlc'){const ps=document.getElementById('fParentSearch');const ph=document.getElementById('fParentAppId');if(ps)ps.value='';if(ph)ph.value='';}
}
document.getElementById('fTypeGame').onclick=()=>setGameType('game');
document.getElementById('fTypeDlc').onclick=()=>setGameType('dlc');

// ══════════════════════════════════════════
//  STEAM STORE LINK PARSER
// ══════════════════════════════════════════
function parseStoreLink(url){
  const m=url.match(/store\.steampowered\.com\/app\/(\d+)\/([^\/\?#]*)/);
  if(!m)return null;
  const appId=m[1];
  const title=decodeURIComponent(m[2]).replace(/_/g,' ').replace(/[^A-Za-z0-9\s']/g,' ').replace(/\s+/g,' ').trim();
  return{appId,title};
}
document.getElementById('fStore').addEventListener('blur',()=>{
  const url=document.getElementById('fStore').value.trim();if(!url)return;
  const parsed=parseStoreLink(url);if(!parsed)return;
  const appIdEl=document.getElementById('fAppId');
  if(!appIdEl.value.trim())appIdEl.value=parsed.appId;
  checkAppIdDup();
  // Always fetch — title will be overwritten with the correct API name (fromUrl=true)
  steamAutoFill(parsed.appId,{fromUrl:true});
});

// ══════════════════════════════════════════
//  PRIORITY LABEL PREVIEW IN MODAL
// ══════════════════════════════════════════
function updatePrioLbl(){
  const v=document.getElementById('fPriority').value;
  const el=document.getElementById('prioLblPrev');
  el.style.background=prioColor(v);
  el.textContent=prioLabel(v);
}
document.getElementById('fPriority').addEventListener('change',updatePrioLbl);


// parentAppId autocomplete
(function(){
  const inp=document.getElementById('fParentSearch');
  const hidden=document.getElementById('fParentAppId');
  const dd=document.getElementById('parentDd');
  function showDd(q){
    const ql=q.toLowerCase();
    const matches=games.filter(g=>g.status==='bought'&&g.type!=='dlc'&&g.steamAppId&&(
      (g.title||'').toLowerCase().includes(ql)||String(g.steamAppId).includes(q)
    )).slice(0,12);
    if(!matches.length){dd.classList.remove('on');return}
    dd.innerHTML=matches.map(g=>`<div class="ac-opt" data-appid="${esc(String(g.steamAppId))}" data-title="${esc(g.title||'')}">${esc(g.title||'')} <span style="color:var(--t3);font-size:.65rem">${g.steamAppId}</span></div>`).join('');
    dd.querySelectorAll('.ac-opt').forEach(el=>{
      el.addEventListener('click',()=>{inp.value=el.dataset.title;hidden.value=el.dataset.appid;dd.classList.remove('on');});
    });
    dd.classList.add('on');
  }
  inp.addEventListener('input',()=>showDd(inp.value.trim()));
  inp.addEventListener('focus',()=>{if(inp.value.trim())showDd(inp.value.trim())});
  document.addEventListener('click',e=>{if(!e.target.closest('#parentAppIdRow'))dd.classList.remove('on')});
})();

// ══════════════════════════════════════════
//  PLATFORM HELPERS
// ══════════════════════════════════════════
function setPlatforms(vals){
  const arr=Array.isArray(vals)?vals:(vals||'').split(',').map(s=>s.trim()).filter(Boolean);
  document.querySelectorAll('#pcks input').forEach(cb=>{cb.checked=arr.length===0?cb.value==='Steam':arr.includes(cb.value)});
}
function getPlatforms(){return Array.from(document.querySelectorAll('#pcks input:checked')).map(cb=>cb.value)}

// ══════════════════════════════════════════
//  ADD / EDIT MODAL
// ══════════════════════════════════════════
function clearModal(){
  ['fTitle','fAppId','fDev','fPub','fPrice','fStore','fCover','fDate','fTbaText','fNoteTxt'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
  // Pre-fill note date with today
  const nd=document.getElementById('fNoteDate');
  if(nd){const n=new Date();nd.value=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`}
  document.getElementById('fHotness').value='';
  document.getElementById('fPriority').value='medium';
  setGameType('game');
  const _fsd3=document.getElementById('fShortDesc');if(_fsd3)_fsd3.value='';
  const _ps=document.getElementById('fParentSearch');if(_ps)_ps.value='';
  const _ph=document.getElementById('fParentAppId');if(_ph)_ph.value='';
  document.getElementById('cprev').style.display='none';
  document.getElementById('coverHint').style.display='none';
  document.getElementById('appIdErr').classList.remove('on');
  document.getElementById('fAppId').classList.remove('err');
  setTbaState(false);
  updatePrioLbl();
  cGenres=[];cTags=[];cModalCol=[];renderGenres();renderTags();renderModalCol();
  _modalNotes=[];renderModalNoteList();
  // Reset collection fields
  const fcs=document.getElementById('fColStore');if(fcs)fcs.value='Steam';
  const fcc=document.getElementById('fColCost');if(fcc)fcc.value='';
  const fcd=document.getElementById('fColDate');
  if(fcd){const n=new Date();fcd.value=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`}
  const fcp=document.getElementById('fColPlayStatus');if(fcp){fcp.value='Unplayed';_syncModalPsBtn('Unplayed');}
  document.getElementById('modalColSection').style.display='none';
}
function openAdd(){
  editId=null;clearModal();setPlatforms(['Steam']);
  const isCol=appMode==='collection';
  document.getElementById('modalTitle').textContent=isCol?'Add to Collection':'Add game';
  document.getElementById('msave').textContent=isCol?'Save to Collection':'Save game';
  // Show collection fields when in collection mode
  const colSec=document.getElementById('modalColSection');
  if(colSec){
    colSec.style.display=isCol?'block':'none';
    if(isCol){
      // Pre-fill purchase date to today
      const fcd=document.getElementById('fColDate');
      if(fcd){const n=new Date();fcd.value=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`}
    }
  }
  // Show notes section in add mode too
  const mnSec=document.getElementById('modalNotesSection');
  if(mnSec)mnSec.style.display='';
  document.getElementById('mov').classList.add('on');
}
function openEdit(id){
  const g=games.find(x=>x.id===id);if(!g)return;
  editId=id;clearModal();
  document.getElementById('modalTitle').textContent=`Edit: ${esc(g.title)}`;
  document.getElementById('fTitle').value=g.title||'';
  document.getElementById('fAppId').value=g.steamAppId||'';
  document.getElementById('fDev').value=g.developer||'';
  document.getElementById('fPub').value=g.publisher||'';
  document.getElementById('fPrice').value=g.price||'';
  document.getElementById('fPriority').value=g.priority||'medium';
  document.getElementById('fHotness').value=(g.hotness===null||g.hotness===undefined)?'':g.hotness;
  document.getElementById('fStore').value=g.storeLink||'';
  const _fsdEl=document.getElementById('fShortDesc');if(_fsdEl)_fsdEl.value=g.shortDescription||'';
  setGameType(g.type||'game');
  // Populate parentAppId for DLCs (setGameType already shows/hides the row)
  if((g.type||'game')==='dlc'&&g.parentAppId){
    const parHidden=document.getElementById('fParentAppId');
    const parSearch=document.getElementById('fParentSearch');
    if(parHidden)parHidden.value=g.parentAppId;
    const par=games.find(x=>x.steamAppId&&String(x.steamAppId)===String(g.parentAppId));
    if(parSearch)parSearch.value=par?par.title:g.parentAppId;
  }
  if(g.tbaText){setTbaState(true);document.getElementById('fTbaText').value=g.tbaText}
  else{document.getElementById('fDate').value=g.releaseDate||''}
  const savedCover=g.cover||'';
  document.getElementById('fCover').value=savedCover;
  if(savedCover)setCoverPreview(savedCover);
  else if(g.steamAppId)tryAutoFillCover(g.steamAppId);
  cGenres=[...(g.genres||[])];cTags=[...(g.tags||[])];
  setPlatforms(g.platforms||[g.platform||'Steam']);
  renderGenres();renderTags();updatePrioLbl();
  // Load existing notes into modal note list
  const _editG=games.find(x=>x.id===editId);
  _modalNotes=_editG?(Array.isArray(_editG.notes)?[..._editG.notes]:(_editG.notes?[{id:nid(),date:todayStr(),text:_editG.notes}]:[])):[];
  renderModalNoteList();
  // Collection fields — show and populate when editing a bought game
  const colSec=document.getElementById('modalColSection');
  if(colSec&&g.status==='bought'){
    colSec.style.display='block';
    const fcs=document.getElementById('fColStore');if(fcs)fcs.value=g.store||'Steam';
    const fcc=document.getElementById('fColCost');if(fcc)fcc.value=g.cost||'';
    const fcd=document.getElementById('fColDate');
    if(fcd){
      const _pd=g.purchaseDate||'';
      const _pdm=_pd.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      fcd.value=_pdm?`${_pdm[3]}-${_pdm[2]}-${_pdm[1]}`:_pd;
    }
    const fcp=document.getElementById('fColPlayStatus');if(fcp){fcp.value=g.playStatus||'Unplayed';_syncModalPsBtn(g.playStatus||'Unplayed');}
    cModalCol=[...(g.steamCollection||[])];renderModalCol();
  }
  // Notes section — only shown when editing
  const mnSec=document.getElementById('modalNotesSection');
  const mnList=document.getElementById('fNoteList');
  if(mnSec)mnSec.style.display='';
  renderModalNotes(g);
  document.getElementById('mov').classList.add('on');
}
function renderModalNotes(g){
  const mnList=document.getElementById('fNoteList');
  if(!mnList)return;
  const notes=Array.isArray(g.notes)?g.notes:(g.notes?[{id:nid(),date:todayStr(),text:g.notes}]:[]);
  if(!notes.length){mnList.innerHTML='';return}
  mnList.innerHTML=[...notes].reverse().map(n=>`
    <div class="note-entry" data-nid="${esc(n.id)}">
      <div class="note-date">${esc(fmtDate(n.date)||n.date||'')}</div>
      <div class="note-text">${esc(n.text)}</div>
      <div class="note-edit-wrap" style="display:none">
        <div class="note-compose" style="margin-bottom:.25rem">
          <input type="date" class="note-compose-date note-edit-date">
          <textarea class="note-edit-area" style="display:block;margin-bottom:0;min-height:50px">${esc(n.text)}</textarea>
        </div>
      </div>
      <div class="note-actions">
        <button class="note-btn edit-btn">Edit</button>
        <button class="note-btn save save-btn" style="display:none">Save</button>
        <button class="note-btn del-btn del">Delete</button>
      </div>
    </div>`).join('');
  // Wire edit/save/delete buttons
  mnList.querySelectorAll('.note-entry').forEach(entry=>{
    const nidVal=entry.dataset.nid;
    const textEl=entry.querySelector('.note-text');
    const editWrap=entry.querySelector('.note-edit-wrap');
    const editArea=entry.querySelector('.note-edit-area');
    const editDateInp=entry.querySelector('.note-edit-date');
    const editBtn=entry.querySelector('.edit-btn');
    const saveBtn=entry.querySelector('.save-btn');
    const delBtn=entry.querySelector('.del-btn');
    const dateEl=entry.querySelector('.note-date');
    const dm=dateEl.textContent.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(editDateInp&&dm)editDateInp.value=`${dm[3]}-${dm[2]}-${dm[1]}`;
    editBtn.onclick=()=>{textEl.style.display='none';editWrap.style.display='block';editBtn.style.display='none';saveBtn.style.display=''};
    saveBtn.onclick=()=>{
      const g2=games.find(x=>x.id===editId);if(!g2)return;
      const arr=Array.isArray(g2.notes)?[...g2.notes]:(g2.notes?[{id:nid(),date:todayStr(),text:g2.notes}]:[]);
      const i=arr.findIndex(n=>n.id===nidVal);
      if(i>-1){arr[i].text=editArea.value.trim();if(editDateInp&&editDateInp.value)arr[i].date=fmtDate(editDateInp.value);}
      g2.notes=arr;renderModalNotes(g2);
    };
    delBtn.onclick=()=>{
      if(!confirm('Delete this note?'))return;
      const g2=games.find(x=>x.id===editId);if(!g2)return;
      const arr=(Array.isArray(g2.notes)?g2.notes:(g2.notes?[{id:nid(),date:todayStr(),text:g2.notes}]:[])).filter(n=>n.id!==nidVal);
      g2.notes=arr;renderModalNotes(g2);
    };
  });
}
function closeModal(){document.getElementById('mov').classList.remove('on');steamStatus('');['genreDd','tagsDd','devDd','pubDd'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('on')});window._pendingShortDesc=null;}
// Modal notes: full note list with add/edit/delete (works in both add and edit mode)
let _modalNotes=[]; // in-memory note list for the open modal
function renderModalNoteList(){
  const list=document.getElementById('fNoteList');if(!list)return;
  list.innerHTML=[..._modalNotes].reverse().map(n=>`
    <div class="note-entry" data-nid="${esc(n.id)}">
      <div class="note-date">${esc(fmtDate(n.date)||n.date||'')}</div>
      <div class="note-text">${esc(n.text)}</div>
      <div class="note-edit-wrap" style="display:none">
        <div class="note-compose" style="margin-bottom:.25rem">
          <input type="date" class="note-compose-date note-edit-date">
          <textarea class="note-edit-area" style="display:block;margin-bottom:0;min-height:50px">${esc(n.text)}</textarea>
        </div>
      </div>
      <div class="note-actions">
        <button class="note-btn edit-btn">Edit</button>
        <button class="note-btn save save-btn" style="display:none">Save</button>
        <button class="note-btn del-btn del">Delete</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('.note-entry').forEach(el=>{
    const nid2=el.dataset.nid;
    const editWrap=el.querySelector('.note-edit-wrap');
    const editBtn=el.querySelector('.edit-btn');
    const saveBtn=el.querySelector('.save-btn');
    const delBtn=el.querySelector('.del-btn');
    const editDate=el.querySelector('.note-edit-date');
    const editArea=el.querySelector('.note-edit-area');
    editBtn.onclick=()=>{
      const n=_modalNotes.find(x=>x.id===nid2);
      if(editDate&&n){
        // Convert dd/mm/yyyy to yyyy-mm-dd for input
        const parts=n.date.split('/');
        editDate.value=parts.length===3?`${parts[2]}-${parts[1]}-${parts[0]}`:n.date;
      }
      editWrap.style.display='';editBtn.style.display='none';saveBtn.style.display='';
    };
    saveBtn.onclick=()=>{
      const idx=_modalNotes.findIndex(x=>x.id===nid2);if(idx<0)return;
      const nd=editDate?editDate.value:'';
      _modalNotes[idx]={..._modalNotes[idx],date:nd?fmtDate(nd):_modalNotes[idx].date,text:editArea?editArea.value.trim():_modalNotes[idx].text};
      renderModalNoteList();
    };
    delBtn.onclick=()=>{_modalNotes=_modalNotes.filter(x=>x.id!==nid2);renderModalNoteList();};
  });
}

(function(){
  const btn=document.getElementById('fNoteSaveBtn');
  if(!btn)return;
  btn.addEventListener('click',()=>{
    const txt=document.getElementById('fNoteTxt').value.trim();
    if(!txt)return;
    const nd=document.getElementById('fNoteDate').value;
    const noteDate=nd?fmtDate(nd):todayStr();
    _modalNotes.push({id:nid(),date:noteDate,text:txt});
    document.getElementById('fNoteTxt').value='';
    renderModalNoteList();
  });
})();
document.getElementById('addBtn').onclick=openAdd;
document.getElementById('mcancel').onclick=closeModal;
document.getElementById('mov').onclick=e=>{if(e.target===e.currentTarget)closeModal()};

document.getElementById('msave').onclick=()=>{
  const title=document.getElementById('fTitle').value.trim();
  if(!title){alert('Please enter a title.');return}
  if(checkAppIdDup()){showToast('Fix the duplicate App ID before saving.','err');return}
  const hotRaw=document.getElementById('fHotness').value.trim();
  const hotness=hotRaw===''?null:Math.min(100,Math.max(1,parseInt(hotRaw)||1));
  const appId=document.getElementById('fAppId').value.trim()||null;
  const platforms=getPlatforms();
  const isTba=document.getElementById('tbaBtn').classList.contains('on');
  const tbaText=isTba?document.getElementById('fTbaText').value.trim():'';
  const rawDate=isTba?'':document.getElementById('fDate').value.trim();
  const coverVal=document.getElementById('fCover').value.trim();
  const data={
    title,steamAppId:appId,
    platforms,platform:platforms.join(', '),
    genres:[...cGenres],genre:cGenres.join(', '),
    developer:document.getElementById('fDev').value.trim(),
    publisher:document.getElementById('fPub').value.trim(),
    releaseDate:rawDate?parseDate(rawDate):'',
    tbaText,
    price:document.getElementById('fPrice').value.trim(),
    priority:document.getElementById('fPriority').value,
    hotness,
    tags:[...cTags],
    cover:coverVal,
    storeLink:document.getElementById('fStore').value.trim(),
    type:document.getElementById('fType').value||'game',
    parentAppId:(()=>{const v=document.getElementById('fParentAppId').value.trim();return v||null})(),
  };
  // Attach shortDescription fetched from Steam API if available
  const _fsd=document.getElementById('fShortDesc');const _sdVal=_fsd?_fsd.value.trim():'';if(_sdVal){data.shortDescription=_sdVal;}else if(window._pendingShortDesc){data.shortDescription=window._pendingShortDesc;window._pendingShortDesc=null;}
  if(editId){
    const i=games.findIndex(x=>x.id===editId);
    if(i>-1){
        const colSec2=document.getElementById('modalColSection');
      const isColEdit=colSec2&&colSec2.style.display!=='none';
      const colFields=isColEdit?{
        store:document.getElementById('fColStore').value||'',
        cost:(()=>{const v=document.getElementById('fColCost').value.trim();return v!==''?parseFloat(v).toFixed(2):''})(  ),
        purchaseDate:document.getElementById('fColDate').value||'',
        playStatus:document.getElementById('fColPlayStatus').value||'Unplayed',
        steamCollection:[...cModalCol],
      }:{store:games[i].store,cost:games[i].cost,purchaseDate:games[i].purchaseDate,playStatus:games[i].playStatus,steamCollection:games[i].steamCollection};
      const preserved={notes:[..._modalNotes],status:games[i].status,added:games[i].added,removeNote:games[i].removeNote,myRating:games[i].myRating,myReview:games[i].myReview,shortDescription:data.shortDescription||games[i].shortDescription,...colFields};
      // parentAppId comes from data object, not preserved
      games[i]={...games[i],...data,...preserved};
    }
  } else {
    const isCol=appMode==='collection';
    const initStatus=isCol?'bought':'wishlist';
    const newGame={...data,id:gid(),added:Date.now(),status:initStatus,notes:[]};
    // If adding to collection, attach collection fields
    if(isCol){
      newGame.store=document.getElementById('fColStore').value||'';
      const cc=document.getElementById('fColCost').value.trim();
      newGame.cost=cc!==''?parseFloat(cc).toFixed(2):'';
      newGame.purchaseDate=document.getElementById('fColDate').value||'';
      newGame.playStatus=document.getElementById('fColPlayStatus').value||'Unplayed';
      newGame.steamCollection=[...cModalCol];
    }
    // Attach modal note if any
    newGame.notes=[..._modalNotes];
    games.push(newGame);
  }
  const _savedId=editId||(games.length?games[games.length-1].id:null);
  save(_savedId);closeModal();dispatchRender();
};

// ══════════════════════════════════════════
//  BULK ACTIONS
// ══════════════════════════════════════════


// ── POPOVER POSITION HELPER ──────────────────────────────────────────────────
function positionFpop(btn,pop){
  const r=btn.getBoundingClientRect();
  const pw=Math.min(260,window.innerWidth-16);
  let left=r.left;
  if(left+pw>window.innerWidth-8)left=window.innerWidth-pw-8;
  if(left<8)left=8;
  pop.style.top=(r.bottom+5)+'px';
  pop.style.left=left+'px';
  pop.style.width=pw+'px';
}

// ══════════════════════════════════════════
//  COLLECTION MODE TOGGLE + FILTERS
// ══════════════════════════════════════════
function setAppMode(mode){
  appMode=mode;
  const isCol=mode==='collection';
  // Toggle toolbars
  document.getElementById('tb').classList.toggle('col-hidden',isCol);
  document.getElementById('ctb').style.display=isCol?'flex':'none';
  // Sync pill toggle
  const mWl=document.getElementById('modeWishlist');
  const mCo=document.getElementById('modeCollection');
  if(mWl)mWl.classList.toggle('on',!isCol);
  if(mCo)mCo.classList.toggle('on',isCol);
  const mBtn=document.getElementById('hmCollectionBtn');
  if(mBtn)mBtn.textContent=isCol?'Wishlist':'Collection';
  // Render the right view
  if(isCol){renderCollection();}else{renderAll();}
}

function dispatchRender(){
  if(appMode==='collection')renderCollection();else renderAll();
}

// ══════════════════════════════════════════
//  URL HASH — persist view state across refreshes
// ══════════════════════════════════════════
function saveHash(){
  if(typeof URLSearchParams==='undefined')return;
  const p=new URLSearchParams();
  if(appMode!=='wishlist')p.set('mode',appMode);
  if(vm!=='grid')p.set('view',vm);
  const si=document.getElementById('searchInput');
  if(si&&si.value)p.set('q',si.value);
  const ss=document.getElementById('sortSel');
  if(ss&&ss.value&&ss.value!=='added')p.set('sort',ss.value);
  const gs=document.getElementById('groupSel');
  if(gs&&gs.value&&gs.value!=='none')p.set('group',gs.value);
  const h=p.toString();
  history.replaceState(null,'',h?('#'+h):(location.pathname+location.search));
}

function restoreFromHash(){
  if(typeof URLSearchParams==='undefined')return;
  const h=location.hash.slice(1);
  if(!h)return;
  try{
    const p=new URLSearchParams(h);
    if(p.has('mode'))appMode=p.get('mode');
    if(p.has('view')){
      vm=p.get('view');
    }
    if(p.has('q')){
      const val=p.get('q');
      const si=document.getElementById('searchInput');
      const sm=document.getElementById('searchInputMob');
      if(si){si.value=val;const sc=document.getElementById('searchClear');if(sc)sc.classList.toggle('visible',!!val);}
      if(sm){sm.value=val;const scm=document.getElementById('searchClearMob');if(scm)scm.classList.toggle('visible',!!val);}
    }
    if(p.has('sort')){const ss=document.getElementById('sortSel');if(ss)ss.value=p.get('sort');}
    if(p.has('group')){const gs=document.getElementById('groupSel');if(gs)gs.value=p.get('group');}
    // Sync app mode UI — setAppMode renders, but data isn't loaded yet; renderAll is a no-op on empty games
    if(appMode==='collection')setAppMode('collection');
  }catch(e){}
}

// ══════════════════════════════════════════
//  DEBOUNCE HELPER
// ══════════════════════════════════════════
function debounce(fn,ms){let t;return function(...a){clearTimeout(t);t=setTimeout(()=>fn.apply(this,a),ms)};}

// Collection toggle buttons
document.getElementById('modeWishlist').onclick=()=>setAppMode('wishlist');
document.getElementById('modeCollection').onclick=()=>setAppMode('collection');
document.getElementById('hmCollectionBtn').onclick=()=>{document.getElementById('hmenu').classList.remove('on');setAppMode(appMode==='collection'?'wishlist':'collection');};

// Collection view mode toggle (grid/list) — handled via per-section toggles

// Collection sort
document.getElementById('cSortSel').onchange=renderCollection;

(function(){
  const btn=document.getElementById('cPlayFilterBtn');
  const pop=document.getElementById('cPlayFilterPop');
  const badge=document.getElementById('cPlayFilterBadge');
  const clearBtn=document.getElementById('cPlayFilterClear');
  const list=document.getElementById('cPlayFilterList');
  const order=['Unplayed','In Progress','Completed','Superseded','Unfinishable','Played on Different Platform','Will Never Complete','Will Never Play'];
  function updateBtn(){
    const active=cfPlayStatus.size>0;
    btn.classList.toggle('active',active);
    badge.textContent=cfPlayStatus.size;badge.style.display=active?'':'none';
  }
  function renderList(){
    const freq={};
    games.filter(g=>g.status==='bought').forEach(g=>{const s=g.playStatus||'Unplayed';freq[s]=(freq[s]||0)+1;});
    const opts=order.filter(s=>freq[s]>0);
    if(!opts.length){list.innerHTML=`<div class="fpop-empty">No options</div>`;return;}
    list.innerHTML=opts.map(v=>{
      const m=PS_META[v]||{code:'UP',cls:'ps-UP'};
      const sel=cfPlayStatus.has(v);
      return`<div class="ps-filter-opt${sel?' selected':''}" data-val="${esc(v)}">
        <span class="col-ps-badge ${m.cls}" style="pointer-events:none">${m.code}<span class="ps-tip">${esc(v)}</span></span>
        <span class="fpop-opt-label">${esc(v)}</span>
        <span class="fpop-opt-count">${freq[v]||0}</span>
      </div>`;
    }).join('');
    list.querySelectorAll('.ps-filter-opt').forEach(el=>{
      el.addEventListener('click',()=>{
        const v=el.dataset.val;
        cfPlayStatus.has(v)?cfPlayStatus.delete(v):cfPlayStatus.add(v);
        el.classList.toggle('selected',cfPlayStatus.has(v));
        updateBtn();renderCollection();
      });
    });
  }
  clearBtn.onclick=()=>{cfPlayStatus=new Set();updateBtn();renderList();renderCollection();};
  btn.addEventListener('click',e=>{
    e.stopPropagation();
    document.querySelectorAll('.fpop.open').forEach(p=>{if(p!==pop)p.classList.remove('open')});
    const opening=!pop.classList.contains('open');
    pop.classList.toggle('open',opening);
    if(opening){positionFpop(btn,pop);renderList();}
  });
  document.addEventListener('click',e=>{if(!pop.contains(e.target)&&e.target!==btn)pop.classList.remove('open')});
})();
makeFilterPopover({
  btnId:'cColFilterBtn',popId:'cColFilterPop',badgeId:'cColFilterBadge',
  clearId:'cColFilterClear',listId:'cColFilterList',logicToggleId:'cColLogicToggle',showTip:false,
  getSelected:()=>cfSteamCol,setSelected:s=>{cfSteamCol=s},
  getLogic:()=>cfSteamColLogic,setLogic:l=>{cfSteamColLogic=l},
  getOptions:()=>{
    const freq={};
    games.filter(g=>g.status==='bought').forEach(g=>{(g.steamCollection||[]).forEach(c=>{if(c)freq[c]=(freq[c]||0)+1})});
    return Object.keys(freq).sort().map(v=>({value:colLabel(v),count:freq[v]}));
  },
  renderFn:renderCollection,
});
makeFilterPopover({
  btnId:'cGenreFilterBtn',popId:'cGenreFilterPop',badgeId:'cGenreFilterBadge',
  clearId:'cGenreFilterClear',listId:'cGenreFilterList',logicToggleId:'cGenreColLogicToggle',
  getSelected:()=>cfGenres,setSelected:s=>{cfGenres=s},
  getLogic:()=>cfGenreLogic,setLogic:l=>{cfGenreLogic=l},
  getOptions:()=>{
    const freq={};
    games.filter(g=>g.status==='bought').forEach(g=>{(g.genres||[]).forEach(x=>{if(x)freq[x]=(freq[x]||0)+1})});
    return Object.keys(freq).sort().map(v=>({value:v,count:freq[v]}));
  },
  renderFn:renderCollection,
});
function makePlatFilterPopover({btnId,popId,badgeId,clearId,listId,getSelected,setSelected,getFreq,doRender}){
  const btn=document.getElementById(btnId);
  const pop=document.getElementById(popId);
  const badge=document.getElementById(badgeId);
  const clearBtn=document.getElementById(clearId);
  const list=document.getElementById(listId);
  function updateBtn(){const active=getSelected().size>0;btn.classList.toggle('active',active);badge.textContent=getSelected().size;badge.style.display=active?'':'none';}
  function renderList(){
    const freq=getFreq();const sel=getSelected();
    const platforms=Object.keys(freq);
    if(!platforms.length){list.innerHTML=`<div class="fpop-empty">No platforms</div>`;return;}
    list.innerHTML=`<div class="plat-filter-pills">${platforms.map(p=>`<button class="b-plat plat-filter-pill${sel.has(p)?' selected':''}" data-val="${esc(p)}" style="background:${platColor(p)};color:${platTextColor(p)}">${esc(p)}<span class="plat-pill-count">${freq[p]}</span></button>`).join('')}</div>`;
    list.querySelectorAll('.plat-filter-pill').forEach(el=>{
      el.addEventListener('click',()=>{
        const v=el.dataset.val;
        getSelected().has(v)?getSelected().delete(v):getSelected().add(v);
        el.classList.toggle('selected',getSelected().has(v));
        updateBtn();doRender();
      });
    });
  }
  clearBtn.onclick=()=>{setSelected(new Set());updateBtn();renderList();doRender();};
  btn.addEventListener('click',e=>{
    e.stopPropagation();
    document.querySelectorAll('.fpop.open').forEach(p=>{if(p!==pop)p.classList.remove('open')});
    const opening=!pop.classList.contains('open');
    pop.classList.toggle('open',opening);
    if(opening){positionFpop(btn,pop);renderList();}
  });
  document.addEventListener('click',e=>{if(!pop.contains(e.target)&&e.target!==btn)pop.classList.remove('open')});
}
makePlatFilterPopover({
  btnId:'platFilterBtn',popId:'platFilterPop',badgeId:'platFilterBadge',
  clearId:'platFilterClear',listId:'platFilterList',
  getSelected:()=>fPlats,setSelected:s=>{fPlats=s},
  getFreq:()=>{const freq={};games.filter(g=>g.status!=='bought').forEach(g=>{const gp=g.platforms&&g.platforms.length?g.platforms:(g.platform?g.platform.split(',').map(s=>s.trim()).filter(Boolean):[]);gp.forEach(p=>{if(p)freq[p]=(freq[p]||0)+1})});return freq;},
  doRender:renderAll,
});
makePlatFilterPopover({
  btnId:'cPlatFilterBtn',popId:'cPlatFilterPop',badgeId:'cPlatFilterBadge',
  clearId:'cPlatFilterClear',listId:'cPlatFilterList',
  getSelected:()=>cfPlats,setSelected:s=>{cfPlats=s},
  getFreq:()=>{const freq={};games.filter(g=>g.status==='bought').forEach(g=>{const gp=g.platforms&&g.platforms.length?g.platforms:(g.platform?g.platform.split(',').map(s=>s.trim()).filter(Boolean):[]);gp.forEach(p=>{if(p)freq[p]=(freq[p]||0)+1})});return freq;},
  doRender:renderCollection,
});

// Search also triggers collection render when in collection mode
// (search inputs already call dispatchRender via renderAll override below)

// ══════════════════════════════════════════
//  VIEW / FILTER / SORT
// ══════════════════════════════════════════
document.getElementById('sortSel').onchange=renderAll;
document.getElementById('groupSel').onchange=renderAll;
const _searchRender=debounce(()=>dispatchRender(),150);
document.getElementById('searchInput').oninput=function(){
  const mob=document.getElementById('searchInputMob');
  if(mob)mob.value=this.value;
  document.getElementById('searchClear').classList.toggle('visible',!!this.value);
  document.getElementById('searchClearMob').classList.toggle('visible',!!this.value);
  _searchRender();
};
document.getElementById('searchClear').onclick=function(){
  const si=document.getElementById('searchInput');
  const sm=document.getElementById('searchInputMob');
  si.value='';if(sm)sm.value='';
  this.classList.remove('visible');
  document.getElementById('searchClearMob').classList.remove('visible');
  si.focus();dispatchRender();
};
document.getElementById('searchClearMob').onclick=function(){
  const si=document.getElementById('searchInput');
  const sm=document.getElementById('searchInputMob');
  si.value='';if(sm)sm.value='';
  this.classList.remove('visible');
  document.getElementById('searchClear').classList.remove('visible');
  sm.focus();dispatchRender();
};
(function(){
  const mob=document.getElementById('searchInputMob');
  if(mob)mob.addEventListener('input',function(){
    document.getElementById('searchInput').value=this.value;
    document.getElementById('searchClear').classList.toggle('visible',!!this.value);
    document.getElementById('searchClearMob').classList.toggle('visible',!!this.value);
    _searchRender();
  });
})();

// ══════════════════════════════════════════
//  EXPORT / IMPORT
// ══════════════════════════════════════════
function doExport(){
  const b=new Blob([JSON.stringify(games,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(b);
  const now=new Date();
  const ts=now.toISOString().slice(0,10)+'-'+now.toTimeString().slice(0,8).replace(/:/g,'');
  a.download=`backlog-${ts}.json`;a.click();
}
function doImport(){
  const inp=document.createElement('input');inp.type='file';inp.accept='.json';
  inp.onchange=e=>{
    const f=e.target.files[0];if(!f)return;
    const r=new FileReader();
    r.onload=ev=>{
      try{
        const data=JSON.parse(ev.target.result);
        if(Array.isArray(data)){
          const ex=new Set(games.map(g=>g.id));
          let added=0;
          data.forEach(g=>{if(!ex.has(g.id)){games.push(normalise({...g}));added++}});
          save();renderAll();
          showToast(`Imported ${added} new game${added!==1?'s':''} (${data.length-added} skipped).`);
        }
      }catch(err){showToast('Invalid JSON file.','err')}
    };
    r.readAsText(f);
  };
  inp.click();
}

// ══════════════════════════════════════════
//  HAMBURGER MENU + CALENDAR BUTTON
// ══════════════════════════════════════════
(function(){
  var btn=document.getElementById('hamburgerBtn');
  var menu=document.getElementById('hmenu');
  btn.addEventListener('click',function(e){
    e.stopPropagation();
    // Close any open filter popovers first
    document.querySelectorAll('.fpop.open').forEach(p=>p.classList.remove('open'));
    menu.classList.toggle('on');
  });
  document.addEventListener('click',function(e){
    if(!menu.contains(e.target)&&e.target!==btn) menu.classList.remove('on');
  });
  function hm(fn){return function(){menu.classList.remove('on');fn();}}
  document.getElementById('hmCalBtn').addEventListener('click',hm(openCalendar));
  document.getElementById('hmThemeLight').addEventListener('click',hm(()=>{if(theme!=='light'){theme='light';localStorage.setItem('btb_theme',theme);applyTheme();}}));
  document.getElementById('hmThemeDark').addEventListener('click',hm(()=>{if(theme!=='dark'){theme='dark';localStorage.setItem('btb_theme',theme);applyTheme();}}));
  document.getElementById('hmViewGrid').addEventListener('click',()=>{if(vm!=='grid'){vm='grid';renderAll();applyVm();}});
  document.getElementById('hmViewList').addEventListener('click',()=>{if(vm!=='list'){vm='list';renderAll();applyVm();}});
  document.getElementById('hmExpBtn').addEventListener('click',hm(doExport));
  document.getElementById('hmImpBtn').addEventListener('click',hm(doImport));
  document.getElementById('hmResyncBtn').addEventListener('click',hm(function(){if(!OFFLINE)resync();}));
  document.getElementById('calBtn').addEventListener('click',openCalendar);
})();

// ══════════════════════════════════════════
//  DESKTOP HAMBURGER MENU
// ══════════════════════════════════════════
(function(){
  const btn=document.getElementById('dhBtn');
  const menu=document.getElementById('dhmenu');
  btn.addEventListener('click',e=>{
    e.stopPropagation();
    document.querySelectorAll('.fpop.open').forEach(p=>p.classList.remove('open'));
    menu.classList.toggle('on');
  });
  document.addEventListener('click',e=>{if(!menu.contains(e.target)&&e.target!==btn)menu.classList.remove('on');});
  function dh(fn){return function(){menu.classList.remove('on');fn();}}
  document.getElementById('dhThemeLight').addEventListener('click',dh(()=>{if(theme!=='light'){theme='light';localStorage.setItem('btb_theme',theme);applyTheme();}}));
  document.getElementById('dhThemeDark').addEventListener('click',dh(()=>{if(theme!=='dark'){theme='dark';localStorage.setItem('btb_theme',theme);applyTheme();}}));
  document.getElementById('dhViewGrid').addEventListener('click',dh(()=>{if(vm!=='grid'){vm='grid';renderAll();applyVm();}}));
  document.getElementById('dhViewList').addEventListener('click',dh(()=>{if(vm!=='list'){vm='list';renderAll();applyVm();}}));
  document.getElementById('dhMetaBtn').addEventListener('click',dh(async()=>{fetchMeta(true);showToast('Metadata refreshed.');}));
  document.getElementById('dhDatesBtn').addEventListener('click',dh(()=>runReleaseDateCheck()));
  document.getElementById('dhExpBtn').addEventListener('click',dh(doExport));
  document.getElementById('dhImpBtn').addEventListener('click',dh(doImport));
})();

// ══════════════════════════════════════════
//  HOTNESS RANGE — dual thumb (desktop) + number inputs (mobile)
// ══════════════════════════════════════════
(function(){
  const minInp=document.getElementById('hrMinInp');
  const maxInp=document.getElementById('hrMaxInp');
  const wrap=document.getElementById('hrSliderWrap');
  const fill=document.getElementById('hrFill');
  const thumbMin=document.getElementById('hrThumbMin');
  const thumbMax=document.getElementById('hrThumbMax');
  const valsEl=document.getElementById('hrVals');
  const resetBtn=document.getElementById('hrReset');
  function clamp(v,lo,hi){return Math.min(hi,Math.max(lo,v))}
  const tipMin=document.getElementById('hrTipMin');
  const tipMax=document.getElementById('hrTipMax');
  const SLIDER_PAD=8; // px — matches CSS padding:0 8px on .hrange-slider-wrap
  function updateSliderUI(){
    if(!wrap||!thumbMin||!thumbMax)return;
    // Map 0-100 value into the padded track area using calc()
    thumbMin.style.left=`calc(${SLIDER_PAD}px + (100% - ${SLIDER_PAD*2}px) * ${hrMinVal/100})`;
    thumbMax.style.left=`calc(${SLIDER_PAD}px + (100% - ${SLIDER_PAD*2}px) * ${hrMaxVal/100})`;
    fill.style.left=`calc(${SLIDER_PAD}px + (100% - ${SLIDER_PAD*2}px) * ${hrMinVal/100})`;
    fill.style.width=`calc((100% - ${SLIDER_PAD*2}px) * ${(hrMaxVal-hrMinVal)/100})`;
    if(tipMin)tipMin.textContent=hrMinVal;
    if(tipMax)tipMax.textContent=hrMaxVal;
    if(valsEl)valsEl.textContent=hrMinVal+'–'+hrMaxVal;
    if(resetBtn)resetBtn.classList.toggle('visible',hrMinVal>0||hrMaxVal<100);
  }
  function applyValues(mn,mx){
    hrMinVal=mn;hrMaxVal=mx;
    minInp.value=mn;maxInp.value=mx;
    updateSliderUI();
    renderAll();
  }
  function onNumChange(){
    let mn=clamp(parseInt(minInp.value)||0,0,100);
    let mx=clamp(parseInt(maxInp.value)||100,0,100);
    if(mn>mx)mx=mn;
    applyValues(mn,mx);
  }
  minInp.addEventListener('input',onNumChange);
  maxInp.addEventListener('input',onNumChange);
  if(resetBtn)resetBtn.addEventListener('click',()=>applyValues(0,100));

  // Track click — account for padding offset
  wrap.addEventListener('mousedown',e=>{
    if(e.target===thumbMin||e.target===thumbMax)return;
    const rect=wrap.getBoundingClientRect();
    const trackW=rect.width-SLIDER_PAD*2;
    const val=Math.round(clamp((e.clientX-rect.left-SLIDER_PAD)/trackW,0,1)*100);
    const dMin=Math.abs(val-hrMinVal);
    const dMax=Math.abs(val-hrMaxVal);
    if(dMin<=dMax)applyValues(clamp(val,0,hrMaxVal),hrMaxVal);
    else applyValues(hrMinVal,clamp(val,hrMinVal,100));
  });

  function makeDraggable(thumb,isMin){
    let dragging=false;
    function getVal(clientX){
      const rect=wrap.getBoundingClientRect();
      const trackW=rect.width-SLIDER_PAD*2;
      return Math.round(clamp((clientX-rect.left-SLIDER_PAD)/trackW,0,1)*100);
    }
    thumb.addEventListener('mousedown',e=>{dragging=true;thumb.classList.add('dragging');e.preventDefault();e.stopPropagation()});
    document.addEventListener('mousemove',e=>{
      if(!dragging)return;
      const val=getVal(e.clientX);
      isMin?applyValues(clamp(val,0,hrMaxVal),hrMaxVal):applyValues(hrMinVal,clamp(val,hrMinVal,100));
    });
    document.addEventListener('mouseup',()=>{dragging=false;thumb.classList.remove('dragging')});
    thumb.addEventListener('touchstart',e=>{dragging=true;thumb.classList.add('dragging');e.preventDefault();e.stopPropagation()},{passive:false});
    document.addEventListener('touchmove',e=>{
      if(!dragging)return;
      const val=getVal(e.touches[0].clientX);
      isMin?applyValues(clamp(val,0,hrMaxVal),hrMaxVal):applyValues(hrMinVal,clamp(val,hrMinVal,100));
    },{passive:true});
    document.addEventListener('touchend',()=>{dragging=false;thumb.classList.remove('dragging')});
  }
  if(thumbMin)makeDraggable(thumbMin,true);
  if(thumbMax)makeDraggable(thumbMax,false);
  updateSliderUI();
})();

// ══════════════════════════════════════════
//  GENRE & TAG FILTER POPOVERS
// ══════════════════════════════════════════
function makeFilterPopover({btnId,popId,badgeId,clearId,listId,logicToggleId,getSelected,setSelected,getLogic,setLogic,getOptions,renderFn,showTip=true}){
  const btn=document.getElementById(btnId);
  const pop=document.getElementById(popId);
  const badge=document.getElementById(badgeId);
  const clearBtn=document.getElementById(clearId);
  const list=document.getElementById(listId);
  const logicWrap=logicToggleId?document.getElementById(logicToggleId):null;
  const doRender=renderFn||renderAll;
  function updateBtn(){
    const sel=getSelected();const active=sel.size>0;
    btn.classList.toggle('active',active);
    badge.textContent=sel.size;badge.style.display=active?'':'none';
  }
  function renderList(){
    const opts=getOptions();const sel=getSelected();
    if(!opts.length){list.innerHTML=`<div class="fpop-empty">No options available</div>`;return}
    list.innerHTML=opts.map(({value,count,color})=>`
      <label class="fpop-opt">
        <input type="checkbox" value="${esc(value)}"${sel.has(value)?' checked':''}>
        <span class="fpop-opt-label">${color?`<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};flex-shrink:0;margin-right:.3rem"></span>`:''}${esc(value)}${showTip?metaTipHTML(value):''}</span>
        ${count!=null?`<span class="fpop-opt-count">${count}</span>`:''}
      </label>`).join('');
    list.querySelectorAll('input[type=checkbox]').forEach(cb=>{
      cb.onchange=()=>{const s=getSelected();cb.checked?s.add(cb.value):s.delete(cb.value);setSelected(s);updateBtn();doRender()};
    });
    if(logicWrap&&getLogic){
      const cur=getLogic();
      logicWrap.querySelectorAll('.fpop-logic-btn').forEach(x=>x.classList.toggle('on',x.dataset.l===cur));
    }
  }
  if(logicWrap){
    logicWrap.addEventListener('click',e=>{
      const b=e.target.closest('.fpop-logic-btn');if(!b||!setLogic)return;
      setLogic(b.dataset.l);
      logicWrap.querySelectorAll('.fpop-logic-btn').forEach(x=>x.classList.toggle('on',x.dataset.l===b.dataset.l));
      if(getSelected().size>0)doRender();
    });
  }
  clearBtn.onclick=()=>{setSelected(new Set());updateBtn();renderList();doRender()};
  const searchInp=pop.querySelector('.fpop-search');
  if(searchInp){
    searchInp.addEventListener('input',()=>{
      const q=searchInp.value.toLowerCase();
      list.querySelectorAll('label.fpop-opt,.ps-filter-opt').forEach(opt=>{
        const lbl=opt.querySelector('.fpop-opt-label');
        opt.style.display=(!q||!lbl||(lbl.textContent||'').toLowerCase().includes(q))?'':'none';
      });
    });
  }
  btn.addEventListener('click',e=>{
    e.stopPropagation();
    document.querySelectorAll('.fpop.open').forEach(p=>{if(p!==pop)p.classList.remove('open')});
    const opening=!pop.classList.contains('open');
    pop.classList.toggle('open',opening);
    if(opening){
      positionFpop(btn,pop);renderList();
      if(searchInp){searchInp.value='';list.querySelectorAll('label.fpop-opt,.ps-filter-opt').forEach(o=>o.style.display='');}
    }
  });
  document.addEventListener('click',e=>{if(!pop.contains(e.target)&&e.target!==btn)pop.classList.remove('open')});
}
makeFilterPopover({
  btnId:'genreFilterBtn',popId:'genreFilterPop',badgeId:'genreFilterBadge',
  clearId:'genreFilterClear',listId:'genreFilterList',logicToggleId:'genreLogicToggle',
  getSelected:()=>fGenres,setSelected:s=>{fGenres=s},
  getLogic:()=>fGenreLogic,setLogic:l=>{fGenreLogic=l},
  getOptions:()=>{
    const freq={};
    games.filter(g=>g.status!=='bought').forEach(g=>{(g.genres||[]).forEach(x=>{if(x)freq[x]=(freq[x]||0)+1})});
    return Object.keys(freq).sort().map(v=>({value:v,count:freq[v]}));
  },
});
makeFilterPopover({
  btnId:'tagFilterBtn',popId:'tagFilterPop',badgeId:'tagFilterBadge',
  clearId:'tagFilterClear',listId:'tagFilterList',logicToggleId:'tagLogicToggle',
  getSelected:()=>fTags,setSelected:s=>{fTags=s},
  getLogic:()=>fTagLogic,setLogic:l=>{fTagLogic=l},
  getOptions:()=>{
    const freq={};
    games.filter(g=>g.status!=='bought').forEach(g=>(g.tags||[]).forEach(x=>{if(x)freq[x]=(freq[x]||0)+1}));
    return Object.keys(freq).sort((a,b)=>freq[b]-freq[a]||a.localeCompare(b)).map(v=>({value:v,count:freq[v]}));
  },
});

// ── PRIORITY FILTER POPOVER ──
(function(){
  const btn=document.getElementById('prioFilterBtn');
  const pop=document.getElementById('prioFilterPop');
  const badge=document.getElementById('prioFilterBadge');
  const clearBtn=document.getElementById('prioFilterClear');
  const list=document.getElementById('prioFilterList');
  const PRIOS=[{value:'high',label:'High'},{value:'medium',label:'Medium'},{value:'low',label:'Low'}];
  function updateBtn(){
    const active=fPrios.size>0;
    btn.classList.toggle('active',active);
    badge.textContent=fPrios.size;badge.style.display=active?'':'none';
  }
  function renderList(){
    const freq={high:0,medium:0,low:0};
    games.filter(g=>g.status!=='bought').forEach(g=>{const p=g.priority||'medium';freq[p]=(freq[p]||0)+1;});
    list.innerHTML=PRIOS.map(({value,label})=>`
      <label class="fpop-opt">
        <input type="checkbox" value="${value}"${fPrios.has(value)?' checked':''}>
        <span class="fpop-opt-label" style="display:flex;align-items:center;gap:.35rem">
          <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${prioColor(value)};flex-shrink:0"></span>
          ${label}
        </span>
        <span class="fpop-opt-count">${freq[value]||0}</span>
      </label>`).join('');
    list.querySelectorAll('input[type=checkbox]').forEach(cb=>{
      cb.onchange=()=>{cb.checked?fPrios.add(cb.value):fPrios.delete(cb.value);updateBtn();renderAll()};
    });
  }
  clearBtn.onclick=()=>{fPrios.clear();updateBtn();renderList();renderAll()};
  btn.addEventListener('click',e=>{
    e.stopPropagation();
    document.querySelectorAll('.fpop.open').forEach(p=>{if(p!==pop)p.classList.remove('open')});
    const opening=!pop.classList.contains('open');
    pop.classList.toggle('open',opening);
    if(opening){positionFpop(btn,pop);renderList();}
  });
  document.addEventListener('click',e=>{if(!pop.contains(e.target)&&e.target!==btn)pop.classList.remove('open')});
})();


// ── SHORTCUTS POPOVER ──
(function(){
  const btn=document.getElementById('kbHelpBtn');
  const pop=document.getElementById('kbPop');
  if(!btn||!pop)return;
  // Position popover relative to button
  btn.addEventListener('mouseenter',()=>{
    const rect=btn.getBoundingClientRect();
    pop.style.top=(rect.bottom+6)+'px';
    pop.style.right=(window.innerWidth-rect.right)+'px';
    pop.style.position='fixed';
    pop.classList.add('open');
  });
  btn.addEventListener('mouseleave',e=>{if(!pop.matches(':hover'))pop.classList.remove('open')});
  pop.addEventListener('mouseleave',()=>pop.classList.remove('open'));
  document.addEventListener('click',e=>{if(!pop.contains(e.target)&&e.target!==btn)pop.classList.remove('open')});
})();


// ══════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ══════════════════════════════════════════
document.addEventListener('keydown',function(e){
  const tag=(e.target.tagName||'').toLowerCase();
  const inField=tag==='input'||tag==='textarea'||tag==='select'||e.target.isContentEditable;
  if(e.key==='Escape'){
    const openPop=document.querySelector('.fpop.open');
    if(openPop){openPop.classList.remove('open');return}
    if(document.getElementById('mov').classList.contains('on')){closeModal();return}
    if(document.getElementById('rmov').classList.contains('on')){document.getElementById('rmov').classList.remove('on');return}
    if(document.getElementById('riov').classList.contains('on')){document.getElementById('riov').classList.remove('on');return}
    if(document.getElementById('calOv').style.display!=='none'){closeCalendar();return}
    if(document.getElementById('panel').classList.contains('on')){closePanel();return}
    return;
  }
  if(inField)return;
  if(e.key==='/'){e.preventDefault();const si=document.getElementById('searchInput');if(si){si.focus();si.select()}return}
  if(e.key==='a'||e.key==='A'||e.key==='n'||e.key==='N'){openAdd();return}
  if(e.key==='c'||e.key==='C'){openCalendar();return}
  if(e.key==='g'||e.key==='G'){vm='grid';renderAll();return}
  if(e.key==='l'||e.key==='L'){vm='list';renderAll();return}
});

// ══════════════════════════════════════════
//  RELEASE DATE CHECKER
// ══════════════════════════════════════════
(function(){
  const ov=document.getElementById('rdcov');
  const summary=document.getElementById('rdcSummary');
  const log=document.getElementById('rdcLog');
  const closeBtn=document.getElementById('rdcClose');
  closeBtn.onclick=()=>ov.classList.remove('on');
  ov.addEventListener('click',e=>{if(e.target===ov)ov.classList.remove('on')});

  function rdcLog(msg,cls){
    const d=document.createElement('div');
    d.className=cls||'';
    d.textContent=msg;
    log.appendChild(d);
    log.scrollTop=log.scrollHeight;
  }

  // Parse a Steam release_date object into {releaseDate, tbaText}
  function parseSteamDate(relObj){
    if(!relObj)return{releaseDate:'',tbaText:''};
    const coming=!!relObj.coming_soon;
    const raw=(relObj.date||'').trim();
    if(!raw)return{releaseDate:'',tbaText:''};
    if(!coming){
      const iso=parseSteamDateStr(raw);
      if(iso)return{releaseDate:iso,tbaText:''};
    }
    return{releaseDate:'',tbaText:raw};
  }

  async function run(){
    if(OFFLINE){showToast('Offline — cannot reach Steam.');return}
    const targets=games.filter(g=>g.steamAppId&&isGameUnreleased(g)&&!isCancelled(g));
    if(!targets.length){showToast('No unreleased Steam games found.');return}

    ov.classList.add('on');
    log.innerHTML='';
    summary.textContent=`Checking ${targets.length} game${targets.length>1?'s':''}…`;

    let updated=0,unchanged=0,failed=0;

    for(let i=0;i<targets.length;i++){
      const g=targets[i];
      summary.textContent=`${i+1}/${targets.length} — ${g.title}`;

      try{
        const res=await fetch(`${STEAM_WORKER}/?appid=${g.steamAppId}`);
        if(!res.ok)throw new Error(`HTTP ${res.status}`);
        const json=await res.json();
        const entry=json[g.steamAppId];
        if(!entry||!entry.success||!entry.data){
          rdcLog(`✗ ${g.title} — no Steam data`,'rdc-err');
          failed++;continue;
        }

        const{releaseDate:newRd,tbaText:newTba}=parseSteamDate(entry.data.release_date);
        const oldRd=g.releaseDate||'';
        const oldTba=g.tbaText||'';

        if(newRd!==oldRd||newTba!==oldTba){
          const gg=games.find(x=>x.id===g.id);
          if(gg){
            gg.releaseDate=newRd;
            gg.tbaText=newTba;
            save(gg.id);
          }
          const before=oldRd||oldTba||'(empty)';
          const after=newRd||newTba||'(empty)';
          rdcLog(`✔ ${g.title}  ${before} → ${after}`,'rdc-ok');
          updated++;
        }else{
          rdcLog(`— ${g.title}  ${oldRd||oldTba||'(empty)'}`,'rdc-skip');
          unchanged++;
        }
      }catch(err){
        rdcLog(`✗ ${g.title} — ${err.message}`,'rdc-err');
        failed++;
      }

      if(i<targets.length-1)await new Promise(r=>setTimeout(r,400));
    }

    summary.textContent=`Done — ${updated} updated, ${unchanged} unchanged${failed?`, ${failed} failed`:''}`;
    if(updated)dispatchRender();
  }

  window.runReleaseDateCheck=run;
  document.getElementById('hmRdcBtn').onclick=()=>{
    document.getElementById('hmenu').classList.remove('open');
    run();
  };
})();

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
restoreFromHash();
initData();
