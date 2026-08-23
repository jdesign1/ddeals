/**
 * Maps a raw fetch/HTTP error into a short, user-friendly message for
 * `ErrorState`'s `detail` line (2026-08-19, Jay's ask after seeing the raw
 * `dodgy_deals_cache?select=product_id,store_id,...(200+ chars)...
 * -> HTTP 400` string rendered directly on screen during the Price History
 * Insights migration-order incident earlier this same session -- see
 * project.md's 2026-08-19 entry for that incident's own writeup).
 *
 * `fetchAllRows`/`fetchByIds` (data.ts) deliberately still throw
 * `Error(\`${path} -> HTTP ${res.status}\`)`, `path` and all -- that detail
 * is still genuinely useful when actually debugging, so it's not removed at
 * the source. This function is the one place that decides how much of it
 * is fair to put in front of a non-technical user: the full raw error is
 * always logged via `console.error` here (devtools, not swallowed), while
 * the string returned to the caller is a short, plain-English sentence,
 * optionally with just the bare HTTP status number for anyone who does want
 * to report a precise code. `ErrorState.tsx`'s own doc comment's stated
 * goal -- "not hiding real information ... just not the first, biggest
 * thing on screen" -- still holds; it's just moved from on-screen to
 * console, since a 200+ character raw query string was never actually more
 * useful to a non-technical user on-screen than a plain sentence + a
 * number.
 *
 * `fallback` is the caller's own existing default text (e.g. "Failed to
 * load specials") -- used as-is for anything this function doesn't
 * recognize (non-`Error` throws, `Error`s with no HTTP status and no
 * recognizable network-failure wording), so behavior for those stays
 * exactly what it was before this function existed.
 *
 * Peer review (2026-08-19) caught a real bug in an earlier version of this
 * function: it mapped 401/403 to "You need to be signed in to see this."
 * But every `${path} -> HTTP ${res.status}` error this function actually
 * receives comes from `fetchAllRows`/`fetchByIds` in data.ts, which always
 * call PostgREST with the app's own anon key (`config.anonKey`), never a
 * per-user JWT -- confirmed by reading every rollout call site. A 401/403
 * on one of those requests can only mean the anon key or an RLS policy is
 * misconfigured server-side; it is never fixable by the user signing in,
 * so telling them to do so is actively misleading (worse than the raw
 * message it replaced, which at least didn't suggest a false remedy). The
 * genuinely user-auth-gated calls (createList/deleteList/addItemToList/etc,
 * lists.ts/deal-checks.ts) go through @supabase/supabase-js, whose
 * PostgrestErrors never contain the literal string "HTTP ###" -- so this
 * function's HTTP-status branch was never reachable from an actual "not
 * signed in" failure in the first place. Folded 401/403 into the same
 * "something's wrong on our end" bucket as 5xx instead.
 */
export function describeFetchError(err: unknown, fallback: string): string {
  // Always logged in full -- this is the one place real detail should still
  // be reachable (browser devtools), just not on-screen anymore.
  console.error(err);

  if (!(err instanceof Error)) return fallback;

  const statusMatch = err.message.match(/HTTP (\d+)/);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    if (status === 404) return "Couldn't find that.";
    if (status === 429) return "Too many requests right now -- try again in a moment.";
    if (status === 401 || status === 403 || status >= 500) {
      return "Something's wrong on our end -- try again shortly.";
    }
    // 400 and any other unmapped 4xx: keep the fallback's own wording, add
    // the bare status number for anyone who wants to report it precisely.
    return `${fallback} (error ${status})`;
  }

  // Failures that never reach `res.ok` at all (offline, DNS, CORS, a
  // blocked request) throw before an HTTP status exists, so their messages
  // never contain "HTTP ###" -- matched separately here.
  if (/fetch failed|network ?error|failed to fetch/i.test(err.message)) {
    return "Check your internet connection and try again.";
  }

  return fallback;
}
