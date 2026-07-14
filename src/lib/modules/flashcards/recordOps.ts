import { uid, type Project, type RecordItem, type SchemaField, type LocalizedText, type Schema } from './model';

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
