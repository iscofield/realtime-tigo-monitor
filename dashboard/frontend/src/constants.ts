// Layout image dimensions (from assets/layout.png) — used as fallback
export const LAYOUT_WIDTH = 1526;
export const LAYOUT_HEIGHT = 2131;

// Default canvas dimensions for blank backgrounds (landscape 3:2)
export const BLANK_CANVAS_WIDTH = 1200;
export const BLANK_CANVAS_HEIGHT = 800;

// Zoom configuration
export const MIN_ZOOM = 0.25;  // 25%
export const MAX_ZOOM = 2.0;   // 200%
export const ZOOM_STEP = 0.25; // 25 percentage points

// Content padding for pan clearance around UI overlays
// At 0.25x zoom: 37.5px visual padding, at 2x zoom: 300px
export const CONTENT_PADDING = 150;

// UI measurements (measured from current implementation)
export const HEADER_HEIGHT = 50;           // Sticky header with ModeToggle
export const TAB_HEIGHT_DESKTOP = 48;      // Desktop tab navigation
export const TAB_HEIGHT_MOBILE = 56;       // Mobile bottom tab bar
export const VIEWPORT_PADDING = 16;        // Padding on all sides
export const SCROLLBAR_WIDTH = 17;         // Standard scrollbar width (Windows/Linux)
// Note: macOS uses overlay scrollbars (0px width) by default. This constant
// may over-compensate on Mac, resulting in slightly conservative fit zoom.

// Mobile breakpoint (matches useMediaQuery)
export const MOBILE_BREAKPOINT = 767;

// Wheel zoom input handling
export const WHEEL_DELTA_PER_STEP = 100;  // Pixels of scroll delta per zoom step
export const WHEEL_DEBOUNCE_MS = 16;       // ~1 frame at 60fps, allows smooth trackpad zoom

// Pinch gesture handling
export const PINCH_THRESHOLD_PX = 10;  // Min distance change before treating as pinch vs pan
