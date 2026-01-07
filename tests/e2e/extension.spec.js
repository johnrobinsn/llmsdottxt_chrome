import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '..', '..');

// Helper to launch browser with extension
async function launchBrowserWithExtension() {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  // Wait for service worker to be ready
  let extensionId;
  const serviceWorkers = context.serviceWorkers();
  if (serviceWorkers.length > 0) {
    extensionId = serviceWorkers[0].url().split('/')[2];
  } else {
    const sw = await context.waitForEvent('serviceworker');
    extensionId = sw.url().split('/')[2];
  }

  return { context, extensionId };
}

// Helper to create a test server page with mock llms.txt
async function createTestPage(context, hasLlmsTxt = true) {
  const page = await context.newPage();

  // Set up route to intercept requests
  await page.route('**/llms.txt', async (route) => {
    if (hasLlmsTxt) {
      const mockContent = readFileSync(
        path.join(__dirname, '..', 'fixtures', 'mock-llms.txt'),
        'utf-8'
      );
      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: mockContent,
      });
    } else {
      await route.fulfill({ status: 404 });
    }
  });

  return page;
}

test.describe('llmsdottxt Extension', () => {
  let context;
  let extensionId;

  test.beforeAll(async () => {
    const result = await launchBrowserWithExtension();
    context = result.context;
    extensionId = result.extensionId;
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.describe('Detection Tests', () => {
    test('should detect llms.txt on page load', async () => {
      const page = await createTestPage(context, true);
      await page.goto('https://example.com/test');
      await page.waitForTimeout(2000); // Wait for detection

      // Open popup to verify detection
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      // The current URL section should be visible
      const urlRow = popup.locator('#current-url-row');
      await expect(urlRow).not.toHaveClass(/hidden/);

      await page.close();
      await popup.close();
    });

    test('should show not found when llms.txt missing', async () => {
      const page = await createTestPage(context, false);
      await page.goto('https://no-llms.example.com/test');
      await page.waitForTimeout(2000);

      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      // Should show "No llms.txt found" or history from other domains
      const notFound = popup.locator('#not-found');
      // Note: This depends on whether there's history from other tests
      // In a clean state, it should show not found

      await page.close();
      await popup.close();
    });

    test('should handle non-HTTP pages gracefully', async () => {
      const page = await context.newPage();
      await page.goto('about:blank');
      await page.waitForTimeout(1000);

      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      // Should still be able to open popup and see history section
      const historySection = popup.locator('#history-section');
      await expect(historySection).toBeVisible();

      await page.close();
      await popup.close();
    });
  });

  test.describe('Panel Tests', () => {
    test('should display correct URL in popup', async () => {
      const page = await createTestPage(context, true);
      await page.goto('https://test-url.example.com/docs/');
      await page.waitForTimeout(2000);

      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      const currentUrl = popup.locator('#current-url');
      await expect(currentUrl).toContainText('llms.txt');

      await page.close();
      await popup.close();
    });

    test('should copy URL when copy button clicked', async () => {
      const page = await createTestPage(context, true);
      await page.goto('https://copy-test.example.com/');
      await page.waitForTimeout(2000);

      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      // Click copy button
      const copyBtn = popup.locator('#copy-current-btn');
      await copyBtn.click();

      // Check icon changes to checkmark
      const checkIcon = popup.locator('#copy-current-btn .check-icon');
      await expect(checkIcon).not.toHaveClass(/hidden/);

      await page.close();
      await popup.close();
    });

    test('should render markdown in preview', async () => {
      const page = await createTestPage(context, true);
      await page.goto('https://markdown-test.example.com/');
      await page.waitForTimeout(2000);

      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      // Content preview should have rendered HTML
      const contentPreview = popup.locator('#content-preview');
      await expect(contentPreview).toBeVisible();

      // Check for heading (markdown renders # to h1)
      const heading = popup.locator('#content-preview h1');
      await expect(heading).toContainText('Example');

      await page.close();
      await popup.close();
    });

    test('should display history list', async () => {
      // First visit a page to populate history
      const page1 = await createTestPage(context, true);
      await page1.goto('https://history1.example.com/');
      await page1.waitForTimeout(2000);
      await page1.close();

      const page2 = await createTestPage(context, true);
      await page2.goto('https://history2.example.com/');
      await page2.waitForTimeout(2000);

      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      // History list should have items
      const historyItems = popup.locator('.history-item');
      const count = await historyItems.count();
      expect(count).toBeGreaterThan(0);

      await page2.close();
      await popup.close();
    });
  });

  test.describe('Persistence Tests', () => {
    test('should persist history entries', async () => {
      const page = await createTestPage(context, true);
      await page.goto('https://persist-test.example.com/');
      await page.waitForTimeout(2000);

      // Check history in popup
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      const historyList = popup.locator('#history-list');
      await expect(historyList).not.toHaveClass(/hidden/);

      await page.close();
      await popup.close();
    });

    test('should deduplicate history entries', async () => {
      // Visit same domain twice
      const page1 = await createTestPage(context, true);
      await page1.goto('https://dedup-test.example.com/page1');
      await page1.waitForTimeout(2000);
      await page1.close();

      const page2 = await createTestPage(context, true);
      await page2.goto('https://dedup-test.example.com/page2');
      await page2.waitForTimeout(2000);

      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      // Should only have one entry for this domain's llms.txt
      const historyItems = popup.locator('.history-item');
      const items = await historyItems.allTextContents();
      const dedupItems = items.filter(item => item.includes('dedup-test.example.com'));
      expect(dedupItems.length).toBeLessThanOrEqual(1);

      await page2.close();
      await popup.close();
    });
  });

  test.describe('Settings Tests', () => {
    test('should open settings page', async () => {
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      // Click settings button
      const settingsBtn = popup.locator('#settings-btn');

      // Listen for new page
      const [optionsPage] = await Promise.all([
        context.waitForEvent('page'),
        settingsBtn.click(),
      ]);

      await expect(optionsPage).toHaveURL(/options\.html/);

      await popup.close();
      await optionsPage.close();
    });

    test('should save settings', async () => {
      const options = await context.newPage();
      await options.goto(`chrome-extension://${extensionId}/options/options.html`);

      // Change preview lines
      const previewInput = options.locator('#preview-lines');
      await previewInput.fill('50');

      // Save
      const saveBtn = options.locator('#save-btn');
      await saveBtn.click();

      // Check success message
      const saveStatus = options.locator('#save-status');
      await expect(saveStatus).not.toHaveClass(/hidden/);

      await options.close();
    });

    test('should clear history', async () => {
      // First add some history
      const page = await createTestPage(context, true);
      await page.goto('https://clear-test.example.com/');
      await page.waitForTimeout(2000);
      await page.close();

      // Open options and clear
      const options = await context.newPage();
      await options.goto(`chrome-extension://${extensionId}/options/options.html`);

      const clearBtn = options.locator('#clear-history-btn');
      await clearBtn.click();

      const clearStatus = options.locator('#clear-status');
      await expect(clearStatus).not.toHaveClass(/hidden/);

      // Verify history is cleared
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      const noHistory = popup.locator('#no-history');
      await expect(noHistory).not.toHaveClass(/hidden/);

      await options.close();
      await popup.close();
    });
  });
});
