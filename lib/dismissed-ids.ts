// Generic per-browser "dismissed items" list. Lets a person clear entries
// out of a list view without deleting the underlying data — each device
// keeps its own set, nothing is shared or synced.

export function loadDismissedIds(storageKey: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

export function saveDismissedIds(storageKey: string, ids: Set<string>): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}
