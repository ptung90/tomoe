import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TreeNode from '../src/lib/components/TreeNode.svelte';
import { loadDocument } from '../src/lib/stores';

const long = 'Folders and graphemes follow the sound-family list in the PDF';

beforeEach(() => loadDocument({ notes: [long] }, null));

describe('TreeNode array-item label', () => {
  it('caps a long array-item preview with an ellipsis but keeps the full title', () => {
    render(TreeNode, { label: long, value: long, path: ['notes', 0], query: '', index: 0 });
    const btn = screen.getByRole('button');
    expect(btn.textContent!.trim().length).toBeLessThanOrEqual(24);
    expect(btn.textContent).toContain('…');
    expect(btn.getAttribute('title')).toBe(long); // full text on hover
  });
  it('does not cap object-key labels (no index)', () => {
    const key = 'aReasonablyNamedKey';
    render(TreeNode, { label: key, value: 'x', path: [key], query: '', index: null });
    expect(screen.getByRole('button', { name: key })).toBeInTheDocument();
  });
});
