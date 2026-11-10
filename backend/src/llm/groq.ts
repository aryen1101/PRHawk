import OpenAI from "openai";
import { z } from "zod";
import { config } from "../config.js";

type Provider = { name: string; model: string; client: OpenAI };

function getProviders(): Provider[] {
  const providers: Provider[] = [];
  if (config.openaiApiKey()) {
    providers.push({
      name: "OpenAI",
      model: config.openaiModel,
      client: new OpenAI({
        apiKey: config.openaiApiKey(),
        baseURL: config.openaiBaseURL,
      }),
    });
  }
  if (config.groqApiKey()) {
    providers.push({
      name: "Groq",
      model: config.groqModel,
      client: new OpenAI({
        apiKey: config.groqApiKey(),
        baseURL: "https://api.groq.com/openai/v1",
      }),
    });
  }
  if (providers.length === 0) {
    throw new Error("Configure OPENAI_API_KEY or GROQ_API_KEY before running a review.");
  }
  return providers;
}

export async function complete<T extends z.ZodTypeAny>(
  system: string,
  user: string,
  schema: T,
  maxCompletionTokens = 8000,
): Promise<z.infer<T>> {
  const shape = JSON.stringify(z.toJSONSchema(schema));
  const errors: string[] = [];

  for (const provider of getProviders()) {
    let lastDetail = "";

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await provider.client.chat.completions.create({
          model: provider.model,
          max_completion_tokens: maxCompletionTokens,
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

        if (choice?.finish_reason === "length") {
          throw new Error("response was cut off at the output token limit");
        }
        if (!text) {
          lastDetail = "empty response";
          continue;
        }

        try {
          return schema.parse(JSON.parse(extractJson(text)));
        } catch (err) {
          lastDetail = err instanceof Error ? err.message : String(err);
        }
      } catch (err) {
        lastDetail = err instanceof Error ? err.message : String(err);
      }
    }

    errors.push(`${provider.name}: ${lastDetail}`);
  }

  throw new Error(`All configured AI providers failed. ${errors.join(" | ")}`);
}

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
