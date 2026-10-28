import "server-only";
import sharp from "sharp";
import { EMPLOYEE_FIELDS, type EmployeeFieldKey } from "./types";

/*
  Reads new-joiner rows out of a photo/screenshot of the HR joining sheet with a vision LLM.
  Provider and model come from .env.local:
    AI_PROVIDER=openai|gemini   (optional; otherwise whichever key is set, OpenAI first)
    OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL
    GEMINI_API_KEY, GEMINI_MODEL, GEMINI_BASE_URL
  Nothing is saved here: the rows go back to the browser for review first.
*/

export type Provider = "openai" | "gemini";
export type ExtractedRow = Record<EmployeeFieldKey, string | null>;

const DEFAULTS: Record<Provider, { model: string; baseUrl: string; keyVar: string }> = {
  openai: { model: "gpt-6.1-terra", baseUrl: "https://api.openai.com/v1", keyVar: "OPENAI_API_KEY" },
  gemini: { model: "gemini-3.8-flash", baseUrl: "https://generativelanguage.googleapis.com/v1beta", keyVar: "GEMINI_API_KEY" },
};

const TIMEOUT_MS = 120_000;
const MAX_SIDE_PX = 2400;

/** An error with a message safe to show the user and the HTTP status to return. */
export class ExtractError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

const env = (name: string) => process.env[name]?.trim() || "";

export function extractConfig() {
  const chosen = env("AI_PROVIDER").toLowerCase();
  if (chosen && chosen !== "openai" && chosen !== "gemini") throw new ExtractError(`AI_PROVIDER must be "openai" or "gemini", not "${chosen}".`, 500);
  const provider: Provider | undefined = chosen ? (chosen as Provider) : env("OPENAI_API_KEY") ? "openai" : env("GEMINI_API_KEY") ? "gemini" : undefined;
  if (!provider) {
    throw new ExtractError("Image import needs an AI API key. Add OPENAI_API_KEY or GEMINI_API_KEY to .env.local and restart the server.", 503);
  }
  const d = DEFAULTS[provider];
  const apiKey = env(d.keyVar);
  if (!apiKey) throw new ExtractError(`AI_PROVIDER is "${provider}" but ${d.keyVar} is not set in .env.local.`, 503);
  const prefix = provider.toUpperCase();
  return { provider, apiKey, model: env(`${prefix}_MODEL`) || d.model, baseUrl: (env(`${prefix}_BASE_URL`) || d.baseUrl).replace(/\/+$/, "") };
}

const COLUMN_GUIDE = EMPLOYEE_FIELDS.map((f) => `- ${f.key}: the "${f.label.toUpperCase()}" column`).join("\n");

const PROMPT = `This image shows an HR "new joiner" sheet: a table with one employee per row.
Extract every employee row into the JSON format given. Columns map to fields as follows:
${COLUMN_GUIDE}
Ignore the S.No column and any header, title or total rows.

Rules:
- Copy values exactly as written. Do not guess, correct, translate or complete anything.
- Dates: copy them as shown, e.g. "01.08.2026" or "03-08-2026".
- Emails and mobile numbers: copy every character carefully, including spaces in numbers.
- A value that spans several lines in one cell (e.g. "Sagar, Madhya Pradesh") is one value; join the lines with a space.
- Use null for an empty cell, a column that is not in the image, or text you cannot read.
- If the image contains no such table, return an empty rows list.`;

const KEYS = EMPLOYEE_FIELDS.map((f) => f.key);

// OpenAI strict mode: every field required, nullable through a type array, no extra properties.
const OPENAI_SCHEMA = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: Object.fromEntries(KEYS.map((k) => [k, { type: ["string", "null"] }])),
        required: KEYS,
        additionalProperties: false,
      },
    },
  },
  required: ["rows"],
  additionalProperties: false,
};

// Gemini response_schema uses the OpenAPI subset: upper-case types and `nullable`.
const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    rows: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: Object.fromEntries(KEYS.map((k) => [k, { type: "STRING", nullable: true }])),
        required: ["DisplayName"],
        propertyOrdering: KEYS,
      },
    },
  },
  required: ["rows"],
};

