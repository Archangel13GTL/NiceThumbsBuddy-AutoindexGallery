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
