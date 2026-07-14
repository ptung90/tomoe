import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import AiGenerateModal from '../src/lib/modules/flashcards/components/AiGenerateModal.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => {
  localStorage.clear();
  S.initProject();
  S.setAiConfig({ apiKey: '', model: 'claude-opus-4-8' });
});

describe('AiGenerateModal', () => {
  it('Generate is disabled without a key or instruction', () => {
    const { getByRole } = render(AiGenerateModal, { props: { schemaId: 's1', onClose: () => {} } });
    expect(getByRole('button', { name: /generate/i })).toBeDisabled();
  });
  it('with key + instruction, Generate calls aiGenerateRecords', async () => {
    const spy = vi.spyOn(S, 'aiGenerateRecords').mockResolvedValue(3);
    S.setAiConfig({ apiKey: 'sk-1' });
    const { getByRole, getByLabelText } = render(AiGenerateModal, { props: { schemaId: 's1', onClose: () => {} } });
    await fireEvent.input(getByLabelText(/instruction/i), { target: { value: 'verbs' } });
    await fireEvent.click(getByRole('button', { name: /generate/i }));
    expect(spy).toHaveBeenCalledWith('s1', 'verbs', expect.any(Number));
    spy.mockRestore();
  });
});
