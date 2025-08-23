// ==UserScript==
// @name         NiceThumbsBuddy — Autoindex Gallery
// @namespace    archangel.nicethumbsbuddy
// @version      2.6.0
// @description  Transform bare Apache/Nginx directory listings into a rich gallery with smart folders.
// @author       Archangel13GTL
// @license      MIT
// @run-at       document-end
// @grant        none
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

// Configuration constants
const IMG_EXT = /\.(avif|webp|jpe?g|png|gif|bmp|svg)$/i;
const FILE_EXT = /\.(avif|webp|jpe?g|png|gif|bmp|svg|heic|tif?f|mp4|mov|webm|mkv|pdf|zip|rar|7z|tar|gz)$/i;
const MAX_ITEMS_PAGE = 12000; // per page safety guard
const SCAN_CONCURRENCY = 4;   // sitemap concurrent fetches
const IO_THRESHOLD = 0.1;     // intersection observer threshold
const CACHE_EXPIRY = 7200000; // metadata cache expiry (2 hours)

// Local storage keys
const LSK = {
  size: 'ntb:size',
  gap: 'ntb:gap',
  sort: 'ntb:sort',
  view: 'ntb:view',
  label: 'ntb:label',
  adv: 'ntb:advmeta',
  wheelZoom: 'ntb:wheelzoom',
  theme: 'ntb:theme',
  expandSitemap: 'ntb:expandmap'
};

const SELECTORS = [
  'pre a[href]',          // classic Apache
  'table a[href]',        // fancyindex styles
  'a[href]'               // fallback (filter later)
];

// Utility helpers
const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
const abs = (href, base=location.href) => new URL(href, base).href;
const isFunctionalLink = (a) => a && a.href && !a.href.startsWith('mailto:') && !a.href.startsWith('javascript:');
const isDirHref = (href) => /\/$/.test(href.split('#')[0].split('?')[0]);
const isImgHref = (href) => IMG_EXT.test(href.split('?')[0]);
const isFileHref = (href) => FILE_EXT.test(href.split('?')[0]);

