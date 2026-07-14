import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import NodeView from '../src/lib/components/NodeView.svelte';
import { loadDocument } from '../src/lib/stores';

beforeEach(() => loadDocument({ words: ['cat'], meta: { v: 1 }, rows: [{ a: 1 }] }, null));

describe('NodeView', () => {
  it('renders chips for a scalar array', () => {
    render(NodeView, { value: ['cat'], path: ['words'] });
    expect(screen.getByDisplayValue('cat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
  });
  it('renders a form for an object', () => {
    render(NodeView, { value: { v: 1 }, path: ['meta'] });
    expect(screen.getByText('v')).toBeInTheDocument();
  });
  it('renders a table for an array of objects', () => {
    render(NodeView, { value: [{ a: 1 }], path: ['rows'] });
    expect(screen.getByRole('columnheader', { name: 'a' })).toBeInTheDocument();
  });
});
