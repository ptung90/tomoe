<script lang="ts">
  import { classify, type JsonValue, type Path } from '../jsonModel';
  import ObjectForm from '../editors/ObjectForm.svelte';
  import ObjectArrayTable from '../editors/ObjectArrayTable.svelte';
  import ScalarArrayEditor from '../editors/ScalarArrayEditor.svelte';
  import MixedArrayList from '../editors/MixedArrayList.svelte';
  import LeafEditor from '../editors/LeafEditor.svelte';

  let { value, path }: { value: JsonValue; path: Path } = $props();
  const kind = $derived(classify(value));
</script>

{#if kind === 'object'}
  <ObjectForm value={value as Record<string, JsonValue>} {path} />
{:else if kind === 'array-of-objects'}
  <ObjectArrayTable value={value as JsonValue[]} {path} />
{:else if kind === 'array-of-scalars'}
  <ScalarArrayEditor value={value as JsonValue[]} {path} />
{:else if kind === 'array-mixed'}
  <MixedArrayList value={value as JsonValue[]} {path} />
{:else}
  <LeafEditor {value} {path} />
{/if}
