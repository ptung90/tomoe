<script lang="ts">
  import Cropper from 'cropperjs';
  import 'cropperjs/dist/cropper.css';
  import { confirm } from '@tauri-apps/plugin-dialog';
  import X from 'lucide-svelte/icons/x';
  import CropIcon from 'lucide-svelte/icons/crop';
  import Eraser from 'lucide-svelte/icons/eraser';
  import Paintbrush from 'lucide-svelte/icons/paintbrush';
  import Pipette from 'lucide-svelte/icons/pipette';
  import WandSparkles from 'lucide-svelte/icons/wand-sparkles';
  import Undo2 from 'lucide-svelte/icons/undo-2';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import ZoomIn from 'lucide-svelte/icons/zoom-in';
  import ZoomOut from 'lucide-svelte/icons/zoom-out';
  import { pickCornerColor, removeSolidBackground } from '../lib/imageEdit';
  import { clampZoom, ZOOM_MIN, ZOOM_MAX } from '../lib/zoom';
  import { showToast } from '../../../shell';

  let { src, onApply, onClose }: { src: string; onApply: (dataUrl: string) => void; onClose: () => void } = $props();

  const UNDO_CAP = 20;
  const MAX = 1600; // cropperjs export cap, shared by Crop apply + Erase seeding

  let mode = $state<'crop' | 'erase'>('crop');

  // ── Crop mode (cropperjs) — unchanged from the original CropModal ─────────────────
  let cropper: Cropper | undefined;
  function mount(node: HTMLImageElement) {
    // Set crossOrigin BEFORE src (Wikimedia serves CORS -> keeps the canvas untainted),
    // and init cropper only once the image has loaded so it sizes to the container.
    node.crossOrigin = 'anonymous';
    let raf = 0;
    const init = () => {
      if (cropper || raf) return;
      raf = requestAnimationFrame(() => { raf = 0; if (!cropper) cropper = new Cropper(node, { viewMode: 1, autoCropArea: 1, background: false }); });
    };
    node.addEventListener('load', init, { once: true });
    node.src = src;
    if (node.complete && node.naturalWidth) init();
    return { destroy() { node.removeEventListener('load', init); if (raf) cancelAnimationFrame(raf); cropper?.destroy(); cropper = undefined; } };
  }
  const setAspect = (r: number) => cropper?.setAspectRatio(r);

  // ── Erase mode (pixel canvas) ─────────────────────────────────────────────────────
  type Tool = 'remove' | 'erase' | 'restore';
  let work: HTMLCanvasElement | null = null;   // the live, editable canvas
  let origCanvas: HTMLCanvasElement | null = null; // offscreen copy of the pristine image (restore brush)
  let original: ImageData | null = null;       // pristine pixels (reset)
  let pendingSeed: HTMLCanvasElement | null = null; // cropped canvas captured before the crop area unmounts
  let eraseReady = false;
  let hasErased = false;                        // any erase op applied -> Apply outputs PNG; re-crop confirms

  let natW = $state(0);
  let natH = $state(0);
  let tool = $state<Tool>('remove');
  let target = $state<[number, number, number]>([255, 255, 255]);
  let tolerance = $state(32);
  let eyedropper = $state(false);
  let brushSize = $state(40);
  let zoom = $state(1);
  let undoStack = $state<ImageData[]>([]);
  let drawing = false;

  const rgbCss = $derived(`rgb(${target[0]},${target[1]},${target[2]})`);
  function ctx2d(): CanvasRenderingContext2D { return work!.getContext('2d')!; }

  // Crop -> Erase: bake the current crop into the erase canvas. Read the cropped canvas WHILE
  // the cropper is still alive (switching mode unmounts + destroys it), then probe readability.
  function toErase(): void {
    const cc = cropper?.getCroppedCanvas({ maxWidth: MAX, maxHeight: MAX });
    if (!cc) return; // cropper not ready (e.g. image not yet loaded) — stay in Crop
    try {
      cc.getContext('2d')!.getImageData(0, 0, 1, 1); // throws on a tainted (non-CORS remote) canvas
    } catch {
      showToast("Can't edit this remote image — upload it first", 'error');
      return; // stay in Crop; Erase effectively disabled for this source
    }
    pendingSeed = cc;
    mode = 'erase';
  }

  // Runs when the erase <canvas> mounts (mode === 'erase'). Seeds it from the captured crop.
  function seedWork(node: HTMLCanvasElement) {
    work = node;
    const cc = pendingSeed!;
    natW = cc.width; natH = cc.height;
    node.width = cc.width; node.height = cc.height;
    const c = node.getContext('2d')!;
    c.drawImage(cc, 0, 0);
    original = c.getImageData(0, 0, node.width, node.height);
    origCanvas = document.createElement('canvas');
    origCanvas.width = cc.width; origCanvas.height = cc.height;
    origCanvas.getContext('2d')!.drawImage(cc, 0, 0);
    target = pickCornerColor(original); // auto default chroma target
    undoStack = [];
    hasErased = false;
    eraseReady = true;
    pendingSeed = null;
    return { destroy() { work = null; origCanvas = null; original = null; eraseReady = false; } };
  }

  // Erase -> Crop: warn before discarding erase edits (user decision). On confirm, drop erase
  // state; re-entering Crop re-mounts the cropper on the ORIGINAL src (pre-erase source).
  async function toCrop(): Promise<void> {
    if (hasErased) {
      const ok = await confirm('Re-cropping discards the erased areas — continue?', { title: 'Re-crop image', kind: 'warning' });
      if (!ok) return;
    }
    hasErased = false; eraseReady = false; zoom = 1; undoStack = [];
    mode = 'crop';
  }

  function pushUndo(): void {
    if (!work) return;
    undoStack.push(ctx2d().getImageData(0, 0, work.width, work.height));
    if (undoStack.length > UNDO_CAP) undoStack.shift(); // cap memory
  }

  function removeColour(): void {
    if (!work) return;
    pushUndo();
    const c = ctx2d();
    const cur = c.getImageData(0, 0, work.width, work.height);
    const out = removeSolidBackground(cur, target, tolerance);
    // out.data is Uint8ClampedArray<ArrayBufferLike> (RgbaImage is canvas-agnostic per Task 1);
    // in this browser code path it's always a real ArrayBuffer (never SharedArrayBuffer), so the
    // cast to satisfy ImageData's stricter Uint8ClampedArray<ArrayBuffer> param is safe.
    c.putImageData(new ImageData(out.data as Uint8ClampedArray<ArrayBuffer>, out.width, out.height), 0, 0);
    hasErased = true;
  }

  function canvasPos(e: PointerEvent): { x: number; y: number } {
    const rect = work!.getBoundingClientRect();
    // Displayed size = natural * zoom, so dividing by zoom maps back to canvas pixels.
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  }

  function paint(x: number, y: number): void {
    const c = ctx2d();
    const r = brushSize / 2;
    if (tool === 'erase') {
      c.globalCompositeOperation = 'destination-out';
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.globalCompositeOperation = 'source-over';
    } else if (tool === 'restore' && origCanvas) {
      c.save();
      c.globalCompositeOperation = 'source-over';
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.clip();
      c.drawImage(origCanvas, 0, 0);
      c.restore();
    }
    hasErased = true;
  }

  function pickAt(x: number, y: number): void {
    const d = ctx2d().getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    target = [d[0], d[1], d[2]];
  }

  function onPointerDown(e: PointerEvent): void {
    if (!eraseReady || !work) return;
    const { x, y } = canvasPos(e);
    if (eyedropper) { pickAt(x, y); eyedropper = false; return; }
    if (tool === 'remove') return; // chroma-key runs from its button, not a drag
    work.setPointerCapture(e.pointerId);
    drawing = true;
    pushUndo();      // one undo step per stroke
    paint(x, y);
  }
  function onPointerMove(e: PointerEvent): void {
    if (!drawing) return;
    const { x, y } = canvasPos(e);
    paint(x, y);
  }
  function onPointerUp(e: PointerEvent): void {
    if (!drawing) return;
    drawing = false;
    try { work?.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }

  function undo(): void {
    if (!work || !undoStack.length) return;
    const prev = undoStack.pop()!;
    ctx2d().putImageData(prev, 0, 0);
  }
  function reset(): void {
    if (!work || !original) return;
    ctx2d().putImageData(original, 0, 0);
    undoStack = [];
    hasErased = false;
  }

  const zoomBy = (f: number) => { zoom = clampZoom(zoom * f); };

  function apply(): void {
    if (mode === 'crop') {
      const canvas = cropper?.getCroppedCanvas({ maxWidth: MAX, maxHeight: MAX });
      if (!canvas) return;
      try { onApply(canvas.toDataURL('image/jpeg', 0.9)); }
      catch { onClose(); } // tainted canvas (non-CORS remote) — bail rather than throw
      return;
    }
    if (!work) return;
    // Erased -> PNG (keeps alpha); untouched/reset -> JPEG (smaller, no transparency needed).
    onApply(hasErased ? work.toDataURL('image/png') : work.toDataURL('image/jpeg', 0.9));
  }
</script>

<div class="overlay" role="dialog" aria-modal="true">
  <div class="modal">
    <header class="head">
      <div class="modes">
        <button type="button" class:active={mode === 'crop'} onclick={toCrop}><CropIcon size={14} /> Crop</button>
        <button type="button" class:active={mode === 'erase'} onclick={toErase}><Eraser size={14} /> Erase</button>
      </div>
      <button type="button" class="close" aria-label="close" onclick={onClose}><X size={16} /></button>
    </header>

    {#if mode === 'crop'}
      <div class="crop-area"><img use:mount alt="" /></div>
      <div class="aspects">
        <button type="button" onclick={() => setAspect(NaN)}>Free</button>
        <button type="button" onclick={() => setAspect(1)}>1:1</button>
        <button type="button" onclick={() => setAspect(3 / 4)}>3:4</button>
        <button type="button" onclick={() => setAspect(4 / 3)}>4:3</button>
      </div>
    {:else}
      <div class="erase-tools">
        <div class="toolgroup">
          <button type="button" class:active={tool === 'remove'} onclick={() => (tool = 'remove')} title="Remove colour"><WandSparkles size={14} /></button>
          <button type="button" class:active={tool === 'erase'} onclick={() => (tool = 'erase')} title="Eraser brush"><Eraser size={14} /></button>
          <button type="button" class:active={tool === 'restore'} onclick={() => (tool = 'restore')} title="Restore brush"><Paintbrush size={14} /></button>
        </div>
        {#if tool === 'remove'}
          <div class="toolgroup">
            <span class="swatch" style="background:{rgbCss}"></span>
            <button type="button" class:active={eyedropper} onclick={() => (eyedropper = !eyedropper)} title="Pick colour"><Pipette size={14} /></button>
            <label class="slider">Tol <input type="range" min="0" max="200" bind:value={tolerance} /> {tolerance}</label>
            <button type="button" class="primary sm" onclick={removeColour}>Remove</button>
          </div>
        {:else}
          <label class="slider">Size <input type="range" min="4" max="120" bind:value={brushSize} /> {brushSize}</label>
        {/if}
        <div class="toolgroup right">
          <button type="button" onclick={undo} title="Undo" disabled={!undoStack.length}><Undo2 size={14} /></button>
          <button type="button" onclick={reset} title="Reset"><RotateCcw size={14} /></button>
          <button type="button" onclick={() => zoomBy(1 / 1.25)} title="Zoom out"><ZoomOut size={14} /></button>
          <button type="button" onclick={() => zoomBy(1.25)} title="Zoom in"><ZoomIn size={14} /></button>
        </div>
      </div>
      <div class="erase-area">
        <div class="checker">
          <canvas use:seedWork
            style="width:{natW * zoom}px;height:{natH * zoom}px;"
            class:eyedrop={eyedropper}
            onpointerdown={onPointerDown} onpointermove={onPointerMove}
            onpointerup={onPointerUp} onpointerleave={onPointerUp}></canvas>
        </div>
      </div>
    {/if}

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
  .head { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid var(--border); }
  .modes { display:flex; gap:6px; }
  .modes button { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border); background:transparent; color:var(--text);
    border-radius:6px; padding:5px 12px; font:inherit; font-weight:600; }
  .modes button.active { border-color:var(--accent); background:var(--accent-weak); color:var(--accent); }
  .head .close { border:none; background:transparent; color:var(--text-muted); }
  .crop-area { padding:12px 14px; height:52vh; display:flex; align-items:center; justify-content:center; overflow:hidden; }
  /* Constrain on BOTH axes so cropperjs sizes its canvas to fit the modal (handles stay reachable). */
  .crop-area img { display:block; max-width:100%; max-height:100%; }
  .aspects { display:flex; gap:6px; padding:0 14px 10px; }
  .aspects button { border:1px solid var(--border); background:transparent; color:var(--text); border-radius:6px; padding:4px 10px; font:inherit; font-size:12px; }
  .aspects button:hover { background:var(--accent-weak); color:var(--accent); }
  .erase-tools { display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:10px 14px; border-bottom:1px solid var(--border); }
  .toolgroup { display:flex; align-items:center; gap:6px; }
  .toolgroup.right { margin-left:auto; }
  .erase-tools button { display:inline-flex; align-items:center; gap:4px; border:1px solid var(--border); background:transparent; color:var(--text); border-radius:6px; padding:5px 8px; font:inherit; }
  .erase-tools button.active { border-color:var(--accent); background:var(--accent-weak); color:var(--accent); }
  .erase-tools button:disabled { opacity:.4; }
  .erase-tools .primary.sm { border-color:var(--accent); background:var(--accent); color:#fff; font-weight:600; padding:5px 12px; }
  .swatch { width:20px; height:20px; border:1px solid var(--border); border-radius:4px; display:inline-block; }
  .slider { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--text-muted); }
  .slider input { vertical-align:middle; }
  .erase-area { padding:12px 14px; height:52vh; overflow:auto; background:var(--bg); }
  /* Checkerboard so transparency is visible — two token-coloured diagonal grids, no hardcoded hex. */
  .checker { display:inline-block;
    background-color:var(--surface);
    background-image:
      linear-gradient(45deg, var(--border) 25%, transparent 25%, transparent 75%, var(--border) 75%),
      linear-gradient(45deg, var(--border) 25%, transparent 25%, transparent 75%, var(--border) 75%);
    background-size:16px 16px; background-position:0 0, 8px 8px; }
  .checker canvas { display:block; cursor:crosshair; touch-action:none; } /* touch-action:none so a drag paints, not scrolls */
  .checker canvas.eyedrop { cursor:cell; }
  .foot { display:flex; align-items:center; gap:8px; padding:12px 14px; border-top:1px solid var(--border); }
  .spacer { flex:1; }
  .foot button { border:1px solid var(--border); background:transparent; color:var(--text); border-radius:6px; padding:6px 14px; font:inherit; }
  .foot .primary { border-color:var(--accent); background:var(--accent); color:#fff; font-weight:600; }
</style>
