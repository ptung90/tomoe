import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import RecordField from '../src/lib/modules/flashcards/components/RecordField.svelte';
import type { SchemaField } from '../src/lib/modules/flashcards/model';

// text and text-long now share the same RichText editor (short = compact, fewer lines), so each
// editing surface is identified by its toolbar (one "bold" button per editor) rather than an <input>.
describe('RecordField', () => {
  it('renders one RichText editor per locale for a multilingual text field', () => {
    const field: SchemaField = { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true };
    render(RecordField, { field, value: { en: 'Owl', vi: 'Cú' }, locales: ['en', 'vi'], onChange: vi.fn() });
    expect(screen.getByText('EN')).toBeInTheDocument();
    expect(screen.getByText('VI')).toBeInTheDocument();
    expect(screen.getAllByLabelText('bold')).toHaveLength(2); // one editor per locale row
  });
  it('renders a single editor (no locale tags) for a non-multilingual text field', () => {
    const field: SchemaField = { id: 'f1', key: 'code', label: 'Code', type: 'text', multilingual: false };
    render(RecordField, { field, value: 'X1', locales: ['en', 'vi'], onChange: vi.fn() });
    expect(screen.queryByText('EN')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('bold')).toHaveLength(1);
  });
  it('offers all heading levels H1–H6 in the editor toolbar', () => {
    const field: SchemaField = { id: 'f1', key: 'code', label: 'Code', type: 'text', multilingual: false };
    render(RecordField, { field, value: '', locales: ['en'], onChange: vi.fn() });
    for (const n of [1, 2, 3, 4, 5, 6]) expect(screen.getByLabelText(`h${n}`)).toBeInTheDocument();
  });
  it('renders ImageField for an image field', () => {
    const field: SchemaField = { id: 'f3', key: 'pic', label: 'Pic', type: 'image' };
    render(RecordField, { field, value: 'http://x/a.png', locales: ['en'], onChange: vi.fn() });
    expect(screen.getByPlaceholderText(/image url/i)).toBeInTheDocument();
  });
  it('resolves an {en,vi} field label to the active locale', () => {
    const field: SchemaField = { id: 'f1', key: 'def', label: { en: 'Definition', vi: 'Nghĩa' }, type: 'text', multilingual: true };
    render(RecordField, { field, value: { en: 'a bird', vi: 'con chim' }, locales: ['en', 'vi'], activeLocale: 'vi', onChange: vi.fn() });
    expect(screen.getByText('Nghĩa')).toBeInTheDocument();
  });
});
