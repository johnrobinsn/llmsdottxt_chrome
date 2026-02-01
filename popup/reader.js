// LLMs.txt Reader - with llms-full.txt support

let llmsRawContent = null;
let llmsFullRawContent = null;

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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function copyToClipboard(text, button) {
  navigator.clipboard.writeText(text).then(() => {
    button.classList.add('copied');
    const copyIcon = button.querySelector('.copy-icon');
    const checkIcon = button.querySelector('.check-icon');
    if (copyIcon) copyIcon.classList.add('hidden');
    if (checkIcon) checkIcon.classList.remove('hidden');
    setTimeout(() => {
      button.classList.remove('copied');
      if (copyIcon) copyIcon.classList.remove('hidden');
      if (checkIcon) checkIcon.classList.add('hidden');
    }, 2000);
  });
}

async function renderContent(content, contentEl, settings) {
  const { frontmatter, body } = extractFrontmatter(content);
  const displayContent = body || content;

  // Show raw content first
  let rawHtml = '';
  if (frontmatter && settings.showFrontmatter) {
    rawHtml += `<div class="frontmatter"><pre>${escapeHtml(frontmatter)}</pre></div>`;
  }
  rawHtml += `<pre>${escapeHtml(displayContent)}</pre>`;
  contentEl.innerHTML = rawHtml;

  // Parse markdown in background
  if (settings.renderMarkdown) {
    try {
      const worker = new Worker('markdown-worker.js');
      const requestId = Date.now();

      worker.onmessage = function(e) {
        if (e.data.id === requestId && e.data.html) {
          let html = '';
          if (frontmatter && settings.showFrontmatter) {
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
      };

      worker.postMessage({ content: displayContent, id: requestId });
    } catch (e) {
      console.error('Markdown parse error:', e);
    }
  }
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get('url');
  const fullUrl = params.get('fullUrl');
  const tabId = params.get('tabId');

  const loadingState = document.getElementById('loading-state');

  // Get settings
  let settings = { showFrontmatter: true, renderMarkdown: true };
  try {
    settings = await chrome.runtime.sendMessage({ type: 'getSettings' });
  } catch (e) {
    console.log('Could not get settings:', e);
  }

  // Get cached data from tab
  let tabData = null;
  if (tabId) {
    try {
      tabData = await chrome.runtime.sendMessage({
        type: 'getTabData',
        tabId: parseInt(tabId)
      });
    } catch (e) {
      console.log('Could not get tab data:', e);
    }
  }

  let hasContent = false;

  // Setup llms.txt section
  if (url) {
    const llmsSection = document.getElementById('llms-section');
    const llmsUrlEl = document.getElementById('llms-url');
    const llmsContentEl = document.getElementById('llms-content');

    llmsUrlEl.href = url;
    llmsUrlEl.textContent = url;

    // Get content from cache or fetch
    let content = tabData?.content;
    if (!content) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          content = await response.text();
        }
      } catch (e) {
        console.log('Failed to fetch llms.txt:', e);
      }
    }

    if (content) {
      llmsRawContent = content;
      llmsSection.classList.remove('hidden');
      hasContent = true;
      await renderContent(content, llmsContentEl, settings);
    }

    // Setup copy buttons
    document.getElementById('copy-llms-url-btn').addEventListener('click', (e) => {
      copyToClipboard(url, e.currentTarget);
    });
    document.getElementById('copy-llms-source-btn').addEventListener('click', (e) => {
      if (llmsRawContent) {
        copyToClipboard(llmsRawContent, e.currentTarget);
      }
    });
  }

  // Setup llms-full.txt section
  if (fullUrl) {
    const fullSection = document.getElementById('llms-full-section');
    const fullUrlEl = document.getElementById('llms-full-url');
    const fullContentEl = document.getElementById('llms-full-content');
    const divider = document.getElementById('file-divider');

    fullUrlEl.href = fullUrl;
    fullUrlEl.textContent = fullUrl;

    // Get content from cache or fetch
    let fullContent = tabData?.fullContent;
    if (!fullContent) {
      try {
        const response = await fetch(fullUrl);
        if (response.ok) {
          fullContent = await response.text();
        }
      } catch (e) {
        console.log('Failed to fetch llms-full.txt:', e);
      }
    }

    if (fullContent) {
      llmsFullRawContent = fullContent;
      fullSection.classList.remove('hidden');
      // Show divider only if both sections are visible
      if (hasContent) {
        divider.classList.remove('hidden');
      }
      hasContent = true;
      await renderContent(fullContent, fullContentEl, settings);
    }

    // Setup copy buttons
    document.getElementById('copy-llms-full-url-btn').addEventListener('click', (e) => {
      copyToClipboard(fullUrl, e.currentTarget);
    });
    document.getElementById('copy-llms-full-source-btn').addEventListener('click', (e) => {
      if (llmsFullRawContent) {
        copyToClipboard(llmsFullRawContent, e.currentTarget);
      }
    });
  }

  // Hide loading state if we have content
  if (hasContent) {
    loadingState.classList.add('hidden');
  } else {
    loadingState.textContent = 'No content available';
  }
}

document.addEventListener('DOMContentLoaded', init);
