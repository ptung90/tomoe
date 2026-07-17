import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const { writeTextFile, save, showToast, userName } = vi.hoisted(() => ({
  writeTextFile: vi.fn(async (_path: string, _contents: string) => {}),
  save: vi.fn(async () => null as string | null),
  showToast: vi.fn(),
  // minimal Readable<string> so the module's save path (doWrite -> get(userName)) resolves
  userName: { subscribe: (run: (v: string) => void) => { run('Tester'); return () => {}; } },
}));

vi.mock('@tauri-apps/plugin-fs', () => ({ writeTextFile }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save }));
vi.mock('../src/lib/shell', () => ({ showToast, userName }));
// Isolate the module's save/open from real lock-file fs so writeTextFile counts stay about the project.
vi.mock('../src/lib/modules/flashcards/io/lockService', () => ({
  acquireLock: vi.fn(), checkAndAcquireLock: vi.fn(), releaseLock: vi.fn(),
}));
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

    expect(writeTextFile).toHaveBeenCalledTimes(1);
    const [calledPath, calledText] = writeTextFile.mock.calls[0];
    expect(calledPath).toBe('/x.tomoe.json');
    expect(calledText.endsWith('\n')).toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(get(dirty)).toBe(false);
    expect(showToast).toHaveBeenCalledWith('Saved');
  });

  it('save() with no bound file path opens the native save dialog', async () => {
    flashcards.newDoc();
    await flashcards.save();

    expect(save).toHaveBeenCalledTimes(1);
    expect(writeTextFile).not.toHaveBeenCalled();
  });
});
