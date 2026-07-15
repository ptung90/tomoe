import { uid, type Project, type Schema, type CardTemplate, type RecordItem, type Card, type CardSection, type CardImage, type Settings, type StyleOverrides, type SchemaField } from './model';
import { resolveLocale } from './lib/card-render';
import { LAYOUT_SLOTS } from './lib/layouts';
import { mergeStyle } from './lib/style';

const DEFAULT_IMAGE_HEIGHT = 50;

export function deriveAutoTemplate(schema: Schema): CardTemplate {
  const hasImage = schema.fields.some((f) => f.type === 'image');
  const layout = hasImage ? '1top-1bot' : 'fulltext';
  return {
    // Deterministic (schema.id-derived), NOT uid('tpl') — every call for the same schema must agree
    // on the same id, so a virgin schema's (cardTemplates: []) packed cards (Card.templateId stamped
    // from a deriveAutoTemplate result) keep matching this same auto view on every later render/print/
    // gallery lookup. A non-deterministic id here silently orphans packed cards (see cardOps.packRecords,
    // printCards.collectPrintCards/sheetsByView, CardGallery.svelte).
    id: `${schema.id}::auto`,
    templateType: 'single',
    layout,
    size: null,
    orientation: undefined,
    hideTitle: false,
    hideSectionLabels: false,
    mapping: {},
  };
}

export function chunkRecords<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/** Build one Card from a single record — one Card = one record. */
export function recordToCard(
  record: RecordItem, schema: Schema, template: CardTemplate, settings: Settings, locale: string,
): Card {
  const orientation = template.style?.orientation ?? template.orientation ?? settings.orientation;
  // A view (template.fields) selects + orders a subset of the schema's fields; empty/undefined = all.
  const activeFields: SchemaField[] = template.fields?.length
    ? template.fields.map((k) => schema.fields.find((f) => f.key === k)).filter((f): f is SchemaField => !!f)
    : schema.fields;
  const textFields = activeFields.filter((f) => f.type !== 'image');
  const imageFields = activeFields.filter((f) => f.type === 'image');
  const titleField = textFields[0] ?? null;
  const sectionFields = titleField ? textFields.slice(1) : textFields;
  const slotCount = LAYOUT_SLOTS[template.layout] ?? 0;
  const images: CardImage[] = [];
  for (let i = 0; i < Math.min(slotCount, imageFields.length); i++) {
    const url = resolveLocale(record.fields[imageFields[i].key], locale);
    if (url) images.push({ slot: i, url });
  }
  const sections: CardSection[] = sectionFields.map((f) => (
    { id: uid('sec'), label: f.label, content: resolveLocale(record.fields[f.key], locale) }
  ));
  return {
    id: 'preview_' + record.id,
    layout: template.layout,
    imageHeightPercent: template.imageHeightPercent ?? DEFAULT_IMAGE_HEIGHT,
    images,
    title: titleField ? resolveLocale(record.fields[titleField.key], locale) : '',
    sections,
    orientation,
    hideTitle: template.hideTitle,
    hideSectionLabels: template.hideSectionLabels,
    recordId: record.id,
    templateId: template.id,
  };
}

const MAX_VIEW_LABEL = 24;
/** The display name for a view (a CardTemplate): the explicit `name` if set; else the label of
 *  its one selected field; else its selected fields' labels joined (truncated); else "View {n}"
 *  (1-based `index` — the caller passes the template's position in `schema.cardTemplates`). Pure. */
export function viewLabel(template: CardTemplate, schema: Schema, index: number): string {
  if (template.name) return template.name;
  const keys = template.fields ?? [];
  if (keys.length === 1) {
    const f = schema.fields.find((x) => x.key === keys[0]);
    if (f) return f.label;
  } else if (keys.length > 1) {
    const labels = keys.map((k) => schema.fields.find((x) => x.key === k)?.label ?? k);
    const joined = labels.join(' + ');
    return joined.length > MAX_VIEW_LABEL ? joined.slice(0, MAX_VIEW_LABEL - 1) + '…' : joined;
  }
  return `View ${index + 1}`;
}

export function applySettings(p: Project, patch: Partial<Settings> | StyleOverrides): Project {
  const s = p.settings;
  return { ...p, settings: {
    ...s, ...patch,
    border: { ...s.border, ...(patch.border ?? {}) },
    image: { ...s.image, ...(patch.image ?? {}) },
    titleFont: { ...s.titleFont, ...(patch.titleFont ?? {}) },
    contentFont: { ...s.contentFont, ...(patch.contentFont ?? {}) },
  } };
}

