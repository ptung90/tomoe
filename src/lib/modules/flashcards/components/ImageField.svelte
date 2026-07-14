<script lang="ts">
  import SearchIcon from 'lucide-svelte/icons/search';
  import Crop from 'lucide-svelte/icons/crop';
  import ImageSearchModal from './ImageSearchModal.svelte';
  import CropModal from './CropModal.svelte';

  let { value = '', onChange }: { value?: string; onChange: (url: string) => void } = $props();
  let fileInput: HTMLInputElement;
  let showSearch = $state(false);
  let showCrop = $state(false);

  function cssUrl(v: string): string {
    // percent-encode chars that would break url("...") — quotes, parens, backslash, whitespace.
    // NB: encodeURIComponent leaves ' ( ) ! * ~ unescaped, so encode by char code instead.
    return v.replace(/["'()\\\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
  }

  function onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  }
  async function paste() {
    try {
      const txt = await navigator.clipboard.readText();
      if (txt) onChange(txt.trim());
    } catch { /* clipboard unavailable */ }
  }
</script>

<div class="imgfield">
  <div class="thumb" class:empty={!value}
       style={value ? `background-image:url("${cssUrl(value)}")` : ''}></div>
  <div class="body">
    <input class="url" type="text" placeholder="Image URL or data URL"
           value={value}
           oninput={(e) => onChange((e.target as HTMLInputElement).value)} />
    <div class="btns">
      <button type="button" onclick={() => fileInput.click()}>Pick…</button>
      <button type="button" onclick={paste}>Paste</button>
      <button type="button" onclick={() => (showSearch = true)}><SearchIcon size={13} /> Search</button>
      {#if value}<button type="button" onclick={() => (showCrop = true)}><Crop size={13} /> Crop</button>{/if}
      {#if value}<button type="button" onclick={() => onChange('')}>Clear</button>{/if}
    </div>
  </div>
  <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onFile} />
</div>

{#if showSearch}
  <ImageSearchModal onPick={(u) => { onChange(u); showSearch = false; }} onClose={() => (showSearch = false)} />
{/if}
{#if showCrop && value}
  <CropModal src={value} onApply={(d) => { onChange(d); showCrop = false; }} onClose={() => (showCrop = false)} />
{/if}

<style>
  .imgfield { display:flex; gap:10px; align-items:flex-start; }
  .thumb { width:64px; height:64px; border:1px solid var(--border); border-radius:8px;
    background-size:cover; background-position:center; flex:none; }
  .thumb.empty { background:var(--accent-weak); }
  .body { flex:1; min-width:0; display:flex; flex-direction:column; gap:6px; }
  .url { width:100%; padding:6px 8px; border:1px solid var(--border); border-radius:6px;
    background:var(--bg); color:var(--text); font:inherit; }
  .btns { display:flex; gap:6px; }
  .btns button { border:1px solid var(--border); background:transparent; color:var(--text);
    border-radius:6px; padding:4px 10px; font:inherit; }
  .btns button:hover { background:var(--accent-weak); color:var(--accent); }
</style>
