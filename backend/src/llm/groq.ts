import OpenAI from "openai";
import { z } from "zod";
import { config } from "../config.js";

let client: OpenAI | null = null;

function getOpenAIClient(customKey?: string, customBaseURL?: string): OpenAI {
  if (customKey) {
    return new OpenAI({
      apiKey: customKey,
      baseURL: customBaseURL || "https://openrouter.ai/api/v1",
    });
  }
  if (!client) {
    client = new OpenAI({
      apiKey: config.apiKey(),
      baseURL: config.baseURL(),
    });
  }

  return client;
}

export async function complete<T extends z.ZodTypeAny>(
  system: string,
  user: string,
  schema: T,
  customKey?: string,
  customBaseURL?: string,
): Promise<z.infer<T>> {
  const shape = JSON.stringify(z.toJSONSchema(schema));

  const response = await getOpenAIClient(customKey, customBaseURL).chat.completions.create({
    model: config.model,
    temperature: 0.2,
    max_tokens: 3000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          `${system}\n\nReply with one JSON object matching this JSON Schema. ` +
          `Do not add markdown fences or any text around it:\n${shape}`,
      },
      { role: "user", content: user },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if(!text){
    throw new Error("The model returned an empty response.");
  }

  return schema.parse(JSON.parse(text));
}
