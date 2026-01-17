import { test, expect } from '@playwright/test';

test.describe('Solar Panel Viewer', () => {
  test.describe('Core Functionality', () => {
    test('application loads and displays layout image', async ({ page }) => {
      await page.goto('/');

      // Wait for image to load
      const img = page.locator('img[alt="Solar panel layout"]');
      await expect(img).toBeVisible();
      await page.waitForFunction(() => {
        const img = document.querySelector('img[alt="Solar panel layout"]');
        return img?.complete && img?.naturalWidth > 0;
      });
    });

    test('displays mode toggle button', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('[data-testid="mode-toggle"]')).toBeVisible();
    });

    test('toggle button shows "Show Voltage" initially (watts is default)', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('[data-testid="mode-toggle"]')).toContainText('Show Voltage');
    });
  });

  test.describe('Panel Positioning', () => {
    test('panels render after image loads', async ({ page }) => {
      await page.goto('/');

      // Wait for image to load
      await page.locator('img[alt="Solar panel layout"]').waitFor();
      await page.waitForFunction(() => {
        const img = document.querySelector('img[alt="Solar panel layout"]');
        return img?.complete && img?.naturalWidth > 0;
      });

      // Verify panels rendered (should be 69 panels)
      const panels = await page.locator('[data-testid^="panel-"]').count();
      expect(panels).toBe(69);
    });

    test('panel centers stay within image bounds', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid^="panel-"]').first().waitFor();

      const imgBox = await page.locator('img[alt="Solar panel layout"]').boundingBox();
      if (!imgBox) {
        throw new Error('Layout image not visible - cannot verify panel bounds');
      }

      const panels = await page.locator('[data-testid^="panel-"]').all();

      for (const panel of panels) {
        const panelBox = await panel.boundingBox();
        if (!panelBox) {
          continue; // Skip panels that might not be visible
        }
        // Check panel CENTER is within image bounds
        const panelCenterX = panelBox.x + panelBox.width / 2;
        const panelCenterY = panelBox.y + panelBox.height / 2;
        expect(panelCenterX).toBeGreaterThanOrEqual(imgBox.x);
        expect(panelCenterY).toBeGreaterThanOrEqual(imgBox.y);
        expect(panelCenterX).toBeLessThanOrEqual(imgBox.x + imgBox.width);
        expect(panelCenterY).toBeLessThanOrEqual(imgBox.y + imgBox.height);
      }
    });
  });

  test.describe('Mode Toggle', () => {
    test('toggle switches between watts and voltage', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid^="panel-"]').first().waitFor();

      // Get panel A1 for verification
      const panelA1 = page.locator('[data-testid="panel-A1"]');

      // Verify initial state (watts mode is default per FR-4.5)
      await expect(panelA1).toContainText('W');

      // Click toggle
      await page.locator('[data-testid="mode-toggle"]').click();

      // Verify voltage mode
      await expect(panelA1).toContainText('V');
      await expect(page.locator('[data-testid="mode-toggle"]')).toContainText('Show Watts');

      // Toggle back
      await page.locator('[data-testid="mode-toggle"]').click();
      await expect(panelA1).toContainText('W');
      await expect(page.locator('[data-testid="mode-toggle"]')).toContainText('Show Voltage');
    });
  });

  test.describe('Responsive Layout', () => {
    const viewports = [
      { name: 'mobile', width: 375, height: 812 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1280, height: 720 },
    ];

    for (const vp of viewports) {
      test(`renders correctly at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
        // Set viewport before navigation
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('/');

        // Wait for image load
        await page.waitForFunction(() => {
          const img = document.querySelector('img[alt="Solar panel layout"]');
          return img?.complete && img?.naturalWidth > 0;
        });
        await page.locator('[data-testid^="panel-"]').first().waitFor();

        // No horizontal scroll
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth).toBeLessThanOrEqual(vp.width);
      });
    }
  });

  test.describe('Error States', () => {
    test('displays error when image fails to load', async ({ page }) => {
      // Intercept image request and abort
      await page.route('**/layout.png', route => route.abort());
      await page.goto('/');

      // Error message should display
      await expect(page.locator('[data-testid="image-error"]')).toBeVisible();
      await expect(page.locator('text=Failed to load layout image')).toBeVisible();
      await expect(page.locator('[data-testid="image-retry-button"]')).toBeVisible();
    });

    test('retry button attempts to reload image', async ({ page }) => {
      let requestCount = 0;

      // First request fails, second succeeds
      await page.route('**/layout.png', async (route) => {
        requestCount++;
        if (requestCount === 1) {
          await route.abort();
        } else {
          await route.continue();
        }
      });

      await page.goto('/');

      // Wait for error state
      await expect(page.locator('[data-testid="image-error"]')).toBeVisible();

      // Click retry
      await page.locator('[data-testid="image-retry-button"]').click();

      // Image should now load
      await expect(page.locator('img[alt="Solar panel layout"]')).toBeVisible();
      expect(requestCount).toBe(2);
    });
  });

  test.describe('Connection Status', () => {
    test('shows connecting overlay initially', async ({ page }) => {
      // Block WebSocket to see connecting state
      await page.route('**/ws/panels', route => {
        // Don't fulfill - just hang
        return new Promise(() => {});
      });

      await page.goto('/');
      await expect(page.locator('[data-testid="connecting-overlay"]')).toBeVisible();
    });
  });

  test.describe('Visual Regression', () => {
    const viewports = [
      { name: 'mobile', width: 375, height: 812 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1280, height: 720 },
    ];

    for (const vp of viewports) {
      test(`visual snapshot at ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('/');

        await page.waitForFunction(() => {
          const img = document.querySelector('img[alt="Solar panel layout"]');
          return img?.complete && img?.naturalWidth > 0;
        });
        await page.locator('[data-testid^="panel-"]').first().waitFor();

        // Wait for any animations to settle
        await page.waitForTimeout(500);

        await expect(page).toHaveScreenshot(`layout-${vp.name}.png`, {
          maxDiffPixelRatio: 0.05,
        });
      });
    }
  });

  test.describe('Accessibility', () => {
    test('toggle button is keyboard accessible', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="mode-toggle"]').waitFor();

      // Tab to the toggle button
      await page.keyboard.press('Tab');
      await expect(page.locator('[data-testid="mode-toggle"]')).toBeFocused();

      // Activate with Enter key
      await page.keyboard.press('Enter');
      await expect(page.locator('[data-testid="mode-toggle"]')).toContainText('Show Watts');
    });

    test('all panel overlays have readable text content', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid^="panel-"]').first().waitFor();

      const panels = await page.locator('[data-testid^="panel-"]').all();

      for (const panel of panels) {
        const text = await panel.textContent();
        expect(text).toBeTruthy();
        expect(text!.length).toBeGreaterThan(0);
      }
    });
  });
});
