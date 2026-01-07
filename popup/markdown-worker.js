// Markdown parsing web worker
importScripts('marked.min.js');

self.onmessage = function(e) {
  const { content, id } = e.data;

  try {
    const html = marked.parse(content);
    self.postMessage({ id, html, error: null });
  } catch (err) {
    self.postMessage({ id, html: null, error: err.message });
  }
};
