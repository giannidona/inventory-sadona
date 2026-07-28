// Low-stock alert threshold, stored per-browser in localStorage.
// Each device/person sets their own alert quantity — nothing is shared
// or synced across computers.

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

const THRESHOLD_KEY = "sadona:lowStockThreshold";
const THRESHOLD_EVENT = "sadona:low-stock-threshold-changed";

export function loadLowStockThreshold(): number {
  if (typeof window === "undefined") return DEFAULT_LOW_STOCK_THRESHOLD;
  try {
    const raw = window.localStorage.getItem(THRESHOLD_KEY);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed >= 0
      ? parsed
      : DEFAULT_LOW_STOCK_THRESHOLD;
  } catch {
    return DEFAULT_LOW_STOCK_THRESHOLD;
  }
}

export function saveLowStockThreshold(value: number): void {
  try {
    window.localStorage.setItem(THRESHOLD_KEY, String(value));
    window.dispatchEvent(
      new CustomEvent<number>(THRESHOLD_EVENT, { detail: value })
    );
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

/** Notifies other components in the same tab when the threshold changes. */
export function onLowStockThresholdChange(
  handler: (value: number) => void
): () => void {
  function listener(e: Event) {
    handler((e as CustomEvent<number>).detail);
  }
  window.addEventListener(THRESHOLD_EVENT, listener);
  return () => window.removeEventListener(THRESHOLD_EVENT, listener);
}

// Products dismissed from the notifications list, stored per-browser.
// Maps product id -> stock at the moment it was dismissed, so a product
// reappears automatically once its stock changes again.
export type DismissedLowStockMap = Record<string, number>;

const DISMISSED_KEY = "sadona:dismissedLowStock";
const DISMISSED_EVENT = "sadona:low-stock-dismissed-changed";

export function loadDismissedLowStock(): DismissedLowStockMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as DismissedLowStockMap) : {};
  } catch {
    return {};
  }
}

export function saveDismissedLowStock(map: DismissedLowStockMap): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(map));
    window.dispatchEvent(new Event(DISMISSED_EVENT));
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

/** Notifies other components in the same tab when the dismissed list changes. */
export function onDismissedLowStockChange(handler: () => void): () => void {
  window.addEventListener(DISMISSED_EVENT, handler);
  return () => window.removeEventListener(DISMISSED_EVENT, handler);
}
