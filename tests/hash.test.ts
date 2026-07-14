import { describe, it, expect } from 'vitest';
import { newProject, type Project } from '../src/lib/modules/flashcards/model';
import { hashFields } from '../src/lib/modules/flashcards/lib/hash';

function proj(): Project {
  const p = newProject();
  p.records.push(
    { id: 'r1', schemaId: 's1', fieldsHash: '', fields: { t: { en: 'Cat', vi: '' } } },
    { id: 'r2', schemaId: 's1', fieldsHash: '', fields: { t: { en: 'Dog', vi: '' } } },
  );
  return p;
}

describe('hashFields', () => {
  it('is deterministic + stable for the same records', () => {
    const p = proj();
    expect(hashFields(p, ['r1', 'r2'])).toBe(hashFields(p, ['r1', 'r2']));
  });
  it('changes when a source field changes', () => {
    const p = proj();
    const before = hashFields(p, ['r1', 'r2']);
    (p.records[0].fields.t as Record<string, string>).en = 'Cow';
    expect(hashFields(p, ['r1', 'r2'])).not.toBe(before);
  });
  it('changes when a source record is missing (deleted)', () => {
    const p = proj();
    const before = hashFields(p, ['r1', 'r2']);
    p.records = p.records.filter((r) => r.id !== 'r2');
    expect(hashFields(p, ['r1', 'r2'])).not.toBe(before);
  });
  it('reflects id order', () => {
    const p = proj();
    expect(hashFields(p, ['r1', 'r2'])).not.toBe(hashFields(p, ['r2', 'r1']));
  });
});
