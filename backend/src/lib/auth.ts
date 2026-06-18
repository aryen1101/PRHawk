import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { client } from "../db/index.js"; // your mongodb clientƒ

export const auth = betterAuth({
 database: mongodbAdapter(client.db("pr_hawk"), { client }),
 emailAndPassword: { 
    enabled: true, 
  }
});