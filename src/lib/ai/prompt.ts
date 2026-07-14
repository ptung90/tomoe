import { getAtPath, type JsonValue, type Path } from '../jsonModel';
import { pathExists } from '../pathUtils';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type Turn = { role: 'user' | 'assistant'; content: string };

const CAP = 4000;
const SYSTEM =
  'You are a helpful assistant embedded in a JSON data editor. You can see the selected node and its context. '
  + 'Only when the user explicitly asks you to fill, generate, add, or replace a value, reply with ONLY the value '
  + 'to insert — a JSON literal (object/array/number/boolean) when structured, or plain text for a single string, '
  + 'with no extra words. For questions, checks, analysis, or anything else (e.g. "are there duplicates?"), '
  + 'answer normally in clear, concise prose — do NOT wrap the answer as JSON.';

const isObj = (v: JsonValue): v is Record<string, JsonValue> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const isScalar = (v: JsonValue) => v === null || typeof v !== 'object';

export function buildContext(data: JsonValue | null, path: Path): string {
  if (data === null || !pathExists(data, path)) return '';
  const parts: string[] = [];

  // 1. Document meta: root scalars, small scalar arrays, small objects (skip big containers).
  if (isObj(data)) {
    const meta: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(data)) {
      if (isScalar(v)) meta[k] = v;
      else if (Array.isArray(v) && v.length <= 6 && v.every(isScalar)) meta[k] = v;
      else if (isObj(v) && JSON.stringify(v).length <= 400) meta[k] = v;
    }
    if (Object.keys(meta).length) parts.push('Document meta:\n' + JSON.stringify(meta, null, 2));
  }

  // 2. Ancestor chain: each ancestor object's scalar fields.
  const crumbs: string[] = ['root'];
  let cur: JsonValue = data;
  for (let i = 0; i < path.length; i++) {
    cur = (cur as Record<string, JsonValue> & JsonValue[])[path[i] as never];
    if (i < path.length - 1 && isObj(cur)) {
      const scalars: Record<string, JsonValue> = {};
      for (const [k, v] of Object.entries(cur)) if (isScalar(v)) scalars[k] = v;
      crumbs.push(`${path[i]} ${JSON.stringify(scalars)}`);
    } else {
      crumbs.push(String(path[i]));
    }
  }
  parts.push('Path: ' + crumbs.join(' > '));

  // 3. Selected node.
  parts.push('Selected node:\n' + JSON.stringify(getAtPath(data, path), null, 2));

  let out = parts.join('\n\n');
  if (out.length > CAP) out = out.slice(0, CAP) + '\n…(truncated)';
  return out;
}

export function buildMessages(history: Turn[], userText: string, context: string | null): ChatMessage[] {
  const msgs: ChatMessage[] = [{ role: 'system', content: SYSTEM }];
  for (const h of history) msgs.push({ role: h.role, content: h.content });
  msgs.push({ role: 'user', content: context ? `Context:\n${context}\n\nRequest: ${userText}` : userText });
  return msgs;
}
