# TextSketch — Design Document

> **One-line pitch**: Paste any text, get an interactive SVG diagram back — instantly.

---

## 0. Product Overview

TextSketch is a single-page browser application. The user types or pastes a chunk of
prose (a meeting note, a project plan, a list of ideas) into a text area on the left.
The app sends that text to an AI, receives a structured JSON description of the
diagram, then renders that description as a clean SVG on the right — with no external
diagram library involved. The user can switch between three diagram types (flowchart,
timeline, mind map), fine-tune the result, and export the SVG or a raster PNG.

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (single HTML file + two JS modules)                    │
│                                                                 │
│  ┌──────────────┐   input event     ┌──────────────────────┐   │
│  │  TextInput   │ ────────────────► │   DebounceGate       │   │
│  │  <textarea>  │                   │   (300 ms trailing)  │   │
│  └──────────────┘                   └──────────┬───────────┘   │
│                                                │ fires          │
│                                                ▼               │
│                                     ┌──────────────────────┐   │
│                                     │  AIBridge            │   │
│                                     │  fetch() → /api/parse│   │
│                                     └──────────┬───────────┘   │
│                                                │ DiagramSpec   │
│                                                ▼               │
│                                     ┌──────────────────────┐   │
│                                     │  LayoutEngine        │   │
│                                     │  (per diagram type)  │   │
│                                     └──────────┬───────────┘   │
│                                                │ PositionedSpec│
│                                                ▼               │
│                                     ┌──────────────────────┐   │
│                                     │  SVGPainter          │   │
│                                     │  (pure DOM/SVG API)  │   │
│                                     └──────────┬───────────┘   │
│                                                │               │
│                                                ▼               │
│                                     ┌──────────────────────┐   │
│                                     │  PreviewPane         │   │
│                                     │  <div id="canvas">   │   │
│                                     └──────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ExportBar  [SVG ↓]  [PNG ↓]  [Copy PNG]               │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

Server (thin edge function or Cloud Function)
  POST /api/parse
    body:  { text: string, type: "flowchart" | "timeline" | "mindmap" }
    calls: LLM with a deterministic system prompt
    returns: DiagramSpec (JSON, see §2)