/** Upright, at most MAX_SIDE_PX on the long side, JPEG: keeps small table text legible with a modest upload. */
async function prepareImage(buffer: Buffer) {
  const jpeg = await sharp(buffer)
    .rotate()
    .resize({ width: MAX_SIDE_PX, height: MAX_SIDE_PX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return jpeg.toString("base64");
}

async function post(url: string, headers: Record<string, string>, body: unknown, provider: Provider) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if ((err as Error).name === "TimeoutError") throw new ExtractError("The AI service took too long to answer. Try again, or use a smaller/clearer image.", 504);
    throw new ExtractError(`Could not reach the ${provider === "openai" ? "OpenAI" : "Gemini"} API. Check this PC's internet connection.`, 502);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = String(data?.error?.message ?? "").slice(0, 300);
    console.error(`${provider} extraction failed (${res.status}):`, detail || data);
    if (res.status === 401 || res.status === 403) throw new ExtractError(`The ${provider} API key was rejected. Check the key in .env.local.${detail ? ` (${detail})` : ""}`, 502);
    if (res.status === 429) throw new ExtractError(`The ${provider} API rate limit or quota was reached. Wait a minute, or check billing on your account.`, 429);
    if (res.status === 404) throw new ExtractError(`The ${provider} model was not found. Check ${provider.toUpperCase()}_MODEL in .env.local.${detail ? ` (${detail})` : ""}`, 502);
    throw new ExtractError(`The ${provider} API returned an error (${res.status})${detail ? `: ${detail}` : "."}`, 502);
  }
  return data;
}

async function callOpenAI(cfg: ReturnType<typeof extractConfig>, base64: string): Promise<string> {
  const data = await post(
    `${cfg.baseUrl}/responses`,
    { Authorization: `Bearer ${cfg.apiKey}` },
    {
      model: cfg.model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: PROMPT },
            { type: "input_image", image_url: `data:image/jpeg;base64,${base64}`, detail: "high" },
          ],
        },
      ],
      text: { format: { type: "json_schema", name: "new_joiners", schema: OPENAI_SCHEMA, strict: true } },
    },
    "openai",
  );

  if (data.status === "incomplete") throw new ExtractError(`The AI answer was cut off (${data.incomplete_details?.reason ?? "incomplete"}). Try a crop with fewer rows.`);
  const parts = (data.output ?? []).flatMap((item: { content?: { type: string; text?: string; refusal?: string }[] }) => item.content ?? []);
  const refusal = parts.find((p: { type: string }) => p.type === "refusal");
  if (refusal) throw new ExtractError(`The AI declined to read this image: ${refusal.refusal}`);
  const text = parts.find((p: { type: string }) => p.type === "output_text")?.text;
  if (!text) throw new ExtractError("The AI returned no data for this image.");
  return text;
}

async function callGemini(cfg: ReturnType<typeof extractConfig>, base64: string): Promise<string> {
  const data = await post(
    `${cfg.baseUrl}/models/${encodeURIComponent(cfg.model)}:generateContent`,
    { "x-goog-api-key": cfg.apiKey },
    {
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: "image/jpeg", data: base64 } }] }],
      generation_config: { response_mime_type: "application/json", response_schema: GEMINI_SCHEMA, temperature: 0 },
    },
    "gemini",
  );

  if (data.promptFeedback?.blockReason) throw new ExtractError(`Gemini blocked this image (${data.promptFeedback.blockReason}).`);
  const candidate = data.candidates?.[0];
  const reason = candidate?.finishReason as string | undefined;
  if (reason === "SPII") throw new ExtractError("Gemini refused to output the personal details in this image (SPII). Try OpenAI instead (AI_PROVIDER=openai).");
  if (reason === "MAX_TOKENS") throw new ExtractError("The AI answer was cut off. Try a crop with fewer rows.");
  if (reason && reason !== "STOP") throw new ExtractError(`Gemini stopped without an answer (${reason}).`);
  const text = (candidate?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) throw new ExtractError("The AI returned no data for this image.");
  return text;
}

/** Sends one image to the configured provider and returns the employee rows it found (not validated or saved). */
export async function extractEmployeeRows(buffer: Buffer): Promise<ExtractedRow[]> {
  const cfg = extractConfig();
  let base64: string;
  try {
    base64 = await prepareImage(buffer);
  } catch {
    throw new ExtractError("The image could not be read.", 400);
  }

  const text = cfg.provider === "openai" ? await callOpenAI(cfg, base64) : await callGemini(cfg, base64);

  let parsed: { rows?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ExtractError("The AI answer was not valid JSON. Try again.");
  }
  if (!Array.isArray(parsed.rows)) throw new ExtractError("The AI answer did not contain any rows.");

  // Keep only known fields as trimmed strings; drop rows that came back completely empty.
  return parsed.rows
    .map((raw) => {
      const row = {} as ExtractedRow;
      for (const key of KEYS) {
        const value = (raw as Record<string, unknown>)?.[key];
        row[key] = value === null || value === undefined ? null : String(value).trim() || null;
      }
      return row;
    })
    .filter((row) => KEYS.some((k) => row[k]));
}
