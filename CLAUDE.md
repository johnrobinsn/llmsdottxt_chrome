# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

llmsdottxt is a Chrome extension (Manifest V3) that detects `llms.txt` files on websites and provides quick access to their content. The extension checks for llms.txt at the current path of any visited page and notifies users via icon color changes and a popup panel.

## Commands

```bash
# Build icons from SVG sources (generates PNG files in icons/)
npm run build

# Run all Playwright tests (requires headed mode for extensions)
npm test

# Run E2E tests only
npm run test:e2e

# Run tests with coverage
npm run test:coverage
```

## Architecture

### Extension Components

- **Service Worker** (`background/service-worker.js`): Core detection logic. Listens for tab updates/activations, fetches llms.txt files, manages storage, and controls icon state. Communicates with popup via `chrome.runtime.onMessage`.

- **Popup** (`popup/popup.js`, `popup.html`): Main UI shown when clicking the extension icon. Displays current llms.txt URL/content and history. Uses a Web Worker for markdown parsing to keep UI responsive.

- **Reader** (`popup/reader.js`, `reader.html`): Full-page view for reading llms.txt content. Opened from the popup.

- **Options** (`options/options.js`, `options.html`): Settings page for configuring history count, markdown rendering, and frontmatter display.

- **Markdown Worker** (`popup/markdown-worker.js`): Background Web Worker that parses markdown using marked.js to avoid blocking the main thread.

### Storage

- **`chrome.storage.local`**: Persists history (array of {url, domain, content}) and settings across sessions
- **`chrome.storage.session`**: Stores current tab data (tab_${tabId}) for fast access, cleared when tab closes

### Icon States

- **Static (grey)**: No llms.txt found for current domain
- **Found (colored)**: llms.txt detected at current path or exists in history for this domain

Icons are SVG sources in `icons/` converted to PNG via `scripts/build-icons.js` using Sharp.

## Testing

Tests use Playwright with Chrome extension support. Extensions require headed mode (`headless: false`). Tests intercept `**/llms.txt` requests to serve mock content from `tests/fixtures/mock-llms.txt`.

Key test pattern for extension testing:
```javascript
const context = await chromium.launchPersistentContext('', {
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
});
```

## Detection Logic

1. On page load, check if URL is HTTP(S)
2. Construct llms.txt URL at current path directory (e.g., `/docs/api/guide.html` → `/docs/api/llms.txt`)
3. Fetch and validate: reject if response is HTML (by content-type header or content sniffing)
4. Valid llms.txt is saved to history and session storage; icon updates to "found" state
5. If no llms.txt at current path, check history for any entry matching current domain
