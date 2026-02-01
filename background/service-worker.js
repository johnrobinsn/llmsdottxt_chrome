// llmsdottxt Service Worker
// Handles llms.txt and llms-full.txt detection, icon state, and storage

const DEFAULTS = {
  historyCount: 5,
  renderMarkdown: true,
  showFrontmatter: true,
  preferFull: false
};


// Initialize context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'llmsdottxt-settings',
    title: 'Settings...',
    contexts: ['action']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'llmsdottxt-settings') {
    chrome.runtime.openOptionsPage();
  }
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    await checkForLlmsTxt(tabId, tab.url);
  }
});

// Listen for tab activation (switching tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url) {
    await updateIconForTab(activeInfo.tabId, tab.url);
  }
});

// Clean up session data when tab closes
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await chrome.storage.session.remove(`tab_${tabId}`);
});

// Check if URL is a valid HTTP(S) URL
function isHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Get the llms.txt URL for a given page URL
function getLlmsTxtUrl(pageUrl) {
  try {
    const url = new URL(pageUrl);
    const pathParts = url.pathname.split('/');
    pathParts.pop(); // Remove the file/last segment
    const dirPath = pathParts.join('/') || '/';
    return `${url.origin}${dirPath}${dirPath.endsWith('/') ? '' : '/'}llms.txt`;
  } catch {
    return null;
  }
}

// Get the llms-full.txt URL for a given page URL
function getLlmsFullTxtUrl(pageUrl) {
  try {
    const url = new URL(pageUrl);
    const pathParts = url.pathname.split('/');
    pathParts.pop();
    const dirPath = pathParts.join('/') || '/';
    return `${url.origin}${dirPath}${dirPath.endsWith('/') ? '' : '/'}llms-full.txt`;
  } catch {
    return null;
  }
}

// Get domain from URL
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// Fetch and validate an llms file (shared logic for both llms.txt and llms-full.txt)
async function fetchAndValidateLlmsFile(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'text/plain' }
    });

    if (!response.ok) {
      return { found: false };
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const isHtml = contentType.includes('text/html') || contentType.includes('application/xhtml');

    if (isHtml) {
      return { found: false };
    }

    const content = await response.text();
    const trimmedContent = content.trim();

    // Content sniffing - reject if content looks like HTML
    if (trimmedContent.startsWith('<!') ||
        trimmedContent.toLowerCase().startsWith('<html') ||
        trimmedContent.toLowerCase().startsWith('<?xml')) {
      return { found: false };
    }

    return { found: true, content };
  } catch (err) {
    console.log('Fetch error for', url, ':', err.message);
    return { found: false };
  }
}

// Remove URLs from history (handles both url and fullUrl)
async function removeFromHistory(llmsTxtUrl, llmsFullTxtUrl) {
  const { history = [] } = await chrome.storage.local.get('history');
  const filtered = history.filter(h => {
    return h.url !== llmsTxtUrl && h.url !== llmsFullTxtUrl &&
           h.fullUrl !== llmsTxtUrl && h.fullUrl !== llmsFullTxtUrl;
  });
  if (filtered.length !== history.length) {
    await chrome.storage.local.set({ history: filtered });
  }
}

// Clear tab session data
async function clearTabData(tabId) {
  await chrome.storage.session.remove(`tab_${tabId}`);
}

// Check for llms.txt and llms-full.txt at the current path
async function checkForLlmsTxt(tabId, pageUrl) {
  console.log('checkForLlmsTxt called:', tabId, pageUrl);

  if (!isHttpUrl(pageUrl)) {
    console.log('Not HTTP URL, checking history');
    await updateIconForTab(tabId, pageUrl);
    return;
  }

  const llmsTxtUrl = getLlmsTxtUrl(pageUrl);
  const llmsFullTxtUrl = getLlmsFullTxtUrl(pageUrl);
  console.log('Checking for:', llmsTxtUrl, 'and', llmsFullTxtUrl);

  if (!llmsTxtUrl) return;

  // Fetch both files in parallel
  const [llmsResult, fullResult] = await Promise.all([
    fetchAndValidateLlmsFile(llmsTxtUrl),
    fetchAndValidateLlmsFile(llmsFullTxtUrl)
  ]);

  console.log('llms.txt found:', llmsResult.found, 'llms-full.txt found:', fullResult.found);

  if (llmsResult.found || fullResult.found) {
    await saveLlmsTxtData(tabId, pageUrl, {
      url: llmsResult.found ? llmsTxtUrl : null,
      content: llmsResult.found ? llmsResult.content : null,
      fullUrl: fullResult.found ? llmsFullTxtUrl : null,
      fullContent: fullResult.found ? fullResult.content : null
    });
    return;
  }

  // Neither found - check history for domain
  console.log('No llms.txt or llms-full.txt at current path, checking history');
  await updateIconForTab(tabId, pageUrl);
}

