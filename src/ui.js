
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
