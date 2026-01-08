# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

llmsdottxt is a Chrome extension (Manifest V3) that detects `llms.txt` files on websites and provides quick access to copy URLs or view content. The extension checks for llms.txt at the current path directory on every page load.

## Commands

```bash
# Install dependencies
npm install

# Build icons from SVG sources (required before loading extension)
npm run build

# Run all tests (requires headed Chromium)
npm test

# Run e2e tests only
npm run test:e2e
```

## Loading the Extension

1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the project root

## Architecture

### Service Worker (`background/service-worker.js`)
Central orchestrator that:
- Listens for tab updates/activations via Chrome tabs API
- Fetches and validates llms.txt files (checks content-type, sniffs for HTML)
- Manages icon state per tab (found vs static icons)
- Uses `chrome.storage.session` for per-tab data and `chrome.storage.local` for history/settings
- Handles all message passing from popup/options pages

### Popup (`popup/`)
- `popup.js` - Main popup logic, communicates with service worker via `chrome.runtime.sendMessage`
- `markdown-worker.js` - Web worker that uses marked.js to parse markdown off the main thread
- `reader.js` - Full-page reader view, reuses markdown worker for rendering

### Options (`options/`)
Settings page for history count, markdown rendering toggle, and frontmatter display.

### Key Data Flow
1. Page loads → service worker's `tabs.onUpdated` fires
2. `checkForLlmsTxt()` constructs URL from current path, fetches, validates
3. Valid llms.txt → stored in session storage (`tab_${tabId}`) and history
4. Popup opens → sends `getTabData` message → service worker responds with cached content
5. Popup renders raw content immediately, then processes markdown in worker

### Storage Structure
- `chrome.storage.session`: `tab_${tabId}` → `{url, domain, content}`
- `chrome.storage.local`: `history` array, `settings` object

## Testing

Tests use Playwright with a real Chromium instance (headed mode required for extensions). Tests mock llms.txt responses via `page.route()`.

```bash
# Run specific test file
npx playwright test tests/e2e/extension.spec.js

# Run with UI
npx playwright test --ui
```

## Icon Generation

Icons are generated from SVG sources in `icons/` directory. Two variants exist:
- `icon.svg` - Default gray icon
- `icon-found.svg` - Red icon when llms.txt detected

Run `npm run build` after modifying SVG files to regenerate PNGs.
