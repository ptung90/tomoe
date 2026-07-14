/**
 * Svelte action: turn an element into a horizontal drag handle.
 * Calls `onDelta(dx)` with the pixel delta since the last pointer move.
 * Usage: <div use:dragX={(dx) => width = clamp(width + dx)}></div>
 */
export function dragX(node: HTMLElement, onDelta: (dx: number) => void) {
  let last = 0;
  let cb = onDelta;

  const move = (e: PointerEvent) => {
    const dx = e.clientX - last;
    last = e.clientX;
    cb(dx);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
  const down = (e: PointerEvent) => {
    e.preventDefault();
    last = e.clientX;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  node.addEventListener('pointerdown', down);
  return {
    update(next: (dx: number) => void) { cb = next; },
    destroy() { node.removeEventListener('pointerdown', down); up(); },
  };
}
