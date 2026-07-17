import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { userName, setUserName, configOpen, backupEnabled, setBackupEnabled } from '../src/lib/shell';
import { continentColors, resetContinentColors } from '../src/lib/modules/flashcards/stores';
import ConfigModal from '../src/lib/components/ConfigModal.svelte';

beforeEach(() => { localStorage.clear(); setUserName(''); setBackupEnabled(false); resetContinentColors(); configOpen.set(false); });

describe('shell userName identity', () => {
  it('setUserName updates the store and persists to localStorage', () => {
    setUserName('Tung');
    expect(get(userName)).toBe('Tung');
    expect(localStorage.getItem('tomoe.userName')).toBe('Tung');
  });

  it('overwrites a previous name', () => {
    setUserName('A');
    setUserName('B');
    expect(get(userName)).toBe('B');
    expect(localStorage.getItem('tomoe.userName')).toBe('B');
  });
});

describe('ConfigModal — Your name field', () => {
  it('renders the name field and writes edits to the identity store', async () => {
    configOpen.set(true);
    render(ConfigModal);
    const input = screen.getByLabelText('your name') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Tung' } });
    expect(get(userName)).toBe('Tung');
    expect(localStorage.getItem('tomoe.userName')).toBe('Tung');
  });
});

describe('ConfigModal — Backups toggle', () => {
  it('enables auto-backup from Settings', async () => {
    configOpen.set(true);
    render(ConfigModal);
    await fireEvent.click(screen.getByLabelText('enable backups'));
    expect(get(backupEnabled)).toBe(true);
    expect(localStorage.getItem('tomoe.backup.enabled')).toBe('1');
  });
});

describe('ConfigModal — Continent colors', () => {
  it('remaps a continent color from Settings (English labels)', async () => {
    configOpen.set(true);
    render(ConfigModal);
    await fireEvent.input(screen.getByLabelText('Asia color'), { target: { value: '#112233' } });
    expect(get(continentColors).asia).toBe('#112233');
  });
});
