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
});