/** Index of the addressed template within a schema's cardTemplates: the exact templateId if
 *  found; the first view (index 0) if templateId is null/stale/unknown but the schema already
 *  has views; -1 only when the schema has NO views yet (the caller then creates the first one). */
function templateIndex(s: Schema, templateId: string | null): number {
  if (!s.cardTemplates.length) return -1;
  if (!templateId) return 0;
  const idx = s.cardTemplates.findIndex((t) => t.id === templateId);
  return idx === -1 ? 0 : idx;
}

export function applyTemplatePatch(p: Project, schemaId: string, templateId: string | null, patch: Partial<CardTemplate>): Project {
  return { ...p, schemas: p.schemas.map((s) => {
    if (s.id !== schemaId) return s;
    const idx = templateIndex(s, templateId);
    if (idx === -1) return { ...s, cardTemplates: [{ ...deriveAutoTemplate(s), ...patch }, ...s.cardTemplates] };
    const cardTemplates = s.cardTemplates.slice();
    cardTemplates[idx] = { ...cardTemplates[idx], ...patch };
    return { ...s, cardTemplates };
  }) };
}

export function applyTemplateStyle(p: Project, schemaId: string, templateId: string | null, patch: StyleOverrides): Project {
  return { ...p, schemas: p.schemas.map((s) => {
    if (s.id !== schemaId) return s;
    const idx = templateIndex(s, templateId);
    if (idx === -1) {
      const created = deriveAutoTemplate(s);
      return { ...s, cardTemplates: [{ ...created, style: mergeStyle(created.style, patch) }, ...s.cardTemplates] };
    }
    const cardTemplates = s.cardTemplates.slice();
    cardTemplates[idx] = { ...cardTemplates[idx], style: mergeStyle(cardTemplates[idx].style, patch) };
    return { ...s, cardTemplates };
  }) };
}

// ── Views (multi-view per schema): a "view" is one entry in Schema.cardTemplates ──
/** Adds one more view than the schema currently shows. A virgin schema (cardTemplates: []) only
 *  ever DISPLAYS one synthetic auto-derived view (see deriveAutoTemplate) — it is never persisted
 *  until something writes to it. So "add a view" here first MATERIALIZES that baseline view as a
 *  real, persisted cardTemplates[0], then appends the new one after it — the user goes from
 *  "View 1" (implicit) to "View 1" + "View 2" (both real), not from nothing to a single view. */
export function addView(p: Project, schemaId: string): { project: Project; id: string | null } {
  const schema = p.schemas.find((s) => s.id === schemaId);
  if (!schema) return { project: p, id: null };
  const baseline = schema.cardTemplates.length ? schema.cardTemplates : [deriveAutoTemplate(schema)];
  const created: CardTemplate = { ...deriveAutoTemplate(schema), id: uid('tpl') };
  const project = { ...p, schemas: p.schemas.map((s) => (s.id === schemaId ? { ...s, cardTemplates: [...baseline, created] } : s)) };
  return { project, id: created.id };
}

export function renameView(p: Project, schemaId: string, templateId: string, name: string): Project {
  return { ...p, schemas: p.schemas.map((s) => (s.id !== schemaId ? s : {
    ...s, cardTemplates: s.cardTemplates.map((t) => (t.id === templateId ? { ...t, name } : t)),
  })) };
}

/** Refuses to delete a schema's last remaining view — a schema must always keep >=1 once it has any. */
export function deleteView(p: Project, schemaId: string, templateId: string): Project {
  const schema = p.schemas.find((s) => s.id === schemaId);
  if (!schema || schema.cardTemplates.length <= 1) return p;
  return { ...p, schemas: p.schemas.map((s) => (s.id !== schemaId ? s : {
    ...s, cardTemplates: s.cardTemplates.filter((t) => t.id !== templateId),
  })) };
}

export function setViewFields(p: Project, schemaId: string, templateId: string, keys: string[]): Project {
  return { ...p, schemas: p.schemas.map((s) => {
    if (s.id !== schemaId) return s;
    const idx = templateIndex(s, templateId);
    if (idx === -1) return { ...s, cardTemplates: [{ ...deriveAutoTemplate(s), fields: keys }, ...s.cardTemplates] };
    const cardTemplates = s.cardTemplates.slice();
    cardTemplates[idx] = { ...cardTemplates[idx], fields: keys };
    return { ...s, cardTemplates };
  }) };
}