// Save llms.txt data (handles both files)
async function saveLlmsTxtData(tabId, pageUrl, data) {
  const domain = getDomain(pageUrl);
  const settings = await getSettings();

  // Get current history
  const { history = [] } = await chrome.storage.local.get('history');

  // Remove existing entry for this URL combination if present
  const filteredHistory = history.filter(h => {
    return h.url !== data.url && h.url !== data.fullUrl &&
           h.fullUrl !== data.url && h.fullUrl !== data.fullUrl &&
           h.domain !== domain;
  });

  // Create new history entry
  const historyEntry = {
    url: data.url,
    fullUrl: data.fullUrl,
    domain: domain,
    content: data.content,
    fullContent: data.fullContent
  };

  // Add new entry at the beginning
  filteredHistory.unshift(historyEntry);

  // Keep only the configured number of entries
  const trimmedHistory = filteredHistory.slice(0, settings.historyCount);

  await chrome.storage.local.set({ history: trimmedHistory });

  // Store current data for this tab
  await chrome.storage.session.set({
    [`tab_${tabId}`]: {
      url: data.url,
      fullUrl: data.fullUrl,
      domain: domain,
      content: data.content,
      fullContent: data.fullContent
    }
  });

  // Set found icon
  setFoundIcon(tabId);
}

// Update icon based on current tab state
async function updateIconForTab(tabId, pageUrl) {
  const domain = getDomain(pageUrl);

  // Check if we have current data for this tab
  const sessionData = await chrome.storage.session.get(`tab_${tabId}`);
  const tabData = sessionData[`tab_${tabId}`];

  if (tabData && tabData.domain === domain) {
    setFoundIcon(tabId);
    return;
  }

  // Check history for this domain
  const { history = [] } = await chrome.storage.local.get('history');
  const domainEntry = history.find(h => h.domain === domain);

  if (domainEntry) {
    // Store this as current for the tab
    await chrome.storage.session.set({
      [`tab_${tabId}`]: {
        url: domainEntry.url,
        fullUrl: domainEntry.fullUrl,
        domain: domain,
        content: domainEntry.content,
        fullContent: domainEntry.fullContent
      }
    });
    setFoundIcon(tabId);
  } else {
    // Clear any stale session data for this tab
    await chrome.storage.session.remove(`tab_${tabId}`);
    setStaticIcon(tabId);
  }
}

// Icon paths
const FOUND_ICON = {
  16: '/icons/icon-found-16.png',
  32: '/icons/icon-found-32.png',
  48: '/icons/icon-found-48.png',
  128: '/icons/icon-found-128.png'
};

const STATIC_ICON = {
  16: '/icons/icon-16.png',
  32: '/icons/icon-32.png',
  48: '/icons/icon-48.png',
  128: '/icons/icon-128.png'
};

// Icon control
function setFoundIcon(tabId) {
  console.log('setFoundIcon called for tab:', tabId);
  chrome.action.setIcon({
    tabId: tabId,
    path: FOUND_ICON
  }).then(() => {
    console.log('Icon set to found for tab:', tabId);
  }).catch((err) => {
    console.error('Failed to set found icon:', err);
  });
}

function setStaticIcon(tabId) {
  console.log('setStaticIcon called for tab:', tabId);
  chrome.action.setIcon({
    tabId: tabId,
    path: STATIC_ICON
  }).then(() => {
    console.log('Icon set to static for tab:', tabId);
  }).catch((err) => {
    console.error('Failed to set static icon:', err);
  });
}

// Get settings with defaults
async function getSettings() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  return {
    historyCount: settings.historyCount ?? DEFAULTS.historyCount,
    renderMarkdown: settings.renderMarkdown ?? DEFAULTS.renderMarkdown,
    showFrontmatter: settings.showFrontmatter ?? DEFAULTS.showFrontmatter,
    preferFull: settings.preferFull ?? DEFAULTS.preferFull
  };
}

// Message handler for popup communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getTabData') {
    handleGetTabData(message.tabId).then(sendResponse);
    return true; // Async response
  }

  if (message.type === 'getHistory') {
    chrome.storage.local.get('history').then(({ history = [] }) => {
      sendResponse(history);
    });
    return true;
  }

  if (message.type === 'getSettings') {
    getSettings().then(sendResponse);
    return true;
  }

  if (message.type === 'saveSettings') {
    chrome.storage.local.set({ settings: message.settings }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'clearHistory') {
    chrome.storage.local.set({ history: [] }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

async function handleGetTabData(tabId) {
  const sessionData = await chrome.storage.session.get(`tab_${tabId}`);
  const tabData = sessionData[`tab_${tabId}`];

  if (tabData) {
    return {
      found: true,
      url: tabData.url,
      content: tabData.content,
      fullUrl: tabData.fullUrl,
      fullContent: tabData.fullContent,
      domain: tabData.domain
    };
  }

  return { found: false };
}
