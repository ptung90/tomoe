import { uid, type Project, type RecordItem, type SchemaField, type LocalizedText, type Schema } from './model';
import { IMAGE_PLACEHOLDER } from './lib/copyStrip';

export function emptyFieldValue(field: SchemaField, locales: string[]): LocalizedText {
  if (field.type === 'image' || field.multilingual === false) return '';
  const o: Record<string, string> = {};
  for (const l of locales) o[l] = '';
  return o;
}

export function addRecord(p: Project, schemaId: string): { project: Project; id: string } {
  const schema = p.schemas.find((s) => s.id === schemaId);
  if (!schema) return { project: p, id: '' };
  const id = uid('rec');
  const fields: Record<string, LocalizedText> = {};
  for (const f of schema.fields) fields[f.key] = emptyFieldValue(f, p.locales);
  const rec: RecordItem = { id, schemaId, fieldsHash: '', fields };
  return { project: { ...p, records: [...p.records, rec] }, id };
}

export function deleteRecord(p: Project, id: string): Project {
  return { ...p, records: p.records.filter((r) => r.id !== id) };
}

export function duplicateRecord(p: Project, id: string): { project: Project; id: string } {
  const idx = p.records.findIndex((r) => r.id === id);
  if (idx < 0) return { project: p, id: '' };
  const newId = uid('rec');
  const clone: RecordItem = { ...structuredClone(p.records[idx]), id: newId, fieldsHash: '' };
  const records = [...p.records];
  records.splice(idx + 1, 0, clone);
  return { project: { ...p, records }, id: newId };
}

export function setField(
  p: Project, recordId: string, key: string, value: string, locale?: string,
): Project {
  const records = p.records.map((r) => {
    if (r.id !== recordId) return r;
    const cur = r.fields[key];
    let next: LocalizedText;
    if (locale) {
      const base = cur && typeof cur === 'object' ? cur : {};
      next = { ...base, [locale]: value };
    } else {
      next = value;
    }
    return { ...r, fields: { ...r.fields, [key]: next } };
  });
  return { ...p, records };
}

/** Reconcile every record's fields to its schema: add missing, drop unknown,
 *  and convert string<->multilingual-object per the field's current type. */
export function migrateRecordFields(p: Project): Project {
  const records = p.records.map((rec) => {
    const schema = p.schemas.find((s) => s.id === rec.schemaId);
    if (!schema) return rec;
    const fields: Record<string, LocalizedText> = {};
    for (const f of schema.fields) {
      const cur = rec.fields[f.key];
      if (f.type === 'image' || f.multilingual === false) {
        fields[f.key] = typeof cur === 'string'
          ? cur
          : cur && typeof cur === 'object'
            ? (cur[p.activeLocale] ?? Object.values(cur)[0] ?? '')
            : '';
      } else {
        const obj: Record<string, string> = {};
        if (typeof cur === 'string') { for (const l of p.locales) obj[l] = cur; }
        else if (cur && typeof cur === 'object') { for (const l of p.locales) obj[l] = cur[l] ?? ''; }
        else { for (const l of p.locales) obj[l] = ''; }
        fields[f.key] = obj;
      }
    }
    return { ...rec, fields };
  });
  return { ...p, records };
}

export function addSchema(p: Project, name: string): { project: Project; id: string } {
  const id = uid('sch');
  const schema: Schema = { id, name: name || 'Untitled', fields: [], cardTemplates: [] };
  return { project: { ...p, schemas: [...p.schemas, schema] }, id };
}

export function updateSchema(
  p: Project, schemaId: string, patch: { name?: string; fields?: SchemaField[] },
): Project {
  const schemas = p.schemas.map((s) =>
    s.id === schemaId
      ? { ...s, ...(patch.name !== undefined ? { name: patch.name } : {}),
              ...(patch.fields ? { fields: patch.fields } : {}) }
      : s,
  );
  return migrateRecordFields({ ...p, schemas });
}

