// Inventory table view preferences (search, sort, low-stock filter),
// stored per-browser in localStorage — never synced to the DB, so each
// device/user keeps their own view without affecting anyone else.

export type SortMode = "name" | "stock-desc" | "stock-asc" | "newest" | "oldest";

export type ViewPreferences = {
  search: string;
  sortMode: SortMode;
  lowStockOnly: boolean;
};

const STORAGE_KEY = "sadona:viewPreferences";

const DEFAULT_PREFERENCES: ViewPreferences = {
  search: "",
  sortMode: "name",
  lowStockOnly: false,
};

const VALID_SORT_MODES: SortMode[] = [
  "name",
  "stock-desc",
  "stock-asc",
  "newest",
  "oldest",
];

export function loadViewPreferences(): ViewPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;

    const parsed = JSON.parse(raw) as Partial<ViewPreferences>;
    return {
      search:
        typeof parsed.search === "string"
          ? parsed.search
          : DEFAULT_PREFERENCES.search,
      sortMode: VALID_SORT_MODES.includes(parsed.sortMode as SortMode)
        ? (parsed.sortMode as SortMode)
        : DEFAULT_PREFERENCES.sortMode,
      lowStockOnly:
        typeof parsed.lowStockOnly === "boolean"
          ? parsed.lowStockOnly
          : DEFAULT_PREFERENCES.lowStockOnly,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/** Merges the given fields into the stored preferences (partial update). */
export function saveViewPreferences(patch: Partial<ViewPreferences>): void {
  if (typeof window === "undefined") return;

  try {
    const merged = { ...loadViewPreferences(), ...patch };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Ignore storage errors (e.g. private browsing quota)
  }
}
