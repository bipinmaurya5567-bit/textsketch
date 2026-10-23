# TextSketch — Progress Log

## Baseline (v0.1 — commit 82a4875)
- Flowchart, timeline, mind-map rendering working.
- Back-edge routing fixed (enters target from left side).
- Dark theme bg synced with SVG background.
- .env, research/, node_modules excluded from git.

---

## Phase 1 — Mind Map Radial Layout (DONE)
**What changed:**
- layout.js: rewrote layoutMindmap — balanced radial layout; dynamic R1 grows with child count to prevent overlap for up to 40 nodes; per-branch accent colours (10-colour palette) propagated as ranchColor on each posNode and posEdge; actual node width/height computed per label (multi-line wrapping estimate); branch lines start from nearest box border via orderPt() helper.
- painter.js: rewrote paintMindmap — root gets full-accent pill; depth-1 branches get solid coloured rounded-rect; depth-2+ leaves get subtle fill with coloured left accent bar; all labels use wrapText() (min 12 px); box() uses actual node dims; drawEdge() now accepts optional strokeOverride for branch-coloured edges.
- Tested: Product Strategy sample and Large (6-branch depth-3) sample — no overlaps, distinct colours confirmed in browser.

---

## Phase 2 — Canvas Zoom/Pan (DONE)
**What changed:**
- New public/canvas.js: wheel zoom, pinch zoom (touch), drag-background pan, it() (reset transform), eset() (100%). CSS transform applied to SVG element so viewBox is untouched for exports.
- index.html: Fit and 100% buttons in canvas toolbar, wired in app.js.
- pp.js: initCanvas() called on startup; canvasCtrl.fit() called after every render.
- Tested: zoom in/out with scroll wheel, Fit and 100% buttons — both work.

---

## Phase 3 — Flowchart & Timeline Improvements (DONE)
**What changed:**
- layout.js: 2-pass barycenter heuristic (forward + backward) for better node ordering on wide 30-node diagrams; adaptive hGap widens automatically when a layer has >4 nodes; back-edge detour staggered by 22px per back-edge to prevent rail overlap on multi-back-edge graphs.
- layout.js (timeline): compressed label offset (90px) for 12-event timelines.
- samples.js: added CI/CD Pipeline flowchart (21 nodes, 5 back-edges), 12-event Timeline stress-test, and large 6-branch depth-3 mindmap.
- Tested: CI/CD sample — all 21 nodes visible, no overlaps, 5 staggered back-edge rails; 12-event timeline — all events alternating above/below.

---

## Phase 4 — Autosave, History, Share, JSON Import/Export (DONE)
**What changed:**
- New public/history.js: stores last 10 diagrams in localStorage; push on AI generate; history panel with Open/delete/rename per entry.
- New public/share.js: encodes diagram JSON as deflate-raw (CompressionStream) or base64url fallback into URL hash; copyShareLink() writes to clipboard.
- pp.js: autosave textarea+type+theme to localStorage; session restore on load; URL hash decoded on first load; JSON export (Blob download) and JSON import (FileReader); Ctrl+Enter triggers Generate.
- index.html: History panel (collapsible), Share button, JSON Export/Import buttons, hidden file input.
- Tested: History panel opens with "Recent Diagrams" header; Share copies link; JSON export/import work.

---

## Phase 5 — Server Hardening (DONE)
**What changed:**
- server/index.js: rewritten with GEMINI_MODEL env override (default gemini-2.0-flash); 20 req/10 min per-IP rate limiter; 10 kb body size limit; 30 s request timeout; retry-once on 503/invalid JSON; server-side alidateSpec() (type check, node/edge ID cross-reference, label length truncation); GET /api/health endpoint; security headers (CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy).
- Tested: GET /api/health returns {"status":"ok","model":"gemini-2.0-flash","keyLoaded":true}.

---

## Phase 6 — UX / A11y (DONE)
**What changed:**
- index.html: ria-pressed on type buttons; ole="group" on type selector; ria-label on all major regions; ria-live="polite" on preview pane; ole="alert" on error banner; ole="status" on spinner; ole="list" on history list; .sr-only utility class; responsive stacked layout under 800px (flexbox column, max-height: 38vh for left panel).
- pp.js: prefers-color-scheme applied on first visit (no saved preference); Ctrl+Enter generate shortcut; toast uses ria-live.
- Tested: dark-mode system preference applied correctly on fresh session.

---

## Phase 7 — Security / Cleanliness (DONE)
**What changed:**
- All user-visible text in pp.js uses .textContent (never .innerHTML) — error banner, toasts, history titles.
- Placeholder built with DOM API (no innerHTML).
- 
pm audit: 0 vulnerabilities found.
- Server never logs user text; API key masked in startup log.

---

## Phase 8 — Tests, README, DEPLOY (DONE)
**What changed:**
- New 	est/layout.test.mjs: 10 tests using 
ode:test — flowchart no-overlap (user-registration + 21-node CI/CD), back-edge 5-waypoint check, timeline 12-event positioning, timeline alternating, mindmap no-overlap (product-strategy + 6-branch), branch colour distinctness, share encode/decode round-trip, server validateSpec smoke-test.
- package.json: added "test": "node --test test/layout.test.mjs".
- All 10 tests pass (
pm test exit code 0).

---

## Final Browser Test Results (v0.2)
| Feature | Result |
|---|---|
| Mind map coloured branches | PASS |
| Mind map no overlaps | PASS |
| Dark theme seamless background | PASS |
| Flowchart back-edge left-side entry | PASS |
| Canvas zoom/pan (wheel + Fit + 100%) | PASS |
| History panel opens | PASS |
| Share button copies link | PASS |
| Export SVG/PNG/JSON | PASS |
| /api/health endpoint | PASS |
| npm audit 0 vulnerabilities | PASS |
| npm test 10/10 pass | PASS |
