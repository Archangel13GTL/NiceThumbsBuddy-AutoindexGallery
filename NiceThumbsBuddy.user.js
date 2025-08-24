// ==UserScript==
// @name         NiceThumbsBuddy — Supercharged Directory Gallery
// @namespace    archangel.nicethumbsbuddy
// @version      3.1.0
// @description  Modern, accessible gallery for Apache/Nginx/local directory listings. Sidebar, preview pane, tree view, keyboard navigation, sorting, media previews, persistent settings, and more.
// @author       Archangel13GTL
// @license      MIT
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
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
// @match        file://*/*
// ==/UserScript==

(function () {
  'use strict';

  // --------------------------- Config & State -----------------------------
  const EXT = {
    img: /\.(avif|webp|jpe?g|png|gif|bmp|svg)$/i,
    video: /\.(mp4|mov|webm|mkv)$/i,
    audio: /\.(mp3|wav|flac|ogg)$/i,
    font: /\.(ttf|otf|woff2?|eot)$/i,
    doc: /\.(pdf|txt|md|markdown)$/i,
    archive: /\.(zip|rar|7z|tar|gz)$/i
  };
  const MAX_ITEMS = 10000;
  const PREF_KEYS = {
    theme: 'ntb:theme',
    view: 'ntb:view',
    sort: 'ntb:sort',
    sidebar: 'ntb:sidebar',
    gridSize: 'ntb:gridSize',
    gap: 'ntb:gap',
    label: 'ntb:label'
  };
  const storage = (typeof GM_getValue === 'function' && typeof GM_setValue === 'function')
    ? { get: GM_getValue, set: GM_setValue }
    : {
      get: (k) => localStorage.getItem(k),
      set: (k, v) => localStorage.setItem(k, v)
    };
  const getPref = (key, def) => {
    const v = storage.get(key);
    return v !== undefined && v !== null ? v : def;
  };
  const setPref = (key, val) => storage.set(key, val);

  // --------------------------- Utilities ----------------------------------
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const abs = (href, base = location.href) => new URL(href, base).href;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const nat = (() => {
    try { return new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare; }
    catch (e) { return (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }); }
  })();
  const fmtBytes = (n) => !Number.isFinite(n) ? '—' : (
    n < 1024 ? `${n} B` :
      n < 1048576 ? `${(n / 1024).toFixed(1)} KB` :
        n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` :
          `${(n / 1073741824).toFixed(2)} GB`
  );
  const debounce = (fn, ms = 150) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };
  function isImg(href) { return EXT.img.test(href); }
  function isVideo(href) { return EXT.video.test(href); }
  function isAudio(href) { return EXT.audio.test(href); }
  function isFont(href) { return EXT.font.test(href); }
  function isDoc(href) { return EXT.doc.test(href); }
  function isArchive(href) { return EXT.archive.test(href); }
  function isDir(href) { return /\/$/.test(href.split('#')[0].split('?')[0]); }
  function isFunctionalLink(a) { return a && a.href && !a.href.startsWith('mailto:') && !a.href.startsWith('javascript:'); }

  // --------------------------- Directory Parsing --------------------------
  function parseIndex(doc, baseUrl) {
    const SELECTORS = ['pre a[href]', 'table a[href]', 'a[href]'];
    let anchors = [];
    for (const sel of SELECTORS) {
      anchors = $$(sel, doc);
      if (anchors.length) break;
    }
    const dirs = [], files = [];
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      if (!href || href === '../' || href === './' || href === '/') continue;
      const url = abs(href, baseUrl);
      if (!isFunctionalLink(a)) continue;
      let name = (a.textContent || decodeURIComponent(url.split('/').pop() || '')).trim();
      if (name.endsWith('/')) name = name.slice(0, -1);
      if (!name) continue;
      if (isDir(href)) {
        dirs.push({ kind: 'dir', url, name });
      } else {
        files.push({ kind: 'file', url, name });
      }
      if (dirs.length + files.length >= MAX_ITEMS) break;
    }
    return { dirs, files };
  }

  // --------------------------- UI & Accessibility -------------------------
  function injectCSS() {
    const css = `
      :root {
        --ntb-gap: ${getPref(PREF_KEYS.gap, 14)}px;
        --ntb-size: ${getPref(PREF_KEYS.gridSize, 220)}px;
        --ntb-label: ${getPref(PREF_KEYS.label, 14)}px;
        --ntb-bg: #0b0f14;
        --ntb-fg: #e6eef9;
        --ntb-ac: #00ffc8;
        --ntb-dim: #9bb1c7;
        --ntb-card-bg: #0f1722;
        --ntb-border: #1c2836;
        --ntb-toolbar-bg: linear-gradient(180deg, rgba(5,8,11,0.95), rgba(5,8,11,0.85));
      }
      body { background-color: var(--ntb-bg) !important; color: var(--ntb-fg) !important; }
      .ntb-hide-original { display: none !important; }
      .ntb-toolbar { position: sticky; top: 0; z-index: 9999; display: flex; gap: 10px; align-items: center; padding: 12px 16px; background: var(--ntb-toolbar-bg); border-bottom: 1px solid var(--ntb-border); color: var(--ntb-fg); font: 14px/1.4 system-ui, sans-serif; }
      .ntb-sidebar { position: fixed; left: 0; top: 0; bottom: 0; width: 260px; background: var(--ntb-card-bg); border-right: 1px solid var(--ntb-border); z-index: 9998; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; }
      .ntb-content { margin-left: 260px; padding: 16px; }
      .ntb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--ntb-size), 1fr)); gap: var(--ntb-gap); }
      .ntb-item { background: var(--ntb-card-bg); border: 1px solid var(--ntb-border); border-radius: 12px; overflow: hidden; transition: transform 0.15s, border-color 0.15s, box-shadow 0.2s; }
      .ntb-item:focus { outline: 2px solid var(--ntb-ac); }
      .ntb-item:hover { transform: translateY(-2px); border-color: var(--ntb-ac); box-shadow: 0 10px 22px rgba(0,0,0,0.35); }
      .ntb-caption { font-size: var(--ntb-label); color: var(--ntb-fg); padding: 10px 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-top: 1px solid var(--ntb-border); }
      .ntb-preview-pane { background: var(--ntb-card-bg); border: 1px solid var(--ntb-border); border-radius: 12px; padding: 16px; margin-bottom: 16px; min-height: 180px; }
      .ntb-tree { font-size: 13px; }
      .ntb-tree details { margin-left: 16px; }
      .ntb-tree summary { cursor: pointer; }
      .ntb-toolbar input, .ntb-toolbar select, .ntb-toolbar button { background: var(--ntb-card-bg); color: var(--ntb-fg); border: 1px solid var(--ntb-border); border-radius: 8px; padding: 8px 12px; font-size: 13px; outline: none; }
      .ntb-toolbar button { cursor: pointer; }
      .ntb-toolbar button:focus, .ntb-toolbar input:focus, .ntb-toolbar select:focus { border-color: var(--ntb-ac); box-shadow: 0 0 0 2px rgba(0,255,200,0.15); }
      @media (max-width: 900px) { .ntb-sidebar { width: 100vw; position: static; } .ntb-content { margin-left: 0; } }
    `;
    if (typeof GM_addStyle === 'function') GM_addStyle(css);
    else { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }
  }

  // --------------------------- Main UI ------------------------------------
  function renderToolbar() {
    const tb = document.createElement('div');
    tb.className = 'ntb-toolbar';
    tb.innerHTML = `
      <b>NiceThumbsBuddy</b>
      <label>Theme <select id="ntb-theme"><option value="dark">Dark</option><option value="light">Light</option></select></label>
      <label>View <select id="ntb-view"><option value="grid">Grid</option><option value="list">List</option></select></label>
      <label>Sort <select id="ntb-sort"><option value="name">Name</option><option value="date">Date</option></select></label>
      <label>Size <input type="range" min="120" max="320" value="${getPref(PREF_KEYS.gridSize, 220)}" step="10" id="ntb-size"></label>
      <label>Gap <input type="range" min="4" max="22" value="${getPref(PREF_KEYS.gap, 14)}" step="1" id="ntb-gap"></label>
      <input type="search" id="ntb-q" placeholder="Filter by name…">
      <button id="ntb-toggle-sidebar">Sidebar</button>
    `;
    document.body.prepend(tb);
    // Event wiring
    $('#ntb-theme').value = getPref(PREF_KEYS.theme, 'dark');
    $('#ntb-theme').addEventListener('change', e => { setPref(PREF_KEYS.theme, e.target.value); location.reload(); });
    $('#ntb-view').value = getPref(PREF_KEYS.view, 'grid');
    $('#ntb-view').addEventListener('change', e => { setPref(PREF_KEYS.view, e.target.value); location.reload(); });
    $('#ntb-sort').value = getPref(PREF_KEYS.sort, 'name');
    $('#ntb-sort').addEventListener('change', e => { setPref(PREF_KEYS.sort, e.target.value); location.reload(); });
    $('#ntb-size').addEventListener('input', e => { setPref(PREF_KEYS.gridSize, e.target.value); document.documentElement.style.setProperty('--ntb-size', e.target.value + 'px'); });
    $('#ntb-gap').addEventListener('input', e => { setPref(PREF_KEYS.gap, e.target.value); document.documentElement.style.setProperty('--ntb-gap', e.target.value + 'px'); });
    $('#ntb-toggle-sidebar').addEventListener('click', () => {
      const sb = $('.ntb-sidebar');
      if (sb) sb.style.display = sb.style.display === 'none' ? '' : 'none';
    });
    $('#ntb-q').addEventListener('input', debounce(e => {
      const q = e.target.value.trim().toLowerCase();
      renderContent(q);
    }, 200));
  }

  function renderSidebar(dirs) {
    const sb = document.createElement('nav');
    sb.className = 'ntb-sidebar';
    sb.setAttribute('aria-label', 'Directory tree');
    sb.innerHTML = `<h2>Folders</h2><div class="ntb-tree">${dirs.map(d => `<details><summary>${d.name}</summary></details>`).join('')}</div>`;
    document.body.appendChild(sb);
  }

  function renderContent(filterQ = '') {
    let { dirs, files } = parseIndex(document, location.href);
    if (filterQ) files = files.filter(f => f.name.toLowerCase().includes(filterQ));
    // Sorting
    const sortKey = getPref(PREF_KEYS.sort, 'name');
    if (sortKey === 'name') files.sort((a, b) => nat(a.name, b.name));
    // TODO: Add date sorting if metadata available
    // Main content
    let content = $('.ntb-content');
    if (!content) {
      content = document.createElement('main');
      content.className = 'ntb-content';
      document.body.appendChild(content);
    }
    content.innerHTML = `<div class="ntb-grid">${files.map(f => `<a href="${f.url}" class="ntb-item" tabindex="0" aria-label="${f.name}"><div class="ntb-caption">${f.name}</div></a>`).join('')}</div>`;
    // Keyboard navigation
    $$('.ntb-item', content).forEach((el, i, arr) => {
      el.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight') arr[(i + 1) % arr.length].focus();
        if (e.key === 'ArrowLeft') arr[(i - 1 + arr.length) % arr.length].focus();
        if (e.key === 'Enter') previewFile(files[i]);
      });
      el.addEventListener('click', e => { e.preventDefault(); previewFile(files[i]); });
    });
  }

  function injectCSS() {
    let s = document.getElementById('ntb-styles');
    if (!s) {
      s = document.createElement('style');
      s.id = 'ntb-styles';
      document.documentElement.appendChild(s);
    }
    s.textContent = CSS;
  }

  // --------------------------- Metadata Manager ---------------------------
  function createMetadataManager() {
    // Use sessionStorage to persist metadata across page navigation
    const storageKey = 'ntb-metadata-cache';
    const storageExpiry = 'ntb-metadata-expiry';

    // Try to load cached data
    let cache = new Map();
    try {
      const now = Date.now();
      const expiry = parseInt(sessionStorage.getItem(storageExpiry) || '0', 10);

      // Only use cache if it's still valid
      if (expiry > now) {
        const cachedData = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
        Object.entries(cachedData).forEach(([url, data]) => {
          cache.set(url, data);
        });
        console.log(`[NiceThumbsBuddy] Loaded metadata for ${cache.size} items from cache`);
      } else {
        // Cache expired, clear it
        sessionStorage.removeItem(storageKey);
        sessionStorage.removeItem(storageExpiry);
      }
    } catch (e) {
      console.warn('[NiceThumbsBuddy] Error loading metadata cache:', e);
    }

    const inFlight = new Map();
    const io = new In