import { describe, it, expect } from 'vitest';
import { pickModuleForOpen, MODULES } from '../src/lib/modules/registry';
import { serializeMenuDoc, newMenuDoc } from '../src/lib/modules/menu/model';

describe('menu routing', () => {
  it('menu module is registered', () => {
    expect(MODULES.some((m) => m.id === 'menu')).toBe(true);
  });
  it('.menu.tomoe.json routes to menu (not flashcards)', () => {
    expect(pickModuleForOpen('x.menu.tomoe.json', '{}').id).toBe('menu');
  });
  it('.tomoe.json (non-menu) still routes to flashcards', () => {
    expect(pickModuleForOpen('x.tomoe.json', '{}').id).toBe('flashcards');
  });
  it('menu content sniff wins over the flashcards projectName sniff', () => {
    // A menu doc has projectName too — must NOT be captured by flashcards.
    const text = serializeMenuDoc(newMenuDoc());
    expect(pickModuleForOpen('untitled.json', text).id).toBe('menu');
  });
});
