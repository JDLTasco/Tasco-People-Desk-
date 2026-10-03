// "Application error: a client-side exception has occurred" (John,
// 2026-10-03). Every deploy is a clean deploy, which deletes the previous
// build's JavaScript files and restarts the app -- so a tab that was open
// across a deploy asks for files that no longer exist and crashes. A plain
// reload fixes it. The error boundaries (app/error.tsx, app/global-error.tsx)
// reload automatically once; this guard stops a genuine bug from causing a
// reload loop -- a second error on the same page within the window shows the
// error screen instead.
export const RELOAD_GUARD_KEY = "tpd-auto-reload";
export const RELOAD_WINDOW_MS = 30_000;

/** Pure: should we auto-reload, given the last auto-reload (path + time) stored for this tab? */
export function shouldAutoReload(stored: string | null, path: string, now: number): boolean {
  if (!stored) return true;
  try {
    const last = JSON.parse(stored) as { path?: string; at?: number };
    if (last.path !== path || typeof last.at !== "number") return true;
    return now - last.at > RELOAD_WINDOW_MS;
  } catch {
    return true;
  }
}

/** Browser-only: reloads once if allowed; returns false when the guard says not to (show the error screen). */
export function tryAutoReload(): boolean {
  try {
    const path = window.location.pathname + window.location.search;
    const now = Date.now();
    if (!shouldAutoReload(window.sessionStorage.getItem(RELOAD_GUARD_KEY), path, now)) return false;
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify({ path, at: now }));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}
