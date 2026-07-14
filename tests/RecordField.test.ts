import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import RecordField from '../src/lib/modules/flashcards/components/RecordField.svelte';
import type { SchemaField } from '../src/lib/modules/flashcards/model';

describe('RecordField', () => {
  it('renders one input per locale for a multilingual text field', () => {
    const field: SchemaField = { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true };
    render(RecordField, { field, value: { en: 'Owl', vi: 'Cú' }, locales: ['en', 'vi'], onChange: vi.fn() });
    expect(screen.getByDisplayValue('Owl')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Cú')).toBeInTheDocument();
    expect(screen.getByText('EN')).toBeInTheDocument();
    expect(screen.getByText('VI')).toBeInTheDocument();
  });
  it('fires onChange with the locale for a multilingual edit', async () => {
    const field: SchemaField = { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true };
    const onChange = vi.fn();
    render(RecordField, { field, value: { en: '', vi: '' }, locales: ['en', 'vi'], onChange });
    const inputs = screen.getAllByRole('textbox');
    await fireEvent.input(inputs[0], { target: { value: 'Owl' } });
    expect(onChange).toHaveBeenCalledWith('Owl', 'en');
  });
  it('renders a single input (no locale tags) for a non-multilingual field', () => {
    const field: SchemaField = { id: 'f1', key: 'code', label: 'Code', type: 'text', multilingual: false };
    render(RecordField, { field, value: 'X1', locales: ['en', 'vi'], onChange: vi.fn() });
    expect(screen.getByDisplayValue('X1')).toBeInTheDocument();
    expect(screen.queryByText('EN')).not.toBeInTheDocument();
  });
  it('renders ImageField for an image field', () => {
    const field: SchemaField = { id: 'f3', key: 'pic', label: 'Pic', type: 'image' };
    render(RecordField, { field, value: 'http://x/a.png', locales: ['en'], onChange: vi.fn() });
    expect(screen.getByPlaceholderText(/image url/i)).toBeInTheDocument();
  });
});
