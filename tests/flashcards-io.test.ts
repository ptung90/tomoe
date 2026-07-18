import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const { writeFile, save, showToast, userName } = vi.hoisted(() => ({
  writeFile: vi.fn(async (_path: string, _contents: Uint8Array) => {}),
  save: vi.fn(async () => null as string | null),
  showToast: vi.fn(),
  // minimal Readable<string> so the module's save path (doWrite -> get(userName)) resolves
  userName: { subscribe: (run: (v: string) => void) => { run('Tester'); return () => {}; } },
}));

vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save }));
vi.mock('../src/lib/shell', () => ({ showToast, userName }));
vi.mock('../src/lib/modules/flashcards/io/backupService', () => ({ writeBackup: vi.fn() }));

import { flashcards } from '../src/lib/modules/flashcards/module';
import { project, filePath, dirty } from '../src/lib/modules/flashcards/stores';
import { newProject, serializeProject } from '../src/lib/modules/flashcards/model';

beforeEach(() => {
  vi.clearAllMocks();
  flashcards.newDoc();
});

describe('flashcards module io', () => {
  it('open() parses text and loads the project into the store, binding the file path', () => {
    const p = newProject();
    p.projectName = 'Birds';
    flashcards.open(serializeProject(p), '/x.tomoe.json');

    expect(get(project).projectName).toBe('Birds');
    expect(get(filePath)).toBe('/x.tomoe.json');
    expect(get(dirty)).toBe(false);
  });

  it('open() discards a path that does not end in .tomoe.json', () => {
    flashcards.open(serializeProject(newProject()), '/x.json');
    expect(get(filePath)).toBeNull();
  });

  it('save() with a bound file path writes serialized project text ending in a newline', async () => {
    flashcards.open(serializeProject(newProject()), '/x.tomoe.json');
    await flashcards.save();

    expect(writeFile).toHaveBeenCalledTimes(1);
    const [calledPath, bytes] = writeFile.mock.calls[0] as [string, Uint8Array];
    expect(calledPath).toBe('/x.tomoe.json');
    expect(new TextDecoder().decode(bytes).endsWith('\n')).toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(get(dirty)).toBe(false);
    expect(showToast).toHaveBeenCalledWith('Saved');
  });

  it('save() with no bound file path opens the native save dialog', async () => {
    flashcards.newDoc();
    await flashcards.save();

    expect(save).toHaveBeenCalledTimes(1);
    expect(writeFile).not.toHaveBeenCalled();
  });
});
