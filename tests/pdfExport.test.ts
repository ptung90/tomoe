import { describe, it, expect } from 'vitest';
import { pdfFileName, pdfStamp } from '../src/lib/modules/flashcards/lib/pdfExport';

describe('pdfFileName', () => {
  it('slugs + strips Vietnamese diacritics and đ', () => {
    expect(pdfFileName('Vòng tuần hoàn', '20260715-1042')).toBe('vong-tuan-hoan-20260715-1042.pdf');
    expect(pdfFileName('Đường phố', '20260715-1042')).toBe('duong-pho-20260715-1042.pdf');
  });
  it('collapses non-alphanumerics and trims dashes', () => {
    expect(pdfFileName('  My Cards!! (v2) ', '20260101-0000')).toBe('my-cards-v2-20260101-0000.pdf');
  });
  it('falls back to "cards" when the name is empty after slugging', () => {
    expect(pdfFileName('', '20260715-1042')).toBe('cards-20260715-1042.pdf');
    expect(pdfFileName('★★★', '20260715-1042')).toBe('cards-20260715-1042.pdf');
  });
});

describe('pdfStamp', () => {
  it('formats YYYYMMDD-HHmm with zero-padding', () => {
    expect(pdfStamp(new Date(2026, 6, 15, 10, 42))).toBe('20260715-1042');
    expect(pdfStamp(new Date(2026, 0, 5, 9, 3))).toBe('20260105-0903');
  });
});
