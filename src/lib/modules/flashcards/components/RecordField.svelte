<script lang="ts">
  import type { SchemaField, LocalizedText } from '../model';
  import { resolveLabel } from '../lib/card-render';
  import RichText from './RichText.svelte';
  import ImageField from './ImageField.svelte';

  let { field, value, locales, activeLocale = 'en', imageQuery = '', onChange }: {
    field: SchemaField;
    value: LocalizedText;
    locales: string[];
    activeLocale?: string;
    imageQuery?: string;
    onChange: (val: string, locale?: string) => void;
  } = $props();

  const multilingual = $derived(field.type !== 'image' && field.multilingual !== false);
  function loc(l: string): string {
    return value && typeof value === 'object' ? (value[l] ?? '') : (typeof value === 'string' ? value : '');
  }
  function str(): string { return typeof value === 'string' ? value : ''; }
</script>

<div class="field">
  <span class="field-label">{resolveLabel(field.label, activeLocale, field.key)}</span>

  {#if field.type === 'image'}
    <ImageField value={str()} query={imageQuery} onChange={(u) => onChange(u)} />
  {:else if multilingual}
    <div class="locales">
      {#each locales as l (l)}
        <div class="loc-row">
          <span class="loc-tag">{l.toUpperCase()}</span>
          <RichText value={loc(l)} compact={field.type !== 'text-long'}
            onChange={(md) => onChange(md, l)} />
        </div>
      {/each}
    </div>
  {:else}
    <RichText value={str()} compact={field.type !== 'text-long'} onChange={(md) => onChange(md)} />
  {/if}
</div>

<style>
  .field { display:flex; flex-direction:column; gap:6px; }
  .field-label { font-size:12px; font-weight:600; color:var(--text-muted); }
  .locales { display:flex; flex-direction:column; gap:6px; }
  .loc-row { display:flex; gap:8px; align-items:flex-start; }
  .loc-tag { font-size:11px; font-weight:600; color:var(--accent); padding-top:8px; min-width:24px; }
</style>
