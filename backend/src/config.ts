import dotenv from "dotenv"

dotenv.config()

function intFromEnv(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
}

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
    openaiModel: process.env.OPENAI_MODEL || "gpt-6-astra",
    groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    githubAppId: process.env.GITHUB_APP_ID || "",
    githubAppPrivateKey: process.env.GITHUB_APP_PRIVATE_KEY || "",
    githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || "",
    githubClientId: process.env.GITHUB_CLIENT_ID || "",
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    githubOAuthRedirectUri: process.env.GITHUB_OAUTH_REDIRECT_URI || "",
    sessionSecret: process.env.SESSION_SECRET || "",
    githubToken : () => required("GITHUB_TOKEN"),
    review: {
        /** Total characters of diffs + surrounding code sent to the model (~4 chars per token). */
        maxPromptChars: intFromEnv("REVIEW_MAX_PROMPT_CHARS", 60000),
        /** Each file's diff is cut at this size. */
        maxPatchCharsPerFile: intFromEnv("REVIEW_MAX_PATCH_CHARS_PER_FILE", 8000),
        /** Lines of surrounding code included above and below each changed line. */
        contextLines: intFromEnv("REVIEW_CONTEXT_LINES", 30),
        /** Maximum convention rules included in a review prompt. */
        maxConventions: intFromEnv("REVIEW_MAX_CONVENTIONS", 40),
        /** Parallel GitHub file-content requests. */
        fileFetchConcurrency: 5,
    },
    maxMergedPr : 10,
    mongoUri : process.env.MONGODB_URL || ""

}
