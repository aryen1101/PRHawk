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
    max_tokens: 8000,
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

  const choice = response.choices[0];
  const text = choice?.message?.content;
  if (!text) {
    throw new Error("The model returned an empty response.");
  }

  // The model ran out of output tokens before closing the JSON, which yields
  // truncated text like an unterminated string. Surface a clear, actionable error.
  if (choice?.finish_reason === "length") {
    throw new Error(
      "The model's response was cut off before it finished (output token limit reached). " +
        "Try reviewing a smaller pull request.",
    );
  }

  const cleaned = extractJson(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`The model did not return valid JSON (${detail}).`);
  }

  return schema.parse(parsed);
}

// Defensively isolate the JSON object from the model output: strip markdown
// code fences and any prose before/after the outermost { ... }.
function extractJson(text: string): string {
  let t = text.trim();

  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) {
    t = fence[1].trim();
  }

  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last > first) {
    t = t.slice(first, last + 1);
  }

  return t;
}
