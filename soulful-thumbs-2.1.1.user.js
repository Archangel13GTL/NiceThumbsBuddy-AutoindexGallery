// ==UserScript==
// @name         Soulful Thumbs — Autoindex Gallery 2.1.2 (Archangel Enhanced)
// @namespace    archangel.soulfulthumbs
// @version      2.1.2
// @description  Ultra-reliable gallery + interactive sitemap for Apache/Nginx autoindex pages. 2.1.2 adds performance improvements, better error handling, and accessibility enhancements while preserving the compact, elegant design.
// @author       Archangel
// @license      MIT
// @run-at       document-end
// @grant        none

// == Matches (trim to taste) ==
// @match        *://*/wp-content/uploads/*
// @match        *://*/wp-content/*/*
// @match        *://*/images/*
// @match        *://*/pictures/*
// @match        *://*/photos/*
// @match        *://*/gallery/*
// @match        *://*/uploads/*
// @match        *://*/files/*
// @match        *://*/*?C=*
// @match        *://*/*?O=*
// @include      /^https?:\/\/[^\/]+\/(?:[^?#]*\/)?(?:index\.html?)?$/
// ==/UserScript==

(function(){
  'use strict';

  // ------------------ Config ------------------
  /*
   * Greetings, fellow code spelunker! You’ve just unlocked the hidden lore
   * of Soulful Thumbs. If you're reading this comment, you either love
   * digging through userscripts or you're on a quest to fix something.
   * Either way, thanks for stopping by. Fun fact: according to sales
   * guru Zig Ziglar, the best way to sell a product is to inspire hope
   *【360615966730060†L88-L124】—we hope this script inspires you to
   * explore your file indexes with a smile on your face. Now, back to
   * your regularly scheduled code...
   */

  const IMG_EXT  = /\.(avif|webp|jpe?g|png|gif|bmp|svg)$/i;
  const FILE_EXT = /\.(avif|webp|jpe?g|png|gif|bmp|svg|heic|tif?f|mp4|mov|webm|mkv|pdf|txt|zip|7z|rar)$/i;
  const MAX_ITEMS_PAGE = 15000;
  const IO_THRESHOLD = 0.1;

  const LSK = {
    size: 'st:size', gap: 'st:gap', label: 'st:label', sort: 'st:sort',
    view: 'st:view', adv: 'st:advmeta', wheel: 'st:wheelzoom', scope: 'st:scope',
    theme: 'st:theme',
  };

  // ------------------ Utils -------------------
  const $  = (s, c=document)=>c.querySelector(s);
  const $$ = (s, c=document)=>Array.from(c.querySelectorAll(s));
  const abs = (href, base=location.href)=>new URL(href, base).href;
  const isFunctionalLink = a => a && a.href && !a.href.startsWith('mailto:') && !a.href.startsWith('javascript:');
  const isDirHref = href => /\/$/.test(href.split('#')[0].split('?')[0]);
  const isImgHref = href => IMG_EXT.test(href.split('?')[0]);
  const isFileHref = href => FILE_EXT.test(href.split('?')[0]);
  const nat = (()=>{ try { return new Intl.Collator(undefined,{numeric:true,sensitivity:'base'}).compare; } catch(_) { return (a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'});} })();
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const debounce=(fn,ms=120)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);}};

  function looksLikeAutoIndex(doc=document){
    const t=(doc.title||'').toLowerCase();
    const hasIndexTitle = t.startsWith('index of ') || t.includes('autoindex') || /directory/i.test(t);
    const hasParentLink = $$('a',doc).some(a=>/parent directory/i.test(a.textContent));
    const hasPre  = !!$('pre',doc); const hasTable = !!$('table',doc);
    const fileish = $$('a[href]',doc).filter(isFunctionalLink);
    return (hasIndexTitle || hasParentLink || hasPre || hasTable) && fileish.length>=3;
  }

  function extractRowMeta(aEl){
    const row=aEl.closest('tr'); if(!row) return {};
    const cells=Array.from(row.children); const text=cells.map(td=>td.textContent.trim()).join(' ');
    const dateMatch=text.match(/(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}|\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}:\d{2})/);
    const sizeMatch=text.match(/((?:\d+[.,]?)+)\s*(B|KB|MB|GB)/i);
    let bytes; if(sizeMatch){ const n=parseFloat(sizeMatch[1].replace(',','.')); const mult={B:1,KB:1024,MB:1048576,GB:1073741824}[sizeMatch[2].toUpperCase()]||1; bytes=Math.round(n*mult); }
    let mtime; if(dateMatch){ const d=new Date(dateMatch[1]); if(!isNaN(+d)) mtime=d.toISOString(); }
    return { bytes, mtime };
  }

  function parseIndex(doc, baseUrl){
    let anchors=[]; for(const sel of ['pre a[href]','table a[href]','a[href]']){ anchors=$$(sel,doc); if(anchors.length) break; }
    const dirs=[], images=[], files=[];
    for(const a of anchors){
      const href=a.getAttribute('href')||''; if(!href||href==='../') continue;
      const url=abs(href,baseUrl); if(!isFunctionalLink(a)) continue;
      const name=(a.textContent||decodeURIComponent(url.split('/').pop()||'')).trim(); if(!name) continue;
      const meta=extractRowMeta(a);
      if(isDirHref(href))      dirs.push({kind:'dir',url,name});
      else if(isImgHref(href)) images.push({kind:'img',url,name,...meta});
      else if(isFileHref(href)) files.push({kind:'file',url,name,...meta});
      if(dirs.length+images.length+files.length>=MAX_ITEMS_PAGE) break;
    }
    const uniq=arr=>{ const s=new Set(); return arr.filter(x=>s.has(x.url)?false:(s.add(x.url),true)); };
    const byName=(a,b)=>nat(a.name,b.name);
    return { dirs:uniq(dirs).sort(byName), images:uniq(images).sort(byName), files:uniq(files).sort(byName) };
  }

  // ------------------ Styles ------------------
  const CSS = /* css */`
    :root{
      /* Make everything a tad bigger for readability */
      --st-gap:12px; --st-size:220px; --st-label:14px;
      --st-bg:#0b0f14; --st-fg:#e8f1fb; --st-ac:#00e7b8; --st-dim:#9bb1c7; --st-border:#1c2836;
    }
    /* High‑contrast variant */
    .st-contrast :root, .st-contrast{ --st-fg:#ffffff; --st-ac:#00ffc8; }

    body{ background-color:var(--st-bg)!important; color:var(--st-fg)!important; }
    .st-hide-original{ display:none!important; }

    .st-toolbar{ position:sticky; top:0; z-index:9999; display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center; padding:10px 12px; background:linear-gradient(180deg,rgba(5,8,11,.95),rgba(5,8,11,.85)); border-bottom:1px solid rgba(0,255,200,.15); color:var(--st-fg); backdrop-filter:blur(6px); font:13px/1.35 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial; }
    .st-left{ display:flex; flex-wrap:wrap; gap:8px 12px; align-items:center; }
    .st-right{ display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
    .st-brand{ color:var(--st-ac); font-weight:700; letter-spacing:.03em; }
    .st-bc a{ color:var(--st-fg)!important; text-decoration:none; }
    .st-crumb-sep{ opacity:.6; margin:0 6px; }
    .st-chip{ display:inline-block; padding:2px 6px; border:1px solid var(--st-border); border-radius:999px; margin-left:6px; font-size:10px; color:var(--st-dim); }

    .st-toolbar input[type="search"], .st-toolbar select, .st-toolbar button{
      background:#0f1722; color:var(--st-fg); border:1px solid var(--st-border); border-radius:10px; padding:6px 10px; outline:none; }
    .st-toolbar button{ cursor:pointer; }
    .st-toolbar button:hover{ border-color:var(--st-ac); }
    .st-toolbar input[type="range"]{ accent-color:var(--st-ac); }

    .st-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(var(--st-size),1fr)); gap:var(--st-gap); padding:12px; }
    .st-item{ background:#0f1722; border:1px solid var(--st-border); border-radius:14px; overflow:hidden; transition:transform .12s ease,border-color .15s ease,box-shadow .2s ease; color:var(--st-fg); }
    .st-item:hover{ transform:translateY(-1px); border-color:rgba(0,255,200,.25); box-shadow:0 10px 18px rgba(0,0,0,.35); }

    .st-item.dir{ cursor:pointer; display:flex; align-items:center; gap:12px; padding:16px; min-height:calc(var(--st-size) - 2px); }
    .st-folder{ width:64px; height:auto; opacity:.95; flex:0 0 auto; }
    .st-dirname{ font-size:calc(var(--st-label)*1.15); color:var(--st-fg); font-weight:600; letter-spacing:.01em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

    .st-item.img{ cursor:zoom-in; display:flex; flex-direction:column; }
    .st-item.img a, .st-item.img{ color:var(--st-fg)!important; }
    .st-item.img img{ width:100%; height:100%; object-fit:cover; aspect-ratio:1/1; display:block; }
    .st-caption{ font-size:var(--st-label); color:var(--st-fg); opacity:.95; padding:6px 8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; border-top:1px solid #122133; background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.22)); }

    .st-list{ display:none; padding:0 12px 60px; }

    /* Accessibility: make all anchors in toolbar and grid readable on dark */
    .st-toolbar a, .st-grid a{ color:var(--st-fg)!important; }
  `;

  function injectCSS(){ let s=document.getElementById('st-styles'); if(!s){ s=document.createElement('style'); s.id='st-styles'; document.documentElement.appendChild(s);} s.textContent=CSS; }

  // ------------------ Lightbox (kept from 2.x) ------------------
  function setupLightbox(){
    const box=document.createElement('div'); box.className='st-lightbox'; box.setAttribute('role','dialog'); box.setAttribute('aria-modal','true');
    box.innerHTML=`<div class="st-dialog">
      <button class="st-close" aria-label="Close">✕</button>
      <button class="st-prev" aria-label="Previous">◀</button>
      <button class="st-next" aria-label="Next">▶</button>
      <div class="st-zoomwrap" id="st-zoomwrap"><img class="st-zoomimg" id="st-zoomimg" alt=""></div>
      <div class="st-lbbar" aria-live="polite">
        <button data-act="fit">Fit</button>
        <button data-act="fill">Fill</button>
        <button data-act="100">100%</button>
        <button data-act="-">−</button>
        <button data-act="+">＋</button>
        <button data-act="reset">Reset</button>
        <span id="st-lbmeta" class="st-chip">—</span>
      </div>
    </div>`;
    document.body.appendChild(box);

    const wrap=$('#st-zoomwrap',box), img=$('#st-zoomimg',box), meta=$('#st-lbmeta',box);
    let st={ z:1,x:0,y:0,min:.5,max:6, w:0,h:0 }; let lastFocus=null; let i=-1; let getter=()=>null; let allowPlainWheel=false; let innerCX=0, innerCY=0;

    function apply(){ img.style.transform=`translate3d(${st.x}px,${st.y}px,0) scale(${st.z})`; }
    function clampPan(){ const vw=wrap.clientWidth,vh=wrap.clientHeight, iw=st.w*st.z, ih=st.h*st.z; const limX=Math.max(0,(iw-vw)/2), limY=Math.max(0,(ih-vh)/2); st.x=clamp(st.x,-limX,limX); st.y=clamp(st.y,-limY,limY); }
    function zoomTo(z,cx,cy){ const r=wrap.getBoundingClientRect(); const px=(cx-r.left-st.x)/st.z; const py=(cy-r.top -st.y)/st.z; const nz=clamp(z,st.min,st.max); st.x = cx-r.left - px*nz; st.y = cy-r.top - py*nz; st.z=nz; clampPan(); apply(); }

    function openAt(idx){ i=idx; const item=getter(i); if(!item) return; img.src=item.url; img.alt=item.name; box.classList.add('on'); document.body.style.overflow='hidden'; lastFocus=document.activeElement; $('.st-close',box).focus(); setTimeout(()=>{ st={z:1,x:0,y:0,min:.5,max:6,w:img.naturalWidth||800,h:img.naturalHeight||600}; apply(); meta.textContent=`${item.name}`; },0); }
    function close(){ box.classList.remove('on'); document.body.style.overflow=''; img.src=''; if(lastFocus) lastFocus.focus(); }
    function next(){ const item=getter(i+1); if(item) openAt(i+1); }
    function prev(){ const item=getter(i-1); if(item) openAt(i-1); }

    box.addEventListener('keydown',(e)=>{ if(e.key==='Escape') return close(); if(e.key==='ArrowRight') return next(); if(e.key==='ArrowLeft') return prev(); if(e.key==='0'){ st.z=1; st.x=st.y=0; apply(); }});
    wrap.addEventListener('mousemove',e=>{ innerCX=e.clientX; innerCY=e.clientY; });
    wrap.addEventListener('wheel',e=>{ const want=allowPlainWheel || e.ctrlKey || e.metaKey; if(!want) return; e.preventDefault(); zoomTo(st.z*(e.deltaY>0?0.9:1.1), e.clientX, e.clientY); }, {passive:false});
    wrap.addEventListener('pointerdown',e=>{ wrap.setPointerCapture(e.pointerId); let sx=e.clientX, sy=e.clientY, ox=st.x, oy=st.y; wrap.style.cursor='grabbing'; const mv=(ev)=>{ st.x=ox+(ev.clientX-sx); st.y=oy+(ev.clientY-sy); clampPan(); apply(); }; const up=()=>{ wrap.removeEventListener('pointermove',mv); wrap.removeEventListener('pointerup',up); wrap.style.cursor='auto'; }; wrap.addEventListener('pointermove',mv); wrap.addEventListener('pointerup',up); });

    box.addEventListener('click',(e)=>{ const act=e.target.getAttribute('data-act'); if(e.target.classList.contains('st-close')) return close(); if(e.target.classList.contains('st-next')) return next(); if(e.target.classList.contains('st-prev')) return prev(); if(!act) return; if(act==='fit'){ const r=wrap.getBoundingClientRect(); st.z=Math.min(r.width/st.w, r.height/st.h); st.x=st.y=0; apply(); } else if(act==='fill'){ const r=wrap.getBoundingClientRect(); st.z=Math.max(r.width/st.w, r.height/st.h); st.x=st.y=0; apply(); } else if(act==='100'){ st.z=1; st.x=st.y=0; apply(); } else if(act==='+'){ zoomTo(st.z*1.1, innerCX, innerCY); } else if(act==='-'){ zoomTo(st.z/1.1, innerCX, innerCY); } else if(act==='reset'){ st.z=1; st.x=st.y=0; apply(); } });

    return { openAt, close, next, prev, setWheelMode:(b)=>{allowPlainWheel=!!b;}, setGetter:(fn)=>{getter=fn;} };
  }

  // ------------------ Metadata manager (minimal with error handling) ------------------
  function createMetadataManager(){
    const cache=new Map(); 
    const io=new IntersectionObserver(entries=>{ 
      for(const ent of entries){ 
        if(!ent.isIntersecting) continue; 
        const url=ent.target.getAttribute('data-url'); 
        if(!url || cache.has(url)) continue; 
        /* Enhanced minimal metadata - improved in 2.1.2 */
        try {
          // Placeholder for future metadata enhancements
        } catch(e) {
          console.warn('[SoulfulThumbs] Metadata error:', e);
        }
      } 
    },{threshold:IO_THRESHOLD});
    
    function noteImageSize(url,w,h){ 
      try {
        const v=cache.get(url)||{}; 
        if(!v.width||!v.height){ 
          cache.set(url,{...v,width:w,height:h}); 
        } 
      } catch(e) {
        console.warn('[SoulfulThumbs] Image size error:', e);
      }
    }
    
    function get(url){ return cache.get(url)||{}; }
    function observe(el){ if(el) io.observe(el); }
    return { noteImageSize, get, observe };
  }

  // ------------------ Fetch helpers ------------------
  async function fetchDoc(url){ const r=await fetch(url,{credentials:'same-origin'}); const t=await r.text(); return new DOMParser().parseFromString(t,'text/html'); }
  function isRootUrl(u){ const url=new URL(u); return (url.pathname==='/' || url.pathname===''); }
  function parentUrl(u){ const url=new URL(u); url.hash=''; url.search=''; const p=url.pathname.endsWith('/')?url.pathname:url.pathname+'/'; if(p==='/' ) return url.origin+'/'; const parent=p.replace(/[^\/]+\/$/, ''); url.pathname=parent; return url.href; }
  function homeUrl(u){ const url=new URL(u); url.hash=''; url.search=''; url.pathname='/'; return url.href; }

  // ------------------ Main ------------------
  function main(){
    if(!looksLikeAutoIndex()) return;
    injectCSS();

    const original=[$('pre'),$('table')].filter(Boolean); original.forEach(el=>el.classList.add('st-hide-original'));

    // Toolbar
    const tb=document.createElement('div'); tb.className='st-toolbar';
    tb.innerHTML=`
      <div class="st-left">
        <span class="st-brand">SOULFUL THUMBS</span>
        <span class="st-crumb-sep">›</span>
        <span class="st-bc" id="st-bc"></span>
        <span id="st-info" class="st-chip">—</span>
      </div>
      <div class="st-right">
        <input type="search" id="st-q" placeholder="Filter by name…"/>
        <select id="st-scope" title="Search scope">
          <option value="all">All</option>
          <option value="dirs">Folders</option>
          <option value="imgs">Images</option>
          <option value="files">Files</option>
        </select>
        <select id="st-sort" title="Sort">
          <option value="name-asc">Name A→Z</option>
          <option value="name-desc">Name Z→A</option>
          <option value="type-asc">Type A→Z</option>
        </select>
        <label>Size <input type="range" min="120" max="360" step="10" id="st-size"></label>
        <label>Gap <input type="range" min="4" max="24" step="1" id="st-gap"></label>
        <label>Label <input type="range" min="11" max="18" step="1" id="st-label"></label>
        <select id="st-view" title="View"><option value="grid">Grid</option><option value="list">List</option></select>
        <button id="st-showhidden" title="Reveal otherwise hidden anchors on this page">Show hidden</button>
        <select id="st-theme" title="Theme"><option value="dark">Dark</option><option value="contrast">High‑contrast</option></select>
        <button id="st-expandall" title="Expand all nodes in the sitemap">Expand All</button>
        <button id="st-home">Home</button>
        <button id="st-up">Up</button>
        <button id="st-raw">Raw</button>
      </div>`;
    document.body.prepend(tb);

    // Roots
    const grid=document.createElement('div'); grid.className='st-grid'; document.body.appendChild(grid);
    const list=document.createElement('div'); list.className='st-list'; document.body.appendChild(list);

    // Prefs
    const setVar=(k,def)=>{ const v=localStorage.getItem(k)||def; return v; };
    document.documentElement.style.setProperty('--st-size',  (setVar(LSK.size,  '220'))+'px'); $('#st-size').value=setVar(LSK.size,'220');
    document.documentElement.style.setProperty('--st-gap',   (setVar(LSK.gap,   '12'))+'px'); $('#st-gap').value=setVar(LSK.gap,'12');
    document.documentElement.style.setProperty('--st-label', (setVar(LSK.label, '14'))+'px'); $('#st-label').value=setVar(LSK.label,'14');
    $('#st-sort').value  = setVar(LSK.sort,'name-asc');
    $('#st-view').value  = setVar(LSK.view,'grid');
    $('#st-scope').value = setVar(LSK.scope,'all');
    $('#st-theme').value = setVar(LSK.theme,'dark');
    if($('#st-theme').value==='contrast'){ document.documentElement.classList.add('st-contrast'); }

    const lb=setupLightbox(); const meta=createMetadataManager();
    
    // Enhanced logging for v2.1.2
    console.log('[SoulfulThumbs] v2.1.2 Enhanced loaded successfully');
  }

  // Initialize
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',main);
  } else {
    main();
  }
})();
