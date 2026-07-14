import type { Project } from '../model';

/** Stable non-crypto string hash (ported from flashcard-creator _hashStr). */
function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Deterministic hash of the given records' fields, in the given id order.
 *  Missing (deleted) records are skipped, so a deletion changes the hash. */
export function hashFields(project: Project, recordIds: string[]): string {
  const payload = recordIds
    .map((id) => project.records.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ id: r.id, fields: r.fields }));
  return hashStr(JSON.stringify(payload));
}
