import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => { S.initProject(); });

function seedSchema() {
  const sid = S.addSchema('Words');
  S.updateSchema(sid, { fields: [
    { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    { id: 'f2', key: 'pic', label: 'Pic', type: 'image' },
  ] });
  return sid;
}

describe('view stores', () => {
  it('addView appends a view and makes it the active view', () => {
    const sid = seedSchema();
    S.setTemplateLayout(sid, { layout: 'fulltext' }); // creates the first (implicit) view
    S.addView(sid);
    const tpls = get(S.project).schemas[0].cardTemplates;
    expect(tpls).toHaveLength(2);
    expect(get(S.activeViewId)).toBe(tpls[1].id);
    expect(get(S.dirty)).toBe(true);
  });

  it('renameView sets an explicit name, read back by the addressed template', () => {
    const sid = seedSchema();
    S.setTemplateLayout(sid, { layout: 'fulltext' });
    const t1 = get(S.project).schemas[0].cardTemplates[0].id;
    S.renameView(sid, t1, 'Cover');
    expect(get(S.project).schemas[0].cardTemplates[0].name).toBe('Cover');
  });

  it('deleteView refuses the last view; succeeds once a 2nd exists, reassigning activeViewId off the deleted one', () => {
    const sid = seedSchema();
    S.setTemplateLayout(sid, { layout: 'fulltext' });
    const t1 = get(S.project).schemas[0].cardTemplates[0].id;
    S.selectView(t1);
    S.deleteView(sid, t1); // refused — only view
    expect(get(S.project).schemas[0].cardTemplates).toHaveLength(1);

    S.addView(sid);
    const t2 = get(S.project).schemas[0].cardTemplates[1].id;
    S.selectView(t1);
    S.deleteView(sid, t1); // now allowed
    expect(get(S.project).schemas[0].cardTemplates).toHaveLength(1);
    expect(get(S.project).schemas[0].cardTemplates[0].id).toBe(t2);
    expect(get(S.activeViewId)).toBe(t2); // reassigned off the deleted active view
  });

  it('setViewFields commits the selected field keys onto the addressed template', () => {
    const sid = seedSchema();
    S.setTemplateLayout(sid, { layout: 'fulltext' });
    const t1 = get(S.project).schemas[0].cardTemplates[0].id;
    S.setViewFields(sid, t1, ['pic']);
    expect(get(S.project).schemas[0].cardTemplates[0].fields).toEqual(['pic']);
  });

  it('setTemplateLayout/setTemplateStyle default to the active view, not always cardTemplates[0]', () => {
    const sid = seedSchema();
    S.setTemplateLayout(sid, { layout: 'fulltext' });
    S.addView(sid); // active view is now the 2nd template
    const [t1, t2] = get(S.project).schemas[0].cardTemplates.map((t) => t.id);
    S.setTemplateLayout(sid, { layout: 'fullimage' });
    S.setTemplateStyle(sid, { border: { width: 9 } });
    const tpls = get(S.project).schemas[0].cardTemplates;
    expect(tpls.find((t) => t.id === t2)?.layout).toBe('fullimage');
    expect(tpls.find((t) => t.id === t2)?.style?.border?.width).toBe(9);
    expect(tpls.find((t) => t.id === t1)?.layout).toBe('fulltext'); // untouched
  });

  it('setTemplateLayout/setTemplateStyle accept an explicit templateId, overriding the active view', () => {
    const sid = seedSchema();
    S.setTemplateLayout(sid, { layout: 'fulltext' });
    S.addView(sid);
    const [t1, t2] = get(S.project).schemas[0].cardTemplates.map((t) => t.id);
    S.setTemplateLayout(sid, { layout: '2x2' }, t1); // active view is t2, but we address t1 explicitly
    const tpls = get(S.project).schemas[0].cardTemplates;
    expect(tpls.find((t) => t.id === t1)?.layout).toBe('2x2');
    expect(tpls.find((t) => t.id === t2)?.layout).not.toBe('2x2');
  });

  it('clearStyleOverride/resetScopeStyle at "schema" scope target the active view\'s template', () => {
    const sid = seedSchema();
    S.setTemplateLayout(sid, { layout: 'fulltext' });
    S.addView(sid);
    const t2 = get(S.activeViewId)!;
    S.setTemplateStyle(sid, { border: { width: 9 }, margin: 10 });
    S.clearStyleOverride('schema', sid, 'border');
    let tpls = get(S.project).schemas[0].cardTemplates;
    expect(tpls.find((t) => t.id === t2)?.style?.border).toBeUndefined();
    expect(tpls.find((t) => t.id === t2)?.style?.margin).toBe(10);
    S.resetScopeStyle('schema', sid);
    tpls = get(S.project).schemas[0].cardTemplates;
    expect(tpls.find((t) => t.id === t2)?.style).toBeUndefined();
  });
});
