import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import AutofillImagesModal from '../src/lib/modules/flashcards/components/AutofillImagesModal.svelte';
import * as stores from '../src/lib/modules/flashcards/stores';
import { newProject, type Project, type Schema } from '../src/lib/modules/flashcards/model';

function setup(): { project: Project; schema: Schema } {
  const project = newProject();
  const schema: Schema = { id: 's1', name: 'W', cardTemplates: [], fields: [
    { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    { id: 'f2', key: 'pic', label: 'Pic', type: 'image' },
  ] };
  project.schemas.push(schema);
  project.records.push(
    { id: 'a', schemaId: 's1', fieldsHash: '', fields: { title: { en: 'Owl', vi: '' }, pic: '' } },
    { id: 'b', schemaId: 's1', fieldsHash: '', fields: { title: { en: 'Cat', vi: '' }, pic: '' } },
  );
  stores.loadProject(project, null);
  return { project, schema };
}

describe('AutofillImagesModal', () => {
  beforeEach(() => setup());

  it('runs auto-fill, writes top-1 urls to the store, and closes', async () => {
    const schema = get(stores.project).schemas[0];
    const records = get(stores.project).records;
    const search = vi.fn(async (q: string) => [{ thumb: q + '_t', full: 'https://img/' + q + '.jpg', title: q }]);
    const onClose = vi.fn();
    render(AutofillImagesModal, { records, schema, onClose, search });

    await fireEvent.click(screen.getByRole('button', { name: /fill|run/i }));
    // let the sequential async run settle
    await new Promise((r) => setTimeout(r, 0));

    expect(search).toHaveBeenCalledTimes(2);
    expect(get(stores.project).records[0].fields.pic).toBe('https://img/Owl.jpg');
    expect(get(stores.project).records[1].fields.pic).toBe('https://img/Cat.jpg');
    expect(onClose).toHaveBeenCalled();
  });

  it('lets the user pick the query field, including image fields (self-query)', async () => {
    const schema = get(stores.project).schemas[0];
    const records = get(stores.project).records;
    render(AutofillImagesModal, { records, schema, onClose: vi.fn(), search: vi.fn(async () => []) });
    // both text and image fields are options — an image field can be its own query source
    const opts = Array.from(screen.getByLabelText(/query field/i).querySelectorAll('option')).map((o) => o.textContent);
    expect(opts).toContain('Title');
    expect(opts).toContain('Pic');
  });

  it('auto-selects the matching target when an image field is chosen as the query source', async () => {
    const project = newProject();
    const schema: Schema = { id: 's3', name: 'C', cardTemplates: [], fields: [
      { id: 'f1', key: 'name', label: 'Name', type: 'text', multilingual: true },
      { id: 'f2', key: 'imageFlag', label: 'Flag', type: 'image' },
      { id: 'f3', key: 'imageFood', label: 'Food', type: 'image' },
    ] };
    project.schemas.push(schema);
    stores.loadProject(project, null);
    render(AutofillImagesModal, { records: [], schema, onClose: vi.fn(), search: vi.fn(async () => []) });
    const querySelect = screen.getByLabelText('query field') as HTMLSelectElement;
    await fireEvent.change(querySelect, { target: { value: 'imageFood' } });
    const targetSelect = screen.getByLabelText('target image field') as HTMLSelectElement;
    expect(targetSelect.value).toBe('imageFood');
  });

  it('resolves a multilingual field label in the query-field dropdown to the active locale', () => {
    const project = newProject();
    project.activeLocale = 'vi';
    const schema: Schema = { id: 's2', name: 'ML', cardTemplates: [], fields: [
      { id: 'f1', key: 'title', label: { en: 'Title', vi: 'Tiêu đề' }, type: 'text', multilingual: true },
      { id: 'f2', key: 'pic', label: 'Pic', type: 'image' },
    ] };
    project.schemas.push(schema);
    stores.loadProject(project, null);
    render(AutofillImagesModal, { records: [], schema, onClose: vi.fn(), search: vi.fn(async () => []) });
    const opts = Array.from(screen.getByLabelText(/query field/i).querySelectorAll('option')).map((o) => o.textContent);
    expect(opts).toContain('Tiêu đề');
  });
});
