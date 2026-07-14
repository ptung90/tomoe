import { writable, derived, get, type Readable } from 'svelte/store';
import { updateAtPath, addArrayItem, removeArrayItem, getAtPath, type JsonValue, type Path } from './jsonModel';
import * as H from './history';
import { clampPath, pathExists } from './pathUtils';
import { loadBool, saveBool, loadTheme, loadStr, saveStr } from './theme';
import type { Theme } from './theme';
import { buildContext, buildMessages, type Turn } from './ai/prompt';
import { streamChat } from './ai/openai';
import { validateJson } from './jsonText';

const history = writable<H.History<JsonValue | null>>(H.createHistory(null));

// The path whose smart-context we last sent to the AI (avoids re-sending every turn).
let lastContextPath: string | null = null;

export const data: Readable<JsonValue | null> = derived(history, (h) => h.present);
export const canUndo: Readable<boolean> = derived(history, (h) => H.canUndo(h));
export const canRedo: Readable<boolean> = derived(history, (h) => H.canRedo(h));

export const filePath = writable<string | null>(null);
export const dirty = writable<boolean>(false);
export const selectedPath = writable<Path>([]);
export const theme = writable<Theme>(loadTheme());
export const toast = writable<{ message: string; kind: 'success' | 'error' } | null>(null);
export const bigEditorPath = writable<Path | null>(null);
export const twoLevel = writable<boolean>(loadBool('jte-two-level', true));
export const editorTab = writable<'form' | 'text'>('form');

// AI chat state
export const aiToken = writable<string>(loadStr('jte-ai-token', ''));
export const aiModel = writable<string>(loadStr('jte-ai-model', 'gpt-4o-mini'));
export const chatOpen = writable<boolean>(false);
export const configOpen = writable<boolean>(false);
export const chatBusy = writable<boolean>(false);
export const chatMessages = writable<Turn[]>([]);

export function loadDocument(value: JsonValue, path: string | null): void {
  history.set(H.createHistory(value));
  filePath.set(path);
  dirty.set(false);
  selectedPath.set([]);
  lastContextPath = null;
}

function commit(next: JsonValue): void {
  history.update((h) => H.push(h, next));
  dirty.set(true);
}

export function editValue(path: Path, newValue: JsonValue): void {
  const cur = get(data);
  if (cur === null) return;
  commit(updateAtPath(cur, path, newValue));
}
export function addItem(arrayPath: Path): void {
  const cur = get(data);
  if (cur === null) return;
  commit(addArrayItem(cur, arrayPath));
}
export function removeItem(arrayPath: Path, index: number): void {
  const cur = get(data);
  if (cur === null) return;
  commit(removeArrayItem(cur, arrayPath, index));
}

function reclampSelection(): void {
  const cur = get(data);
  selectedPath.update((p) => clampPath(cur, p));
}
export function undo(): void {
  history.update((h) => H.undo(h));
  dirty.set(true);
  reclampSelection();
}
export function redo(): void {
  history.update((h) => H.redo(h));
  dirty.set(true);
  reclampSelection();
}

export function select(path: Path): void { selectedPath.set(path); }
export function markSaved(path: string): void { filePath.set(path); dirty.set(false); }

export function openBigEditor(path: Path): void { bigEditorPath.set(path); }
export function closeBigEditor(): void { bigEditorPath.set(null); }

export function setTwoLevel(on: boolean): void { twoLevel.set(on); saveBool('jte-two-level', on); }
export function setEditorTab(t: 'form' | 'text'): void { editorTab.set(t); }

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(message: string, kind: 'success' | 'error' = 'success'): void {
  toast.set({ message, kind });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.set(null), 2500);
}

export function setTheme(t: Theme): void { theme.set(t); }

// ---- AI chat ----
export function setAiConfig(token: string, model: string): void {
  aiToken.set(token); aiModel.set(model);
  saveStr('jte-ai-token', token); saveStr('jte-ai-model', model);
}
export function openConfig(): void { configOpen.set(true); }
export function closeConfig(): void { configOpen.set(false); }

export function insertAnswer(text: string): void {
  const cur = get(data);
  if (cur === null) return;
  const r = validateJson(text);
  editValue(get(selectedPath), r.ok ? r.value : text);
  showToast('Inserted');
}

// Append the answer's item(s) to the selected array (an array answer is spread,
// a single value is pushed). Falls back to replace when the target isn't an array.
export function appendAnswer(text: string): void {
  const cur = get(data);
  if (cur === null) return;
  const path = get(selectedPath);
  const target = pathExists(cur, path) ? getAtPath(cur, path) : null;
  if (!Array.isArray(target)) { insertAnswer(text); return; }
  const r = validateJson(text);
  const value = r.ok ? r.value : text;
  const items = Array.isArray(value) ? value : [value];
  editValue(path, [...target, ...items]);
  showToast('Appended');
}

export async function sendChat(text: string): Promise<void> {
  const token = get(aiToken);
  if (!token) {
    chatMessages.update((m) => [...m,
      { role: 'user', content: text },
      { role: 'assistant', content: 'Add your OpenAI token in ⚙ Config first.' }]);
    return;
  }
  const path = get(selectedPath);
  const key = JSON.stringify(path);
  const context = key !== lastContextPath ? buildContext(get(data), path) : null;
  lastContextPath = key;

  const prior = get(chatMessages).slice(-12);
  const messages = buildMessages(prior, text, context);

  chatMessages.update((m) => [...m,
    { role: 'user', content: text },
    { role: 'assistant', content: '' }]);
  chatBusy.set(true);
  try {
    await streamChat({
      token, model: get(aiModel), messages,
      onDelta: (d) => chatMessages.update((m) => {
        const c = [...m];
        c[c.length - 1] = { role: 'assistant', content: c[c.length - 1].content + d };
        return c;
      }),
    });
  } catch (e) {
    chatMessages.update((m) => {
      const c = [...m];
      c[c.length - 1] = { role: 'assistant', content: `⚠ ${(e as Error).message}` };
      return c;
    });
  } finally {
    chatBusy.set(false);
  }
}