```

### Module split

| File | Responsibility |
|---|---|
| `index.html` | Shell, `<textarea>`, preview `<div>`, toolbar |
| `app.js` | Event wiring, DebounceGate, state, AIBridge calls |
| `layout.js` | Three layout engines (Sugiyama-lite, lane-based, radial) |
| `painter.js` | SVG element factory, arrow routing, text wrapping |
| `export.js` | SVG serialise → download; SVG → Canvas → PNG pipeline |
| `server/parse.js` | Edge function: prompt assembly, LLM call, JSON validation |

All browser files are vanilla ES modules — no bundler required for development.

---

## 2. AI JSON Contract — DiagramSpec

The server returns exactly one JSON object. The browser trusts its shape (validated
with a tiny JSON Schema check) and nothing else.

```jsonc
{
  // Which diagram type the AI chose (may differ from user's hint if text suits
  // a different type better — the UI lets the user override).
  "type": "flowchart",           // "flowchart" | "timeline" | "mindmap"

  // Short label shown in the diagram header.
  "title": "User Registration Flow",

  // Nodes — every distinct concept, step, event, or idea.
  "nodes": [
    {
      "id": "n1",               // stable, unique within this spec
      "label": "Visitor lands\non homepage",
      "shape": "rounded-rect",  // "rect" | "rounded-rect" | "diamond" | "circle" | "pill"
      "role": "start"           // "start" | "end" | "step" | "decision" | "note" (optional)
    },
    {
      "id": "n2",
      "label": "Fill sign-up form",
      "shape": "rounded-rect",
      "role": "step"
    },
    {
      "id": "n3",
      "label": "Valid?",
      "shape": "diamond",
      "role": "decision"
    },
    {
      "id": "n4",
      "label": "Show errors",
      "shape": "rect",
      "role": "step"
    },
    {
      "id": "n5",
      "label": "Create account",
      "shape": "rounded-rect",
      "role": "step"
    },
    {
      "id": "n6",
      "label": "Send welcome email",
      "shape": "rounded-rect",
      "role": "step"
    },
    {
      "id": "n7",
      "label": "Done",
      "shape": "circle",
      "role": "end"
    }
  ],

  // Edges — directed connections between nodes.
  "edges": [
    { "from": "n1", "to": "n2", "label": "" },
    { "from": "n2", "to": "n3", "label": "" },
    { "from": "n3", "to": "n4", "label": "No" },
    { "from": "n4", "to": "n2", "label": "retry" },
    { "from": "n3", "to": "n5", "label": "Yes" },
    { "from": "n5", "to": "n6", "label": "" },
    { "from": "n6", "to": "n7", "label": "" }
  ],

  // Timeline-only: ordered list of moments.
  // Present only when type === "timeline"; nodes array is ignored.
  "events": [
    { "id": "e1", "date": "2019", "label": "Company founded", "detail": "Three founders, one rented desk." },
    { "id": "e2", "date": "2021 Q2", "label": "Series A", "detail": "$4 M raised." },
    { "id": "e3", "date": "2023", "label": "1 M users", "detail": "" }
  ],

  // Mind-map only: a single root with recursive children.
  // Present only when type === "mindmap"; nodes/edges are ignored.
  "root": {
    "id": "r0",
    "label": "Product Strategy",
    "children": [
      {
        "id": "r1",
        "label": "Growth",
        "children": [
          { "id": "r1a", "label": "SEO", "children": [] },
          { "id": "r1b", "label": "Referral programme", "children": [] }
        ]
      },
      {
        "id": "r2",
        "label": "Retention",
        "children": [
          { "id": "r2a", "label": "Onboarding", "children": [] }
        ]
      }
    ]
  }
}
```

### Validation rules enforced in the browser before rendering

1. `type` must be one of the three known strings.
2. Every `edge.from` and `edge.to` must reference an existing `node.id`.
3. `nodes` must contain at most 40 items (prevents illegible diagrams).
4. Cycles in edges are allowed for flowcharts; for timelines and mind maps the
   data structures are inherently acyclic.
5. If validation fails, the PreviewPane shows an error card instead of crashing.

---

## 3. Layout Engines

Each layout engine receives the validated DiagramSpec and returns a **PositionedSpec**
— the same object extended with `x`, `y`, `width`, `height` on every node, and a
list of `waypoints` on every edge. All units are in logical pixels; the SVGPainter
scales them to a `viewBox`.

### 3a. Flowchart — Layered (Sugiyama-lite)

The goal is a top-to-bottom directed graph where edges flow downward with the
fewest possible crossings.

**Phase 1 — Cycle removal**

Walk edges depth-first. If a back-edge is found (an edge that points to an ancestor
in the current DFS stack), reverse it in the working graph and mark it `reversed`.
After layout the arrow on that edge will be drawn pointing the original direction.

**Phase 2 — Layer assignment**

Assign each node a rank (row index) equal to the length of the longest path from
any source node to that node. This is a simple topological-order dynamic programming
pass:

```
rank[n] = max(rank[predecessor] + 1) for all predecessors, or 0 if none.
```

Nodes with no predecessors go in rank 0. The result is a set of layers
`L[0], L[1], ..., L[k]`.

**Phase 3 — Crossing minimisation (one-pass)**

For each layer from top to bottom, order nodes by the average rank-position of their
parents in the layer above (the "barycenter heuristic"). One forward pass and one
backward pass are enough for diagrams up to ~30 nodes.

**Phase 4 — Coordinate assignment**

- Horizontal: nodes in each layer are spaced evenly. The layer's total width is
  `n_nodes × (NODE_W + H_GAP)`. Nodes are centred within the layer.
- Vertical: each layer top is at `rank × (NODE_H + V_GAP)`. Constants:
  `NODE_W = 160`, `NODE_H = 48`, `H_GAP = 40`, `V_GAP = 60`.

**Phase 5 — Edge waypoints**

For each edge from node A (rank r) to node B (rank r+1), the waypoint list is:

```
[A.bottomCenter, midpoint_y, B.topCenter]
```

where `midpoint_y` is halfway between the two layers. For edges that skip multiple
layers ("long edges"), insert a virtual waypoint at each intermediate layer to keep
lines straight. For back-edges (after cycle removal), route along the right margin.

---

### 3b. Timeline — Horizontal Swim Lane

The input is `spec.events` (already in order). Layout proceeds in one left-to-right
pass.

**Spine**: a horizontal line at `y = CANVAS_H / 2`. Events alternate above and below
the spine to prevent label collisions:

- Even-indexed events: label above the spine, tick at spine y.
- Odd-indexed events: label below.

**Spacing**: distribute events evenly. If `events.length <= 8`, use fixed spacing of
`160 px` between ticks. For longer timelines, compress to `max(80, CANVAS_W / n)`
where `CANVAS_W` is 900 by default.

**Each event node emits**:
```
{
  tickX,       // x position of the tick mark on the spine
  tickY,       // = CANVAS_H / 2
  labelX,      // = tickX (centred)
  labelY,      // tickY - 70  (above) or tickY + 70 (below)
  connectorY1, // spine y
  connectorY2  // labelY baseline or top depending on direction
}
```

No edges exist in the DiagramSpec for timelines; the spine itself is the connector.

---

### 3c. Mind Map — Radial Tree

The `root` node sits at the canvas centre. Its immediate children are distributed
evenly around a circle of radius `R1 = 200`. Each child's subtree fans out in the
angular sector allocated to that child.

**Angular sector allocation**:
- Each child `c` of the root gets a sector of `(2π / numChildren)` radians.
- Each grandchild gets a proportional sub-sector within its parent's sector.
- Recurse until leaves.

**Radial layer radii**:
- Depth 0 (root): `r = 0` (centre).
- Depth 1: `r = 200`.
- Depth 2: `r = 340`.
- Depth 3+: `r = 340 + (depth - 2) × 120`.

**Node placement**:
```
x = cx + r × cos(midAngle)
y = cy + r × sin(midAngle)
```
where `midAngle` is the middle of the node's angular sector.

**Edge waypoints**: straight line from parent centre to child centre. For depth >= 2,
a quadratic Bézier is used with the control point pulled 30 px toward the canvas
centre to give a gentle curve.

**Label orientation**: labels at the left half of the circle (`cos(θ) < 0`) are
right-aligned; labels at the right half are left-aligned; the root is centre-aligned.

---

## 4. SVG Rendering — SVGPainter

The painter module has one public function:

```js
// Returns an <svg> element ready to append to the DOM.
function paint(positionedSpec, theme) { ... }
```

It never touches `innerHTML` or template strings. Every element is created with
`document.createElementNS("http://www.w3.org/2000/svg", tagName)` and attributes
are set with `el.setAttribute(name, value)`. This keeps the output XSS-clean and
allows the same code path to be used for both live preview and export.

### 4a. viewBox and sizing

The painter first computes the bounding box of all positioned nodes, adds a padding
of 40 px on each side, and sets:

```
viewBox="minX minY width height"
```

The `<svg>` element itself has `width="100%"` and `height="100%"` so it scales to
fill the preview pane responsively. During export, concrete pixel dimensions are
written instead.

### 4b. Defs block

One `<defs>` block is emitted per render, containing:

- **Arrow markers** — one `<marker>` per colour variant (normal, highlighted, reversed).
  The arrowhead is a small filled path: a triangle 10 px long, 6 px wide at the base.
- **Drop-shadow filter** — a `<filter>` with `feDropShadow` for node cards.
- **Gradient defs** — a `<linearGradient>` for the flowchart node fill (very subtle,
  just 4% lighter at the top).

### 4c. Node shapes

Each node is drawn by a small helper that returns a `<g>` group containing the shape
element and a `<text>` child.

| `shape` value | SVG element | Key attributes |
|---|---|---|
| `rect` | `<rect>` | `rx="2"` |
| `rounded-rect` | `<rect>` | `rx="12"` |
| `diamond` | `<polygon>` | 4 points: top, right, bottom, left |
| `circle` | `<circle>` | `r = NODE_H / 2` |
| `pill` | `<rect>` | `rx = NODE_H / 2` |

Text wrapping: the label is split on newlines and on word boundaries to fit within
`NODE_W - 16 px`. Each line becomes a `<tspan>` with `dy="1.2em"`. The group of
tspans is vertically centred by calculating total text height and applying
`transform="translate(0, offset)"` to the `<text>`.

### 4d. Edge paths

Each edge is drawn as an SVG `<path>` element. The path data is generated from the
waypoint list produced by the layout engine:

- **2 waypoints** (straight): `M x1,y1 L x2,y2`
- **3 waypoints** (one intermediate, e.g. layer midpoint):
  `M x1,y1 L xm,ym L x2,y2` — or a cubic `C` if smoothing is on.
- **Bézier for mind map**: `M x1,y1 Q cx,cy x2,y2`

The `marker-end` attribute is set to reference the arrowhead `<marker>` from defs.
Edge labels (`edge.label`) are placed at the midpoint of the path using a `<text>`
with `text-anchor="middle"` and a small white `<rect>` underneath as a knockout.

### 4e. Timeline-specific rendering

- **Spine**: `<line x1="..." y1="centre" x2="..." y2="centre">` spanning the full
  canvas width, stroke `2px`.
- **Tick**: a short `<line>` 12 px tall centred on the spine at `tickX`.
- **Connector**: `<line>` from the tick top/bottom to the label bottom/top.
- **Event card**: `<rect>` + `<text>` for the date, and a second `<text>` for the
  detail in a lighter weight.
- **Date bubble**: the date string is placed inside a small pill (`<rect rx="8">`)
  right on the spine.

### 4f. Colour themes

Two built-in themes; switching re-renders from the PositionedSpec (no new AI call).

```js
const themes = {
  light: {
    bg:           "#ffffff",
    nodeStroke:   "#334155",
    nodeFill:     "#f1f5f9",
    nodeText:     "#0f172a",
    edgeStroke:   "#64748b",
    edgeLabel:    "#475569",
    startFill:    "#dcfce7",
    endFill:      "#fef2f2",
    decisionFill: "#fef9c3",
    spineLine:    "#94a3b8",
    accent:       "#6366f1",
  },
  dark: {
    bg:           "#0f172a",
    nodeStroke:   "#94a3b8",
    nodeFill:     "#1e293b",
    nodeText:     "#f1f5f9",
    edgeStroke:   "#475569",
    edgeLabel:    "#94a3b8",
    startFill:    "#166534",
    endFill:      "#7f1d1d",
    decisionFill: "#713f12",
    spineLine:    "#334155",
    accent:       "#818cf8",
  },
};
```

---

## 5. Live Preview with Debounce

### Event flow

```
textarea "input" event
  │
  ├─ update character count label (synchronous, immediate)
  │
  └─ call schedule(renderCycle)
       │
       ├─ if a pending timer exists → clearTimeout(pendingTimer)
       │
       └─ pendingTimer = setTimeout(renderCycle, DEBOUNCE_MS)


