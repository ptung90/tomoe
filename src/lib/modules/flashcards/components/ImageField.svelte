<script lang="ts">
  let { value = '', onChange }: { value?: string; onChange: (url: string) => void } = $props();
  let fileInput: HTMLInputElement;

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
       style={value ? `background-image:url('${value}')` : ''}></div>
  <div class="body">
    <input class="url" type="text" placeholder="Image URL or data URL"
           value={value}
           oninput={(e) => onChange((e.target as HTMLInputElement).value)} />
    <div class="btns">
      <button type="button" onclick={() => fileInput.click()}>Pick…</button>
      <button type="button" onclick={paste}>Paste</button>
      {#if value}<button type="button" onclick={() => onChange('')}>Clear</button>{/if}
    </div>
  </div>
  <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onFile} />
</div>

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
