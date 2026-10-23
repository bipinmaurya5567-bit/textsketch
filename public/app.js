// app.js — state machine, event wiring, debounce, AIBridge (design.md §5)
// Phases 2, 4, 6 incorporated.
import { themes }          from './themes.js';
import { layout }          from './layout.js';
import { paint }           from './painter.js';
import { makeInteractive } from './interact.js';
import { exportSVG, exportPNG, copyPNG } from './export.js';
import { samples }         from './samples.js';
import { initCanvas }      from './canvas.js';
import { pushHistory, buildHistoryPanel } from './history.js';
import { copyShareLink, decodeShare }     from './share.js';

// ─── State ────────────────────────────────────────────────────────────────────
let currentTheme      = 'light';
let currentSpec       = null;
let currentPositioned = null;
let currentType       = 'auto';
let pendingTimer      = null;
let prevController    = null;
let canvasCtrl        = null;  // Phase 2 canvas controller
const DEBOUNCE_MS     = 300;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const textarea      = document.getElementById('text-input');
const charCount     = document.getElementById('char-count');
const previewPane   = document.getElementById('preview-pane');
const spinner       = document.getElementById('spinner');
const errorBanner   = document.getElementById('error-banner');
const themeBtn      = document.getElementById('btn-theme');
const samplesSelect = document.getElementById('samples-select');
const generateBtn   = document.getElementById('btn-generate');
const typeButtons   = document.querySelectorAll('[data-type]');

// ─── Phase 2: Canvas init ─────────────────────────────────────────────────────
canvasCtrl = initCanvas(previewPane, () => previewPane.querySelector('svg'));

// Fit button
document.getElementById('btn-fit').addEventListener('click', () => { canvasCtrl.fit(); });
// 100% button
document.getElementById('btn-100').addEventListener('click', () => { canvasCtrl.reset(); });

// ─── Phase 4: Autosave to localStorage ────────────────────────────────────────
function autosave() {
  try {
    localStorage.setItem('ts_input', textarea.value);
    localStorage.setItem('ts_type', currentType);
    localStorage.setItem('ts_theme', currentTheme);
  } catch { /* quota exceeded */ }
}

function restoreSession() {
  try {
    const savedTheme = localStorage.getItem('ts_theme');
    // Phase 6: prefers-color-scheme on first visit (no saved preference).
    if (savedTheme) {
      currentTheme = savedTheme;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      currentTheme = 'dark';
    }
    document.body.dataset.theme = currentTheme;
    themeBtn.textContent = currentTheme === 'light' ? '\u{1F319} Dark' : '\u2600\uFE0F Light';

    const savedType = localStorage.getItem('ts_type');
    if (savedType) { currentType = savedType; updateTypeButtons(); }

    const savedInput = localStorage.getItem('ts_input');
    if (savedInput) {
      textarea.value = savedInput;
      updateCharCount();
      if (looksLikeJson(savedInput)) {
        try {
          const spec = JSON.parse(savedInput);
          if (spec && spec.type) { currentSpec = spec; currentType = spec.type; updateTypeButtons(); renderSpec(spec); return; }
        } catch { /* fall through */ }
      }
    }
  } catch { /* storage unavailable */ }
}

// ─── Phase 4: History panel ───────────────────────────────────────────────────
const histContainer = document.getElementById('history-list');
let histPanel = null;
if (histContainer) {
  histPanel = buildHistoryPanel(histContainer, spec => {
    currentSpec = spec;
    currentType = spec.type;
    updateTypeButtons();
    textarea.value = JSON.stringify(spec, null, 2);
    updateCharCount();
    renderSpec(spec);
    autosave();
    // Close panel on mobile after open.
    const panel = document.getElementById('history-panel');
    if (panel) panel.setAttribute('aria-hidden', 'true');
  });
}

const histToggle = document.getElementById('btn-history');
if (histToggle) {
  histToggle.addEventListener('click', () => {
    const panel = document.getElementById('history-panel');
    if (!panel) return;
    const hidden = panel.getAttribute('aria-hidden') !== 'false';
    panel.setAttribute('aria-hidden', hidden ? 'false' : 'true');
    if (hidden && histPanel) histPanel.refresh();
  });
}

