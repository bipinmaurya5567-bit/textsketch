// export.js — SVG + PNG + clipboard export (design.md §6)

function filename(ext) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `textsketch-${ts}.${ext}`;
}

// Clone the live SVG and set the background colour.
// For SVG export we also bake in concrete pixel dimensions (design.md §6a).
function cloneAndPrepSvg(previewPane, theme, concreteSize = false) {
  const svgEl = previewPane.querySelector('svg');
  if (!svgEl) throw new Error('No diagram to export yet.');
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.style.background = theme.bg;

  if (concreteSize) {
    const vb = svgEl.viewBox.baseVal;
    const w  = vb.width  || 900;
    const h  = vb.height || 600;
    clone.setAttribute('width',  String(w));
    clone.setAttribute('height', String(h));
  }
  return clone;
}

// ─── SVG download ─────────────────────────────────────────────────────────────
export function exportSVG(previewPane, theme) {
  const clone     = cloneAndPrepSvg(previewPane, theme, true /* concrete dims */);
  const svgString = new XMLSerializer().serializeToString(clone);
  const dataUri   = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
  const a = document.createElement('a');
  a.href = dataUri;
  a.download = filename('svg');
  a.click();
}

// ─── Shared SVG → canvas pipeline (for PNG and clipboard) ────────────────────
async function svgToCanvas(previewPane, theme) {
  const clone     = cloneAndPrepSvg(previewPane, theme, true);
  const svgString = new XMLSerializer().serializeToString(clone);

  // Use the live SVG's viewBox for dimensions (never the clone's width/height attr)
  const liveSvg = previewPane.querySelector('svg');
  const vb      = liveSvg.viewBox.baseVal;
  const scale   = 2; // 2× for retina quality
  const cw      = (vb.width  || 900) * scale;
  const ch      = (vb.height || 600) * scale;

  const canvas  = document.createElement('canvas');
  canvas.width  = cw;
  canvas.height = ch;
  const ctx     = canvas.getContext('2d');
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, cw, ch);

  const img = new Image();
  img.src   = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
  await new Promise((resolve, reject) => {
    img.onload  = resolve;
    img.onerror = reject;
  });
  ctx.drawImage(img, 0, 0, cw, ch);
  return canvas;
}

// ─── PNG download ─────────────────────────────────────────────────────────────
export async function exportPNG(previewPane, theme) {
  const canvas  = await svgToCanvas(previewPane, theme);
  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename('png');
  a.click();
}

// ─── Copy PNG to clipboard ────────────────────────────────────────────────────
export async function copyPNG(previewPane, theme, toast) {
  try {
    const canvas = await svgToCanvas(previewPane, theme);
    await new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('Canvas toBlob returned null.'));
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          .then(resolve).catch(reject);
      }, 'image/png');
    });
    toast('Copied!', 'success');
  } catch (e) {
    console.error('Copy PNG failed:', e);
    toast('Clipboard not available (requires HTTPS or localhost)', 'error');
  }
}