const nat = (() => {
  try {
    return new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;
  } catch (e) {
    return (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  }
})();

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const fmtBytes = (n) => !Number.isFinite(n) ? '—' : (
  n < 1024 ? `${n} B` :
  n < 1048576 ? `${(n / 1024).toFixed(1)} KB` :
  n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` :
  `${(n / 1073741824).toFixed(2)} GB`
);

const shuffle = (array) => {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const debounce = (fn, ms = 150) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

const throttle = (fn, ms = 100) => {
  let lastCall = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastCall < ms) return;
    lastCall = now;
    return fn(...args);
  };
};

const getExt = (url) => {
  const filename = url.split('/').pop() || '';
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
};

const formatDate = (date) => {
  if (!date) return '—';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 1) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours < 1) {
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        return diffMinutes < 1 ? 'Just now' : `${diffMinutes}m ago`;
      }
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    }
    return d.toLocaleDateString();
  } catch (e) {
    return '—';
  }
};

const getFolderType = (name) => {
  name = name.toLowerCase();
  if (/video|movie|film|tv|show|series/i.test(name)) return 'video';
  if (/audio|sound|music|mp3|wav|flac/i.test(name)) return 'audio';
  if (/photo|image|picture|img|jpg|camera|raw/i.test(name)) return 'photo';
  if (/archive|backup|old|save/i.test(name)) return 'archive';
  if (/document|doc|pdf|txt|report/i.test(name)) return 'document';
  return 'default';
};

const getFolderColor = (type) => {
  const colors = {
    video: '#ff5a5f',
    audio: '#00d1b2',
    photo: '#3273dc',
    archive: '#9c5fff',
    document: '#ffdd57',
    default: 'var(--ntb-ac)'
  };
  return colors[type] || colors.default;
};


// Detect if current document looks like a server autoindex page
function looksLikeAutoIndex(doc = document) {
  const t = (doc.title || '').toLowerCase();
  const hasIndexTitle = t.startsWith('index of ') || t.includes('autoindex') || /directory/i.test(t);
  const hasParentLink = $$('a', doc).some(a => /parent directory/i.test(a.textContent));
  const hasPre = !!$('pre', doc);
  const hasTable = !!$('table', doc);
  const fileish = $$('a[href]', doc).filter(isFunctionalLink);
  const many = fileish.length >= 3; // small folders too
  return (hasIndexTitle || hasParentLink || (hasPre && hasTable)) && many;
}

// Extract metadata from a table row or pre listing
function extractRowMeta(aEl) {
  const row = aEl.closest('tr');
  if (row) {
    const cells = Array.from(row.cells || []);
    if (cells.length >= 3) {
      let bytes, mtime;
      for (const cell of cells) {
        const text = cell.textContent.trim();
        const dateMatch = text.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})|(\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}:\d{2})/);
        if (dateMatch) {
          const d = new Date(dateMatch[0].replace(/-/g, ' '));
          if (!isNaN(+d)) mtime = d.toISOString();
          continue;
        }
        const sizeMatch = text.match(/(\d+(?:\.\d+)?)([KMG]?)$/i);
        if (sizeMatch) {
          const num = parseFloat(sizeMatch[1]);
          const mult = { 'K': 1024, 'M': 1048576, 'G': 1073741824 }[sizeMatch[2].toUpperCase()] || 1;
          bytes = Math.round(num * mult);
        }
      }
      return { bytes, mtime };
    }
  }
  return {};
}

// Parse the current index and categorise entries
function parseIndex(doc, baseUrl) {
  let anchors = [];
  for (const sel of SELECTORS) {
    anchors = $$(sel, doc);
    if (anchors.length) break;
  }
  const dirs = [];
  const images = [];
  const files = [];
  for (const a of anchors) {
    const href = a.getAttribute('href') || '';
    if (!href || href === '../' || href === './' || href === '/') continue;
    const url = abs(href, baseUrl);
    if (!isFunctionalLink(a)) continue;
    let name = (a.textContent || decodeURIComponent(url.split('/').pop() || '')).trim();
    if (name.endsWith('/')) name = name.slice(0, -1);
    if (!name) continue;
    const meta = extractRowMeta(a);
    if (isDirHref(href)) {
      dirs.push({ kind: 'dir', url, name, type: getFolderType(name) });
    } else if (isImgHref(href)) {
      images.push({ kind: 'img', url, name, ext: getExt(url), ...meta });
    } else if (isFileHref(href)) {
      files.push({ kind: 'file', url, name, ext: getExt(url), ...meta });
    }
    if (dirs.length + images.length + files.length >= MAX_ITEMS_PAGE) break;
  }
  const uniq = (arr) => {
    const seen = new Set();
    return arr.filter(x => seen.has(x.url) ? false : (seen.add(x.url), true));
  };
  const byName = (a, b) => nat(a.name, b.name);
  return {
    dirs: uniq(dirs).sort(byName),
    images: uniq(images).sort(byName),
    files: uniq(files).sort(byName)
  };
}


// Inject basic styles for gallery
function injectCSS() {
  if (document.getElementById('ntb-styles')) return;
  const style = document.createElement('style');
  style.id = 'ntb-styles';
  style.textContent = `
    .ntb-grid { display:flex; flex-wrap:wrap; gap:1rem; }
    .ntb-item { width:150px; font:14px sans-serif; }
    .ntb-thumb { width:100%; height:100px; object-fit:cover; border-radius:4px; }
    .ntb-name { margin-top:4px; }
  `;
  document.head.appendChild(style);
}

// Render a simple gallery listing
function renderGallery(data) {
  const container = document.createElement('div');
  container.className = 'ntb-grid';
  data.dirs.forEach(dir => {
    const div = document.createElement('div');
    div.className = 'ntb-item';
    div.innerHTML = `<div class="ntb-name" style="color:${getFolderColor(dir.type)}">📁 <a href="${dir.url}">${dir.name}</a></div>`;
    container.appendChild(div);
  });
  data.images.forEach(img => {
    const div = document.createElement('div');
    div.className = 'ntb-item';
    div.innerHTML = `<img class="ntb-thumb" src="${img.url}" alt=""><div class="ntb-name">${img.name}</div>`;
    container.appendChild(div);
  });
  data.files.forEach(file => {
    const div = document.createElement('div');
    div.className = 'ntb-item';
    div.innerHTML = `<div class="ntb-name">📄 <a href="${file.url}">${file.name}</a><br><small>${fmtBytes(file.bytes)} • ${formatDate(file.mtime)}</small></div>`;
    container.appendChild(div);
  });
  document.body.innerHTML = '';
  document.body.appendChild(container);
}


// Entry point
if (looksLikeAutoIndex(document)) {
  const data = parseIndex(document, location.href);
  injectCSS();
  renderGallery(data);
}

})();
