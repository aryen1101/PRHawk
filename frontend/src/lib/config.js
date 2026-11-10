/** Public browser configuration (VITE_* values are compiled into the bundle and are not secrets). */
export const installUrl =
  import.meta.env.VITE_GITHUB_APP_INSTALL_URL ||
  "https://github.com/apps/prhawk-webhook-tester/installations/new";

const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export const apiUrl = (path) => `${apiBase}${path}`;