renderCycle():
  1. Read textarea.value and selectedType.
  2. Show spinner in preview pane.
  3. previousController?.abort()           ← cancel any in-flight fetch
  4. controller = new AbortController()
  5. resp = await fetch("/api/parse", {
       method: "POST",
       signal: controller.signal,
       body: JSON.stringify({ text, type })
     })
  6. spec = await resp.json()
  7. Validate spec (see §2 validation rules).
  8. positioned = layout(spec)             ← chosen layout engine
  9. svg = paint(positioned, currentTheme)
 10. previewPane.replaceChildren(svg)      ← single DOM mutation
 11. Hide spinner.
```

### Debounce constant

`DEBOUNCE_MS = 300` — fast enough to feel live; long enough that the API is not
hammered on every keystroke. A user typing at 60 WPM produces one character roughly
every 200 ms, so 300 ms fires at most once per word.

### AbortController

Each `renderCycle` call creates a fresh `AbortController`. Before firing the fetch,
it calls `abort()` on the previous controller (if any). This means a stale response
from a slow AI call cannot overwrite the result of a faster, more recent call.
The fetch `catch` block ignores `AbortError` and re-throws everything else.

### Diagram-type toggle

Three buttons in the toolbar (`Flowchart`, `Timeline`, `Mind Map`) set `selectedType`.
Changing the type fires `renderCycle()` immediately (no debounce delay) because the
text hasn't changed — only the render intent has.

### Error states

| Condition | UI |
|---|---|
| Network error | Red banner: "Could not reach the AI. Check your connection." |
| AI returns invalid JSON | Red banner: "Unexpected AI response. Try again." |
| Validation failure | Yellow banner listing the specific violation. |
| Empty textarea | Clear the preview pane, show placeholder illustration. |

---

## 6. PNG and SVG Export

Both export paths share a single source of truth: the live `<svg>` element currently
in the preview pane.

### 6a. SVG Export

```
1. svgEl = previewPane.querySelector("svg").cloneNode(true)
2. Set svgEl.setAttribute("xmlns", "http://www.w3.org/2000/svg")
3. Set svgEl.style.background = currentTheme.bg
   (so the file looks the same whether opened in a browser or Figma)
