// llmsdottxt Options Script

const DEFAULTS = {
  historyCount: 5,
  renderMarkdown: true,
  showFrontmatter: true
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Load current settings
  const settings = await chrome.runtime.sendMessage({ type: 'getSettings' });

  document.getElementById('history-count').value = settings.historyCount;
  document.getElementById('render-markdown').checked = settings.renderMarkdown;
  document.getElementById('show-frontmatter').checked = settings.showFrontmatter;

  // Setup save button
  document.getElementById('save-btn').addEventListener('click', saveSettings);

  // Setup clear history button
  document.getElementById('clear-history-btn').addEventListener('click', clearHistory);
}

async function saveSettings() {
  const historyCount = parseInt(document.getElementById('history-count').value, 10);
  const renderMarkdown = document.getElementById('render-markdown').checked;
  const showFrontmatter = document.getElementById('show-frontmatter').checked;

  // Validate
  const settings = {
    historyCount: Math.max(1, Math.min(50, historyCount || DEFAULTS.historyCount)),
    renderMarkdown: renderMarkdown,
    showFrontmatter: showFrontmatter
  };

  // Update input values to validated values
  document.getElementById('history-count').value = settings.historyCount;

  // Save
  await chrome.runtime.sendMessage({ type: 'saveSettings', settings });

  // Show success message
  const status = document.getElementById('save-status');
  status.classList.remove('hidden');
  setTimeout(() => {
    status.classList.add('hidden');
  }, 2000);
}

async function clearHistory() {
  await chrome.runtime.sendMessage({ type: 'clearHistory' });

  // Show success message
  const status = document.getElementById('clear-status');
  status.classList.remove('hidden');
  setTimeout(() => {
    status.classList.add('hidden');
  }, 2000);
}
