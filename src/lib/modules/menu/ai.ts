import Anthropic from '@anthropic-ai/sdk';
import { writable, derived, type Readable } from 'svelte/store';
import type { MenuTemplate } from './model';

export interface AiConfig { apiKey: string; model: string }
export const DEFAULT_AI_MODEL = 'claude-haiku-4-5-20251001';

export function loadAiConfig(): AiConfig {
  try {
    return {
      apiKey: localStorage.getItem('tomoe.ai.apiKey') ?? '',
      model: localStorage.getItem('tomoe.menu.ai.model') ?? DEFAULT_AI_MODEL,
    };
  } catch { return { apiKey: '', model: DEFAULT_AI_MODEL }; }
}
const _cfg = writable<AiConfig>(loadAiConfig());
export const aiConfig: Readable<AiConfig> = derived(_cfg, (c) => c);
export function setAiConfig(patch: Partial<AiConfig>): void {
  _cfg.update((c) => {
    const next = { ...c, ...patch };
    try {
      if (patch.apiKey !== undefined) localStorage.setItem('tomoe.ai.apiKey', next.apiKey);
      if (patch.model !== undefined) localStorage.setItem('tomoe.menu.ai.model', next.model);
    } catch { /* ignore */ }
    return next;
  });
}

export interface GenWeekResult { cells: Record<string, string>; newDishes: { name: string; categoryKey: string; ingredientType?: string }[] }

function buildPrompt(template: MenuTemplate, instruction: string): string {
  const cats = template.periods.flatMap((p) =>
    p.categories.map((c) => `- id="${c.id}" key="${c.key}" nhóm="${c.label}"${c.defaultValue ? ` (mặc định: ${c.defaultValue})` : ''}`)).join('\n');
  return [
    'Bạn là trợ lý lên thực đơn cho trường mầm non Việt Nam.',
    `Số ngày trong tuần: ${template.days.length} (${template.days.join(', ')}), dayIndex chạy 0..${template.days.length - 1}.`,
    'Các nhóm món:', cats,
    `Yêu cầu người dùng: ${instruction}`,
    'Trả về DUY NHẤT một JSON hợp lệ, không văn bản khác, dạng:',
    '{"cells": {"<categoryId>:<dayIndex>": "Tên món"}, "newDishes": [{"name":"...","categoryKey":"<key>","ingredientType":"thit|ca|trung|tom|..."}]}',
    'Đa dạng nguyên liệu trong tuần (đừng lặp toàn thịt hoặc toàn cá).',
  ].join('\n');
}

function extractJson(text: string): any {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return {};
  return JSON.parse(text.slice(start, end + 1));
}

export async function generateWeek(config: AiConfig, template: MenuTemplate, instruction: string): Promise<GenWeekResult> {
  if (!config.apiKey) return { cells: {}, newDishes: [] };
  const client = new Anthropic({ apiKey: config.apiKey, dangerouslyAllowBrowser: true });
  const resp: any = await client.messages.create({
    model: config.model, max_tokens: 2048,
    messages: [{ role: 'user', content: buildPrompt(template, instruction) }],
  });
  const text = (resp.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  let parsed: any = {};
  try { parsed = extractJson(text); } catch { parsed = {}; }
  const cells: Record<string, string> = {};
  if (parsed.cells && typeof parsed.cells === 'object') {
    for (const [k, v] of Object.entries(parsed.cells)) if (typeof v === 'string') cells[k] = v;
  }
  const newDishes = Array.isArray(parsed.newDishes)
    ? parsed.newDishes.filter((d: any) => d && typeof d.name === 'string' && typeof d.categoryKey === 'string')
        .map((d: any) => ({ name: d.name, categoryKey: d.categoryKey, ingredientType: typeof d.ingredientType === 'string' ? d.ingredientType : undefined }))
    : [];
  return { cells, newDishes };
}
