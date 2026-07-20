import type { TomoeModule } from './types';
import { flashcards } from './flashcards/module';
import { jsonTable } from './json-table/module';
import { menu } from './menu/module';

export const MODULES: TomoeModule[] = [flashcards, menu, jsonTable];

export function getModule(id: string): TomoeModule {
  return MODULES.find((m) => m.id === id) ?? MODULES[0];
}

/** Route an opened file to the module that should own it: extension, then content sniff, then fallback. */
export function pickModuleForOpen(path: string, text: string): TomoeModule {
  if (path.endsWith('.menu.tomoe.json')) return menu;
  if (path.endsWith('.tomoe.json')) return flashcards;
  if (menu.matches?.(text)) return menu;               // check menu before the generic loop
  const sniff = MODULES.find((m) => m.matches?.(text));
  if (sniff) return sniff;
  return jsonTable;
}
