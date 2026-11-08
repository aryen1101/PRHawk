import dotenv from "dotenv"

dotenv.config()
// Local-only overrides (for example, a developer's own MongoDB instance).
// This file is ignored by Git and takes precedence over backend/.env.
dotenv.config({ path: ".env.local", override: true })

function required(name : string){
    const value = process.env[name];
    if(!value){
        throw new Error(`${name} environment variable is missing.`)
    }
    return value
}

export const config = {

    openaiApiKey: () => process.env.OPENAI_API_KEY || "",
    openaiBaseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    groqApiKey: () => process.env.GROQ_API_KEY || "",
    openrouterApiKey: () => process.env.OPENROUTER_API_KEY || "",
    openaiModel: process.env.OPENAI_MODEL || "gpt-6-astra",
    groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    openrouterModel: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
    githubAppId: process.env.GITHUB_APP_ID || "",
    githubAppPrivateKey: process.env.GITHUB_APP_PRIVATE_KEY || "",
    githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || "",
    githubToken : () => required("GITHUB_TOKEN"),
    accessKey: process.env.APP_SECRET ?? "",

    conventionsPath : "conventions/rules.json",
    maxFilesContextChars : 12000,
    maxMergedPr : 10,
    mongoUri : process.env.MONGODB_URL || ""

}
