import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Settings Menu', () => {
  test.describe('Menu Display', () => {
    test('settings button is visible on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/');

      await expect(page.locator('[data-testid="settings-menu-button"]')).toBeVisible();
    });

    test('settings button is hidden on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto('/');

      // Wait for page to load
      await page.locator('[data-testid="mode-toggle"]').waitFor();

      // Settings menu should not be visible on mobile
      await expect(page.locator('[data-testid="settings-menu-button"]')).not.toBeVisible();
    });

    test('clicking settings button opens dropdown menu', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="settings-menu-button"]').click();

      await expect(page.locator('[data-testid="settings-dropdown"]')).toBeVisible();
      await expect(page.locator('[data-testid="settings-menu-backup"]')).toBeVisible();
      await expect(page.locator('[data-testid="settings-menu-restore"]')).toBeVisible();
      await expect(page.locator('[data-testid="settings-menu-wizard"]')).toBeVisible();
    });

    test('clicking outside dropdown closes it', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="settings-menu-button"]').click();
      await expect(page.locator('[data-testid="settings-dropdown"]')).toBeVisible();

      // Click outside the menu
      await page.locator('main').click({ position: { x: 100, y: 100 } });

      await expect(page.locator('[data-testid="settings-dropdown"]')).not.toBeVisible();
    });

    test('pressing Escape closes dropdown', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="settings-menu-button"]').click();
      await expect(page.locator('[data-testid="settings-dropdown"]')).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(page.locator('[data-testid="settings-dropdown"]')).not.toBeVisible();
    });
  });

  test.describe('Factory Reset Flow', () => {
    test('clicking Re-run Setup Wizard opens confirmation modal', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-wizard"]').click();

      await expect(page.locator('[data-testid="reset-confirm-dialog"]')).toBeVisible();
      await expect(page.locator('text=Factory Reset?')).toBeVisible();
      await expect(page.locator('[data-testid="reset-cancel-button"]')).toBeVisible();
      await expect(page.locator('[data-testid="reset-confirm-button"]')).toBeVisible();
    });

    test('reset confirmation modal is properly centered', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/');
      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-wizard"]').click();

      const dialog = page.locator('[data-testid="reset-confirm-dialog"]');
      await expect(dialog).toBeVisible();

      const dialogBox = await dialog.boundingBox();
      expect(dialogBox).not.toBeNull();

      // Dialog should be roughly centered horizontally (within 100px)
      const viewportWidth = 1280;
      const dialogCenterX = dialogBox!.x + dialogBox!.width / 2;
      const viewportCenterX = viewportWidth / 2;
      expect(Math.abs(dialogCenterX - viewportCenterX)).toBeLessThan(100);

      // Dialog should be in upper half of viewport (centered vertically)
      const viewportHeight = 720;
      const dialogCenterY = dialogBox!.y + dialogBox!.height / 2;
      const viewportCenterY = viewportHeight / 2;
      expect(Math.abs(dialogCenterY - viewportCenterY)).toBeLessThan(200);
    });

    test('reset confirmation modal shows warning about data loss', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-wizard"]').click();

      await expect(page.locator('[data-testid="reset-confirm-dialog"]')).toBeVisible();
      await expect(page.locator('text=All MQTT connection settings')).toBeVisible();
      await expect(page.locator('text=CCA/system topology configuration')).toBeVisible();
      await expect(page.locator('text=Panel positions and mappings')).toBeVisible();
      await expect(page.locator('text=Layout image')).toBeVisible();
      await expect(page.locator('text=Recommendation')).toBeVisible();
    });

    test('cancel button closes reset modal without action', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-wizard"]').click();

      await expect(page.locator('[data-testid="reset-confirm-dialog"]')).toBeVisible();
      await page.locator('[data-testid="reset-cancel-button"]').click();

      await expect(page.locator('[data-testid="reset-confirm-dialog"]')).not.toBeVisible();
      // Should still be on dashboard
      await expect(page.locator('[data-testid="mode-toggle"]')).toBeVisible();
    });

    test('pressing Escape closes reset modal', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-wizard"]').click();

      await expect(page.locator('[data-testid="reset-confirm-dialog"]')).toBeVisible();
      await page.keyboard.press('Escape');

      await expect(page.locator('[data-testid="reset-confirm-dialog"]')).not.toBeVisible();
    });

    test('clicking overlay closes reset modal', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-wizard"]').click();

      await expect(page.locator('[data-testid="reset-confirm-dialog"]')).toBeVisible();

      // Click on overlay (outside dialog)
      await page.locator('[data-testid="reset-confirm-overlay"]').click({ position: { x: 10, y: 10 } });

      await expect(page.locator('[data-testid="reset-confirm-dialog"]')).not.toBeVisible();
    });

    test('confirming reset navigates to setup wizard', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-wizard"]').click();

      await expect(page.locator('[data-testid="reset-confirm-dialog"]')).toBeVisible();
      await page.locator('[data-testid="reset-confirm-button"]').click();

      // Should navigate to wizard
      await expect(page.locator('text=Realtime Tigo Monitor Setup')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=Welcome to Solar Dashboard Setup')).toBeVisible();
    });

    test('reset button shows loading state while processing', async ({ page }) => {
      // Slow down the API to see loading state
      await page.route('**/api/config/reset*', async (route) => {
        await new Promise(resolve => setTimeout(resolve, 500));
        await route.fulfill({ status: 200, json: { success: true, deleted: {} } });
      });

      await page.goto('/');
      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-wizard"]').click();

      await expect(page.locator('[data-testid="reset-confirm-dialog"]')).toBeVisible();
      await page.locator('[data-testid="reset-confirm-button"]').click();

      // Button should show loading text
      await expect(page.locator('[data-testid="reset-confirm-button"]')).toContainText('Resetting...');
    });
  });

  test.describe('Backup Configuration', () => {
    test('clicking Backup Configuration triggers download', async ({ page }) => {
      await page.goto('/');

      // Setup download listener before clicking
      const downloadPromise = page.waitForEvent('download');

      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-backup"]').click();

      const download = await downloadPromise;

      // Verify download filename pattern
      expect(download.suggestedFilename()).toMatch(/solar-dashboard-backup-.*\.zip/);
    });

    test('backup download contains expected file', async ({ page }) => {
      await page.goto('/');

      const downloadPromise = page.waitForEvent('download');

      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-backup"]').click();

      const download = await downloadPromise;

      // Save and verify the backup file exists
      const downloadPath = await download.path();
      expect(downloadPath).not.toBeNull();
      expect(fs.existsSync(downloadPath!)).toBe(true);

      // Verify it's a valid ZIP file (starts with PK)
      const buffer = fs.readFileSync(downloadPath!);
      expect(buffer[0]).toBe(0x50); // 'P'
      expect(buffer[1]).toBe(0x4b); // 'K'
    });

    test('menu closes after backup is initiated', async ({ page }) => {
      await page.goto('/');

      await page.locator('[data-testid="settings-menu-button"]').click();
      await expect(page.locator('[data-testid="settings-dropdown"]')).toBeVisible();

      // Don't wait for download, just click
      await page.locator('[data-testid="settings-menu-backup"]').click();

      // Menu should close immediately
      await expect(page.locator('[data-testid="settings-dropdown"]')).not.toBeVisible();
    });
  });

  test.describe('Restore Configuration', () => {
    // Helper to create a mock backup file
    const createMockBackup = async (page: any): Promise<string> => {
      // First, create a real backup by triggering the backup function
      const downloadPromise = page.waitForEvent('download');

      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-backup"]').click();

      const download = await downloadPromise;
      const downloadPath = await download.path();
      return downloadPath!;
    };

    test('clicking Restore Configuration opens file picker', async ({ page }) => {
      await page.goto('/');

      // Listen for file chooser
      const fileChooserPromise = page.waitForEvent('filechooser');

      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-restore"]').click();

      const fileChooser = await fileChooserPromise;
      expect(fileChooser.isMultiple()).toBe(false);
    });

    test('restore shows confirmation modal with backup details', async ({ page }) => {
      await page.goto('/');

      // Create a backup first
      const backupPath = await createMockBackup(page);

      // Now restore it
      const fileChooserPromise = page.waitForEvent('filechooser');

      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-restore"]').click();

      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(backupPath);

      // Should show restore confirmation dialog
      await expect(page.locator('[data-testid="restore-confirm-dialog"]')).toBeVisible();
      await expect(page.locator('text=Restore Configuration?')).toBeVisible();
      await expect(page.locator('[data-testid="restore-panel-count"]')).toBeVisible();
    });

    test('restore confirmation modal is properly centered', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/');

      const backupPath = await createMockBackup(page);

      const fileChooserPromise = page.waitForEvent('filechooser');

      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-restore"]').click();

      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(backupPath);

      const dialog = page.locator('[data-testid="restore-confirm-dialog"]');
      await expect(dialog).toBeVisible();

      const dialogBox = await dialog.boundingBox();
      expect(dialogBox).not.toBeNull();

      // Dialog should be roughly centered horizontally
      const viewportWidth = 1280;
      const dialogCenterX = dialogBox!.x + dialogBox!.width / 2;
      const viewportCenterX = viewportWidth / 2;
      expect(Math.abs(dialogCenterX - viewportCenterX)).toBeLessThan(100);
    });

    test('cancel button closes restore modal', async ({ page }) => {
      await page.goto('/');

      const backupPath = await createMockBackup(page);

      const fileChooserPromise = page.waitForEvent('filechooser');

      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-restore"]').click();

      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(backupPath);

      await expect(page.locator('[data-testid="restore-confirm-dialog"]')).toBeVisible();
      await page.locator('[data-testid="restore-cancel-button"]').click();

      await expect(page.locator('[data-testid="restore-confirm-dialog"]')).not.toBeVisible();
      // Should still be on dashboard
      await expect(page.locator('[data-testid="mode-toggle"]')).toBeVisible();
    });

    test('confirming restore navigates to setup wizard', async ({ page }) => {
      await page.goto('/');

      const backupPath = await createMockBackup(page);

      const fileChooserPromise = page.waitForEvent('filechooser');

      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-restore"]').click();

      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(backupPath);

      await expect(page.locator('[data-testid="restore-confirm-dialog"]')).toBeVisible();
      await page.locator('[data-testid="restore-confirm-button"]').click();

      // Should navigate to wizard with restore flow
      await expect(page.locator('text=Realtime Tigo Monitor Setup')).toBeVisible({ timeout: 10000 });
    });

    test('pressing Escape closes restore modal', async ({ page }) => {
      await page.goto('/');

      const backupPath = await createMockBackup(page);

      const fileChooserPromise = page.waitForEvent('filechooser');

      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-restore"]').click();

      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(backupPath);

      await expect(page.locator('[data-testid="restore-confirm-dialog"]')).toBeVisible();
      await page.keyboard.press('Escape');

      await expect(page.locator('[data-testid="restore-confirm-dialog"]')).not.toBeVisible();
    });
  });

  test.describe('Visual Regression', () => {
    test('settings dropdown visual snapshot', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/');

      // Wait for page to stabilize
      await page.locator('[data-testid^="panel-"]').first().waitFor();

      await page.locator('[data-testid="settings-menu-button"]').click();
      await expect(page.locator('[data-testid="settings-dropdown"]')).toBeVisible();

      await page.waitForTimeout(200);

      await expect(page).toHaveScreenshot('settings-dropdown.png', {
        maxDiffPixelRatio: 0.05,
      });
    });

    test('factory reset modal visual snapshot', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/');

      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-wizard"]').click();

      await expect(page.locator('[data-testid="reset-confirm-dialog"]')).toBeVisible();
      await page.waitForTimeout(200);

      await expect(page).toHaveScreenshot('factory-reset-modal.png', {
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe('Error Handling', () => {
    test('shows error when backup fails', async ({ page }) => {
      // Mock backup API to fail
      await page.route('**/api/backup/export', (route) => {
        route.fulfill({ status: 500, json: { message: 'Backup failed' } });
      });

      await page.goto('/');
      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-backup"]').click();

      // Error toast should appear
      await expect(page.locator('text=Backup failed')).toBeVisible({ timeout: 5000 });
    });

    test('shows error when reset fails', async ({ page }) => {
      // Mock reset API to fail
      await page.route('**/api/config/reset*', (route) => {
        route.fulfill({ status: 500, json: { message: 'Reset failed: permission denied' } });
      });

      await page.goto('/');
      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-wizard"]').click();

      await expect(page.locator('[data-testid="reset-confirm-dialog"]')).toBeVisible();
      await page.locator('[data-testid="reset-confirm-button"]').click();

      // Error toast should appear
      await expect(page.locator('text=Reset failed')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Accessibility', () => {
    test('settings menu is keyboard accessible', async ({ page }) => {
      await page.goto('/');

      // Tab to settings button
      await page.locator('[data-testid="settings-menu-button"]').focus();
      await expect(page.locator('[data-testid="settings-menu-button"]')).toBeFocused();

      // Enter opens menu
      await page.keyboard.press('Enter');
      await expect(page.locator('[data-testid="settings-dropdown"]')).toBeVisible();
    });

    test('modal traps focus', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-testid="settings-menu-button"]').click();
      await page.locator('[data-testid="settings-menu-wizard"]').click();

      await expect(page.locator('[data-testid="reset-confirm-dialog"]')).toBeVisible();

      // Tab through elements - should stay within modal
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Focus should be on one of the modal buttons
      const cancelFocused = await page.locator('[data-testid="reset-cancel-button"]').evaluate(
        (el) => document.activeElement === el
      );
      const confirmFocused = await page.locator('[data-testid="reset-confirm-button"]').evaluate(
        (el) => document.activeElement === el
      );

      expect(cancelFocused || confirmFocused).toBe(true);
    });

    test('dropdown has proper ARIA attributes', async ({ page }) => {
      await page.goto('/');

      const button = page.locator('[data-testid="settings-menu-button"]');
      await expect(button).toHaveAttribute('aria-haspopup', 'true');
      await expect(button).toHaveAttribute('aria-expanded', 'false');

      await button.click();
      await expect(button).toHaveAttribute('aria-expanded', 'true');

      const dropdown = page.locator('[data-testid="settings-dropdown"]');
      await expect(dropdown).toHaveAttribute('role', 'menu');
    });
  });
});
