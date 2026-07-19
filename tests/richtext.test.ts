import { describe, it, expect } from 'vitest';
import { mdToHtml, htmlToMd } from '../src/lib/modules/flashcards/lib/richtext';

describe('richtext md<->html', () => {
  it('mdToHtml wraps bold', () => {
    expect(mdToHtml('**hi**').replace(/\n/g, '')).toBe('<p><strong>hi</strong></p>');
  });
  it('bold round-trips', () => { expect(htmlToMd(mdToHtml('**hi**'))).toBe('**hi**'); });
  it('bullet list round-trips', () => {
    expect(htmlToMd(mdToHtml('- a\n- b'))).toBe('- a\n- b');
  });
  it('heading round-trips', () => { expect(htmlToMd(mdToHtml('# Title'))).toBe('# Title'); });
  it('subtitle (h6) round-trips through markdown — the RichText Subtitle button', () => {
    expect(htmlToMd('<h6>Bengal Tiger</h6>')).toBe('###### Bengal Tiger');
    expect(mdToHtml('###### Bengal Tiger').replace(/\n/g, '')).toContain('<h6');
  });
  it('empty string is empty', () => { expect(htmlToMd(mdToHtml(''))).toBe(''); });
  it('preserves aligned paragraph html', () => {
    const md = htmlToMd('<p style="text-align:center">hey</p>');
    expect(md).toContain('text-align:center');
  });
});
