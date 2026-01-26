# Record GIF Supplement - Solar Tigo Viewer

This supplement extends the global `record-gif` skill with project-specific patterns for this repository.

## Element Selection Patterns

### Panel Elements (Layout Editor)

Panels in the editor have `data-testid` attributes:

```javascript
// Positioned panels on the canvas
'[data-testid="editor-panel-A1"]'  // Panel by display label
'[data-testid="editor-panel-B2"]'

// Unpositioned panels in sidebar
'[data-testid="unpositioned-panel-A1"]'
```

### Getting Element Positions

```javascript
const getCenter = async (selector) => {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`Element not found: ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

// Usage
const a1 = await getCenter('[data-testid="editor-panel-A1"]');
```

### UI Elements

| Element | Selector |
|---------|----------|
| Layout View tab | `button:has-text("Layout View")` |
| Table View tab | `button:has-text("Table View")` |
| Layout Editor tab | `button:has-text("Layout Editor")` |
| Snap toggle | `button:has-text("Snap")` |
| Save button | `button:has-text("Save")` |
| Discard button | `button:has-text("Discard")` |
| Size slider | `[aria-label="Drag to adjust panel size"]` |
| Display mode toggles | `button:has-text("Watts")`, `button:has-text("Volts")`, etc. |

## Smooth Animation Helper

For professional-looking drag demonstrations:

```javascript
// Eased movement helper
const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// Smooth drag with easing
const smoothDrag = async (page, fromX, fromY, toX, toY, steps = 20, stepDelay = 30, pauseAtEnd = 0) => {
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
```

## Demo Script Template

Use this template for new demo scripts:

```javascript
// docs/gif-scripts/my-demo.js
const MY_DEMO_CODE = `
async (page) => {
  // === HELPERS ===
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

  // Initial pause to establish context
  await page.waitForTimeout(600);

  // Your demo actions here...
  // Example: click a button
  // await page.click('button:has-text("Settings")');

  // Example: drag an element
  // const elem = await getCenter('[data-testid="editor-panel-A1"]');
  // await smoothDrag(elem.x, elem.y, elem.x + 100, elem.y, 20, 30, 500);

  // Final pause to show result
  await page.waitForTimeout(1000);

  return { success: true };
}
`;

module.exports = { MY_DEMO_CODE };
`;
```

## Recording Workflow

### 1. Navigate and Setup

```
mcp__playwright__browser_navigate({ url: "http://localhost:5174/editor?view=editor" })
mcp__playwright__browser_wait_for({ time: 2 })
```

### 2. Handle Draft Banner (if present)

Check snapshot for draft banner, click Discard if present, then reload:
```
mcp__playwright__browser_click({ ref: "...", element: "Discard button" })
mcp__playwright__browser_navigate({ url: "http://localhost:5174/editor?view=editor" })
```

### 3. Execute Demo Script

```
mcp__playwright__browser_run_code({ code: DEMO_CODE })
```

### 4. Close and Convert

```
mcp__playwright__browser_close()
```

Then find and convert the video:
```bash
# Find most recent video
VIDEO=$(ls -t .playwright-mcp/recordings/videos/*.webm | head -1)

# Get duration
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO")

# Trim to last N seconds (where N is your demo length + buffer)
START=$(echo "$DURATION - 10" | bc)

# Convert to GIF
ffmpeg -y -ss $START -i "$VIDEO" \
  -vf "fps=15,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  -loop 0 \
  "docs/images/my-demo.gif"
```

## Available Demo Scripts

| Script | Purpose | Output |
|--------|---------|--------|
| `snap-to-grid-demo.js` | Panel drag with alignment snap | `docs/images/snap-to-grid-demo.gif` |

## Timing Guidelines

| Action Type | Recommended Duration |
|-------------|---------------------|
| Initial pause (establish context) | 500-800ms |
| After click (show result) | 300-500ms |
| Drag operation | 15-35 steps × 25-30ms |
| Pause at drag end (show snap) | 500-1000ms |
| Final pause (show result) | 800-1200ms |
| Total demo | 5-10 seconds ideal |

## Troubleshooting

### Element Not Found

If `boundingBox()` returns null:
1. Check the element exists in snapshot (`mcp__playwright__browser_snapshot`)
2. Verify the `data-testid` attribute is correct
3. Try using `browser_evaluate` for DOM traversal as fallback

### Video Too Long

The MCP records from session start. Always trim to the relevant portion:
- Calculate: `start_time = total_duration - (demo_length + 2s buffer)`
- Use `ffmpeg -ss $start_time` to trim

### Animation Choppy

- Increase steps in `smoothDrag` (more granular movement)
- Decrease step delay (faster updates)
- Use 15 FPS for GIF output (balance of smoothness and file size)
