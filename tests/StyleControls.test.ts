import { describe, it, expect, beforeEach } from 'vitest';
import { tick } from 'svelte';
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
    await tab('Border');
    await fireEvent.change(screen.getByLabelText('Width'), { target: { value: '6' } });
    expect(get(S.project).settings.border.width).toBe(6);
  });

  it('Card → Border: color applies live via input', async () => {
    const { container } = render(StyleControls);
    await tab('Border');
    const colorInput = container.querySelector('input[type=color]') as HTMLInputElement;
    await fireEvent.input(colorInput, { target: { value: '#123456' } });
    expect(get(S.project).settings.border.color).toBe('#123456');
  });

  it('Card → Spacing: margin + vertical align commit', async () => {
    render(StyleControls);
    await tab('Spacing');
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

  it('Card → Fields: toggling Labels sets hideSectionLabels (there is no separate Title toggle — hide the title field via the checklist)', async () => {
    const sid = S.addSchema('W');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text', multilingual: true }] });
    S.addRecord(sid); // selects it → the schema's template exists
    render(StyleControls);
    await tab('Fields');
    // "Show on card" has only the Labels eye toggle now; the Title toggle was removed (redundant with the field checklist).
    expect(screen.queryByRole('button', { name: 'Show title' })).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Show field labels' }));
    expect(get(S.project).schemas[0].cardTemplates[0].hideSectionLabels).toBe(true);
  });
});

describe('StyleControls (scope switcher: Global / This view / This card)', () => {
  function seedSelected() {
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text', multilingual: true }] });
    S.addRecord(sid); // auto-selects the new record
    return sid;
  }

  it('This view / This card are disabled until a schema / packed card exist', () => {
    render(StyleControls);
    expect(screen.getByRole('tab', { name: 'This view' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: 'This card' })).toBeDisabled();
  });

  it('defaults to Global — Border width writes to settings', async () => {
    render(StyleControls);
    await tab('Border');
    await fireEvent.change(screen.getByLabelText('Width'), { target: { value: '6' } });
    expect(get(S.project).settings.border.width).toBe(6);
  });

  it('This view — Border width writes to template.style, not settings', async () => {
    const sid = seedSelected();
    render(StyleControls);
    await fireEvent.click(screen.getByRole('tab', { name: 'This view' }));
    await tab('Border');
    await fireEvent.change(screen.getByLabelText('Width'), { target: { value: '9' } });
    expect(get(S.project).schemas[0].cardTemplates[0].style?.border?.width).toBe(9);
    expect(get(S.project).settings.border.width).not.toBe(9);
    void sid;
  });

  it('This card — Border width writes to the packed card.style, not template.style', async () => {
    const sid = seedSelected();
    S.packAllForSchema(sid);
    render(StyleControls);
    await fireEvent.click(screen.getByRole('tab', { name: 'This card' }));
    await tab('Border');
    await fireEvent.change(screen.getByLabelText('Width'), { target: { value: '11' } });
    const recId = get(S.selectedRecordId);
    const card = get(S.project).cards.find((c) => c.recordId === recId);
    expect(card?.style?.border?.width).toBe(11);
    expect(get(S.project).schemas[0].cardTemplates[0]?.style?.border?.width).not.toBe(11);
  });

  it('controls display the resolved (cascaded) value from a schema override', async () => {
    const sid = seedSelected();
    S.setTemplateStyle(sid, { border: { width: 22 } });
    render(StyleControls);
    await tab('Border');
    expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('22');
  });

  it('reset at This view scope clears the schema override, falling back to global', async () => {
    const sid = seedSelected();
    S.setTemplateStyle(sid, { border: { width: 22 } });
    render(StyleControls);
    await fireEvent.click(screen.getByRole('tab', { name: 'This view' }));
    await tab('Border');
    expect(screen.getByLabelText('Width')).toHaveValue(22);
    await fireEvent.click(screen.getByLabelText('Reset border'));
    expect(get(S.project).schemas[0].cardTemplates[0].style?.border).toBeUndefined();
    expect(screen.getByLabelText('Width')).toHaveValue(get(S.project).settings.border.width);
  });

  it('Global scope shows no reset control (nothing to reset at the base level)', async () => {
    const sid = seedSelected();
    S.setTemplateStyle(sid, { border: { width: 22 } });
    render(StyleControls);
    await tab('Border');
    expect(screen.queryByLabelText('Reset border')).not.toBeInTheDocument();
  });

  it('the scope hint names the active type and Global describes the base', async () => {
    const sid = seedSelected();
    void sid;
    render(StyleControls);
    expect(screen.getByText(/applies to every card/i)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('tab', { name: 'This view' }));
    expect(screen.getByText(/Words/)).toBeInTheDocument();
  });

  it('reset-all is disabled with no overrides and clears every override for the scope when clicked', async () => {
    const sid = seedSelected();
    render(StyleControls);
    await fireEvent.click(screen.getByRole('tab', { name: 'This view' }));
    const resetAll = screen.getByRole('button', { name: 'Reset all This view overrides' });
    expect(resetAll).toBeDisabled();

    S.setTemplateStyle(sid, { border: { width: 9 } });
    S.setTemplateStyle(sid, { margin: 15 });
    await tick();
    expect(resetAll).toBeEnabled();
    expect(screen.getByText('2 set here')).toBeInTheDocument();

    await fireEvent.click(resetAll);
    expect(get(S.project).schemas[0].cardTemplates[0].style).toBeUndefined();
  });

  it('Global scope shows no reset-all control', () => {
    seedSelected();
    render(StyleControls);
    expect(screen.queryByRole('button', { name: /Reset all/ })).not.toBeInTheDocument();
  });
});

