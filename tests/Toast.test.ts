import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Toast from '../src/lib/components/Toast.svelte';
import { showToast, toast } from '../src/lib/modules/json-table/stores';

describe('Toast', () => {
  it('shows nothing initially, then the message', async () => {
    toast.set(null);
    render(Toast);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    showToast('Saved');
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
  });
});
