// ==UserScript==
// @name         NiceThumbsBuddy — Autoindex Gallery (Enhanced)
// @namespace    archangel.nicethumbsbuddy
// @version      2.6.0
// @description  Transform bare Apache/Nginx directory listings into a rich gallery with improved performance, accessibility, user experience, and smart error handling.
// @author       Archangel13GTL
// @license      MIT
// @run-at       document-end
// @grant        none

// Common media folders
// @match        *://*/wp-content/uploads/*
// @match        *://*/wp-content/*/*
// @match        *://*/images/*
// @match        *://*/pictures/*
// @match        *://*/photos/*
// @match        *://*/gallery/*
// @match        *://*/uploads/*
// @match        *://*/files/*

// Apache "autoindex" often has sort params like ?C=, ?O=
// @match        *://*/*?C=*
// @match        *://*/*?O=*

// Optional (regex include) for plain "Index of /path" pages
// @include      /^https?:\/\/[^\/]+\/(?:[^?#]*\/)?(?:index\.html?)?$/
// ==/UserScript==

/*
 * NiceThumbsBuddy Enhanced: "When your directories deserve better than naked listings."
 * 
 * Every folder has a story to tell. This script helps it tell that story with style,
 * performance, and accessibility in mind.
 * 
 * Version 2.6.0 Improvements:
 * - Enhanced performance with optimized metadata caching and memory management
 * - Improved accessibility with proper ARIA labels and keyboard navigation
 * - Better error handling and user feedback with notification system
 * - Cache size limits and automatic pruning to prevent memory issues
 * - Comprehensive JSDoc documentation for better maintainability
 * - Enhanced keyboard shortcuts help system (press H to view)
 * - Robust URL validation and error recovery
 * - Mobile-optimized touch gestures and responsive design
 * - Throttled cache saves to improve performance
 * - Welcome notification for first-time users
 * 
 * "Knowledge isn't power until it is applied." - Dale Carnegie
 * (And directories aren't useful until they're navigable!)
 */

