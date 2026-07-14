import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent, screen } from '@testing-library/svelte';
import SchemaRecordList from '../src/lib/modules/flashcards/components/SchemaRecordList.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: vi.fn(async () => true) }));

function seed() {
  S.initProject();
  const sid = S.addSchema('Words');
  S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true }] });
  S.addRecord(sid);
  S.setField(get(S.project).records[0].id, 'title', 'Owl', 'en');
  return sid;
}
beforeEach(seed);

describe('SchemaRecordList', () => {
  it('shows the schema name and a row labelled by the first field', () => {
    render(SchemaRecordList);
    expect(screen.getByText('Words')).toBeInTheDocument();
    expect(screen.getByText('Owl')).toBeInTheDocument();
  });
  it('clicking a record selects it', async () => {
    render(SchemaRecordList);
    await fireEvent.click(screen.getByText('Owl'));
    expect(get(S.selectedRecordId)).toBe(get(S.project).records[0].id);
  });
  it('add-record button adds a record to that schema', async () => {
    const sid = get(S.project).schemas[0].id;
    render(SchemaRecordList);
    const before = get(S.project).records.length;
    await fireEvent.click(screen.getByRole('button', { name: /add record/i }));
    expect(get(S.project).records.length).toBe(before + 1);
    expect(get(S.project).records.at(-1)!.schemaId).toBe(sid);
  });
});
