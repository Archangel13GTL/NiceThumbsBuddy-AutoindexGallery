
// Entry point
if (looksLikeAutoIndex(document)) {
  const data = parseIndex(document, location.href);
  injectCSS();
  renderGallery(data);
}
