import type { CardTemplate, Project } from '../model';

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

/** Deterministic hash of a packed card's full source: the record's fields AND the packing view's
 *  own field-selection + layout. A card is only "synced" while BOTH its source record and its own
 *  view are unchanged since it was packed — a view's `fields`/`layout` edit must also mark every
 *  card packed from that view stale (see isCardStale in cardOps.ts). `template` may be null (e.g.
 *  the card's source record/schema no longer exists) — hashFields alone already changes in that
 *  case, so a constant view signature is fine. Pure/deterministic. */
export function hashCardSource(project: Project, recordId: string, template: CardTemplate | null): string {
  const base = hashFields(project, [recordId]);
  const viewSig = JSON.stringify({ fields: template?.fields ?? null, layout: template?.layout ?? null });
  return hashStr(base + viewSig);
}
