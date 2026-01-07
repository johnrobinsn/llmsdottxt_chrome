// llmsdottxt Service Worker
// Handles llms.txt detection, icon state, and storage

const DEFAULTS = {
  historyCount: 5,
  renderMarkdown: true,
  showFrontmatter: true
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

// Get domain from URL
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// Remove a URL from history
async function removeFromHistory(llmsTxtUrl) {
  const { history = [] } = await chrome.storage.local.get('history');
  const filtered = history.filter(h => h.url !== llmsTxtUrl);
  if (filtered.length !== history.length) {
    await chrome.storage.local.set({ history: filtered });
  }
}

// Clear tab session data
async function clearTabData(tabId) {
  await chrome.storage.session.remove(`tab_${tabId}`);
}

// Check for llms.txt at the current path
async function checkForLlmsTxt(tabId, pageUrl) {
  console.log('checkForLlmsTxt called:', tabId, pageUrl);

  if (!isHttpUrl(pageUrl)) {
    console.log('Not HTTP URL, checking history');
    // Non-HTTP page - just update icon based on history
    await updateIconForTab(tabId, pageUrl);
    return;
  }

  const llmsTxtUrl = getLlmsTxtUrl(pageUrl);
  console.log('Checking for:', llmsTxtUrl);
  if (!llmsTxtUrl) return;

  try {
    const response = await fetch(llmsTxtUrl, {
      method: 'GET',
      headers: { 'Accept': 'text/plain' }
    });

    console.log('Fetch response:', response.status, response.headers.get('content-type'));

    if (response.ok) {
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const isHtml = contentType.includes('text/html') || contentType.includes('application/xhtml');

      if (isHtml) {
        // Explicitly HTML - remove any bad history entry and mark as not found
        await removeFromHistory(llmsTxtUrl);
        await clearTabData(tabId);
        setStaticIcon(tabId);
        setStaticIcon(tabId);
        return;
      }

      const content = await response.text();

      // Content sniffing - reject if content looks like HTML
      const trimmedContent = content.trim();
      if (trimmedContent.startsWith('<!') ||
          trimmedContent.toLowerCase().startsWith('<html') ||
          trimmedContent.toLowerCase().startsWith('<?xml')) {
        await removeFromHistory(llmsTxtUrl);
        await clearTabData(tabId);
        setStaticIcon(tabId);
        setStaticIcon(tabId);
        return;
      }

      // Valid llms.txt - save URL and raw content (markdown parsed in popup)
      console.log('Valid llms.txt found!', llmsTxtUrl);
      await saveLlmsTxtUrl(tabId, llmsTxtUrl, pageUrl, content);
      return;
    }
  } catch (err) {
    console.log('Fetch error:', err.message);
  }

  // No llms.txt found at current path - check history for domain
  console.log('No llms.txt at current path, checking history');
  await updateIconForTab(tabId, pageUrl);
}

// Save llms.txt URL and raw content (markdown parsed later in popup)
async function saveLlmsTxtUrl(tabId, llmsTxtUrl, pageUrl, content) {
  const domain = getDomain(pageUrl);
  const settings = await getSettings();

  // Get current history
  const { history = [] } = await chrome.storage.local.get('history');

  // Remove existing entry for this URL if present
  const filteredHistory = history.filter(h => h.url !== llmsTxtUrl);

  // Add new entry at the beginning
  filteredHistory.unshift({
    url: llmsTxtUrl,
    domain: domain,
    content: content
  });

  // Keep only the configured number of entries
  const trimmedHistory = filteredHistory.slice(0, settings.historyCount);

  await chrome.storage.local.set({ history: trimmedHistory });

  // Store current llms.txt for this tab
  await chrome.storage.session.set({
    [`tab_${tabId}`]: {
      url: llmsTxtUrl,
      domain: domain,
      content: content
    }
  });

  // Set found icon
  setFoundIcon(tabId);
}

// Update icon based on current tab state
async function updateIconForTab(tabId, pageUrl) {
  const domain = getDomain(pageUrl);

  // Check if we have a current llms.txt for this tab
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
        domain: domain,
        content: domainEntry.content
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
    showFrontmatter: settings.showFrontmatter ?? DEFAULTS.showFrontmatter
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
      domain: tabData.domain
    };
  }

  return { found: false };
}