describe('StyleControls — "This card" cross-view isolation (2 views, only one packed)', () => {
  it('while a view WITHOUT a packed card is active, "This card" stays disabled and a style edit lands ' +
    'on Global, never on the OTHER (packed) view\'s card', async () => {
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text', multilingual: true }] });
    S.addRecord(sid); // selects it; schema still has no persisted views (implicit view 1)
    S.packAllForSchema(sid); // packs a card for the (still-implicit) view 1
    S.addView(sid); // materializes view 1 (now real), appends view 2, activeViewId -> view 2 (unpacked)

    const view1Id = get(S.project).schemas[0].cardTemplates[0].id;
    const packedCard = get(S.project).cards.find((c) => c.templateId === view1Id);
    expect(packedCard).toBeTruthy(); // view 1's card survived materialization (deterministic auto id)

    render(StyleControls);
    expect(screen.getByRole('tab', { name: 'This card' })).toBeDisabled(); // view 2 has no card of its own
    // A disabled tab can't be clicked into by a real user — scope stays at its default (Global).

    await tab('Border');
    await fireEvent.change(screen.getByLabelText('Width'), { target: { value: '31' } });

    expect(get(S.project).settings.border.width).toBe(31); // the edit landed at Global (the only reachable scope)
    const cardAfter = get(S.project).cards.find((c) => c.id === packedCard!.id)!;
    expect(cardAfter.style?.border?.width).not.toBe(31); // did NOT leak onto view 1's packed card
  });
});

describe('StyleControls — Fields checklist (per view)', () => {
  it('a per-schema field checklist toggles the active view\'s template.fields', async () => {
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
      { id: 'f2', key: 'def', label: 'Def', type: 'text', multilingual: true },
    ] });
    S.addRecord(sid);
    render(StyleControls);
    await tab('Fields');
    await fireEvent.click(screen.getByLabelText('Def'));
    const tpl = get(S.project).schemas[0].cardTemplates[0];
    expect(tpl.fields).toEqual(['title']); // unchecking Def from "all" leaves Title only
  });

  it('re-checking a field adds it back to the explicit selection', async () => {
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
      { id: 'f2', key: 'def', label: 'Def', type: 'text', multilingual: true },
    ] });
    S.addRecord(sid);
    render(StyleControls);
    await tab('Fields');
    await fireEvent.click(screen.getByLabelText('Def'));   // -> ['title']
    await fireEvent.click(screen.getByLabelText('Def'));   // re-check -> ['title', 'def']
    expect(get(S.project).schemas[0].cardTemplates[0].fields).toEqual(['title', 'def']);
  });

  it('the field checklist targets the active view, leaving other views\' selection untouched', async () => {
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
      { id: 'f2', key: 'def', label: 'Def', type: 'text', multilingual: true },
    ] });
    S.addRecord(sid);
    S.setTemplateLayout(sid, { layout: 'fulltext' }); // creates view 1
    S.addView(sid);                                   // view 2, becomes active
    render(StyleControls);
    await tab('Fields');
    await fireEvent.click(screen.getByLabelText('Def'));
    const tpls = get(S.project).schemas[0].cardTemplates;
    expect(tpls[1].fields).toEqual(['title']); // active (view 2) changed
    expect(tpls[0].fields).toBeUndefined();    // view 1 untouched
  });

  it('resolves a multilingual field label in the checklist to the active locale', async () => {
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [
      { id: 'f1', key: 'def', label: { en: 'Definition', vi: 'Nghĩa' }, type: 'text', multilingual: true },
    ] });
    S.addRecord(sid);
    S.setActiveLocale('vi');
    render(StyleControls);
    await tab('Fields');
    expect(screen.getByLabelText('Nghĩa')).toBeInTheDocument();
  });
});