4. Serialise:
     serialiser = new XMLSerializer()
     svgString = serialiser.serializeToString(svgEl)
5. Build data URI:
     dataUri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString)
6. Trigger download:
     a = document.createElement("a")
     a.href = dataUri
     a.download = filename("svg")
     a.click()
```

`filename(ext)` returns `textsketch-YYYY-MM-DD-HHmmss.ext` using the local clock
via `new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)`.

### 6b. PNG Export

The SVG-to-PNG pipeline avoids any third-party library.

```
1. Clone and serialise the SVG as in steps 1–4 above.
2. Compute export dimensions:
     vb = svgEl.viewBox.baseVal   // {x, y, width, height}
     scale = 2                    // 2× for retina-quality output
     canvasW = vb.width  * scale
     canvasH = vb.height * scale
3. Create an offscreen canvas:
     canvas = document.createElement("canvas")
     canvas.width  = canvasW
     canvas.height = canvasH
4. Fill with background colour:
     ctx = canvas.getContext("2d")
     ctx.fillStyle = currentTheme.bg
     ctx.fillRect(0, 0, canvasW, canvasH)
5. Load SVG into an Image:
     img = new Image()
     img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString)
     await new Promise(resolve => { img.onload = resolve })
6. Draw onto canvas at 2× scale:
     ctx.drawImage(img, 0, 0, canvasW, canvasH)
