import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { client } from "../db/index.js"; // your mongodb clientƒ

export const auth = betterAuth({
 database: mongodbAdapter(client.db("pr_hawk"), { client }),
 emailAndPassword: {
    enabled: true,
  },
  trustedOrigins : ["http://localhost:5173", "https://pr-hawk.vercel.app"],
  // Frontend (Vercel) and backend (Render) are on different domains, so the
  // session cookie must be SameSite=None + Secure to be sent cross-site.
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
    },
  },
});