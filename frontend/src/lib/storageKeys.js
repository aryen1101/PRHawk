// Centralized localStorage keys used across the app.
// Keeping these in one place avoids typos and keeps persistence consistent.
export const STORAGE_KEYS = {
  accessKey: "prhawk_access_key",
  onboardingComplete: "code_reviewer_onboarding_complete",
  credType: "code_reviewer_cred_type",
  githubToken: "code_reviewer_github_token",
  openRouterKey: "code_reviewer_openrouter_key",
  theme: "prhawk_theme",

  // Persisted UI / data state (so it survives a page refresh)
  activeTab: "prhawk_active_tab",
  reviewResult: "prhawk_review_result",
  reviewUrl: "prhawk_review_url",
};

// Per-user state held in localStorage (shared across the whole browser).
// Must be cleared on login/logout so one account's data does not leak into
// another account's session on the same browser.
const SESSION_SCOPED_KEYS = [
  STORAGE_KEYS.activeTab,
  STORAGE_KEYS.reviewResult,
  STORAGE_KEYS.reviewUrl,
];

export function clearSessionScopedState() {
  for (const key of SESSION_SCOPED_KEYS) {
    localStorage.removeItem(key);
  }
}