// ─── Phase 4: Share link ─────────────────────────────────────────────────────
const shareBtn = document.getElementById('btn-share');
if (shareBtn) {
  shareBtn.addEventListener('click', async () => {
    if (!currentSpec) { showToast('No diagram to share yet.', 'info'); return; }
    await copyShareLink(currentSpec, showToast);
  });
}

// Phase 4: load share link from URL hash on page open.
async function loadFromHash() {
  const hash = location.hash;
  if (!hash || hash.length < 3) return false;
  const spec = await decodeShare(hash);
  if (!spec) return false;
  try {
    validateSpec(spec);
    currentSpec = spec;
    currentType = spec.type;
    updateTypeButtons();
    textarea.value = JSON.stringify(spec, null, 2);
    updateCharCount();
    renderSpec(spec);
    // Clear hash so refresh doesn't re-load it.
    history.replaceState(null, '', location.pathname);
    showToast('Shared diagram loaded!', 'success');
    return true;
  } catch (e) {
    showToast('Invalid share link.', 'error');
    return false;
  }
}

// ─── Phase 4: JSON import/export ─────────────────────────────────────────────
const jsonExportBtn = document.getElementById('btn-json-export');
if (jsonExportBtn) {
  jsonExportBtn.addEventListener('click', () => {
    if (!currentSpec) { showToast('No diagram to export.', 'info'); return; }
    const json = JSON.stringify(currentSpec, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `textsketch-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

const jsonImportBtn = document.getElementById('btn-json-import');
const jsonImportFile = document.getElementById('json-import-file');
if (jsonImportBtn && jsonImportFile) {
  jsonImportBtn.addEventListener('click', () => jsonImportFile.click());
  jsonImportFile.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const spec = JSON.parse(ev.target.result);
        validateSpec(spec);
        currentSpec = spec;
        currentType = spec.type;
        updateTypeButtons();
        textarea.value = JSON.stringify(spec, null, 2);
        updateCharCount();
        renderSpec(spec);
        autosave();
        showToast('JSON imported!', 'success');
      } catch (err) {
        showToast(`Import failed: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
    jsonImportFile.value = ''; // reset for re-import
  });
}

// ─── Populate Samples dropdown ────────────────────────────────────────────────
samples.forEach((s, i) => {
  const opt = document.createElement('option');
  opt.value = i;
  opt.textContent = s.label;
  samplesSelect.appendChild(opt);
});

samplesSelect.addEventListener('change', () => {
  const idx = parseInt(samplesSelect.value, 10);
  if (isNaN(idx)) return;
  const s = samples[idx];
  currentSpec = s.spec;
  currentType = s.spec.type;
  updateTypeButtons();
  textarea.value = JSON.stringify(s.spec, null, 2);
  updateCharCount();
  renderSpec(s.spec);
  samplesSelect.value = '';
  autosave();
});

// ─── Diagram type toggle ──────────────────────────────────────────────────────
typeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    currentType = btn.dataset.type;
    updateTypeButtons();
    const text = textarea.value.trim();
    if (text && !looksLikeJson(text)) {
      renderCycle(true);
    } else if (currentSpec) {
      renderSpec(currentSpec);
    }
    autosave();
  });
});

function updateTypeButtons() {
  typeButtons.forEach(btn => {
    btn.classList.toggle('btn-active', btn.dataset.type === currentType);
    btn.setAttribute('aria-pressed', btn.dataset.type === currentType ? 'true' : 'false');
  });
}

// ─── Theme toggle ─────────────────────────────────────────────────────────────
themeBtn.addEventListener('click', () => {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.body.dataset.theme = currentTheme;
  themeBtn.textContent = currentTheme === 'light' ? '\u{1F319} Dark' : '\u2600\uFE0F Light';
  if (currentPositioned) {
    renderFromPositioned(currentPositioned);
  } else if (currentSpec) {
    renderSpec(currentSpec);
  }
  autosave();
});

// ─── Generate button ──────────────────────────────────────────────────────────
generateBtn.addEventListener('click', () => {
  const text = textarea.value.trim();
  if (!text) { showError('Please enter some text first.'); return; }
  renderCycle(true);
});

// Phase 6: Ctrl+Enter to generate.
textarea.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    const text = textarea.value.trim();
    if (text) renderCycle(true);
  }
});

