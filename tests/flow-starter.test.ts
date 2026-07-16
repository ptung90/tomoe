import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseProject } from '../src/lib/modules/flashcards/model';
import { isFlowLayout } from '../src/lib/modules/flashcards/lib/flow-layouts';

describe('country-profile starter', () => {
  const p = parseProject(readFileSync('save_data/country-profile-starter.tomoe.json', 'utf-8'));
  it('has one schema with 3 flow views', () => {
    expect(p.schemas).toHaveLength(1);
    const views = p.schemas[0].cardTemplates;
    expect(views).toHaveLength(3);
    expect(views.every((v) => isFlowLayout(v.layout))).toBe(true);
  });
  it('cover view is collage; page views set cardsPerPage 1', () => {
    const [cover, page1, page2] = p.schemas[0].cardTemplates;
    expect(cover.layout).toBe('country-cover');
    expect(page1.layout).toBe('country-page');
    expect(page2.layout).toBe('country-page');
    expect(page1.cardsPerPage).toBe(1);
    expect(page2.cardsPerPage).toBe(1);
  });
  it('ships border width 0 so it matches the mock out-of-box', () => {
    expect(p.settings.border.width).toBe(0);
  });
});
