import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';

// jsdom has no canvas: neutralise cropperjs + its stylesheet so the component mounts.
vi.mock('cropperjs', () => ({
  default: class {
    getCroppedCanvas() { return null; }
    setAspectRatio() {}
    destroy() {}
  },
}));
vi.mock('cropperjs/dist/cropper.css', () => ({}));

// Spy the shell toast. CropModal imports it from ../../../shell; this test's ../src/lib/shell
// resolves to the same module file, so the mock applies to the component's import too.
// vi.mock factories are hoisted above top-level const declarations, so the spy must be created
// via vi.hoisted() — referencing a plain outer const here throws a ReferenceError at runtime.
const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../src/lib/shell', async (orig) => ({ ...(await orig() as object), showToast }));

import CropModal from '../src/lib/modules/flashcards/components/CropModal.svelte';

describe('CropModal (Crop | Erase editor)', () => {
  it('renders the Crop and Erase mode toggle, starting in Crop', () => {
    render(CropModal, { src: 'data:image/png;base64,AAAA', onApply: vi.fn(), onClose: vi.fn() });
    expect(screen.getByRole('button', { name: /crop/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /erase/i })).toBeInTheDocument();
    // Crop mode shows the aspect-ratio buttons and NOT the erase toolbar.
    expect(screen.getByRole('button', { name: /free/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument();
  });

  it('clicking Erase without a decodable image stays in Crop (guard is safe, no crash)', async () => {
    render(CropModal, { src: 'data:image/png;base64,AAAA', onApply: vi.fn(), onClose: vi.fn() });
    await fireEvent.click(screen.getByRole('button', { name: /erase/i }));
    // cropper is undefined under jsdom -> toErase() bails; we remain in Crop mode.
    expect(screen.getByRole('button', { name: /free/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument();
  });
});
