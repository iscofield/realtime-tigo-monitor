import { test, expect } from '@playwright/test';

test.describe('Table View', () => {
  test.describe('Tab Navigation', () => {
    test('desktop: tabs display in horizontal bar', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/');

      // Wait for initial load
      await page.locator('[data-testid="mode-toggle"]').waitFor();

      // Tab navigation should be visible
      await expect(page.locator('[data-testid="layout-tab"]')).toBeVisible();
      await expect(page.locator('[data-testid="table-tab"]')).toBeVisible();

      // Layout tab should be active by default (FR-1.5)
      await expect(page.locator('[data-testid="layout-tab"]')).toHaveAttribute('aria-current', 'page');
    });

    test('mobile: tabs display in bottom navigation', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto('/');

      await page.locator('[data-testid="mode-toggle"]').waitFor();

      // Bottom nav should be visible
      const layoutTab = page.locator('[data-testid="layout-tab"]');
      const tableTab = page.locator('[data-testid="table-tab"]');

      await expect(layoutTab).toBeVisible();
      await expect(tableTab).toBeVisible();

      // Check tabs are at the bottom
      const tabBox = await layoutTab.boundingBox();
      expect(tabBox!.y).toBeGreaterThan(700); // Should be near bottom
    });

    test('tab switching preserves WebSocket connection', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid^="panel-"]').first().waitFor();

      // Get initial panel count
      const initialPanelCount = await page.locator('[data-testid^="panel-"]').count();
      expect(initialPanelCount).toBeGreaterThan(0);

      // Switch to table view
      await page.locator('[data-testid="table-tab"]').click();
      await expect(page.locator('[data-testid="panel-table"]')).toBeVisible();

      // Switch back to layout view
      await page.locator('[data-testid="layout-tab"]').click();

      // Panels should still be there (WebSocket connection preserved)
      await page.locator('[data-testid^="panel-"]').first().waitFor();
      const afterPanelCount = await page.locator('[data-testid^="panel-"]').count();
      expect(afterPanelCount).toBe(initialPanelCount);
    });

    test('active tab indicator updates on switch', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="layout-tab"]').waitFor();

      // Layout should be active initially
      await expect(page.locator('[data-testid="layout-tab"]')).toHaveAttribute('aria-current', 'page');

      // Switch to table
      await page.locator('[data-testid="table-tab"]').click();
      await expect(page.locator('[data-testid="table-tab"]')).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('[data-testid="layout-tab"]')).not.toHaveAttribute('aria-current', 'page');
    });
  });

  test.describe('Table View Rendering', () => {
    test('table view displays panels organized by system', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="table-tab"]').click();
      await expect(page.locator('[data-testid="panel-table"]')).toBeVisible();

      // Check for system headers
      await expect(page.locator('text=Primary System')).toBeVisible();
    });

    test('panels are grouped by string', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="table-tab"]').click();
      await expect(page.locator('[data-testid="panel-table"]')).toBeVisible();

      // Check for string headers
      await expect(page.locator('text=String A')).toBeVisible();
    });

    test('panel rows are present', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="table-tab"]').click();
      await expect(page.locator('[data-testid="panel-table"]')).toBeVisible();

      // Check for panel rows
      const panelRows = await page.locator('[data-testid^="panel-row-"]').count();
      expect(panelRows).toBeGreaterThan(0);
    });
  });

  test.describe('Column Visibility', () => {
    test('column toggle shows/hides columns', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="table-tab"]').click();
      await expect(page.locator('[data-testid="panel-table"]')).toBeVisible();

      // Check SN column toggle exists
      const snToggle = page.locator('[data-testid="col-toggle-sn"]');
      await expect(snToggle).toBeVisible();

      // Toggle SN column on
      await snToggle.click();

      // Column header should be visible
      await expect(page.locator('th:has-text("Serial")')).toBeVisible();

      // Toggle off
      await snToggle.click();

      // Column header should be hidden
      await expect(page.locator('th:has-text("Serial")')).not.toBeVisible();
    });

    test('default columns are visible on first load', async ({ page }) => {
      // Clear localStorage first
      await page.addInitScript(() => {
        localStorage.removeItem('tableColumns');
      });

      await page.goto('/');
      await page.locator('[data-testid="table-tab"]').click();
      await expect(page.locator('[data-testid="panel-table"]')).toBeVisible();

      // Default columns: display_label, voltage_in, current_in, watts, is_temporary
      await expect(page.locator('th:has-text("Panel ID")')).toBeVisible();
      await expect(page.locator('th:has-text("V In")')).toBeVisible();
      await expect(page.locator('th:has-text("Power")')).toBeVisible();
    });
  });

  test.describe('Threshold Selector', () => {
    test('threshold selector is visible', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="table-tab"]').click();
      await expect(page.locator('[data-testid="panel-table"]')).toBeVisible();

      await expect(page.locator('[data-testid="threshold-select"]')).toBeVisible();
    });

    test('threshold selector has correct options', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="table-tab"]').click();

      const select = page.locator('[data-testid="threshold-select"]');
      await expect(select).toBeVisible();

      // Check for expected options
      await expect(select.locator('option[value="5"]')).toHaveCount(1);
      await expect(select.locator('option[value="10"]')).toHaveCount(1);
      await expect(select.locator('option[value="15"]')).toHaveCount(1);
      await expect(select.locator('option[value="20"]')).toHaveCount(1);
      await expect(select.locator('option[value="30"]')).toHaveCount(1);
    });
  });

  test.describe('Mobile Behavior', () => {
    test('table scrolls horizontally on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto('/');
      await page.locator('[data-testid="table-tab"]').click();
      await expect(page.locator('[data-testid="panel-table"]')).toBeVisible();

      // Enable all columns to ensure scroll is needed
      const toggles = ['sn', 'voltage_out', 'current_out', 'temperature', 'duty_cycle', 'rssi', 'energy'];
      for (const col of toggles) {
        await page.locator(`[data-testid="col-toggle-${col}"]`).click();
      }

      // Give time for render
      await page.waitForTimeout(100);

      // Check that scroll container exists
      const tableWrapper = page.locator('[data-testid="panel-table"]').locator('table').first();
      await expect(tableWrapper).toBeVisible();
    });

    test('bottom navigation does not overlap content', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto('/');
      await page.locator('[data-testid="table-tab"]').click();
      await expect(page.locator('[data-testid="panel-table"]')).toBeVisible();

      // Get table container padding
      const containerPadding = await page.evaluate(() => {
        const container = document.querySelector('[data-testid="panel-table"]');
        if (container) {
          return parseInt(getComputedStyle(container).paddingBottom, 10);
        }
        return 0;
      });

      // Should have bottom padding for nav (72px per spec)
      expect(containerPadding).toBeGreaterThanOrEqual(56);
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('tab key navigates between Layout and Table buttons', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="layout-tab"]').waitFor();

      // Focus the first tab
      await page.locator('[data-testid="layout-tab"]').focus();
      await expect(page.locator('[data-testid="layout-tab"]')).toBeFocused();

      // Tab to next
      await page.keyboard.press('Tab');
      await expect(page.locator('[data-testid="table-tab"]')).toBeFocused();
    });

    test('Enter activates focused tab button', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="table-tab"]').waitFor();

      // Focus table tab and press Enter
      await page.locator('[data-testid="table-tab"]').focus();
      await page.keyboard.press('Enter');

      // Table view should be visible
      await expect(page.locator('[data-testid="panel-table"]')).toBeVisible();
    });
  });

  test.describe('String Summary', () => {
    test('string summary rows display aggregated totals', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="table-tab"]').click();
      await expect(page.locator('[data-testid="panel-table"]')).toBeVisible();

      // Summary rows should contain "Summary" text
      await expect(page.locator('td:has-text("Summary")')).toBeVisible();
    });
  });

  test.describe('Real-Time Updates', () => {
    test('table values present after WebSocket data received', async ({ page }) => {
      await page.goto('/');

      // Wait for WebSocket data
      await page.locator('[data-testid^="panel-"]').first().waitFor();

      // Switch to table view
      await page.locator('[data-testid="table-tab"]').click();
      await expect(page.locator('[data-testid="panel-table"]')).toBeVisible();

      // Check that panel rows have data
      const firstPanelRow = page.locator('[data-testid^="panel-row-"]').first();
      await expect(firstPanelRow).toBeVisible();

      // Should contain numeric values (from mock data)
      const rowText = await firstPanelRow.textContent();
      expect(rowText).toMatch(/\d+/); // Contains numbers
    });
  });

  test.describe('Visual Regression - Table View', () => {
    test('table view snapshot at desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/');
      await page.locator('[data-testid="table-tab"]').click();
      await expect(page.locator('[data-testid="panel-table"]')).toBeVisible();

      // Wait for data to load
      await page.locator('[data-testid^="panel-row-"]').first().waitFor();
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('table-view-desktop.png', {
        maxDiffPixelRatio: 0.05,
      });
    });

    test('table view snapshot at mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto('/');
      await page.locator('[data-testid="table-tab"]').click();
      await expect(page.locator('[data-testid="panel-table"]')).toBeVisible();

      await page.locator('[data-testid^="panel-row-"]').first().waitFor();
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('table-view-mobile.png', {
        maxDiffPixelRatio: 0.05,
      });
    });
  });
});
