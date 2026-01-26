/**
 * Snap-to-Grid Demo Recording Script
 *
 * This script is designed to be executed via Playwright MCP's browser_run_code tool,
 * which uses the MCP's --save-video configuration for reliable video recording.
 *
 * Usage with Claude Code / Playwright MCP:
 *   1. Navigate to the editor: mcp__playwright__browser_navigate({ url: "http://localhost:5174/editor?view=editor" })
 *   2. Wait for load: mcp__playwright__browser_wait_for({ time: 2 })
 *   3. Execute this script: mcp__playwright__browser_run_code({ code: <contents of getSnapDemoCode()> })
 *   4. Close browser to save video: mcp__playwright__browser_close()
 *   5. Convert video to GIF (see convertToGif below)
 *
 * The script performs:
 *   - Moves panel A1 to the right (misaligns it)
 *   - Pauses to show misaligned state
 *   - Slowly drags A1 back toward A2's column
 *   - Shows snap guide appearing
 *   - Releases to demonstrate snap
 *   - Pauses to show final aligned state
 */

// Helper function for smooth eased movement
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// The main demo code to be executed via browser_run_code
// Copy this entire function body as the 'code' parameter
const SNAP_DEMO_CODE = `
async (page) => {
  // Helper for eased movement
  const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  // Get panel positions
  const getCenter = async (selector) => {
    const box = await page.locator(selector).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  const a1 = await getCenter('[data-testid="editor-panel-A1"]');
  const a2 = await getCenter('[data-testid="editor-panel-A2"]');

  // Smooth drag helper
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

  // === RECORDING SEQUENCE ===

  // Initial pause to show starting state
  await page.waitForTimeout(600);

  // PHASE 1: Move A1 to the right (misalign it)
  await smoothDrag(a1.x, a1.y, a1.x + 80, a1.y, 15, 25);

  // Pause to show misaligned state
  await page.waitForTimeout(800);

  // PHASE 2: Get new position and drag back with snap
  const a1Moved = await getCenter('[data-testid="editor-panel-A1"]');
  await smoothDrag(a1Moved.x, a1Moved.y, a2.x, a1.y, 35, 30, 1000);

  // Final pause to show snapped state
  await page.waitForTimeout(1000);

  return { success: true, a1Start: a1, a2Target: a2 };
}
`;

// Export for use in other scripts or documentation
module.exports = {
  SNAP_DEMO_CODE,

  // FFmpeg command to convert video to GIF
  convertToGif: (inputVideo, outputGif, options = {}) => {
    const { width = 640, fps = 15 } = options;
    return `ffmpeg -y -i "${inputVideo}" \\
  -vf "fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \\
  -loop 0 \\
  "${outputGif}"`;
  },

  // Full workflow instructions
  workflow: `
# Snap-to-Grid Demo Recording Workflow

## 1. Start recording (navigate to editor)
mcp__playwright__browser_navigate({ url: "http://localhost:5174/editor?view=editor" })

## 2. Wait for page load
mcp__playwright__browser_wait_for({ time: 2 })

## 3. Dismiss draft if present (check snapshot first)
mcp__playwright__browser_click({ ref: "...", element: "Discard button" })
# Then reload: mcp__playwright__browser_navigate({ url: "http://localhost:5174/editor?view=editor" })

## 4. Execute the demo sequence (paste SNAP_DEMO_CODE as the code parameter)
mcp__playwright__browser_run_code({ code: "..." })

## 5. Close browser to save video
mcp__playwright__browser_close()

## 6. Find the video and convert to GIF
ls -t .playwright-mcp/recordings/videos/*.webm | head -1
ffmpeg -y -i <video_file> -vf "fps=15,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 docs/images/snap-to-grid-demo.gif
`
};

// If run directly, just print the code for copy-paste
if (require.main === module) {
  console.log('=== SNAP DEMO CODE (copy for browser_run_code) ===\n');
  console.log(SNAP_DEMO_CODE);
  console.log('\n=== WORKFLOW ===');
  console.log(module.exports.workflow);
}
