// llmsdottxt Popup Script

// Markdown worker for background parsing
let markdownWorker = null;

function getMarkdownWorker() {
  if (!markdownWorker) {
    markdownWorker = new Worker('markdown-worker.js');
  }
  return markdownWorker;
}

// HTML escape helper
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Extract YAML frontmatter from content
function extractFrontmatter(content) {
  if (!content) return { frontmatter: null, body: content };

  const trimmed = content.trimStart();

  // Check if content starts with frontmatter delimiter
  if (!trimmed.startsWith('---')) {
    return { frontmatter: null, body: content };
  }

  // Find the closing delimiter
  const endIndex = trimmed.indexOf('\n---', 3);
  if (endIndex === -1) {
    // No closing delimiter - treat entire content as body
    return { frontmatter: null, body: content };
  }

  // Extract frontmatter (including the --- delimiters for display)
  const frontmatter = trimmed.slice(0, endIndex + 4).trim();

  // Extract body (everything after closing ---)
  const body = trimmed.slice(endIndex + 4).trim();

  return { frontmatter, body };
}

document.addEventListener('DOMContentLoaded', init);

// Keyboard shortcut for copy
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    const currentUrl = document.getElementById('current-url');
    if (currentUrl && currentUrl.href && currentUrl.href !== '#' && !currentUrl.href.endsWith('#')) {
      e.preventDefault();
      copyToClipboard(currentUrl.href, document.getElementById('copy-current-btn'));
    }
  }
});

let currentTabId = null;
let currentLlmsUrl = null;
let currentRawContent = null;

async function init() {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;

  // Setup settings button
  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Setup copy button
  document.getElementById('copy-current-btn').addEventListener('click', () => {
    const url = document.getElementById('current-url').href;
    if (url && url !== '#') {
      copyToClipboard(url, document.getElementById('copy-current-btn'));
    }
  });

  // Setup reader button
  document.getElementById('open-reader-btn').addEventListener('click', () => {
    if (currentLlmsUrl) {
      const readerUrl = chrome.runtime.getURL('popup/reader.html') +
        `?url=${encodeURIComponent(currentLlmsUrl)}&tabId=${currentTabId}`;
      chrome.tabs.create({ url: readerUrl });
    }
  });

  // Setup copy content button
  document.getElementById('copy-content-btn').addEventListener('click', () => {
    if (currentRawContent) {
      copyToClipboard(currentRawContent, document.getElementById('copy-content-btn'));
    }
  });

  // Load data
  await loadTabData(tab.id);
  await loadHistory();
}

async function loadTabData(tabId) {
  const data = await chrome.runtime.sendMessage({ type: 'getTabData', tabId });
  const settings = await chrome.runtime.sendMessage({ type: 'getSettings' });

  const foundState = document.getElementById('found-state');
  const notFoundState = document.getElementById('not-found-state');
  const statusBadge = document.getElementById('status-badge');
  const currentUrl = document.getElementById('current-url');
  const contentPreview = document.getElementById('content-preview');

  if (data.found) {
    foundState.classList.remove('hidden');
    notFoundState.classList.add('hidden');
    statusBadge.classList.remove('hidden');

    currentUrl.href = data.url;
    currentUrl.textContent = data.url;
    currentLlmsUrl = data.url;
    currentRawContent = data.content;

    // Strip frontmatter and show raw content immediately
    const { body } = extractFrontmatter(data.content);
    const content = body || data.content;

    // Show raw content first (instant)
    contentPreview.innerHTML = `<pre>${escapeHtml(content)}</pre>`;

    // Parse markdown in background worker (if enabled)
    if (settings.renderMarkdown) {
      try {
        const worker = getMarkdownWorker();
        const requestId = Date.now();

        worker.onmessage = function(e) {
          if (e.data.id === requestId) {
            if (e.data.html) {
              contentPreview.innerHTML = e.data.html;
            }
            // If error, keep the raw pre content
          }
        };

        worker.postMessage({ content, id: requestId });
      } catch (e) {
        console.error('Worker error:', e);
        // Keep raw content on error
      }
    }
  } else {
    foundState.classList.add('hidden');
    notFoundState.classList.remove('hidden');
    statusBadge.classList.add('hidden');
  }
}

async function loadHistory() {
  const history = await chrome.runtime.sendMessage({ type: 'getHistory' });

  const historyList = document.getElementById('history-list');
  const noHistory = document.getElementById('no-history');
  const historyCount = document.getElementById('history-count');

  historyCount.textContent = history.length;

  if (history.length === 0) {
    historyList.classList.add('hidden');
    noHistory.classList.remove('hidden');
    return;
  }

  historyList.classList.remove('hidden');
  noHistory.classList.add('hidden');

  historyList.innerHTML = '';

  history.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'history-item';

    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.textContent = item.url;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.title = 'Copy URL';
    copyBtn.innerHTML = `
      <svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
      <svg class="check-icon hidden" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
    `;
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(item.url, copyBtn);
    });

    row.appendChild(link);
    row.appendChild(copyBtn);
    historyList.appendChild(row);
  });
}

function copyToClipboard(text, button) {
  navigator.clipboard.writeText(text).then(() => {
    // Show success state
    button.classList.add('copied');
    const copyIcon = button.querySelector('.copy-icon');
    const checkIcon = button.querySelector('.check-icon');

    if (copyIcon) copyIcon.classList.add('hidden');
    if (checkIcon) checkIcon.classList.remove('hidden');

    // Reset after 2 seconds
    setTimeout(() => {
      button.classList.remove('copied');
      if (copyIcon) copyIcon.classList.remove('hidden');
      if (checkIcon) checkIcon.classList.add('hidden');
    }, 2000);
  });
}
