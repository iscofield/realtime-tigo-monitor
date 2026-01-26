/**
 * Snap-to-Grid Demo Recording Script
 *
 * Demonstrates the snap-to-grid alignment feature in the Layout Editor.
 * Drags a panel slightly off alignment, showing it snap back when released.
 *
 * Prerequisites:
 * 1. Dashboard running: cd dashboard && docker compose up -d
 * 2. Navigate to editor: http://localhost:5174/editor?view=editor
 * 3. Panels should be positioned (restore from test backup if needed)
 *
 * Usage with Claude Code / Playwright MCP:
 *   1. Navigate: mcp__playwright__browser_navigate({ url: "http://localhost:5174/editor?view=editor" })
 *   2. Wait: mcp__playwright__browser_wait_for({ time: 2 })
 *   3. Execute: mcp__playwright__browser_run_code({ code: SNAP_DEMO_CODE })
 *   4. Close: mcp__playwright__browser_close()
 *   5. Convert video to GIF (see workflow below)
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

  // === SETUP: Center view on A-row panels ===
  await page.evaluate(() => {
    const scrollContainer = Array.from(document.querySelectorAll('div')).find(el => {
      const style = getComputedStyle(el);
      return (style.overflow === 'auto' || style.overflowY === 'auto') &&
             el.scrollHeight > el.clientHeight;
    });

    if (scrollContainer) {
      const a1 = document.querySelector('[data-testid="editor-panel-A1"]');
      const a8 = document.querySelector('[data-testid="editor-panel-A8"]');

      if (a1 && a8) {
        const a1Rect = a1.getBoundingClientRect();
        const a8Rect = a8.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();

        const aRowCenterX = (a1Rect.left + a8Rect.right) / 2;
        const aRowCenterY = a1Rect.top + a1Rect.height / 2;

        const effectiveCenterX = containerRect.left + containerRect.width / 2;
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

  // === GET PANEL POSITION (dynamic, works with any scroll state) ===
  const getA1Position = async () => {
    return await page.evaluate(() => {
      const a1 = document.querySelector('[data-testid="editor-panel-A1"]');
      const rect = a1.getBoundingClientRect();
      return { centerX: rect.x + rect.width/2, centerY: rect.y + rect.height/2 };
    });
  };

  const a1Pos = await getA1Position();

  // === DEMO SEQUENCE ===

  // Initial pause to establish context
  await page.waitForTimeout(800);

  // First drag: Move A1 about 8px left (within 10px snap threshold)
  // This shows misalignment during drag, then snap back on release
  await smoothDrag(
    a1Pos.centerX, a1Pos.centerY,
    a1Pos.centerX - 8, a1Pos.centerY + 3,  // 8px left, 3px down
    20, 25, 300
  );

  // Wait to show the snapped result
  await page.waitForTimeout(800);

  // Get updated position after first snap
  const newPos = await getA1Position();

  // Second drag: offset in opposite direction
  await smoothDrag(
    newPos.centerX, newPos.centerY,
    newPos.centerX + 7, newPos.centerY - 5,  // 7px right, 5px up
    18, 28, 400
  );

  // Final pause for loop buffer
  await page.waitForTimeout(2000);

  return { success: true, message: 'Snap-to-grid demo completed' };
}
`;

module.exports = {
  SNAP_DEMO_CODE,

  // FFmpeg command to convert video to GIF (trim to last N seconds)
  convertToGif: (inputVideo, outputGif, options = {}) => {
    const { width = 640, fps = 15, trimSeconds = 8 } = options;
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

## 3. Wait for page load
mcp__playwright__browser_wait_for({ time: 2 })

## 4. Execute the demo sequence
mcp__playwright__browser_run_code({ code: SNAP_DEMO_CODE })

## 5. Close browser to save video
mcp__playwright__browser_close()

## 6. Find and convert video
VIDEO=$(ls -t .playwright-mcp/recordings/videos/*.webm | head -1)
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO")
START=$(echo "$DURATION - 8" | bc)

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
