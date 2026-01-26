/**
 * Snap-to-Grid Demo Recording Script
 *
 * Demonstrates dragging a panel from the sidebar to the canvas with snap-to-grid alignment.
 * Shows the complete flow: unpositioned panel → drag to canvas → snap to aligned position.
 *
 * Prerequisites:
 * 1. Dashboard running: cd dashboard && docker compose up -d
 * 2. Navigate to editor: http://localhost:5174/editor?view=editor
 * 3. A1 must be unpositioned (in sidebar). To unplace: click panel to select, press Delete
 *
 * Usage with Claude Code / Playwright MCP:
 *   1. Navigate: mcp__playwright__browser_navigate({ url: "http://localhost:5174/editor?view=editor" })
 *   2. Wait: mcp__playwright__browser_wait_for({ time: 2 })
 *   3. Setup: Click A1 on canvas to select, press Delete to move to sidebar
 *   4. Execute: mcp__playwright__browser_run_code({ code: SNAP_DEMO_CODE })
 *   5. Close: mcp__playwright__browser_close()
 *   6. Convert video to GIF (see workflow below)
 *
 * Output: docs/images/snap-to-grid-demo.gif
 */

const SNAP_DEMO_CODE = `
async (page) => {
  // === HELPERS ===
  const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  const smoothDrag = async (fromX, fromY, toX, toY, steps, stepDelay, pauseAtEnd = 0) => {
    await page.mouse.move(fromX, fromY);
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.waitForTimeout(100);
    for (let i = 1; i <= steps; i++) {
      const progress = easeInOut(i / steps);
      await page.mouse.move(
        fromX + (toX - fromX) * progress,
        fromY + (toY - fromY) * progress
      );
      await page.waitForTimeout(stepDelay);
    }
    if (pauseAtEnd > 0) await page.waitForTimeout(pauseAtEnd);
    await page.mouse.up();
  };

  // === SETUP: Center view on A-row ===
  await page.evaluate(() => {
    const scrollContainer = Array.from(document.querySelectorAll('div')).find(el => {
      const style = getComputedStyle(el);
      return (style.overflow === 'auto' || style.overflowY === 'auto') &&
             el.scrollHeight > el.clientHeight;
    });

    if (scrollContainer) {
      const a2 = document.querySelector('[data-testid="editor-panel-A2"]');
      const a8 = document.querySelector('[data-testid="editor-panel-A8"]');

      if (a2 && a8) {
        const a2Rect = a2.getBoundingClientRect();
        const a8Rect = a8.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();

        // Center on A2-A8 row, leaving room for sidebar
        const aRowCenterX = (a2Rect.left + a8Rect.right) / 2;
        const aRowCenterY = a2Rect.top + a2Rect.height / 2;

        const sidebarWidth = 220;
        const effectiveWidth = containerRect.width - sidebarWidth;
        const effectiveCenterX = containerRect.left + effectiveWidth / 2;
        const containerCenterY = containerRect.top + containerRect.height / 2;

        scrollContainer.scrollTo({
          left: Math.max(0, scrollContainer.scrollLeft + (aRowCenterX - effectiveCenterX)),
          top: Math.max(0, scrollContainer.scrollTop + (aRowCenterY - containerCenterY)),
          behavior: 'instant'
        });
      }
    }
  });

  await page.waitForTimeout(300);

  // === GET POSITIONS AFTER CENTERING ===
  const positions = await page.evaluate(() => {
    const a1Sidebar = document.querySelector('[data-testid="unpositioned-panel-A1"]');
    const a2Panel = document.querySelector('[data-testid="editor-panel-A2"]');

    if (!a1Sidebar) throw new Error('A1 not in sidebar - click A1 on canvas, press Delete first');

    const a1Rect = a1Sidebar.getBoundingClientRect();
    const a2Rect = a2Panel.getBoundingClientRect();

    return {
      a1: { centerX: a1Rect.x + a1Rect.width/2, centerY: a1Rect.y + a1Rect.height/2 },
      a2: { x: a2Rect.x, y: a2Rect.y, centerX: a2Rect.x + a2Rect.width/2, centerY: a2Rect.y + a2Rect.height/2 }
    };
  });

  // === DEMO SEQUENCE ===

  // Initial pause to show starting state (A1 in sidebar)
  await page.waitForTimeout(1000);

  // Calculate target: Above A2 (same X column), slightly off on X to show snap
  // Drop 7px off from A2's X position - within 10px snap threshold, will snap to align
  const targetX = positions.a2.x + 7;
  const targetY = positions.a2.y - 55; // Above A2

  // Drag from sidebar to canvas with smooth eased motion
  await smoothDrag(
    positions.a1.centerX, positions.a1.centerY,
    targetX + 25, targetY + 25,  // +25 to target center of panel
    30, 25, 500  // 30 steps, 25ms each, 500ms pause to show snap
  );

  // Hold to show the snapped result before loop
  await page.waitForTimeout(2000);

  return {
    success: true,
    message: 'Sidebar-to-canvas drag with snap completed'
  };
}
`;

module.exports = {
  SNAP_DEMO_CODE,

  // FFmpeg command to convert video to GIF (trim to last N seconds)
  convertToGif: (inputVideo, outputGif, options = {}) => {
    const { width = 640, fps = 15, trimSeconds = 7 } = options;
    return `
# Get video duration and calculate start time for trim
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputVideo}")
START=$(echo "$DURATION - ${trimSeconds}" | bc)

# Convert trimmed portion to GIF
ffmpeg -y -ss $START -i "${inputVideo}" \\
  -vf "fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \\
  -loop 0 \\
  "${outputGif}"
`;
  },

  // Full workflow
  workflow: `
# Snap-to-Grid Demo Recording Workflow

## 1. Start the dashboard
cd dashboard && docker compose up -d

## 2. Navigate to editor
mcp__playwright__browser_navigate({ url: "http://localhost:5174/editor?view=editor" })
mcp__playwright__browser_wait_for({ time: 2 })

## 3. Unplace A1 (move to sidebar)
# Click A1 to select it (status bar shows "1 panel selected")
mcp__playwright__browser_click({ ref: "<A1-ref>", element: "Panel A1" })
# Press Delete to unplace
mcp__playwright__browser_press_key({ key: "Delete" })

## 4. Execute the demo sequence
mcp__playwright__browser_run_code({ code: SNAP_DEMO_CODE })

## 5. Close browser to save video
mcp__playwright__browser_close()

## 6. Find and convert video
VIDEO=$(ls -t .playwright-mcp/recordings/videos/*.webm | head -1)
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO")
START=$(echo "$DURATION - 7" | bc)

ffmpeg -y -ss $START -i "$VIDEO" \\
  -vf "fps=15,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \\
  -loop 0 \\
  docs/images/snap-to-grid-demo.gif
`
};

// Print code for copy-paste when run directly
if (require.main === module) {
  console.log('=== SNAP DEMO CODE ===\n');
  console.log(SNAP_DEMO_CODE);
  console.log('\n=== WORKFLOW ===');
  console.log(module.exports.workflow);
}
