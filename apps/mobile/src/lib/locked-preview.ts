/**
 * Returns the shared opacity ramp used for subscription-locked preview rows.
 * The first locked row remains legible; later rows fade toward the page
 * background without disappearing completely.
 */
export function getLockedPreviewOpacity(index: number, count: number): number {
  if (count <= 0 || index < 0) return 1;
  if (count === 1) return 0.32;

  return Math.max(0.06, 0.55 * (1 - index / Math.max(1, count - 1)));
}
