import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { render, screen } from '@testing-library/svelte';
import { parseProject, serializeProject, newProject } from '../src/lib/modules/flashcards/model';
import { lastEdit, relativeTime } from '../src/lib/modules/flashcards/lib/editLog';
import * as S from '../src/lib/modules/flashcards/stores';
import EditHistoryModal from '../src/lib/modules/flashcards/components/EditHistoryModal.svelte';

describe('model editLog', () => {
  it('newProject starts with an empty editLog', () => {
    expect(newProject().editLog).toEqual([]);
  });
  it('parseProject round-trips editLog and drops malformed entries', () => {
    const raw = JSON.stringify({ ...newProject(), editLog: [
      { by: 'Tung', at: '2026-07-17T00:00:00.000Z' },
      { by: 123, at: 'x' },   // malformed -> dropped
      { at: 'no-by' },        // malformed -> dropped
    ] });
    expect(parseProject(raw).editLog).toEqual([{ by: 'Tung', at: '2026-07-17T00:00:00.000Z' }]);
  });
  it('parseProject defaults editLog to [] when absent', () => {
    expect(parseProject(JSON.stringify({ schemas: [], records: [] })).editLog).toEqual([]);
  });
  it('serializeProject writes the editLog', () => {
    const p = newProject(); p.editLog = [{ by: 'X', at: '1' }];
    expect(serializeProject(p)).toContain('"editLog"');
  });
});

describe('editLog helpers', () => {
  it('lastEdit returns the most recent entry or null', () => {
    expect(lastEdit(undefined)).toBeNull();
    expect(lastEdit([])).toBeNull();
    expect(lastEdit([{ by: 'A', at: '1' }, { by: 'B', at: '2' }])).toEqual({ by: 'B', at: '2' });
  });
  it('relativeTime formats buckets and rejects garbage', () => {
    const now = Date.parse('2026-07-17T12:00:00.000Z');
    expect(relativeTime('2026-07-17T11:59:30.000Z', now)).toBe('just now');
    expect(relativeTime('2026-07-17T11:30:00.000Z', now)).toBe('30m ago');
    expect(relativeTime('2026-07-17T09:00:00.000Z', now)).toBe('3h ago');
    expect(relativeTime('2026-07-15T12:00:00.000Z', now)).toBe('2d ago');
    expect(relativeTime('nonsense', now)).toBe('');
  });
});

describe('stampEditLog', () => {
  beforeEach(() => S.initProject());
  it('appends an entry without adding an undo step or marking dirty', () => {
    const undoBefore = get(S.canUndo);
    S.stampEditLog('Tung', '2026-07-17T00:00:00.000Z');
    expect(get(S.project).editLog).toEqual([{ by: 'Tung', at: '2026-07-17T00:00:00.000Z' }]);
    expect(get(S.canUndo)).toBe(undoBefore);
    expect(get(S.dirty)).toBe(false);
  });
  it('caps the log at 50 entries, keeping the newest', () => {
    for (let i = 0; i < 55; i++) S.stampEditLog('U', String(i));
    const log = get(S.project).editLog!;
    expect(log.length).toBe(50);
    expect(log[0].at).toBe('5');    // oldest 5 dropped
    expect(log[49].at).toBe('54');
  });
});

describe('EditHistoryModal', () => {
  beforeEach(() => S.initProject());
  it('renders entries newest-first when open', () => {
    S.stampEditLog('Alice', '2026-07-17T01:00:00.000Z');
    S.stampEditLog('Bob', '2026-07-17T02:00:00.000Z');
    render(EditHistoryModal, { open: true, onClose: () => {} });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toContain('Bob');
    expect(items[1].textContent).toContain('Alice');
  });
  it('renders nothing when closed', () => {
    render(EditHistoryModal, { open: false, onClose: () => {} });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
