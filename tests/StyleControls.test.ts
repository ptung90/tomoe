import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent, screen } from '@testing-library/svelte';
import StyleControls from '../src/lib/modules/flashcards/components/StyleControls.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => { S.initProject(); });

const tab = (name: string | RegExp) => fireEvent.click(screen.getByRole('tab', { name }));

describe('StyleControls (tabbed)', () => {
  it('defaults to the Text→Title panel; other sections are hidden until their tab is active', () => {
    render(StyleControls);
    expect(screen.getByLabelText('Family')).toBeInTheDocument();   // Title font shown
    expect(screen.queryByLabelText('Width')).not.toBeInTheDocument();      // Border hidden
    expect(screen.queryByLabelText('Fit')).not.toBeInTheDocument();        // Image hidden
  });

  it('Card → Border: width commits', async () => {
    render(StyleControls);
    await tab('Card');
    await fireEvent.change(screen.getByLabelText('Width'), { target: { value: '6' } });
    expect(get(S.project).settings.border.width).toBe(6);
  });

  it('Card → Border: color applies live via input', async () => {
    const { container } = render(StyleControls);
    await tab('Card');
    const colorInput = container.querySelector('input[type=color]') as HTMLInputElement;
    await fireEvent.input(colorInput, { target: { value: '#123456' } });
    expect(get(S.project).settings.border.color).toBe('#123456');
  });

  it('Card → Spacing: margin + vertical align commit', async () => {
    render(StyleControls);
    await tab('Card'); await tab('Spacing');
    await fireEvent.change(screen.getByLabelText('Card margin (mm)'), { target: { value: '12' } });
    await fireEvent.change(screen.getByLabelText('Vertical text align'), { target: { value: 'middle' } });
    expect(get(S.project).settings.margin).toBe(12);
    expect(get(S.project).settings.textVAlign).toBe('middle');
  });

  it('Image: fit commit', async () => {
    render(StyleControls);
    await tab('Image');
    await fireEvent.change(screen.getByLabelText('Fit'), { target: { value: 'contain' } });
    expect(get(S.project).settings.image.backgroundSize).toBe('contain');
  });

  it('Image: image-height control (image layout) sets template.imageHeightPercent', async () => {
    const sid = S.addSchema('Cards');
    S.updateSchema(sid, { fields: [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
      { id: 'f2', key: 'pic', label: 'Pic', type: 'image' },
    ] });
    S.addRecord(sid); // selects it; auto layout 1top-1bot has an image area
    render(StyleControls);
    await tab('Image');
    await fireEvent.change(screen.getByLabelText('Image height %'), { target: { value: '35' } });
    expect(get(S.project).schemas[0].cardTemplates[0].imageHeightPercent).toBe(35);
  });

  it('Image: no image-height control for a text-only layout', async () => {
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true }] });
    S.addRecord(sid); // fulltext (no image field)
    render(StyleControls);
    await tab('Image');
    expect(screen.queryByLabelText('Image height %')).not.toBeInTheDocument();
  });

  it('Text → Title: family + line-height + align commit to titleFont', async () => {
    render(StyleControls); // Title is the default sub-tab
    await fireEvent.change(screen.getByLabelText('Family'), { target: { value: 'serif' } });
    await fireEvent.change(screen.getByLabelText('Line height'), { target: { value: '1.4' } });
    await fireEvent.click(screen.getByLabelText('align center'));
    expect(get(S.project).settings.titleFont.family).toBe('serif');
    expect(get(S.project).settings.titleFont.lineHeight).toBe(1.4);
    expect(get(S.project).settings.titleFont.textAlign).toBe('center');
  });

  it('Text → Content: family commits to contentFont', async () => {
    render(StyleControls);
    await tab('Content');
    await fireEvent.change(screen.getByLabelText('Family'), { target: { value: 'monospace' } });
    expect(get(S.project).settings.contentFont.family).toBe('monospace');
  });

  it('Card → Fields: toggling off Labels / Title sets hideSectionLabels / hideTitle on the template', async () => {
    const sid = S.addSchema('W');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text', multilingual: true }] });
    S.addRecord(sid); // selects it → the schema's template exists
    render(StyleControls);
    await tab('Card'); await tab('Fields');
    await fireEvent.change(screen.getByLabelText('Show field labels'), { target: { checked: false } });
    await fireEvent.change(screen.getByLabelText('Show title'), { target: { checked: false } });
    const tpl = get(S.project).schemas[0].cardTemplates[0];
    expect(tpl.hideSectionLabels).toBe(true);
    expect(tpl.hideTitle).toBe(true);
  });
});
