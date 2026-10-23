// canvas.js — SVG pan/zoom with wheel, pinch, drag-background, Fit and 100% buttons.
// The SVG lives inside a <div id="preview-pane">. We apply a CSS transform to the
// <svg> element itself so exports can still read the untransformed viewBox.

export function initCanvas(previewPane, getSvgEl) {
  let scale = 1;
  let tx = 0, ty = 0;  // translation in screen px
  let pinchDist = null; // last two-finger distance
  let panStart  = null; // { x, y, tx, ty } when background drag starts

  // Apply current transform to the svg element.
  function applyTransform() {
    const svg = getSvgEl();
    if (!svg) return;
    svg.style.transformOrigin = '0 0';
    svg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  // Fit the diagram inside the pane (called after each render).
  function fit() {
    const svg = getSvgEl();
    if (!svg) { scale = 1; tx = 0; ty = 0; return; }
    // Reset transform so we can read natural SVG dimensions.
    svg.style.transform = '';
    const pRect = previewPane.getBoundingClientRect();
    const sRect = svg.getBoundingClientRect();
    if (!sRect.width || !sRect.height) { scale = 1; tx = 0; ty = 0; return; }
    // SVG is width/height=100% so it already fills pane — just reset transform.
    scale = 1; tx = 0; ty = 0;
    applyTransform();
  }

  // Zoom around a point (screenX, screenY) by factor dz.
  function zoom(screenX, screenY, dz) {
    const svg = getSvgEl();
    if (!svg) return;
    const pRect = previewPane.getBoundingClientRect();
    const px = screenX - pRect.left;
    const py = screenY - pRect.top;
    const newScale = Math.min(8, Math.max(0.1, scale * dz));
    // Keep the diagram point under the cursor fixed.
    tx = px - (px - tx) * (newScale / scale);
    ty = py - (py - ty) * (newScale / scale);
    scale = newScale;
    applyTransform();
  }

  // ─── Wheel zoom ──────────────────────────────────────────────────────────────
  previewPane.addEventListener('wheel', e => {
    if (!getSvgEl()) return;
    e.preventDefault();
    const dz = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoom(e.clientX, e.clientY, dz);
  }, { passive: false });

  // ─── Pinch zoom (touch) ──────────────────────────────────────────────────────
  previewPane.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      pinchDist = Math.sqrt(dx * dx + dy * dy);
    }
  }, { passive: true });

  previewPane.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && pinchDist) {
      e.preventDefault();
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const newDist = Math.sqrt(dx * dx + dy * dy);
      const dz = newDist / pinchDist;
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      zoom(cx, cy, dz);
      pinchDist = newDist;
    }
  }, { passive: false });

  previewPane.addEventListener('touchend', () => { pinchDist = null; });

  // ─── Background drag-to-pan ──────────────────────────────────────────────────
  previewPane.addEventListener('pointerdown', e => {
    // Only start a pan if target is the pane or the SVG background rect.
    const onBackground = e.target === previewPane
      || e.target.tagName === 'svg'
      || (e.target.tagName === 'rect' && e.target.parentNode.tagName === 'svg');
    if (!onBackground) return;
    panStart = { x: e.clientX, y: e.clientY, tx, ty };
    previewPane.setPointerCapture(e.pointerId);
    previewPane.style.cursor = 'grabbing';
  });

  previewPane.addEventListener('pointermove', e => {
    if (!panStart) return;
    tx = panStart.tx + (e.clientX - panStart.x);
    ty = panStart.ty + (e.clientY - panStart.y);
    applyTransform();
  });

  const endPan = () => {
    panStart = null;
    previewPane.style.cursor = '';
  };
  previewPane.addEventListener('pointerup', endPan);
  previewPane.addEventListener('pointercancel', endPan);

  return {
    fit,
    reset() { scale = 1; tx = 0; ty = 0; applyTransform(); },
    zoomTo(z) {
      const pRect = previewPane.getBoundingClientRect();
      zoom(pRect.left + pRect.width / 2, pRect.top + pRect.height / 2, z / scale);
    },
  };
}
