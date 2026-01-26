# GIF Recording Scripts

This directory contains YAML scripts for generating documentation GIFs using the `record-gif` skill.

## Available Scripts

| Script | Description | Output |
|--------|-------------|--------|
| `panel-drag-demo.yaml` | Layout editor panel dragging with snap-to-grid | `docs/images/panel-drag-demo.gif` |
| `setup-wizard.yaml` | Setup wizard flow through all steps | `docs/images/setup-wizard-demo.gif` |
| `zoom-pan-demo.yaml` | Zoom, pan, and display mode switching | `docs/images/zoom-pan-demo.gif` |
| `table-view-demo.yaml` | Table view with column hiding and scrolling | `docs/images/table-view-demo.gif` |

## Usage

### Via Claude Code Skill

```
Record GIF from script: docs/gif-scripts/panel-drag-demo.yaml
```

Or invoke the skill directly:

```
Use record-gif skill with:
  Script: docs/gif-scripts/panel-drag-demo.yaml
```

### Generate All GIFs

Ask Claude to regenerate all documentation GIFs:

```
Regenerate all documentation GIFs from scripts in docs/gif-scripts/
```

## Prerequisites

1. **Dashboard running**: Scripts assume `docker compose up -d` in `dashboard/`
2. **FFmpeg installed**: `brew install ffmpeg`
3. **Gifski (optional)**: `brew install gifski` for higher quality

## Script Format

```yaml
name: "Demo Name"
description: "What this demo shows"
version: 1

settings:
  output: "path/to/output.gif"
  width: 800
  height: 500
  fps: 15
  quality: high  # high | medium | low

setup:
  - description: "Setup step"
    command: "shell command"
    wait: 5000  # ms to wait after

actions:
  - type: navigate
    url: "http://localhost:5174"

  - type: wait
    duration: 1000

  - type: click
    selector: "[data-testid='button']"
    description: "Click button"

  - type: drag
    from:
      selector: ".source"
      description: "Source element"
    to:
      selector: ".target"
      description: "Target element"
    duration: 800

  - type: evaluate
    script: |
      // JavaScript to run
      window.scrollTo({ top: 500, behavior: 'smooth' });
    description: "Scroll page"
```

## Customizing Scripts

Feel free to adjust:
- **Timing** (`wait` durations) to match animation speeds
- **Selectors** if test IDs change
- **Output paths** for different documentation locations
- **Quality settings** based on file size requirements

## Regenerating After UI Changes

When the UI changes significantly:
1. Update selectors in affected scripts
2. Adjust timing if animations changed
3. Re-run scripts to regenerate GIFs
4. Commit updated GIFs with the UI changes
