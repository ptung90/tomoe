import { describe, it, expect } from 'vitest';
import { slugifyName, timeStamp } from '../src/lib/modules/flashcards/lib/filename';
import { backupFileName, isBackupOf, selectToPrune } from '../src/lib/modules/flashcards/lib/backup';

describe('filename helpers', () => {
  it('slugifyName is Vietnamese-safe and file-safe', () => {
    expect(slugifyName('Việt Nam')).toBe('viet-nam');
    expect(slugifyName('Đà Nẵng!!')).toBe('da-nang');
    expect(slugifyName('')).toBe('');
  });
  it('timeStamp is YYYY-MM-DD_HHhMM', () => {
    expect(timeStamp(new Date(2026, 6, 17, 9, 5))).toBe('2026-07-17_09h05');
  });
});

describe('backup helpers', () => {
  it('backupFileName combines slug + stamp + ext, with a fallback', () => {
    expect(backupFileName('Việt Nam', '20260717-0905')).toBe('viet-nam-20260717-0905.tomoe.json');
    expect(backupFileName('', '20260717-0905')).toBe('project-20260717-0905.tomoe.json');
  });
  it('isBackupOf matches this project\'s backups only', () => {
    expect(isBackupOf('viet-nam-20260717-0905.tomoe.json', 'Việt Nam')).toBe(true);
    expect(isBackupOf('other-20260717-0905.tomoe.json', 'Việt Nam')).toBe(false);
    expect(isBackupOf('viet-nam-x.pdf', 'Việt Nam')).toBe(false);
  });
  it('selectToPrune keeps the newest N, returns the rest to delete', () => {
    const names = ['p-20260101-0000.tomoe.json', 'p-20260103-0000.tomoe.json', 'p-20260102-0000.tomoe.json'];
    expect(selectToPrune(names, 2)).toEqual(['p-20260101-0000.tomoe.json']); // oldest dropped
    expect(selectToPrune(names, 5)).toEqual([]);                              // nothing to prune
    expect(selectToPrune(names, 0)).toHaveLength(3);                          // keep none
  });
});
