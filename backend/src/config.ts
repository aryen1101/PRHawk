import dotenv from "dotenv"

dotenv.config()

function required(name : string){
    const value = process.env[name];
    if(!value){
        throw new Error(`${name} environment variable is missing.`)
    }
    return value
}

export const config = {

    apiKey : () => {
        const key = process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY;
        if (!key) throw new Error("Neither GROQ_API_KEY nor OPENROUTER_API_KEY environment variable is defined.");
        return key;
    },
    baseURL: () => process.env.OPENROUTER_API_KEY ? "https://openrouter.ai/api/v1" : "https://api.groq.com/openai/v1",
    githubToken : () => required("GITHUB_TOKEN"),
    model : process.env.MODEL || process.env.model || (process.env.OPENROUTER_API_KEY ? "google/gemini-2.5-flash" : "llama-3.3-70b-versatile"),
    accessKey: process.env.APP_SECRET ?? "",

    conventionsPath : "conventions/rules.json",
    maxFilesContextChars : 12000,
    maxMergedPr : 10

}