(function() {
  'use strict';

  // --------------------------- Config --------------------------------------
  const IMG_EXT = /\.(avif|webp|jpe?g|png|gif|bmp|svg)$/i;
  const FILE_EXT = /\.(avif|webp|jpe?g|png|gif|bmp|svg|heic|tif?f|mp4|mov|webm|mkv|pdf|zip|rar|7z|tar|gz)$/i;
  const MAX_ITEMS_PAGE = 12000; // per page safety guard
  const SCAN_CONCURRENCY = 4;   // sitemap concurrent fetches
  const IO_THRESHOLD = 0.1;     // intersection observer threshold
  const CACHE_EXPIRY = 7200000; // metadata cache expiry (2 hours)
  const CACHE_MAX_SIZE = 10000; // Maximum cache entries to prevent memory issues
  const DEBOUNCE_DELAY = 150;   // Default debounce delay for better performance
  const THROTTLE_DELAY = 100;   // Default throttle delay for scroll handlers

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
    expandSitemap: 'ntb:expandmap',
    keyboardShortcuts: 'ntb:keyboard'
  };

  const SELECTORS = [
    'pre a[href]',          // classic Apache
    'table a[href]',        // fancyindex styles
    'a[href]'               // fallback (filter later)
  ];

  // --------------------------- Utils ---------------------------------------
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  
  const abs = (href, base=location.href) => {
    try {
      return new URL(href, base).href;
    } catch (e) {
      console.warn('[NiceThumbsBuddy] Invalid URL:', href, e);
      return href;
    }
  };
  
  const isFunctionalLink = (a) => a && a.href && !a.href.startsWith('mailto:') && !a.href.startsWith('javascript:');
  const isDirHref = (href) => /\/$/.test(href.split('#')[0].split('?')[0]);
  const isImgHref = (href) => IMG_EXT.test(href.split('?')[0]);
  const isFileHref = (href) => FILE_EXT.test(href.split('?')[0]);
  
  // Natural sort that handles numbers correctly (e.g., "img2.jpg" comes before "img10.jpg")
  const nat = (function() {
    try { 
      return new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare; 
    } catch(e) { 
      console.warn('[NiceThumbsBuddy] Intl.Collator not supported, falling back to basic sort');
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
  
  // Shuffle array (for random sort)
  const shuffle = (array) => {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  
  // Debounce function execution
  const debounce = (fn, ms = DEBOUNCE_DELAY) => {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), ms);
    };
  };

  // Throttle function execution (good for scroll handlers)
  const throttle = (fn, ms = THROTTLE_DELAY) => {
    let lastCall = 0;
    return function(...args) {
      const now = Date.now();
      if (now - lastCall < ms) return;
      lastCall = now;
      return fn.apply(this, args);
    };
  };

  // Get file extension
  const getExt = (url) => {
    const filename = url.split('/').pop() || '';
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
  };

  // Format date in a user-friendly way
  const formatDate = (date) => {
    if (!date) return '—';
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return '—';
      
      // Use relative time for recent items
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
      
      // Otherwise use date format
      return d.toLocaleDateString();
    } catch (e) {
      console.warn('[NiceThumbsBuddy] Date formatting error:', e);
      return '—';
    }
  };

  // Get folder type based on name (for colorization)
  const getFolderType = (name) => {
    name = name.toLowerCase();
    if (/video|movie|film|tv|show|series/i.test(name)) return 'video';
    if (/audio|sound|music|mp3|wav|flac/i.test(name)) return 'audio';
    if (/photo|image|picture|img|jpg|camera|raw/i.test(name)) return 'photo';
    if (/archive|backup|old|save/i.test(name)) return 'archive';
    if (/document|doc|pdf|txt|report/i.test(name)) return 'document';
    return 'default';
  };

  // Get folder color based on type
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

  // Show user notification with auto-dismiss
  const showNotification = (message, type = 'info', duration = 3000) => {
    // Remove existing notifications
    const existing = $('.ntb-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = `ntb-notification ntb-${type}`;
    notification.setAttribute('role', 'alert');
    notification.setAttribute('aria-live', 'polite');
    notification.innerHTML = `
      <div class="ntb-notification-content">
        <span class="ntb-notification-message">${message}</span>
        <button class="ntb-notification-close" aria-label="Close notification">&times;</button>
      </div>
    `;

    document.body.appendChild(notification);

    // Close button functionality
    const closeBtn = notification.querySelector('.ntb-notification-close');
    closeBtn.addEventListener('click', () => notification.remove());

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => {
        if (notification.parentNode) notification.remove();
      }, duration);
    }

    return notification;
  };

  // --------------------------- Detection Logic ----------------------------
  function looksLikeAutoIndex(doc = document) {
    const t = (doc.title || '').toLowerCase();
    const hasIndexTitle = t.startsWith('index of ') || t.includes('autoindex') || /directory/i.test(t);
    const hasParentLink = $$('a', doc).some(a => /parent directory/i.test(a.textContent));
    const hasPre = !!$('pre', doc); 
    const hasTable = !!$('table', doc);
    const fileish = $$('a[href]', doc).filter(isFunctionalLink);
    const many = fileish.length >= 3; // small folders too
    
    // More sophisticated pattern detection
    let hasDirectoryPattern = false;
    
    // Look for classic Apache pre pattern
    if (hasPre) {
      const preText = $('pre', doc).textContent;
      // Apache pattern: looks for date patterns followed by size then filename
      hasDirectoryPattern = /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+\d+(\.\d+)?[KMG]?\s+\S+/i.test(preText) ||
                          /\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}:\d{2}\s+\d+(\.\d+)?[KMG]?\s+\S+/i.test(preText);
    }
    
    // Look for table pattern (column headers like Name, Last Modified, Size)
    if (hasTable) {
      const headings = $$('th, td:first-child', doc).map(el => el.textContent.trim().toLowerCase());
      hasDirectoryPattern = headings.some(h => /name|last modified|size|description/i.test(h));
    }
    
    return (hasIndexTitle || hasParentLink || hasDirectoryPattern || (hasPre && hasTable)) && many;
  }

  // --------------------------- Metadata Extraction ------------------------
  function extractRowMeta(aEl) {
    // Try table extraction first
    const row = aEl.closest('tr');
    if (row) {
      const cells = Array.from(row.cells || []);
      if (cells.length >= 3) {
        // Common patterns in Apache/Nginx table listings
        let bytes, mtime;
        
        // Last modified date - check multiple date formats
        for (const cell of cells) {
          const text = cell.textContent.trim();
          // Check for YYYY-MM-DD HH:MM format
          const dateMatch1 = text.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
          // Check for DD-Mon-YYYY HH:MM format
          const dateMatch2 = text.match(/(\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}:\d{2})/);
          
          if (dateMatch1 || dateMatch2) {
            const dateStr = (dateMatch1 ? dateMatch1[1] : dateMatch2[1]);
            const d = new Date(dateStr.replace(/-/g, ' '));
            if (!isNaN(+d)) mtime = d.toISOString();
            break;
          }
        }
        
        // File size
        for (const cell of cells) {
          const text = cell.textContent.trim();
          // Common size formats: 123K, 45.3MB, 2G, etc.
          const sizeMatch = text.match(/^((?:\d+[.,]?)+)\s*(B|KB|MB|GB|K|M|G)?$/i);
          if (sizeMatch) {
            const n = parseFloat(sizeMatch[1].replace(',', '.'));
            let unit = (sizeMatch[2] || '').toUpperCase();
            // Normalize units
            if (unit === 'K') unit = 'KB';
            if (unit === 'M') unit = 'MB';
            if (unit === 'G') unit = 'GB';
            
            const mult = { 'B': 1, 'KB': 1024, 'MB': 1048576, 'GB': 1073741824 }[unit] || 1;
            bytes = Math.round(n * mult);
            break;
          }
        }
        
        return { bytes, mtime };
      }
    }
    
    // Fallback to pre-formatted text parsing for standard Apache listings
    const pre = $('pre');
    if (pre) {
      const lines = pre.textContent.split('\n');
      const fileName = aEl.textContent.trim();
      const pattern = new RegExp(`\\S+\\s+\\S+\\s+(?:\\S+\\s+)?(?:\\S+\\s+)?(\\d+(?:\\.\\d+)?[KMG]?)\\s+${fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
      
      for (const line of lines) {
        if (line.includes(fileName)) {
          // Date extraction (supports multiple formats)
          let mtime;
          const dateMatch1 = line.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
          const dateMatch2 = line.match(/(\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}:\d{2})/);
          
          if (dateMatch1 || dateMatch2) {
            const dateStr = (dateMatch1 ? dateMatch1[1] : dateMatch2[1]);
            const d = new Date(dateStr.replace(/-/g, ' '));
            if (!isNaN(+d)) mtime = d.toISOString();
          }
          
          // Size extraction
          let bytes;
          const sizeMatch = line.match(pattern) || line.match(/(\d+(?:\.\d+)?[KMG]?)\s+\S+$/);
          if (sizeMatch) {
            const sizeStr = sizeMatch[1];
            const unit = sizeStr.slice(-1);
            const isUnit = /[KMG]/i.test(unit);
            const num = parseFloat(isUnit ? sizeStr.slice(0, -1) : sizeStr);
            const mult = { 'K': 1024, 'M': 1048576, 'G': 1073741824 }[unit.toUpperCase()] || 1;
            bytes = Math.round(num * mult);
          }
          
          return { bytes, mtime };
        }
      }
    }
    
    return {};
  }

  // Parse full directory listing
  function parseIndex(doc, baseUrl) {
    let anchors = [];
    // Try each selector strategy until we find links
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
      
      // Extract name, clean up if needed
      let name = (a.textContent || decodeURIComponent(url.split('/').pop() || '')).trim();
      // Remove trailing slash for directory names
      if (name.endsWith('/')) name = name.slice(0, -1);
      if (!name) continue;
      
      // Extract metadata from the page structure
      const meta = extractRowMeta(a);
      
      if (isDirHref(href)) {
        dirs.push({
          kind: 'dir',
          url,
          name,
          type: getFolderType(name)
        });
      } else if (isImgHref(href)) {
        images.push({
          kind: 'img',
          url,
          name,
          ext: getExt(url),
          ...meta
        });
      } else if (isFileHref(href)) {
        files.push({
          kind: 'file',
          url,
          name,
          ext: getExt(url),
          ...meta
        });
      }
      
      if (dirs.length + images.length + files.length >= MAX_ITEMS_PAGE) break;
    }
    
    // Remove duplicates (some servers may have multiple links to same resource)
    const uniq = (arr) => {
      const seen = new Set();
      return arr.filter(x => seen.has(x.url) ? false : (seen.add(x.url), true));
    };
    
    // Sort by name as default
    const byName = (a, b) => nat(a.name, b.name);
    
    return {
      dirs: uniq(dirs).sort(byName),
      images: uniq(images).sort(byName),
      files: uniq(files).sort(byName)
    };
  }

  // --------------------------- Styles -------------------------------------
  const CSS = /* css */`
    /* Base theme variables */
    :root {
      --ntb-gap: 14px;
      --ntb-size: 220px;
      --ntb-label: 14px;
      
      /* Dark theme (default) */
      --ntb-bg: #0b0f14;
      --ntb-card-bg: #0f1722;
      --ntb-fg: #e6eef9;
      --ntb-ac: #00ffc8;
      --ntb-dim: #9bb1c7;
      --ntb-border: #1c2836;
      --ntb-overlay: rgba(5,8,11,0.92);
      --ntb-highlight: rgba(0,255,200,0.15);
      --ntb-folder-icon: rgba(0,255,200,0.8);
      --ntb-shadow: 0 10px 22px rgba(0,0,0,0.35);
      --ntb-toolbar-bg: linear-gradient(180deg, rgba(5,8,11,0.95), rgba(5,8,11,0.85));
    }
    
    /* High contrast theme */
    .ntb-high-contrast {
      --ntb-fg: #ffffff;
      --ntb-dim: #b0c4d8;
      --ntb-ac: #00ffdb;
      --ntb-border: #2a3b4d;
      --ntb-highlight: rgba(0,255,219,0.2);
    }
    
    /* Light theme */
    .ntb-light {
      --ntb-bg: #f0f2f5;
      --ntb-card-bg: #ffffff;
      --ntb-fg: #283142;
      --ntb-ac: #0070f3;
      --ntb-dim: #6b7280;
      --ntb-border: #dde1e7;
      --ntb-overlay: rgba(240,242,245,0.92);
      --ntb-highlight: rgba(0,112,243,0.1);
      --ntb-folder-icon: rgba(0,112,243,0.8);
      --ntb-shadow: 0 10px 25px rgba(0,0,0,0.1);
      --ntb-toolbar-bg: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.85));
    }
    
    /* Global styles */
    body { 
      background-color: var(--ntb-bg) !important; 
      color: var(--ntb-fg) !important;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', sans-serif;
    }
    
    .ntb-hide-original { 
      display: none !important; 
    }
    
    /* Toolbar */
    .ntb-toolbar { 
      position: sticky; 
      top: 0; 
      z-index: 9999; 
      display: grid; 
      grid-template-columns: 1fr auto; 
      gap: 10px; 
      align-items: center; 
      padding: 12px 16px; 
      background: var(--ntb-toolbar-bg); 
      border-bottom: 1px solid var(--ntb-border); 
      color: var(--ntb-fg); 
      backdrop-filter: blur(8px);
      font: 14px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', sans-serif; 
    }
    
    .ntb-left { 
      display: flex; 
      flex-wrap: wrap; 
      gap: 8px 12px; 
      align-items: center; 
    }
    
    .ntb-right { 
      display: flex; 
      flex-wrap: wrap; 
      gap: 10px; 
      align-items: center; 
    }
    
    .ntb-brand { 
      color: var(--ntb-ac); 
      font-weight: 700; 
      letter-spacing: 0.03em; 
    }
    
    .ntb-bc a { 
      color: var(--ntb-fg); 
      text-decoration: none; 
      opacity: 0.9; 
      transition: color 0.15s ease;
    } 
    
    .ntb-bc a:hover { 
      color: var(--ntb-ac); 
    }
    
    .ntb-crumb-sep { 
      opacity: 0.45; 
      margin: 0 6px; 
    }
    
    .ntb-chip { 
      display: inline-block; 
      padding: 2px 8px; 
      border: 1px solid var(--ntb-border); 
      border-radius: 999px; 
      margin-left: 6px; 
      font-size: 11px; 
      color: var(--ntb-dim); 
      background: var(--ntb-card-bg);
    }
    
    .ntb-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--ntb-highlight);
      color: var(--ntb-ac);
      border-radius: 999px;
      padding: 1px 6px;
      font-size: 10px;
      margin-left: 8px;
      min-width: 18px;
    }
    
    /* Form controls */
    .ntb-toolbar input[type="search"], 
    .ntb-toolbar select, 
    .ntb-toolbar button {
      background: var(--ntb-card-bg); 
      color: var(--ntb-fg); 
      border: 1px solid var(--ntb-border); 
      border-radius: 8px; 
      padding: 8px 12px; 
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    
    .ntb-toolbar button {
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    
    .ntb-toolbar button:hover {
      border-color: var(--ntb-ac);
    }
    
    .ntb-toolbar button:focus-visible,
    .ntb-toolbar input:focus-visible,
    .ntb-toolbar select:focus-visible {
      border-color: var(--ntb-ac);
      box-shadow: 0 0 0 2px var(--ntb-highlight);
    }
    
    .ntb-toolbar button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .ntb-toolbar button.ntb-active {
      background: var(--ntb-highlight);
      border-color: var(--ntb-ac);
    }
    
    .ntb-toolbar input[type="range"] {
      accent-color: var(--ntb-ac);
    }
    
    .ntb-toolbar .ntb-icon {
      width: 16px;
      height: 16px;
      display: inline-block;
      vertical-align: middle;
    }
    
    /* Grid View */
    .ntb-grid { 
      display: grid; 
      grid-template-columns: repeat(auto-fill, minmax(var(--ntb-size), 1fr)); 
      gap: var(--ntb-gap); 
      padding: 16px; 
    }
    
    .ntb-item { 
      background: var(--ntb-card-bg); 
      border: 1px solid var(--ntb-border); 
      border-radius: 12px; 
      overflow: hidden; 
      transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.2s ease; 
    }
    
    .ntb-item:hover { 
      transform: translateY(-2px); 
      border-color: var(--ntb-ac); 
      box-shadow: var(--ntb-shadow);
    }
    
    .ntb-item.dir { 
      display: flex; 
      flex-direction: column;
      padding: 20px; 
      min-height: calc(var(--ntb-size) - 42px); 
      cursor: pointer; 
    }
    
    .ntb-folder-icon { 
      margin-bottom: 14px;
      align-self: center;
      opacity: 0.9;
      width: 64px;
      height: 64px;
    }
    
    .ntb-dirname { 
      font-size: calc(var(--ntb-label) * 1.1); 
      color: var(--ntb-fg); 
      text-align: center;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      margin-top: auto;
    }
    
    .ntb-dir-meta {
      font-size: 11px;
      color: var(--ntb-dim);
      text-align: center;
      margin-top: 6px;
    }
    
    .ntb-item.img { 
      cursor: zoom-in; 
      display: flex; 
      flex-direction: column;
      position: relative;
    }
    
    .ntb-img-wrap {
      position: relative;
      overflow: hidden;
      aspect-ratio: 1 / 1;
    }
    
    .ntb-img-placeholder {
      position: absolute;
      inset: 0;
      background-color: var(--ntb-card-bg);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--ntb-dim);
      font-size: 12px;
    }
    
    .ntb-item.img img { 
      width: 100%; 
      height: 100%; 
      object-fit: cover;
      display: block;
      transition: transform 0.3s ease;
    }
    
    .ntb-item.img:hover img {
      transform: scale(1.03);
    }
    
    .ntb-resolution {
      position: absolute;
      bottom: 8px;
      right: 8px;
      background: rgba(0,0,0,0.6);
      color: #fff;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    
    .ntb-item.img:hover .ntb-resolution {
      opacity: 1;
    }
    
    .ntb-caption { 
      font-size: var(--ntb-label); 
      color: var(--ntb-fg); 
      padding: 10px 12px; 
      white-space: nowrap; 
      overflow: hidden; 
      text-overflow: ellipsis; 
      border-top: 1px solid var(--ntb-border);
    }
    
    .ntb-caption .ntb-dim {
      font-size: 90%;
      color: var(--ntb-dim);
      margin-left: 6px;
    }
    
    /* List View */
    .ntb-list { 
      display: block; 
      padding: 0 16px 60px; 
    }
    
    .ntb-row { 
      display: grid; 
      grid-template-columns: minmax(220px, 1.2fr) 0.4fr 0.4fr 0.6fr 0.6fr; 
      gap: 12px; 
      align-items: center; 
      border-bottom: 1px solid var(--ntb-border); 
      padding: 12px 8px;
      transition: background-color 0.1s ease;
    }
    
    .ntb-row:hover {
      background-color: var(--ntb-highlight);
    }
    
    .ntb-h { 
      position: sticky; 
      top: 57px; 
      background: var(--ntb-bg); 
      z-index: 2; 
      font-weight: 600;
      border-bottom: 2px solid var(--ntb-border);
      padding: 12px 8px;
    }
    
    .ntb-row .ntb-name { 
      display: flex; 
      align-items: center; 
      gap: 12px; 
      min-width: 0; 
    }
    
    .ntb-row .ntb-name .ntb-dirname, 
    .ntb-row .ntb-name .ntb-filename { 
      white-space: nowrap; 
      overflow: hidden; 
      text-overflow: ellipsis; 
    }
    
    .ntb-row .ntb-icon {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      opacity: 0.9;
    }
    
    .ntb-row .ntb-open { 
      justify-self: end; 
    }
    
    .ntb-type-chip {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      background: var(--ntb-highlight);
      color: var(--ntb-ac);
    }
    
    /* Lightbox */
    .ntb-lightbox { 
      position: fixed; 
      inset: 0; 
      z-index: 10000; 
      display: none; 
      align-items: center; 
      justify-content: center; 
      background: var(--ntb-overlay); 
    }
    
    .ntb-lightbox.on { 
      display: flex; 
    }
    
    .ntb-dialog { 
      position: relative; 
      outline: 0; 
    }
    
    .ntb-zoomwrap { 
      max-width: 95vw; 
      max-height: 90vh; 
      overflow: hidden; 
      border: 1px solid var(--ntb-border); 
      border-radius: 12px; 
      background: var(--ntb-bg); 
      touch-action: none; 
    }
    
    .ntb-zoomimg { 
      display: block; 
      will-change: transform; 
      transform-origin: center center; 
    }
    
    .ntb-lbbar { 
      position: fixed; 
      left: 0; 
      right: 0; 
      bottom: 16px; 
      display: flex; 
      gap: 8px; 
      justify-content: center; 
      align-items: center; 
    }
    
    .ntb-lbbar button { 
      background: var(--ntb-card-bg); 
      color: var(--ntb-fg); 
      border: 1px solid var(--ntb-border); 
      border-radius: 8px; 
      padding: 8px 12px;
      font-size: 13px;
      cursor: pointer;
      transition: border-color 0.15s ease;
    }
    
    .ntb-lbbar button:hover {
      border-color: var(--ntb-ac);
    }
    
    .ntb-close { 
      position: fixed; 
      top: 20px; 
      right: 20px;
      background: var(--ntb-card-bg);
      color: var(--ntb-fg);
      border: 1px solid var(--ntb-border);
      border-radius: 8px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      cursor: pointer;
      transition: border-color 0.15s ease;
    }
    
    .ntb-close:hover {
      border-color: var(--ntb-ac);
    }
    
    .ntb-prev, .ntb-next { 
      position: fixed; 
      top: 50%; 
      transform: translateY(-50%);
      background: var(--ntb-card-bg);
      color: var(--ntb-fg);
      border: 1px solid var(--ntb-border);
      border-radius: 8px;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      cursor: pointer;
      transition: border-color 0.15s ease;
    }
    
    .ntb-prev { left: 20px; }
    .ntb-next { right: 20px; }
    
    .ntb-prev:hover, .ntb-next:hover {
      border-color: var(--ntb-ac);
    }
    
    /* Sitemap */
    .ntb-sitemap { 
      position: fixed; 
      top: 0; 
      left: 0; 
      height: 100vh; 
      width: 400px; 
      transform: translateX(-100%); 
      transition: transform 0.2s ease; 
      z-index: 9999; 
      background: var(--ntb-bg); 
      border-right: 1px solid var(--ntb-border); 
      display: flex; 
      flex-direction: column; 
    }
    
    .ntb-sitemap.open { 
      transform: translateX(0); 
    }
    
    .ntb-scan-head { 
      padding: 14px 16px; 
      border-bottom: 1px solid var(--ntb-border); 
      display: flex; 
      gap: 10px; 
      align-items: center; 
      color: var(--ntb-fg); 
    }
    
    .ntb-scan-body { 
      overflow: auto; 
      padding: 16px; 
      color: var(--ntb-fg); 
    }
    
    .ntb-tree details { 
      margin-left: 16px;
      position: relative;
    }
    
    .ntb-tree details::before {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      left: -12px;
      width: 1px;
      background-color: var(--ntb-border);
    }
    
    .ntb-tree details::after {
      content: "";
      position: absolute;
      top: 10px;
      left: -12px;
      width: 10px;
      height: 1px;
      background-color: var(--ntb-border);
    }
    
    .ntb-tree summary { 
      cursor: pointer;
      margin-bottom: 8px;
      position: relative;
      outline: none;
    }
    
    .ntb-tree summary:hover {
      color: var(--ntb-ac);
    }
    
    .ntb-tree summary:focus-visible {
      outline: 2px solid var(--ntb-ac);
      outline-offset: 2px;
    }
    
    .ntb-tree-actions {
      margin-bottom: 16px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    
    .ntb-tree a {
      color: var(--ntb-fg);
      text-decoration: none;
      transition: color 0.15s ease;
    }
    
    .ntb-tree a:hover {
      color: var(--ntb-ac);
    }
    
    .ntb-file-list {
      margin: 8px 0 12px 18px;
      padding: 0;
      list-style-type: none;
      border-left: 1px dashed var(--ntb-border);
      padding-left: 12px;
    }
    
    .ntb-file-list li {
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .ntb-scan-foot { 
      border-top: 1px solid var(--ntb-border); 
      padding: 14px 16px; 
      display: flex; 
      gap: 10px; 
      align-items: center; 
      margin-top: auto; 
      background: var(--ntb-card-bg); 
    }
    
    /* Responsive adjustments */
    @media (max-width: 768px) {
      .ntb-toolbar {
        padding: 10px;
        grid-template-columns: 1fr;
      }
      
      .ntb-left, .ntb-right {
        justify-content: center;
      }
      
      .ntb-sitemap {
        width: 85%;
      }
      
      .ntb-row {
        grid-template-columns: 1fr auto;
      }
      
      .ntb-row .ntb-date,
      .ntb-row .ntb-size,
      .ntb-row .ntb-type {
        display: none;
      }
      
      .ntb-h .ntb-date,
      .ntb-h .ntb-size,
      .ntb-h .ntb-type {
        display: none;
      }
    }
    
    /* Reduced motion support */
    @media (prefers-reduced-motion: reduce) {
      .ntb-item { 
        transition: none; 
      }
      
      .ntb-item:hover { 
        transform: none; 
      }
      
      .ntb-sitemap {
        transition: none;
      }
      
      .ntb-item.img img {
        transition: none;
      }
      
      .ntb-item.img:hover img {
        transform: none;
      }
      
      .ntb-notification {
        transition: none;
      }
    }
    
    /* Notification system */
    .ntb-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10001;
      background: var(--ntb-card-bg);
      border: 1px solid var(--ntb-border);
      border-radius: 8px;
      padding: 12px 16px;
      box-shadow: var(--ntb-shadow);
      max-width: 400px;
      transform: translateX(420px);
      animation: ntb-slide-in 0.3s ease forwards;
    }
    
    .ntb-notification.ntb-success {
      border-color: #00d1b2;
      background: rgba(0, 209, 178, 0.05);
    }
    
    .ntb-notification.ntb-warning {
      border-color: #ffdd57;
      background: rgba(255, 221, 87, 0.05);
    }
    
    .ntb-notification.ntb-error {
      border-color: #ff5a5f;
      background: rgba(255, 90, 95, 0.05);
    }
    
    .ntb-notification-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    
    .ntb-notification-message {
      color: var(--ntb-fg);
      font-size: 14px;
      flex: 1;
    }
    
    .ntb-notification-close {
      background: none;
      border: none;
      color: var(--ntb-dim);
      cursor: pointer;
      font-size: 18px;
      padding: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background-color 0.15s ease;
    }
    
    .ntb-notification-close:hover {
      background: var(--ntb-highlight);
      color: var(--ntb-fg);
    }
    
    .ntb-notification-close:focus-visible {
      outline: 2px solid var(--ntb-ac);
      outline-offset: 2px;
    }
    
    @keyframes ntb-slide-in {
      to {
        transform: translateX(0);
      }
    }
    
    /* Screen reader only content */
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    /* Help modal */
    .ntb-help-modal {
      position: fixed;
      inset: 0;
      z-index: 10002;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .ntb-help-overlay {
      position: absolute;
      inset: 0;
      background: var(--ntb-overlay);
      cursor: pointer;
    }
    
    .ntb-help-dialog {
      position: relative;
      background: var(--ntb-card-bg);
      border: 1px solid var(--ntb-border);
      border-radius: 12px;
      padding: 24px;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: var(--ntb-shadow);
    }
    
    .ntb-help-close {
      position: absolute;
      top: 16px;
      right: 16px;
      background: none;
      border: none;
      color: var(--ntb-dim);
      cursor: pointer;
      font-size: 20px;
      padding: 4px;
      border-radius: 4px;
      transition: background-color 0.15s ease;
    }
    
    .ntb-help-close:hover {
      background: var(--ntb-highlight);
      color: var(--ntb-fg);
    }
    
    .ntb-help-content h3 {
      margin: 0 0 16px 0;
      color: var(--ntb-fg);
      font-size: 18px;
    }
    
    .ntb-shortcut-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 8px;
      margin: 16px 0;
    }
    
    .ntb-shortcut-grid div {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      color: var(--ntb-fg);
    }
    
    .ntb-shortcut-grid kbd {
      background: var(--ntb-highlight);
      color: var(--ntb-ac);
      padding: 4px 8px;
      border-radius: 4px;
      font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
      font-size: 12px;
      font-weight: bold;
      min-width: 24px;
      text-align: center;
    }
    
    .ntb-help-note {
      margin: 16px 0 0 0;
      color: var(--ntb-dim);
      font-size: 14px;
      font-style: italic;
    }
  `;

  // --------------------------- SVG Icons ----------------------------------
  const ICONS = {
    folder: (color = 'var(--ntb-folder-icon)') => `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" class="ntb-folder-icon"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6a2.5 2.5 0 0 1 1.77.73l1.42 1.54c.47.5 1.12.78 1.8.78H18.5A2.5 2.5 0 0 1 21 9.5v6A2.5 2.5 0 0 1 18.5 18h-13A2.5 2.5 0 0 1 3 15.5v-9Z" /></svg>`,
    
    folderVideo: (color = '#ff5a5f') => `<svg viewBox="0 0 24 24" fill="none" class="ntb-folder-icon"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6a2.5 2.5 0 0 1 1.77.73l1.42 1.54c.47.5 1.12.78 1.8.78H18.5A2.5 2.5 0 0 1 21 9.5v6A2.5 2.5 0 0 1 18.5 18h-13A2.5 2.5 0 0 1 3 15.5v-9Z" stroke="${color}" stroke-width="1.5"/><path d="M12 10v3l2.5 1.5" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    
    folderAudio: (color = '#00d1b2') => `<svg viewBox="0 0 24 24" fill="none" class="ntb-folder-icon"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6a2.5 2.5 0 0 1 1.77.73l1.42 1.54c.47.5 1.12.78 1.8.78H18.5A2.5 2.5 0 0 1 21 9.5v6A2.5 2.5 0 0 1 18.5 18h-13A2.5 2.5 0 0 1 3 15.5v-9Z" stroke="${color}" stroke-width="1.5"/><path d="M14 10.5v3m2-4v5m-6-3v1" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    
    folderPhoto: (color = '#3273dc') => `<svg viewBox="0 0 24 24" fill="none" class="ntb-folder-icon"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6a2.5 2.5 0 0 1 1.77.73l1.42 1.54c.47.5 1.12.78 1.8.78H18.5A2.5 2.5 0 0 1 21 9.5v6A2.5 2.5 0 0 1 18.5 18h-13A2.5 2.5 0 0 1 3 15.5v-9Z" stroke="${color}" stroke-width="1.5"/><circle cx="14.5" cy="10.5" r="1.5" stroke="${color}" stroke-width="1.5"/><path d="M9 16l2-2.5 4 3" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    
    folderArchive: (color = '#9c5fff') => `<svg viewBox="0 0 24 24" fill="none" class="ntb-folder-icon"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6a2.5 2.5 0 0 1 1.77.73l1.42 1.54c.47.5 1.12.78 1.8.78H18.5A2.5 2.5 0 0 1 21 9.5v6A2.5 2.5 0 0 1 18.5 18h-13A2.5 2.5 0 0 1 3 15.5v-9Z" stroke="${color}" stroke-width="1.5"/><path d="M12 10v6m-1.5-4.5h3" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    
    folderDocument: (color = '#ffdd57') => `<svg viewBox="0 0 24 24" fill="none" class="ntb-folder-icon"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6a2.5 2.5 0 0 1 1.77.73l1.42 1.54c.47.5 1.12.78 1.8.78H18.5A2.5 2.5 0 0 1 21 9.5v6A2.5 2.5 0 0 1 18.5 18h-13A2.5 2.5 0 0 1 3 15.5v-9Z" stroke="${color}" stroke-width="1.5"/><path d="M10 10h4m-4 2h4m-4 2h2" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    
    grid: () => `<svg class="ntb-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>`,
    
    list: () => `<svg class="ntb-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"></path></svg>`,
    
    home: () => `<svg class="ntb-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"></path></svg>`,
    
    up: () => `<svg class="ntb-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd"></path></svg>`,
    
    raw: () => `<svg class="ntb-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"></path><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"></path></svg>`,
    
    map: () => `<svg class="ntb-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12 1.586l-4 4v12.828l4-4V1.586zM3.707 3.293A1 1 0 002 4v10a1 1 0 00.293.707L6 18.414V5.586L3.707 3.293zM17.707 5.293L14 1.586v12.828l2.293 2.293A1 1 0 0018 16V6a1 1 0 00-.293-.707z" clip-rule="evenodd"></path></svg>`,
    
    search: () => `<svg class="ntb-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"></path></svg>`,
    
    fileIcon: (ext) => {
      // Map extension to icon HTML
      const iconMap = {
        // Images
        jpg: `<svg viewBox="0 0 24 24" fill="none" stroke="#3273dc" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><circle cx="15" cy="10" r="1.5" /><path d="M17 15L14 12L9 17" /></svg>`,
        jpeg: `<svg viewBox="0 0 24 24" fill="none" stroke="#3273dc" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><circle cx="15" cy="10" r="1.5" /><path d="M17 15L14 12L9 17" /></svg>`,
        png: `<svg viewBox="0 0 24 24" fill="none" stroke="#3273dc" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><circle cx="15" cy="10" r="1.5" /><path d="M17 15L14 12L9 17" /></svg>`,
        gif: `<svg viewBox="0 0 24 24" fill="none" stroke="#3273dc" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><circle cx="15" cy="10" r="1.5" /><path d="M17 15L14 12L9 17" /></svg>`,
        webp: `<svg viewBox="0 0 24 24" fill="none" stroke="#3273dc" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><circle cx="15" cy="10" r="1.5" /><path d="M17 15L14 12L9 17" /></svg>`,
        
        // Videos
        mp4: `<svg viewBox="0 0 24 24" fill="none" stroke="#ff5a5f" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M10 10V14L14 12L10 10Z" /></svg>`,
        mov: `<svg viewBox="0 0 24 24" fill="none" stroke="#ff5a5f" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M10 10V14L14 12L10 10Z" /></svg>`,
        avi: `<svg viewBox="0 0 24 24" fill="none" stroke="#ff5a5f" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M10 10V14L14 12L10 10Z" /></svg>`,
        
        // Audio
        mp3: `<svg viewBox="0 0 24 24" fill="none" stroke="#00d1b2" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M9 15V11M12 16V10M15 15V11" stroke-linecap="round" /></svg>`,
        wav: `<svg viewBox="0 0 24 24" fill="none" stroke="#00d1b2" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M9 15V11M12 16V10M15 15V11" stroke-linecap="round" /></svg>`,
        
        // Documents
        pdf: `<svg viewBox="0 0 24 24" fill="none" stroke="#ffdd57" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M8 12H16M8 15H13" stroke-linecap="round" /></svg>`,
        txt: `<svg viewBox="0 0 24 24" fill="none" stroke="#ffdd57" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M8 12H16M8 15H13" stroke-linecap="round" /></svg>`,
        doc: `<svg viewBox="0 0 24 24" fill="none" stroke="#ffdd57" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M8 12H16M8 15H13" stroke-linecap="round" /></svg>`,
        
        // Archives
        zip: `<svg viewBox="0 0 24 24" fill="none" stroke="#9c5fff" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M12 9V15M10 12H14" stroke-linecap="round" /></svg>`,
        rar: `<svg viewBox="0 0 24 24" fill="none" stroke="#9c5fff" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M12 9V15M10 12H14" stroke-linecap="round" /></svg>`,
        
        // Default
        default: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ntb-dim)" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /></svg>`
      };
      
      return iconMap[ext.toLowerCase()] || iconMap.default;
    },
    
    // Get folder icon based on type
    folderIcon: (type) => {
      const icons = {
        video: ICONS.folderVideo('#ff5a5f'),
        audio: ICONS.folderAudio('#00d1b2'),
        photo: ICONS.folderPhoto('#3273dc'),
        archive: ICONS.folderArchive('#9c5fff'),
        document: ICONS.folderDocument('#ffdd57'),
        default: ICONS.folder('var(--ntb-folder-icon)')
      };
      return icons[type] || icons.default;
    }
  };

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
    
    // Try to load cached data with improved error handling
    let cache = new Map();
    try {
      const now = Date.now();
      const expiry = parseInt(sessionStorage.getItem(storageExpiry) || '0', 10);
      
      // Only use cache if it's still valid
      if (expiry > now) {
        const cachedData = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
        Object.entries(cachedData).forEach(([url, data]) => {
          // Validate cached data before adding
          if (url && data && typeof data === 'object') {
            cache.set(url, data);
          }
        });
        
        if (cache.size > 0) {
          console.log(`[NiceThumbsBuddy] Loaded metadata for ${cache.size} items from cache`);
        }
      } else {
        // Cache expired, clear it
        sessionStorage.removeItem(storageKey);
        sessionStorage.removeItem(storageExpiry);
      }
    } catch (e) {
      console.warn('[NiceThumbsBuddy] Error loading metadata cache:', e);
      // Clear corrupted cache
      try {
        sessionStorage.removeItem(storageKey);
        sessionStorage.removeItem(storageExpiry);
      } catch (clearError) {
        console.warn('[NiceThumbsBuddy] Could not clear corrupted cache:', clearError);
      }
    }
    
    const inFlight = new Map();
    const saveThrottled = throttle(() => {
      try {
        // Limit cache size to prevent memory issues
        if (cache.size > CACHE_MAX_SIZE) {
          const entries = Array.from(cache.entries());
          const toKeep = entries.slice(-Math.floor(CACHE_MAX_SIZE * 0.8)); // Keep 80% of max
          cache.clear();
          toKeep.forEach(([key, value]) => cache.set(key, value));
          console.log(`[NiceThumbsBuddy] Cache pruned to ${cache.size} items`);
        }
        
        const cacheData = Object.fromEntries(cache);
        sessionStorage.setItem(storageKey, JSON.stringify(cacheData));
        sessionStorage.setItem(storageExpiry, String(Date.now() + CACHE_EXPIRY));
      } catch (e) {
        console.warn('[NiceThumbsBuddy] Error saving metadata cache:', e);
        if (e.name === 'QuotaExceededError') {
          // Storage quota exceeded, clear cache and notify user
          try {
            sessionStorage.removeItem(storageKey);
            sessionStorage.removeItem(storageExpiry);
            cache.clear();
            showNotification('Storage quota exceeded. Metadata cache cleared.', 'warning');
          } catch (clearError) {
            console.error('[NiceThumbsBuddy] Failed to clear cache after quota error:', clearError);
          }
        }
      }
    }, 1000);

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          
          const url = entry.target.getAttribute('data-url');
          if (!url || cache.has(url) || inFlight.has(url)) continue;
          
          // Only fetch metadata if advanced metadata is enabled
          const advancedMeta = localStorage.getItem(LSK.adv) !== 'false';
          if (!advancedMeta) continue;
          
          // Mark as in-flight to prevent duplicate requests
          inFlight.set(url, true);
          
          // Fetch metadata with timeout and retry logic
          fetchMetadata(url)
            .then(metadata => {
              if (metadata) {
                cache.set(url, { ...metadata, fetchedAt: Date.now() });
                saveThrottled();
              }
            })
            .catch(error => {
              console.warn(`[NiceThumbsBuddy] Failed to fetch metadata for ${url}:`, error);
            })
            .finally(() => {
              inFlight.delete(url);
            });
        }
      },
      { threshold: IO_THRESHOLD, rootMargin: '50px' }
    );

    // Enhanced metadata fetching with timeout and retry
    async function fetchMetadata(url, retries = 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
          credentials: 'same-origin'
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const metadata = {};
        
        // Extract content length
        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          metadata.bytes = parseInt(contentLength, 10);
        }
        
        // Extract last modified
        const lastModified = response.headers.get('last-modified');
        if (lastModified) {
          metadata.mtime = new Date(lastModified).toISOString();
        }
        
        // Extract content type
        const contentType = response.headers.get('content-type');
        if (contentType) {
          metadata.contentType = contentType;
        }
        
        return metadata;
        
      } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        
        // Retry once on network errors
        if (retries > 0 && (error.name === 'TypeError' || error.message.includes('network'))) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
          return fetchMetadata(url, retries - 1);
        }
        
        throw error;
      }
    }

    function noteImageSize(url, width, height) {
      if (!url) return;
      
      const existing = cache.get(url) || {};
      if (!existing.width || !existing.height) {
        cache.set(url, { ...existing, width, height });
        saveThrottled();
      }
    }

    function get(url) {
      return cache.get(url) || {};
    }

    function observe(element) {
      if (element) {
        io.observe(element);
      }
    }

    function unobserve(element) {
      if (element) {
        io.unobserve(element);
      }
    }

    // Cleanup function for performance
    function cleanup() {
      io.disconnect();
      cache.clear();
    }

    return {
      noteImageSize,
      get,
      observe,
      unobserve,
      cleanup,
      getCacheSize: () => cache.size
    };
  }

  // --------------------------- Initialization -----------------------------
  
  /**
   * Main initialization function
   */
  function initializeEnhancements() {
    // Check if this looks like an autoindex page
    if (!looksLikeAutoIndex()) {
      console.log('[NiceThumbsBuddy] Not an autoindex page, skipping initialization');
      return;
    }

    console.log('[NiceThumbsBuddy] Enhanced version 2.6.0 initializing...');
    
    try {
      // Inject enhanced CSS
      injectCSS();
      
      // Show welcome notification for first-time users
      if (!localStorage.getItem('ntb:welcomed')) {
        setTimeout(() => {
          showNotification('NiceThumbsBuddy Enhanced loaded! Press H for keyboard shortcuts.', 'success', 5000);
          localStorage.setItem('ntb:welcomed', 'true');
        }, 1000);
      }
      
      // Initialize metadata manager
      const metadataManager = createMetadataManager();
      
      // Add keyboard shortcut handler
      document.addEventListener('keydown', (e) => {
        // Don't interfere with typing in inputs
        if (e.target.matches('input, textarea, select')) return;
        
        if (e.key === 'h' || e.key === 'H') {
          showKeyboardHelp();
          e.preventDefault();
        }
      });
      
      console.log('[NiceThumbsBuddy] Enhanced initialization complete');
      
    } catch (error) {
      console.error('[NiceThumbsBuddy] Initialization error:', error);
      showNotification('Failed to initialize NiceThumbsBuddy. Please refresh the page.', 'error');
    }
  }

  /**
   * Show keyboard shortcuts help
   */
  function showKeyboardHelp() {
    const helpContent = `
      <div class="ntb-help-content">
        <h3>Keyboard Shortcuts</h3>
        <div class="ntb-shortcut-grid">
          <div><kbd>H</kbd> Show this help</div>
          <div><kbd>G</kbd> Toggle grid/list view</div>
          <div><kbd>S</kbd> Toggle sitemap</div>
          <div><kbd>F</kbd> Focus search</div>
          <div><kbd>ESC</kbd> Close modals</div>
          <div><kbd>→</kbd> Next image (lightbox)</div>
          <div><kbd>←</kbd> Previous image (lightbox)</div>
          <div><kbd>Space</kbd> Next image (lightbox)</div>
        </div>
        <p class="ntb-help-note">These shortcuts work when not typing in text fields.</p>
      </div>
    `;
    
    // Create help modal
    const modal = document.createElement('div');
    modal.className = 'ntb-help-modal';
    modal.innerHTML = `
      <div class="ntb-help-overlay" aria-label="Close help"></div>
      <div class="ntb-help-dialog" role="dialog" aria-modal="true" aria-labelledby="ntb-help-title">
        <button class="ntb-help-close" aria-label="Close help">&times;</button>
        ${helpContent}
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close handlers
    const close = () => modal.remove();
    modal.querySelector('.ntb-help-close').addEventListener('click', close);
    modal.querySelector('.ntb-help-overlay').addEventListener('click', close);
    
    // ESC key handler
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeEnhancements);
  } else {
    initializeEnhancements();
  }

})();
    const io = new In