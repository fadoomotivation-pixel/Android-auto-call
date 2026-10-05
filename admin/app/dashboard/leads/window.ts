/** Fixed row height for the lead list. Must match `.lead-item` in globals.css. */
export const LEAD_ROW_HEIGHT = 76;

/**
 * Which rows to mount for a scroll position.
 * Only the visible window, plus a small overscan, is in the DOM.
 */
export function windowRange(
  scrollTop: number,
  viewport: number,
  count: number,
  row: number,
  overscan: number,
) {
  const height = viewport > 0 ? viewport : row * 10;
  const start = Math.max(0, Math.floor(Math.max(0, scrollTop) / row) - overscan);
  const end = Math.min(count, start + Math.ceil(height / row) + overscan * 2);
  return {
    start,
    end,
    padTop: start * row,
    padBot: Math.max(0, count - end) * row,
  };
}
