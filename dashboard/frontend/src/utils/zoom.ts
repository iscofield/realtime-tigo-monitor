/**
 * Adjusts scroll position when zooming to keep the center of the view in place.
 * Used for +/- buttons, wheel zoom, and pinch gestures.
 * NOT used for fit-to-screen (which resets to 0,0).
 */
export function adjustScrollForZoom(
  scrollContainer: HTMLElement,
  oldZoom: number,
  newZoom: number
): void {
  const viewport = {
    width: scrollContainer.clientWidth,
    height: scrollContainer.clientHeight,
  };

  // Calculate center point in content coordinates at old zoom
  const centerX = (scrollContainer.scrollLeft + viewport.width / 2) / oldZoom;
  const centerY = (scrollContainer.scrollTop + viewport.height / 2) / oldZoom;

  // Calculate new scroll position to keep same center point
  const newScrollLeft = (centerX * newZoom) - viewport.width / 2;
  const newScrollTop = (centerY * newZoom) - viewport.height / 2;

  // Apply clamped to valid scroll range
  scrollContainer.scrollLeft = Math.max(0, newScrollLeft);
  scrollContainer.scrollTop = Math.max(0, newScrollTop);
}
