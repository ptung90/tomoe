import JSON5 from 'json5';
import type { JsonValue } from './jsonModel';

export type ParseResult =
  | { ok: true; value: JsonValue }
  | { ok: false; error: string; line?: number; col?: number };

export function formatNode(value: JsonValue): string {
  return JSON.stringify(value, null, 2);
}

function lineColFromPosition(text: string, pos: number): { line: number; col: number } {
  const upto = text.slice(0, Math.max(0, pos));
  const line = upto.split('\n').length;
  const col = pos - upto.lastIndexOf('\n');
  return { line, col };
}

export function validateJson(text: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(text) as JsonValue };
  } catch (e) {
    const error = (e as Error).message;
    const m = /position (\d+)/.exec(error);
    if (m) {
      const { line, col } = lineColFromPosition(text, Number(m[1]));
      return { ok: false, error, line, col };
    }
    return { ok: false, error };
  }
}

export function autoFix(text: string): ParseResult {
  try {
    return { ok: true, value: JSON5.parse(text) as JsonValue };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
