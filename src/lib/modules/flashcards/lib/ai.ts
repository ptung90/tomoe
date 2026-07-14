import Anthropic from '@anthropic-ai/sdk';
import { type Schema, type RecordItem, type LocalizedText } from '../model';

export const DEFAULT_AI_MODEL = 'claude-opus-4-8';
export interface AiConfig { apiKey: string; model: string }

/** Build the system + user prompt for generating `count` records for `schema`. Pure. */
export function buildRecordsPrompt(
  schema: Schema, instruction: string, count: number, locales: string[],
): { system: string; user: string } {
  const fieldLines = schema.fields.map((f) => {
    if (f.type === 'image') return `- "${f.key}" (${f.label}): image — value is a string URL (use "" if none).`;
    if (f.multilingual === false) return `- "${f.key}" (${f.label}): text — value is a plain string.`;
    return `- "${f.key}" (${f.label}): text — value is an object mapping locale → string, locales: ${locales.join(', ')}.`;
  }).join('\n');
  const system =
    `You generate flashcard records as strict JSON.\n` +
    `The schema "${schema.name}" has these fields (use the KEY as the JSON property):\n${fieldLines}\n\n` +
    `Respond with ONLY a JSON array of objects — no markdown, no prose, no code fence. ` +
    `Each object has exactly the field keys above. Do not invent extra keys.`;
  const user = `${instruction}\n\nGenerate ${count} record(s) as a JSON array.`;
  return { system, user };
}

/** Concatenate the text of an Anthropic content array; ignore non-text blocks. */
export function extractText(content: Array<{ type: string; text?: string }>): string {
  return (content ?? []).filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string).join('');
}

/** Tolerantly parse an AI response into loose records for `schema`. Throws if no JSON array. */
export function parseGeneratedRecords(raw: string, schema: Schema): RecordItem[] {
  const arr = extractJsonArray(raw);
  const keys = new Set(schema.fields.map((f) => f.key));
  return arr.map((entry) => {
    const src = (entry && typeof entry === 'object') ? entry as Record<string, unknown> : {};
    const fields: Record<string, LocalizedText> = {};
    for (const [k, v] of Object.entries(src)) {
      if (!keys.has(k)) continue;
      if (typeof v === 'string') fields[k] = v;
      else if (v && typeof v === 'object' && !Array.isArray(v)) {
        const o: Record<string, string> = {};
        for (const [lk, lv] of Object.entries(v as Record<string, unknown>)) o[lk] = String(lv ?? '');
        fields[k] = o;
      } else if (v != null) fields[k] = String(v);
    }
    return { id: '', schemaId: schema.id, fieldsHash: '', fields };
  });
}

function extractJsonArray(raw: string): unknown[] {
  const text = (raw ?? '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : text;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('No JSON array found in AI response');
  const parsed = JSON.parse(body.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error('AI response is not a JSON array');
  return parsed;
}

export interface AnthropicLike {
  messages: { create(body: unknown): Promise<{ content: Array<{ type: string; text?: string }> }> };
}
export type AnthropicFactory = (apiKey: string) => AnthropicLike;

const defaultFactory: AnthropicFactory = (apiKey) =>
  new Anthropic({ apiKey, dangerouslyAllowBrowser: true }) as unknown as AnthropicLike;

/** Generate records for `schema` from `instruction` via Anthropic. Network is behind `factory`. */
export async function generateRecords(
  cfg: AiConfig, schema: Schema, instruction: string, count: number, locales: string[],
  factory: AnthropicFactory = defaultFactory,
): Promise<RecordItem[]> {
  const { system, user } = buildRecordsPrompt(schema, instruction, count, locales);
  const client = factory(cfg.apiKey);
  const res = await client.messages.create({
    model: cfg.model || DEFAULT_AI_MODEL,
    max_tokens: 8192,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return parseGeneratedRecords(extractText(res.content), schema);
}
