import { describe, it, expect, beforeEach } from 'vitest';
import { resolveTheme, applyTheme, loadTheme } from '../src/lib/theme';

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });

describe('theme', () => {
  it('resolves system to the media preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
  it('applyTheme sets data-theme for explicit modes and clears for system', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
  it('applyTheme persists and loadTheme restores', () => {
    applyTheme('dark');
    expect(loadTheme()).toBe('dark');
    expect(loadTheme()).not.toBe('system');
  });
  it('loadTheme defaults to system', () => {
    expect(loadTheme()).toBe('system');
  });
});
