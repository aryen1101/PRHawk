import { createAuthClient } from "better-auth/react";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export const authClient = createAuthClient({
  baseURL: API_BASE || undefined, // empty → same origin (Vite proxy in dev)
});