export function deleteSchema(p: Project, schemaId: string): Project {
  return {
    ...p,
    schemas: p.schemas.filter((s) => s.id !== schemaId),
    records: p.records.filter((r) => r.schemaId !== schemaId),
  };
}

export function addLocale(p: Project, locale: string): Project {
  if (!locale || p.locales.includes(locale)) return p;
  return migrateRecordFields({ ...p, locales: [...p.locales, locale] });
}

export function removeLocale(p: Project, locale: string): Project {
  if (!p.locales.includes(locale) || p.locales.length <= 1) return p;
  const locales = p.locales.filter((l) => l !== locale);
  const activeLocale = p.activeLocale === locale ? locales[0] : p.activeLocale;
  return migrateRecordFields({ ...p, locales, activeLocale });
}

export function setActiveLocale(p: Project, locale: string): Project {
  if (!p.locales.includes(locale)) return p;
  return { ...p, activeLocale: locale };
}

export function importRecords(
  p: Project, schemaId: string, incoming: RecordItem[], mode: 'overwrite' | 'append' | 'merge',
): Project {
  if (!p.schemas.some((s) => s.id === schemaId)) return p;
  const normalized: RecordItem[] = incoming.map((r) => ({
    ...r,
    id: r.id || uid('rec'),
    schemaId,
    fieldsHash: r.fieldsHash ?? '',
    fields: r.fields ?? {},
  }));
  if (mode === 'merge') return migrateRecordFields({ ...p, records: mergeRecords(p.records, normalized, schemaId) });
  const records = mode === 'overwrite'
    ? [...p.records.filter((r) => r.schemaId !== schemaId), ...normalized]
    : [...p.records, ...normalized];
  return migrateRecordFields({ ...p, records });
}

/** Overlay `incoming` onto `existing` by record id (within `schemaId`): each
 *  incoming field is applied EXCEPT where its value is the IMAGE_PLACEHOLDER —
 *  there the existing field is kept (real image survives). Incoming records with
 *  no id match are appended, with any leftover placeholder cleared to ''.
 *  Recovers text edits from an image-stripped backup without losing images. */
function mergeRecords(existing: RecordItem[], incoming: RecordItem[], schemaId: string): RecordItem[] {
  const byId = new Map(incoming.map((r) => [r.id, r]));
  const merged = existing.map((r) => {
    const inc = r.schemaId === schemaId ? byId.get(r.id) : undefined;
    if (!inc) return r;
    byId.delete(r.id); // consumed — won't be appended
    const fields = { ...r.fields };
    for (const [k, v] of Object.entries(inc.fields)) {
      if (v === IMAGE_PLACEHOLDER) continue; // keep existing image, ignore placeholder
      fields[k] = v;
    }
    return { ...r, fields };
  });
  const appended = incoming.filter((r) => byId.has(r.id)).map((r) => {
    const fields = { ...r.fields };
    for (const [k, v] of Object.entries(fields)) if (v === IMAGE_PLACEHOLDER) fields[k] = ''; // no image to recover
    return { ...r, fields };
  });
  return [...merged, ...appended];
}

/** Set image-field values on records in one immutable pass. Each update writes
 *  `url` to `key` on the record with `recordId`; unknown recordIds are ignored. */
export function setImageFields(
  p: Project, updates: { recordId: string; key: string; url: string }[],
): Project {
  if (updates.length === 0) return p;
  const byId = new Map<string, { key: string; url: string }[]>();
  for (const u of updates) {
    const list = byId.get(u.recordId) ?? [];
    list.push({ key: u.key, url: u.url });
    byId.set(u.recordId, list);
  }
  const records = p.records.map((r) => {
    const ups = byId.get(r.id);
    if (!ups) return r;
    const fields = { ...r.fields };
    for (const { key, url } of ups) fields[key] = url;
    return { ...r, fields };
  });
  return { ...p, records };
}
