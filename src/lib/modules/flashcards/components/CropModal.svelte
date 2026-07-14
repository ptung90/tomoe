<script lang="ts">
  import Cropper from 'cropperjs';
  import 'cropperjs/dist/cropper.css';
  import X from 'lucide-svelte/icons/x';

  let { src, onApply, onClose }: { src: string; onApply: (dataUrl: string) => void; onClose: () => void } = $props();

  let cropper: Cropper | undefined;
  function mount(node: HTMLImageElement) {
    node.crossOrigin = 'anonymous'; // Wikimedia serves CORS; keeps the canvas untainted
    cropper = new Cropper(node, { viewMode: 1, autoCropArea: 1, background: false });
    return { destroy() { cropper?.destroy(); cropper = undefined; } };
  }
  const setAspect = (r: number) => cropper?.setAspectRatio(r);
  function apply() {
    const canvas = cropper?.getCroppedCanvas({ maxWidth: 1600, maxHeight: 1600 });
    if (!canvas) return;
    try { onApply(canvas.toDataURL('image/jpeg', 0.9)); }
    catch { onClose(); } // tainted canvas (non-CORS remote) — bail rather than throw
  }
</script>

<div class="overlay" role="dialog" aria-modal="true">
  <div class="modal">
    <header class="head"><span>Crop image</span><button type="button" aria-label="close" onclick={onClose}><X size={16} /></button></header>
    <div class="crop-area"><img {src} use:mount alt="" /></div>
    <div class="aspects">
      <button type="button" onclick={() => setAspect(NaN)}>Free</button>
      <button type="button" onclick={() => setAspect(1)}>1:1</button>
      <button type="button" onclick={() => setAspect(3 / 4)}>3:4</button>
      <button type="button" onclick={() => setAspect(4 / 3)}>4:3</button>
    </div>
    <footer class="foot"><span class="spacer"></span>
      <button type="button" onclick={onClose}>Cancel</button>
      <button type="button" class="primary" onclick={apply}>Apply</button>
    </footer>
  </div>
</div>

<style>
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:60; }
  .modal { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px;
    width:min(680px,94vw); max-height:88vh; display:flex; flex-direction:column; }
  .head { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid var(--border); font-weight:600; }
  .head button { border:none; background:transparent; color:var(--text-muted); }
  .crop-area { padding:12px 14px; max-height:60vh; overflow:hidden; }
  .crop-area img { max-width:100%; display:block; }
  .aspects { display:flex; gap:6px; padding:0 14px 10px; }
  .aspects button { border:1px solid var(--border); background:transparent; color:var(--text); border-radius:6px; padding:4px 10px; font:inherit; font-size:12px; }
  .aspects button:hover { background:var(--accent-weak); color:var(--accent); }
  .foot { display:flex; align-items:center; gap:8px; padding:12px 14px; border-top:1px solid var(--border); }
  .spacer { flex:1; }
  .foot button { border:1px solid var(--border); background:transparent; color:var(--text); border-radius:6px; padding:6px 14px; font:inherit; }
  .foot .primary { border-color:var(--accent); background:var(--accent); color:#fff; font-weight:600; }
</style>