// ─── Export bar ───────────────────────────────────────────────────────────────
document.getElementById('btn-export-svg').addEventListener('click', () => {
  try { exportSVG(previewPane, themes[currentTheme]); }
  catch (e) { showError(e.message); }
});
document.getElementById('btn-export-png').addEventListener('click', async () => {
  try { await exportPNG(previewPane, themes[currentTheme]); }
  catch (e) { showError(e.message); }
});
document.getElementById('btn-copy-png').addEventListener('click', async () => {
  await copyPNG(previewPane, themes[currentTheme], showToast);
});

// ─── Textarea input ───────────────────────────────────────────────────────────
textarea.addEventListener('input', () => {
  updateCharCount();
  autosave();
  const text = textarea.value.trim();
  if (!text) { clearPreview(); return; }

  if (looksLikeJson(text)) {
    try {
      const spec = JSON.parse(text);
      if (spec && spec.type) {
        currentSpec = spec;
        currentType = spec.type;
        updateTypeButtons();
        renderSpec(spec);
        return;
      }
    } catch { /* fall through */ }
  }
  scheduleRender();
});

function updateCharCount() {
  charCount.textContent = `${textarea.value.length} / 4000`;
}
function scheduleRender() {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => renderCycle(false), DEBOUNCE_MS);
}
function looksLikeJson(text) {
  return text.trimStart().startsWith('{');
}

