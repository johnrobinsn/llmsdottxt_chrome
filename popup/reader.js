// LLMs.txt Reader

// Extract YAML frontmatter from content
function extractFrontmatter(content) {
  if (!content) return { frontmatter: null, body: content };

  const trimmed = content.trimStart();

  if (!trimmed.startsWith('---')) {
    return { frontmatter: null, body: content };
  }

  const endIndex = trimmed.indexOf('\n---', 3);
  if (endIndex === -1) {
    return { frontmatter: null, body: content };
  }

  // Extract frontmatter content (between the --- delimiters)
  const frontmatter = trimmed.slice(0, endIndex + 4).trim();
  const body = trimmed.slice(endIndex + 4).trim();
  return { frontmatter, body };
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get('url');
  const tabId = params.get('tabId');

  const urlLink = document.getElementById('llms-url');
  const contentEl = document.getElementById('content');

  if (!url) {
    contentEl.innerHTML = '<div class="loading">No URL provided</div>';
    return;
  }

  urlLink.href = url;
  urlLink.textContent = url;

  // Get settings
  let showFrontmatter = true;
  let renderMarkdown = true;
  try {
    const settings = await chrome.runtime.sendMessage({ type: 'getSettings' });
    showFrontmatter = settings.showFrontmatter;
    renderMarkdown = settings.renderMarkdown;
  } catch (e) {
    console.log('Could not get settings:', e);
  }

  // Try to get cached content from background if we have tabId
  let content = null;

  if (tabId) {
    try {
      const data = await chrome.runtime.sendMessage({ type: 'getTabData', tabId: parseInt(tabId) });
      if (data.found && data.content) {
        content = data.content;
      }
    } catch (e) {
      console.log('Could not get cached content:', e);
    }
  }

  // If no cached content, fetch fresh
  if (!content) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        content = await response.text();
      } else {
        contentEl.innerHTML = '<div class="loading">Failed to load content</div>';
        return;
      }
    } catch (e) {
      contentEl.innerHTML = '<div class="loading">Failed to fetch: ' + e.message + '</div>';
      return;
    }
  }

  // Extract frontmatter
  const { frontmatter, body } = extractFrontmatter(content);
  const displayContent = body || content;

  // Build raw content HTML (show immediately)
  let rawHtml = '';
  if (frontmatter && showFrontmatter) {
    rawHtml += `<div class="frontmatter"><pre>${escapeHtml(frontmatter)}</pre></div>`;
  }
  rawHtml += `<pre>${escapeHtml(displayContent)}</pre>`;
  contentEl.innerHTML = rawHtml;

  // Parse markdown in background using web worker (if enabled)
  if (renderMarkdown) {
    try {
      const worker = new Worker('markdown-worker.js');
      const requestId = Date.now();

      worker.onmessage = function(e) {
        if (e.data.id === requestId && e.data.html) {
          let html = '';
          if (frontmatter && showFrontmatter) {
            html += `<div class="frontmatter"><pre>${escapeHtml(frontmatter)}</pre></div>`;
          }
          html += e.data.html;
          contentEl.innerHTML = html;
        }
        worker.terminate();
      };

      worker.onerror = function(e) {
        console.error('Worker error:', e);
        worker.terminate();
        // Keep raw content on error
      };

      worker.postMessage({ content: displayContent, id: requestId });
    } catch (e) {
      console.error('Markdown parse error:', e);
      // Keep raw content on error
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);
