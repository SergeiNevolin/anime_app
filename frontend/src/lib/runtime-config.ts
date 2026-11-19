/**
 * Configuration that the server injects into the page at request time.
 *
 * `NEXT_PUBLIC_*` variables are inlined by the bundler while the image is
 * built, so they cannot be changed per environment without rebuilding it.  The
 * root layout instead renders the container environment into
 * `window.__ANIME_WATCH_CONFIG__`, and the client reads the values from there.
 */

export interface RuntimeConfig {
  /** Public base URL of the backend API, e.g. `http://localhost:8000/api/v1`. */
  apiBaseUrl: string;
  /** Whether the `Authorization: dev <credential>` scheme may be used. */
  devAuthEnabled: boolean;
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  apiBaseUrl: "http://localhost:8000/api/v1",
  devAuthEnabled: false,
};

declare global {
  interface Window {
    __ANIME_WATCH_CONFIG__?: Partial<RuntimeConfig>;
  }
}

/**
 * Return the configuration of the current page.
 *
 * Outside the browser (and when the server rendered no configuration) the
 * development defaults are used.
 */
export function getRuntimeConfig(): RuntimeConfig {
  if (typeof window === "undefined") {
    return DEFAULT_RUNTIME_CONFIG;
  }
  return { ...DEFAULT_RUNTIME_CONFIG, ...(window.__ANIME_WATCH_CONFIG__ ?? {}) };
}
