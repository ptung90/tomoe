import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import App from '../src/App.svelte';
import { loadDocument } from '../src/lib/stores';

describe('App', () => {
  it('shows empty state when no document', () => {
    loadDocument(null, null); // null is a valid JsonValue → resets to empty
    render(App);
    expect(screen.getByText(/Open a JSON file to start/i)).toBeInTheDocument();
  });
  it('renders tree + detail when a document is loaded', () => {
    loadDocument({ words: ['cat'] }, '/tmp/x.json');
    render(App);
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument();
    // 'root' appears both as the tree root and the breadcrumb root.
    expect(screen.getAllByRole('button', { name: 'root' }).length).toBeGreaterThan(0);
  });
});
