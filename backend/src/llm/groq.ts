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
  const client = getOpenAIClient(customKey, customBaseURL);

  // LLMs occasionally emit malformed JSON or output that doesn't match the
  // schema. That's non-deterministic, so a fresh sample almost always fixes it
  // — retry a few times before giving up.
  const MAX_ATTEMPTS = 3;
  let lastDetail = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await client.chat.completions.create({
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

    // Truncation (hit the output token limit) won't be fixed by retrying with
    // the same prompt, so fail fast with an actionable message.
    if (choice?.finish_reason === "length") {
      throw new Error(
        "The model's response was cut off before it finished (output token limit reached). " +
          "Try reviewing a smaller pull request.",
      );
    }

    if (!text) {
      lastDetail = "empty response";
      continue;
    }

    try {
      return schema.parse(JSON.parse(extractJson(text)));
    } catch (err) {
      lastDetail = err instanceof Error ? err.message : String(err);
      // fall through to the next attempt
    }
  }

  throw new Error(
    `The model did not return valid JSON after ${MAX_ATTEMPTS} attempts (${lastDetail}). Please try again.`,
  );
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
