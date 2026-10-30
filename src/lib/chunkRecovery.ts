const RELOAD_KEY = "metromaps:chunk-reload-at";
// Long enough to cover a slow reload on a mobile connection, so a genuinely
// missing chunk cannot put the tab in a reload loop.
const RELOAD_WINDOW_MS = 60_000;

type BrowserRuntime = {
  location?: { reload: () => void };
  navigator?: { onLine?: boolean };
  sessionStorage?: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
  };
};

/** Keep this module free of DOM types so the data scripts can import it. */
function browser(): BrowserRuntime {
  return globalThis as typeof globalThis & BrowserRuntime;
}

/**
 * Chrome, Firefox and Safari all phrase a missing lazily imported chunk
 * differently. A chunk-load failure means the HTML shell and the lazy chunk
 * came from different deployments, not that the data itself is invalid.
 */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Failed to load module script|Loading chunk [\w-]+ failed/i.test(
    message,
  );
}

/**
 * A tab opened before a deploy keeps the old bundle in memory. When it asks
 * for a hashed chunk that the new deploy removed, reloading pulls the current
 * HTML shell and matching assets. The sessionStorage guard prevents a reload
 * loop if the chunk is genuinely unavailable (offline, a bad deploy, CSP).
 */
export function recoverFromChunkLoadError(error: unknown): boolean {
  if (!isChunkLoadError(error)) return false;

  const { location, navigator, sessionStorage } = browser();
  if (typeof location?.reload !== "function") return false;
  if (navigator?.onLine === false) return false;
  if (!sessionStorage) return false;

  try {
    const lastReload = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - lastReload < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Without storage there is no way to avoid a reload loop; show the error
    // and let the reader reload deliberately instead.
    return false;
  }

  location.reload();
  return true;
}
