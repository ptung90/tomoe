import { DEFAULT_SETTINGS, type SchemaField, type CardTemplate, type Settings } from '../model';

/** The portable, id-less shape of a schema: everything needed to recreate it in another
 *  project, minus the schema's own `id` (a fresh one is always assigned on insert — see
 *  `cardMapping.insertSchema`) and minus records/cards (never shared). A live `Schema` (which
 *  has an `id`) is structurally assignable here since the extra `id` field is simply ignored. */
export interface SchemaExportPayload {
  name: string;
  fields: SchemaField[];
  cardTemplates: CardTemplate[];
}

/** An app-level Schema Library entry (localStorage, NOT part of any project document). */
export interface SchemaLibraryEntry {
  id: string;
  name: string;
  addedAt: number;
  schema: SchemaExportPayload;
  settings: Settings;
}

interface SchemaExportFile {
  tomoeSchema: 1;
  schema: SchemaExportPayload;
  settings: Settings;
}

/** Merge a (possibly partial/legacy) settings object over DEFAULT_SETTINGS, field-group by
 *  field-group — mirrors `parseProject`'s settings merge in model.ts so a schema exported from
 *  an old Tomoe build still fills in newly-added Settings keys. */
export function mergeSettingsOverDefaults(s: Partial<Settings> | undefined | null): Settings {
  const src = s ?? {};
  return {
    ...DEFAULT_SETTINGS, ...src,
    border: { ...DEFAULT_SETTINGS.border, ...(src.border ?? {}) },
    image: { ...DEFAULT_SETTINGS.image, ...(src.image ?? {}) },
    titleFont: { ...DEFAULT_SETTINGS.titleFont, ...(src.titleFont ?? {}) },
    contentFont: { ...DEFAULT_SETTINGS.contentFont, ...(src.contentFont ?? {}) },
  };
}

/** Emit a portable `.schema.json` payload for `schema` — fields + cardTemplates only, no
 *  records/cards ever. Deep-cloned so later mutation of the source can't retroactively change
 *  already-serialized text. Pretty JSON + trailing newline (matches `serializeProject`). */
export function serializeSchemaExport(schema: SchemaExportPayload, settings: Settings): string {
  const out: SchemaExportFile = {
    tomoeSchema: 1,
    schema: structuredClone({ name: schema.name, fields: schema.fields, cardTemplates: schema.cardTemplates }),
    settings: structuredClone(settings),
  };
  return JSON.stringify(out, null, 2) + '\n';
}

/** Parse a portable schema file. Throws `Error('Not a valid Tomoe schema file')` when the
 *  `tomoeSchema` marker is missing or `schema.fields`/`schema.cardTemplates` aren't arrays.
 *  Settings are merged over DEFAULT_SETTINGS for forward-safety, like `parseProject`. */
export function parseSchemaExport(text: string): { schema: SchemaExportPayload; settings: Settings } {
  let raw: any;
  try { raw = JSON.parse(text); } catch { throw new Error('Not a valid Tomoe schema file'); }
  if (
    !raw || typeof raw !== 'object' || raw.tomoeSchema !== 1 ||
    !raw.schema || typeof raw.schema !== 'object' ||
    !Array.isArray(raw.schema.fields) || !Array.isArray(raw.schema.cardTemplates)
  ) {
    throw new Error('Not a valid Tomoe schema file');
  }
  return {
    schema: { name: raw.schema.name || 'Records', fields: raw.schema.fields, cardTemplates: raw.schema.cardTemplates },
    settings: mergeSettingsOverDefaults(raw.settings),
  };
}

/** True only for text that parses as JSON AND carries the `tomoeSchema` marker + well-formed
 *  schema shape — used by the shell's open-router to gate `.schema.json` files away from normal
 *  module routing. Pure; never throws (mirrors `looksLikeFlashcards` in model.ts). */
export function looksLikeSchemaFile(text: string): boolean {
  try {
    const raw = JSON.parse(text);
    return !!raw && typeof raw === 'object' && raw.tomoeSchema === 1 &&
      !!raw.schema && typeof raw.schema === 'object' &&
      Array.isArray(raw.schema.fields) && Array.isArray(raw.schema.cardTemplates);
  } catch { return false; }
}