7. Export:
     dataUrl = canvas.toDataURL("image/png")
     a = document.createElement("a")
     a.href = dataUrl
     a.download = filename("png")
     a.click()
```

### 6c. Copy to Clipboard

Same pipeline as PNG export up to step 6, then:

```js
canvas.toBlob(blob => {
  navigator.clipboard.write([
    new ClipboardItem({ "image/png": blob })
  ]);
}, "image/png");
```

Guarded by `try/catch`; shows a "Copied!" toast on success and a "Clipboard not
available" toast on failure (e.g. non-HTTPS context).

---

## 7. Server — `/api/parse` Edge Function

### System prompt (skeleton)

```
You are a diagram extraction assistant.
The user will provide a block of text and a desired diagram type.
Return ONLY a JSON object matching the DiagramSpec schema below.
Do not wrap it in markdown. Do not explain.

Schema:
  type: "flowchart" | "timeline" | "mindmap"
  title: string (<= 60 chars)
  nodes: array of Node (for flowchart only)
  edges: array of Edge (for flowchart only)
  events: array of Event (for timeline only)
  root: TreeNode (for mindmap only)

Node: { id, label, shape, role }
Edge: { from, to, label }
Event: { id, date, label, detail }
TreeNode: { id, label, children: TreeNode[] }

Rules:
- Use at most 20 nodes for flowcharts.
- Use at most 12 events for timelines.
- Mind map depth must not exceed 3.
- Labels must be concise (<= 8 words each).
- IDs must be short alphanumeric strings (n1, n2, ...).
```

### Request validation

The edge function rejects requests where:
- `text` is missing or exceeds 4,000 characters.
- `type` is not one of the three known values.
- The caller has sent more than 30 requests in the last 60 seconds (per IP, in-memory
  token bucket).

### Response contract

HTTP 200 with `Content-Type: application/json` and exactly the DiagramSpec object.  
HTTP 400 for validation failures (with a human-readable `error` field).  
HTTP 429 for rate limiting.  
HTTP 502 if the upstream LLM call fails.

---

## 8. State Machine

The UI lives in one of five states at any moment:

```
IDLE  ──► DEBOUNCING ──► FETCHING ──► RENDERING ──► READY
  ▲                                                    │
  └────────────────────────────────────────────────────┘
                        (new input)

FETCHING ──► ERROR (on network/AI failure)
ERROR    ──► DEBOUNCING (on next input)
```

The state drives what the preview pane shows:
- `IDLE`: placeholder ("Paste some text to get started …").
- `DEBOUNCING`: no change (keep showing previous diagram or placeholder).
- `FETCHING`: spinner overlay on top of previous diagram.
- `RENDERING`: not visible to user (fast synchronous step, < 5 ms).
- `READY`: the new SVG diagram.
- `ERROR`: error banner, previous diagram dimmed.

---

## 9. File & Folder Structure

```
textsketch/
├── index.html          — shell, toolbar, split-pane layout
├── app.js              — state machine, event wiring, debounce, AIBridge
├── layout.js           — flowchart, timeline, mindmap layout engines
├── painter.js          — SVGPainter (pure SVG DOM, no innerHTML)
├── export.js           — SVG + PNG + clipboard export
├── themes.js           — light and dark theme token objects
├── server/
│   └── parse.js        — edge function (Node / Deno / Cloudflare Worker)
└── README.md
```

---

## 10. Non-Goals (v1)

- No collaborative editing.
- No undo/redo history (the textarea is always editable).
- No custom node styling by the user.
- No pan/zoom (the SVG scales to fit the pane; may add in v2).
- No offline mode (the AI call requires a server).
- No diagram-to-text round-trip (AI output is not editable as structured data).
