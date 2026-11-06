const NAVIGATION_MARK_PREFIX = "dodgey-navigation";

function markName(kind: "start" | "commit", pathname: string): string {
  return `${NAVIGATION_MARK_PREFIX}:${kind}:${encodeURIComponent(pathname)}`;
}

/** Mark the moment a user taps a different primary route. */
export function markNavigationStart(pathname: string): void {
  if (typeof performance === "undefined") return;
  const start = markName("start", pathname);
  performance.clearMarks(start);
  performance.mark(start);
  const entries = performance.getEntriesByName(start);
  const entry = entries[entries.length - 1];
  if (typeof window !== "undefined" && entry) {
    window.setTimeout(() => {
      const latestEntries = performance.getEntriesByName(start);
      const latest = latestEntries[latestEntries.length - 1];
      if (latest?.startTime === entry.startTime) performance.clearMarks(start);
    }, 10_000);
  }
}

/** Measure tap-to-route-commit time when the shared shell sees the new path. */
export function markNavigationCommit(pathname: string): void {
  if (typeof performance === "undefined") return;
  const start = markName("start", pathname);
  if (performance.getEntriesByName(start).length === 0) return;

  const commit = markName("commit", pathname);
  const measure = `${NAVIGATION_MARK_PREFIX}:tap-to-commit:${encodeURIComponent(pathname)}`;
  performance.clearMeasures(measure);
  performance.mark(commit);
  performance.measure(measure, start, commit);
  performance.clearMarks(start);
  performance.clearMarks(commit);
}
