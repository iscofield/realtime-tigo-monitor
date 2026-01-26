# GIF Recording Scripts

This directory contains scripts for generating documentation GIFs using the `record-gif` skill.

## Script Formats

### JS Scripts (Recommended)

JS scripts are executed via Playwright MCP's `browser_run_code` tool. They support:
- Batched execution (no delays between commands)
- Complex logic (loops, conditionals, eased animations)
- Direct access to page locators and mouse control

**Example usage:**
```
mcp__playwright__browser_run_code({ code: SNAP_DEMO_CODE })
```

### YAML Scripts (Aspirational)

YAML scripts are declarative specifications that would need a runner to translate into Playwright commands. They're more readable but currently not directly executable.

## Available Scripts

| Script | Format | Description | Output |
|--------|--------|-------------|--------|
| `snap-to-grid-demo.js` | JS | Panel drag with snap-to-grid alignment | `docs/images/snap-to-grid-demo.gif` |
| `panel-drag-demo.yaml` | YAML | Layout editor panel dragging (template) | `docs/images/panel-drag-demo.gif` |
| `setup-wizard.yaml` | YAML | Setup wizard flow (template) | `docs/images/setup-wizard-demo.gif` |
| `zoom-pan-demo.yaml` | YAML | Zoom/pan interactions (template) | `docs/images/zoom-pan-demo.gif` |
| `table-view-demo.yaml` | YAML | Table view features (template) | `docs/images/table-view-demo.gif` |

## Recording Workflow

### 1. Navigate to starting page
```
mcp__playwright__browser_navigate({ url: "http://localhost:5174/editor?view=editor" })
mcp__playwright__browser_wait_for({ time: 2 })
```

### 2. Handle any UI state (e.g., dismiss draft banner if present)

### 3. Execute the demo script
```javascript
// Read the script and execute
mcp__playwright__browser_run_code({ code: SNAP_DEMO_CODE })
```

### 4. Close browser to save video
```
mcp__playwright__browser_close()
```

### 5. Find and convert video to GIF
```bash
# Find most recent video
VIDEO=$(ls -t .playwright-mcp/recordings/videos/*.webm | head -1)

# Get duration and trim to last N seconds
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO")
START=$(echo "$DURATION - 10" | bc)

# Convert to GIF
ffmpeg -y -ss $START -i "$VIDEO" \
  -vf "fps=15,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  -loop 0 \
  "docs/images/output.gif"
```

## Prerequisites

1. **Dashboard running**: `cd dashboard && docker compose up -d`
2. **FFmpeg installed**: `brew install ffmpeg`
3. **Playwright MCP with video**: Configured with `--save-video=800x600`

## Creating New Scripts

See `docs/record-gif-supplement.md` for:
- Element selection patterns specific to this project
- Smooth animation helper functions
- Template for new demo scripts
- Timing guidelines

## JS Script Template

```javascript
const MY_DEMO_CODE = `
async (page) => {
  const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  const getCenter = async (selector) => {
    const box = await page.locator(selector).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

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

  // === DEMO SEQUENCE ===
  await page.waitForTimeout(600);

  // Your demo actions here...

  await page.waitForTimeout(1000);
  return { success: true };
}
`;

module.exports = { MY_DEMO_CODE };
```
