import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent, screen } from '@testing-library/svelte';
import SchemaLibraryModal from '../src/lib/modules/flashcards/components/SchemaLibraryModal.svelte';
import * as S from '../src/lib/modules/flashcards/stores';
import { serializeSchemaExport } from '../src/lib/modules/flashcards/io/schemaIO';
import { DEFAULT_SETTINGS } from '../src/lib/modules/flashcards/model';

const { openDialog, saveDialog, confirmDialog, readTextFile, writeTextFile, showToast } = vi.hoisted(() => ({
  openDialog: vi.fn(),
  saveDialog: vi.fn(),
  confirmDialog: vi.fn(async () => true),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(async (_path: string, _contents: string) => {}),
  showToast: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openDialog, save: saveDialog, confirm: confirmDialog }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile, writeTextFile }));
vi.mock('../src/lib/shell', () => ({ showToast }));

beforeEach(() => {
  localStorage.clear();
  S.initProject();
  S.schemaLibraryOpen.set(false);
  vi.clearAllMocks();
});

describe('SchemaLibraryModal', () => {
  it('renders nothing when closed', () => {
    render(SchemaLibraryModal);
    expect(screen.queryByText('Schema library')).not.toBeInTheDocument();
  });

  it('shows the empty state when open with no entries', () => {
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    expect(screen.getByText(/no schemas saved yet/i)).toBeInTheDocument();
  });

  it('lists an entry with name · fields · views · added-date', () => {
    S.addToLibrary({
      name: 'Verbs',
      schema: { name: 'Verbs', fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text' }], cardTemplates: [] },
      settings: DEFAULT_SETTINGS,
    });
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    expect(screen.getByText('Verbs')).toBeInTheDocument();
    expect(screen.getByText(/1 field · 1 view ·/)).toBeInTheDocument();
  });

  it('Add current schema adds the active project schema to the library', async () => {
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text' }] });
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /add current schema/i }));
    expect(get(S.schemaLibrary)).toHaveLength(1);
    expect(get(S.schemaLibrary)[0].name).toBe('Words');
    expect(showToast).toHaveBeenCalledWith("Added 'Words' to the schema library");
  });

  it('Add current schema is disabled when there is no active schema', () => {
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    expect(screen.getByRole('button', { name: /add current schema/i })).toBeDisabled();
  });

  it('Insert commits a fresh-id copy of the entry into the project', async () => {
    S.addToLibrary({
      name: 'Verbs',
      schema: { name: 'Verbs', fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text' }], cardTemplates: [] },
      settings: DEFAULT_SETTINGS,
    });
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /insert/i }));
    expect(get(S.project).schemas).toHaveLength(1);
    expect(get(S.project).schemas[0].name).toBe('Verbs');
    expect(showToast).toHaveBeenCalledWith("Inserted 'Verbs' into the project");
  });

  it('Export writes the serialized schema to the chosen path', async () => {
    S.addToLibrary({ name: 'Verbs', schema: { name: 'Verbs', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    saveDialog.mockResolvedValue('/out/Verbs.schema.json');
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /export/i }));
    expect(writeTextFile).toHaveBeenCalledTimes(1);
    const [path, text] = writeTextFile.mock.calls[0];
    expect(path).toBe('/out/Verbs.schema.json');
    expect(JSON.parse(text).tomoeSchema).toBe(1);
  });

  it('Export does nothing when the save dialog is cancelled', async () => {
    S.addToLibrary({ name: 'Verbs', schema: { name: 'Verbs', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    saveDialog.mockResolvedValue(null);
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /export/i }));
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it('Delete removes the entry after confirming', async () => {
    S.addToLibrary({ name: 'Verbs', schema: { name: 'Verbs', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    confirmDialog.mockResolvedValue(true);
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(get(S.schemaLibrary)).toHaveLength(0);
  });

  it('Delete keeps the entry when the confirm dialog is declined', async () => {
    S.addToLibrary({ name: 'Verbs', schema: { name: 'Verbs', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    confirmDialog.mockResolvedValue(false);
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(get(S.schemaLibrary)).toHaveLength(1);
  });

  it('Import from file adds a valid schema export to the library and toasts', async () => {
    openDialog.mockResolvedValue('/in/verbs.schema.json');
    const text = serializeSchemaExport({ name: 'FromFile', fields: [], cardTemplates: [] }, DEFAULT_SETTINGS);
    readTextFile.mockResolvedValue(text);
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /import from file/i }));
    expect(get(S.schemaLibrary)).toHaveLength(1);
    expect(get(S.schemaLibrary)[0].name).toBe('FromFile');
    expect(showToast).toHaveBeenCalledWith("Added 'FromFile' to the schema library");
  });

  it('Import from file shows an error toast for a malformed file, without adding an entry', async () => {
    openDialog.mockResolvedValue('/in/bad.schema.json');
    readTextFile.mockResolvedValue('not json');
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /import from file/i }));
    expect(get(S.schemaLibrary)).toHaveLength(0);
    expect(showToast).toHaveBeenCalledWith('Not a valid Tomoe schema file', 'error');
  });

  it('Import from file shows an error toast (no throw) when the file cannot be read', async () => {
    openDialog.mockResolvedValue('/in/gone.schema.json');
    readTextFile.mockRejectedValue(new Error('file not found'));
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /import from file/i }));
    expect(get(S.schemaLibrary)).toHaveLength(0);
    expect(showToast).toHaveBeenCalledWith('Could not import: file not found', 'error');
  });

  it('opening an entry shows its fields and a read-only views summary', async () => {
    S.addToLibrary({
      name: 'Verbs',
      schema: {
        name: 'Verbs',
        fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text', multilingual: true }],
        cardTemplates: [{ id: 't1', templateType: 'single', layout: 'fulltext', size: null, fields: ['w'], mapping: {} }],
      },
      settings: DEFAULT_SETTINGS,
    });
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /toggle details/i }));
    expect((screen.getByLabelText('field key') as HTMLInputElement).value).toBe('w');
    expect((screen.getByLabelText('entry name') as HTMLInputElement).value).toBe('Verbs');
    expect(screen.getByText(/fulltext · 1 field/)).toBeInTheDocument();
  });

  it('editing the entry name commits to the store', async () => {
    const id = S.addToLibrary({ name: 'Verbs', schema: { name: 'Verbs', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /toggle details/i }));
    await fireEvent.input(screen.getByLabelText('entry name'), { target: { value: 'Nouns' } });
    const entry = get(S.schemaLibrary).find((e) => e.id === id)!;
    expect(entry.name).toBe('Nouns');
    expect(entry.schema.name).toBe('Nouns');
  });

  it('adding then removing a field commits to the entry', async () => {
    const id = S.addToLibrary({ name: 'Verbs', schema: { name: 'Verbs', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /toggle details/i }));
    await fireEvent.click(screen.getByRole('button', { name: /add field/i }));
    expect(get(S.schemaLibrary).find((e) => e.id === id)!.schema.fields).toHaveLength(1);
    await fireEvent.click(screen.getByRole('button', { name: /remove field/i }));
    expect(get(S.schemaLibrary).find((e) => e.id === id)!.schema.fields).toHaveLength(0);
  });

  it('Update from current schema overwrites the entry from the active project schema and toasts', async () => {
    const id = S.addToLibrary({ name: 'Lib', schema: { name: 'Lib', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    const sid = S.addSchema('Verbs');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text', multilingual: true }] });
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /toggle details/i }));
    await fireEvent.click(screen.getByRole('button', { name: /update from current schema/i }));
    const entry = get(S.schemaLibrary).find((e) => e.id === id)!;
    expect(entry.schema.name).toBe('Verbs');
    expect(entry.schema.fields[0].key).toBe('w');
    expect(showToast).toHaveBeenCalledWith("Updated 'Lib' from the current schema");
  });

  it('Update from current schema is disabled when there is no active schema', async () => {
    S.addToLibrary({ name: 'Lib', schema: { name: 'Lib', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /toggle details/i }));
    expect(screen.getByRole('button', { name: /update from current schema/i })).toBeDisabled();
  });

  it('seeds a per-locale label input from the entry\'s fields, showing a legacy string label under the first locale only', async () => {
    S.addToLibrary({
      name: 'Verbs',
      schema: { name: 'Verbs', fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text', multilingual: true }], cardTemplates: [] },
      settings: DEFAULT_SETTINGS,
    });
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /toggle details/i }));
    expect((screen.getByLabelText('field label en') as HTMLInputElement).value).toBe('Word');
    expect((screen.getByLabelText('field label vi') as HTMLInputElement).value).toBe('');
  });

  it('editing a locale label commits a LocalizedText object without clobbering the other locale', async () => {
    const id = S.addToLibrary({
      name: 'Verbs',
      schema: { name: 'Verbs', fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text', multilingual: true }], cardTemplates: [] },
      settings: DEFAULT_SETTINGS,
    });
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /toggle details/i }));
    await fireEvent.input(screen.getByLabelText('field label vi'), { target: { value: 'Từ' } });
    const entry = get(S.schemaLibrary).find((e) => e.id === id)!;
    expect(entry.schema.fields[0].label).toEqual({ en: 'Word', vi: 'Từ' });
  });
});
