# llmsdottxt - Chrome Extension Specification

## Overview

**llmsdottxt** is a Chromium browser extension that detects `llms.txt` files on websites and provides quick access to their content. The extension scans each visited page for the presence of an `llms.txt` file at the current path and notifies users through animated icon feedback and a convenient popup panel.

## Core Functionality

### llms.txt Detection

- **Detection Scope**: Check for `llms.txt` only at the current path level (no path hierarchy walking)
  - Example: Visiting `example.com/docs/api/guide.html` checks only for `example.com/docs/api/llms.txt`
- **Fetch Behavior**: Always fetch fresh content on each page load (no caching)
- **Error Handling**: Silent fail on network errors or missing files (treat as "not found")
- **Non-HTTP URLs**: On `chrome://`, `file://`, `about:`, and extension pages, the extension shows history only (no llms.txt checks attempted)

### State Persistence

- When navigating to a page where no llms.txt exists, but one was previously found on the same domain, show the last found llms.txt for that domain
- History persists across browser sessions using `chrome.storage.local`
- Keep only the last N entries (configurable, default: 5)
- Entries are deduplicated by URL (each URL appears once, most recent visit wins)

## User Interface

### Extension Icon

- **Design**: Text-based "LLM" design
- **Color Scheme**: Monochrome (grey when inactive/not found, colored when active/found)
- **Static State**: Normal icon when no llms.txt exists for the current domain (neither at current path nor in history)
- **Animated State**: Pulsing blue glow animation at 1 frame per second when:
  - An llms.txt is found at the current path, OR
  - An llms.txt for the current domain exists in history
  - Animation consists of 2-3 frames creating a subtle glow effect

### Popup Panel

- **Trigger**: Click on extension icon
- **Fixed Width**: 400px
- **Theme**: Follows system preference (dark/light mode)

#### Panel Layout (Top to Bottom)

1. **Header Area**
   - Gear icon in top-right corner linking to settings page

2. **Current llms.txt Section**
   - URL of the current/last found llms.txt
   - Copy button to the right of the URL (icon changes to checkmark on success)
   - URL is clickable and opens in a new tab

3. **Content Preview**
   - Displays first N lines of the llms.txt file (configurable, default: 40 lines)
   - Rendered as Markdown using marked.js (loaded from CDN)
   - Scrollable container for long content

4. **History Section**
   - Header: "Recent llms.txt files" or similar
   - List of last N unique llms.txt URLs (configurable, default: 5)
   - Each entry shows URL only (no timestamps or metadata)
   - Each URL has a copy button beside it
   - All URLs are clickable and open in new tabs

5. **Empty State**
   - When no llms.txt exists for current domain: Show "No llms.txt found" message
   - History section still displays below (if any global history exists)

6. **Loading Behavior**
   - No loading indicator while fetching llms.txt content
   - Content area remains empty until loaded (consistent with silent fail approach)

### Settings Page

- **Implementation**: Dedicated Chrome options page (`chrome-extension://[id]/options.html`)
- **Access**:
  - Via gear icon in popup panel header
  - Via right-click context menu on extension icon → "Settings..."

#### Configurable Options

| Setting | Default | Description |
|---------|---------|-------------|
| Preview Lines | 40 | Number of lines to show in content preview |
| History Count | 5 | Number of recent llms.txt URLs to remember |

#### Actions

- **Clear History**: Button to remove all stored llms.txt URLs

### Context Menu

Right-click menu on extension icon includes:
- "Settings..." → Opens options page

## Technical Specifications

### Manifest

- **Version**: Manifest V3
- **Permissions Required**:
  - `activeTab` - Access current tab URL
  - `storage` - Persist history and settings
  - `contextMenus` - Right-click menu
  - Host permissions for fetching llms.txt files

### Browser Compatibility

- **Primary**: Google Chrome
- **Also Supported**: Chromium-based browsers (Edge, Brave, Opera)
- **Incognito**: Disabled by default (user must explicitly enable)

### Dependencies

| Library | Source | Purpose |
|---------|--------|---------|
| DaisyUI | CDN | CSS component library |
| marked.js | CDN | Markdown rendering |

**DaisyUI CDN**: Load per https://daisyui.com/docs/cdn/

### Keyboard Shortcuts

- `Ctrl+C` (when panel is open): Copy current llms.txt URL to clipboard

## Icon Assets

Generate SVG icons for:
- **16x16**: Toolbar (small)
- **32x32**: Toolbar (retina)
- **48x48**: Extensions page
- **128x128**: Chrome Web Store

### Animation Frames

For the pulsing glow animation:
- **Frame 1**: Base icon (no glow)
- **Frame 2**: Subtle blue glow
- **Frame 3**: Peak blue glow intensity
- Cycle at 1 frame per second

## File Structure

```
llmsdottxt/
├── manifest.json
├── icons/
│   ├── icon-16.svg
│   ├── icon-32.svg
│   ├── icon-48.svg
│   ├── icon-128.svg
│   ├── icon-16-glow-1.svg
│   ├── icon-16-glow-2.svg
│   ├── icon-32-glow-1.svg
│   ├── icon-32-glow-2.svg
│   └── ... (glow variants for each size)
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/
│   ├── options.html
│   ├── options.js
│   └── options.css
├── background/
│   └── service-worker.js
└── tests/
    ├── e2e/
    │   └── extension.spec.js
    └── fixtures/
        └── mock-llms.txt
```

## Testing Strategy

### Approach

- **Framework**: Playwright with Chrome extension support
- **Coverage Target**: 70%+ (critical paths)

### Test Categories

#### Critical Path Tests

1. **Detection Tests**
   - Verify llms.txt detection on page load
   - Verify icon changes to animated state when found
   - Verify icon stays static when not found
   - Verify behavior on non-HTTP pages

2. **Panel Tests**
   - Verify popup opens on icon click
   - Verify correct URL displayed
   - Verify copy button functionality
   - Verify content preview renders markdown
   - Verify history list displays correctly

3. **Persistence Tests**
   - Verify history survives browser restart
   - Verify settings persist correctly
   - Verify history limit is enforced
   - Verify deduplication works

4. **Settings Tests**
   - Verify settings page opens
   - Verify settings changes apply
   - Verify clear history works

### Test Execution

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run E2E tests only
npm run test:e2e
```

### Headless Testing

- Use Playwright's headless Chrome with extension loaded
- Capture screenshots for visual regression testing
- All tests runnable from command line for CI/CD integration

### Coverage Analysis

- Use `c8` or `nyc` for code coverage
- Generate HTML coverage reports
- Track coverage trends in CI

## Edge Cases & Error Handling

| Scenario | Behavior |
|----------|----------|
| Network timeout | Treat as "not found", no error shown |
| 404 response | Treat as "not found" |
| Non-text response | Treat as "not found" |
| Invalid markdown | Display as plain text fallback |
| Storage quota exceeded | Clear oldest entries first |
| Rapid navigation | No debouncing, check on each navigation |

## Privacy & Security

- **No Analytics**: No telemetry or usage tracking of any kind
- **Local Storage Only**: All data stored locally in browser
- **No External Requests**: Only fetches llms.txt from the current site's domain
- **No PII Collection**: Does not collect or transmit any personal information

## Future Considerations (Out of Scope for v1)

- Export/import history
- llms-full.txt support
- Multiple llms.txt per domain
- Custom icon themes
- Firefox port
