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
