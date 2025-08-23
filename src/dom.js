
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