// ─── AI render cycle ──────────────────────────────────────────────────────────
// force=true is passed by the Generate button and type-switch clicks;
// false is used by the debounce path. The flag is available for future use
// (e.g. bypass a cache) but the current implementation always calls the API.
async function renderCycle(force = false) { // eslint-disable-line no-unused-vars
  const text = textarea.value.trim();
  if (!text) { clearPreview(); return; }

  showSpinner(true);
  hideError();
  setGenerateLoading(true);

  if (prevController) prevController.abort();
  prevController = new AbortController();

  try {
    const resp = await fetch('/api/generate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  prevController.signal,
      body:    JSON.stringify({ text, type: currentType }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      // Show a message tailored to the failure type.
      let msg = data.error;
      if (!msg) {
        if (resp.status === 504) msg = 'The AI took too long to respond. Please try again.';
        else if (resp.status === 429) msg = 'Too many requests. Please wait a moment then try again.';
        else msg = `Unexpected server error (${resp.status}). Try again.`;
      }
      throw new Error(msg);
    }
    currentSpec = data;
    if (data.type && data.type !== currentType && currentType === 'auto') {
      highlightResolvedType(data.type);
    }
    renderSpec(data);
    // Phase 4: push to history on every successful AI generation.
    pushHistory(data);
    if (histPanel) histPanel.refresh();
  } catch (e) {
    if (e.name === 'AbortError') return;
    showError(e.message || 'Could not reach the server. Is it running?');
  } finally {
    showSpinner(false);
    setGenerateLoading(false);
  }
}

function highlightResolvedType(resolvedType) {
  typeButtons.forEach(btn => {
    btn.classList.toggle('btn-active', btn.dataset.type === resolvedType);
  });
}

// ─── renderSpec: layout -> paint -> interact ──────────────────────────────────
function renderSpec(spec) {
  try {
    validateSpec(spec);
    currentPositioned = layout(spec);
    renderFromPositioned(currentPositioned);
    hideError();
  } catch (e) {
    showError(e.message);
  }
}

// ─── renderFromPositioned: paint -> makeInteractive ───────────────────────────
function renderFromPositioned(positioned) {
  const svg = paint(positioned, themes[currentTheme]);
  previewPane.replaceChildren(svg);
  hideError();
  makeInteractive(svg, positioned, onPositionedChange);
  // Phase 2: auto-fit after each render.
  requestAnimationFrame(() => canvasCtrl.fit());
}

function onPositionedChange(updatedPositioned) {
  currentPositioned = updatedPositioned;
  renderFromPositioned(updatedPositioned);
}

// ─── Client-side validation ───────────────────────────────────────────────────
function validateSpec(spec) {
  const validTypes = ['flowchart', 'timeline', 'mindmap'];
  if (!validTypes.includes(spec.type)) throw new Error(`Unknown type "${spec.type}".`);
  if (spec.type === 'flowchart') {
    if (spec.nodes && spec.nodes.length > 40) throw new Error('Too many nodes (max 40).');
    const ids = new Set((spec.nodes || []).map(n => n.id));
    for (const e of (spec.edges || [])) {
      if (!ids.has(e.from)) throw new Error(`Edge references unknown node "${e.from}".`);
      if (!ids.has(e.to))   throw new Error(`Edge references unknown node "${e.to}".`);
    }
  }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function clearPreview() {
  previewPane.replaceChildren(makePlaceholder());
  currentSpec = null;
  currentPositioned = null;
}

function makePlaceholder() {
  const div = document.createElement('div');
  div.className = 'placeholder';
  // Phase 7: use textContent / DOM, no innerHTML with user data.
  const svgNS = 'http://www.w3.org/2000/svg';
  const svgEl = document.createElementNS(svgNS, 'svg');
  svgEl.setAttribute('width', '64'); svgEl.setAttribute('height', '64');
  svgEl.setAttribute('viewBox', '0 0 64 64'); svgEl.setAttribute('fill', 'none');

  const rect = document.createElementNS(svgNS, 'rect');
  rect.setAttribute('x','8'); rect.setAttribute('y','12');
  rect.setAttribute('width','48'); rect.setAttribute('height','40');
  rect.setAttribute('rx','6'); rect.setAttribute('stroke','currentColor');
  rect.setAttribute('stroke-width','2'); rect.setAttribute('stroke-dasharray','4 3');
  svgEl.appendChild(rect);

  const circ = document.createElementNS(svgNS, 'circle');
  circ.setAttribute('cx','24'); circ.setAttribute('cy','28'); circ.setAttribute('r','5');
  circ.setAttribute('stroke','currentColor'); circ.setAttribute('stroke-width','2');
  svgEl.appendChild(circ);

  const rct2 = document.createElementNS(svgNS, 'rect');
  rct2.setAttribute('x','34'); rct2.setAttribute('y','23');
  rct2.setAttribute('width','16'); rct2.setAttribute('height','10');
  rct2.setAttribute('rx','3'); rct2.setAttribute('stroke','currentColor');
  rct2.setAttribute('stroke-width','2');
  svgEl.appendChild(rct2);

  const line = document.createElementNS(svgNS, 'line');
  line.setAttribute('x1','16'); line.setAttribute('y1','42');
  line.setAttribute('x2','48'); line.setAttribute('y2','42');
  line.setAttribute('stroke','currentColor'); line.setAttribute('stroke-width','2');
  line.setAttribute('stroke-linecap','round');
  svgEl.appendChild(line);

  div.appendChild(svgEl);
  const p = document.createElement('p');
  p.textContent = 'Paste some text and click Generate\u2026';
  const small = document.createElement('span');
  small.textContent = 'or pick a sample from the dropdown above';
  p.appendChild(document.createElement('br'));
  p.appendChild(small);
  div.appendChild(p);
  return div;
}

function showSpinner(on)       { spinner.style.display = on ? 'flex' : 'none'; }
function setGenerateLoading(on) {
  generateBtn.disabled = on;
  generateBtn.textContent = on ? '\u23F3 Generating\u2026' : '\u2736 Generate';
}
function showError(msg) {
  errorBanner.textContent = msg;  // Phase 7: textContent, not innerHTML.
  errorBanner.style.display = 'block';
}
function hideError() { errorBanner.style.display = 'none'; }
function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;  // Phase 7: textContent.
  t.setAttribute('role', 'status');
  t.setAttribute('aria-live', 'polite');
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
restoreSession();
updateTypeButtons();
updateCharCount();

// Phase 4: try loading from URL hash first, then restore saved diagram.
loadFromHash().then(loaded => {
  if (!loaded) {
    // If textarea already has content from restore, render it.
    const text = textarea.value.trim();
    if (text && looksLikeJson(text)) {
      try {
        const spec = JSON.parse(text);
        if (spec && spec.type) { currentSpec = spec; currentType = spec.type; updateTypeButtons(); renderSpec(spec); return; }
      } catch { /* */ }
    }
    if (!text) clearPreview();
  }
});
