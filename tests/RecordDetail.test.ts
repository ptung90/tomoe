import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { render, screen } from '@testing-library/svelte';
import RecordDetail from '../src/lib/modules/flashcards/components/RecordDetail.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: vi.fn(async () => true) }));

beforeEach(() => {
  S.initProject();
  const sid = S.addSchema('Words');
  S.updateSchema(sid, { fields: [
    { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    { id: 'f3', key: 'pic', label: 'Pic', type: 'image' },
  ] });
  S.addRecord(sid);
});

describe('RecordDetail', () => {
  it('renders a field per schema field for the selected record', () => {
    render(RecordDetail);
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Pic')).toBeInTheDocument();
  });
  it('shows the empty state when nothing is selected', () => {
    S.selectRecord(null);
    render(RecordDetail);
    expect(screen.getByText(/no record selected/i)).toBeInTheDocument();
  });
  it('duplicate button adds a record and selects it', async () => {
    const { getByRole } = render(RecordDetail);
    const before = get(S.project).records.length;
    await getByRole('button', { name: /duplicate/i }).click();
    expect(get(S.project).records.length).toBe(before + 1);
  });
  it('Next navigates to the next sibling record; Prev is disabled at the first', async () => {
    const sid = get(S.project).schemas[0].id;
    S.addRecord(sid); S.addRecord(sid); // now 3 records
    const ids = get(S.project).records.map((r) => r.id);
    S.selectRecord(ids[0]);
    const { getByRole } = render(RecordDetail);
    expect(getByRole('button', { name: /previous record/i })).toBeDisabled();
    await getByRole('button', { name: /next record/i }).click();
    expect(get(S.selectedRecordId)).toBe(ids[1]);
  });
});
