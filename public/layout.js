// layout.js — three layout engines: flowchart (Sugiyama-lite), timeline, mindmap

// ─── Constants ────────────────────────────────────────────────────────────────
const NODE_W = 160;
const NODE_H = 48;
const H_GAP  = 60;
const V_GAP  = 80;
const CANVAS_H = 500;
const CANVAS_W = 900;

// ─── Flowchart ─────────────────────────────────────────────────────────────────
// IMPORTANT: node.x / node.y are stored as CENTER coordinates so painter.js
// (translate to center, draw shape at -hw/-hh) and interact.js (border = center
// +/- half-size) both agree on where node borders are.
function layoutFlowchart(spec) {
  const nodes = spec.nodes.map(n => ({ ...n }));
  const edges = spec.edges.map(e => ({ ...e, reversed: false }));

  // Phase 1 — cycle removal via DFS
  const visited = new Set();
  const stack   = new Set();
  function dfs(id) {
    if (stack.has(id)) return;
    if (visited.has(id)) return;
    visited.add(id);
    stack.add(id);
    for (const e of edges) {
      if (e.from === id) {
        if (stack.has(e.to)) {
          [e.from, e.to] = [e.to, e.from];
          e.reversed = true;
        } else {
          dfs(e.to);
        }
      }
    }
    stack.delete(id);
  }
  for (const n of nodes) dfs(n.id);

  // Phase 2 — layer assignment (longest path from any source)
  const rank = new Map(nodes.map(n => [n.id, 0]));
  const inDeg = new Map(nodes.map(n => [n.id, 0]));
  for (const e of edges) inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);

  const queue = nodes.filter(n => !inDeg.get(n.id)).map(n => n.id);
  const seen = new Set(queue);
  while (queue.length) {
    const id = queue.shift();
    for (const e of edges) {
      if (e.from !== id) continue;
      const newRank = rank.get(id) + 1;
      if (newRank > rank.get(e.to)) rank.set(e.to, newRank);
      if (!seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
    }
  }
  for (const n of nodes) if (!rank.has(n.id)) rank.set(n.id, 0);

  // Phase 3 — group nodes by layer
  const maxRank = Math.max(...rank.values());
  const layers  = Array.from({ length: maxRank + 1 }, () => []);
  for (const n of nodes) layers[rank.get(n.id)].push(n.id);

  // Barycenter heuristic — 2 passes (forward then backward) for wider diagrams.
  function barycenterPass(forward) {
    const start = forward ? 1 : maxRank - 1;
    const end   = forward ? maxRank : 0;
    const step  = forward ? 1 : -1;
    for (let r = start; forward ? r <= end : r >= end; r += step) {
      const refLayer = layers[r - step];
      const posRef = new Map();
      refLayer.forEach((id, i) => posRef.set(id, i));
      layers[r].sort((a, b) => {
        const pA = edges.filter(e => forward ? e.to === a : e.from === a)
                        .map(e => posRef.get(forward ? e.from : e.to) ?? 0);
        const pB = edges.filter(e => forward ? e.to === b : e.from === b)
                        .map(e => posRef.get(forward ? e.from : e.to) ?? 0);
        const avgA = pA.length ? pA.reduce((s, v) => s + v, 0) / pA.length : 0;
        const avgB = pB.length ? pB.reduce((s, v) => s + v, 0) / pB.length : 0;
        return avgA - avgB;
      });
    }
  }
  if (maxRank > 0) { barycenterPass(true); barycenterPass(false); }

  // Phase 4 — coordinate assignment (CENTER coords).
  // Adaptive H_GAP: widen automatically when a layer has many nodes.
  const maxLayerSize = Math.max(...layers.map(l => l.length));
  const hGap = maxLayerSize > 4
    ? Math.max(H_GAP, Math.ceil(700 / maxLayerSize) - NODE_W)
    : H_GAP;

  const hw = NODE_W / 2;
  const hh = NODE_H / 2;
  const centered = new Map();
  for (let r = 0; r <= maxRank; r++) {
    const layer  = layers[r];
    const totalW = layer.length * NODE_W + (layer.length - 1) * hGap;
    const startX = -totalW / 2 + hw;
    const cy     = r * (NODE_H + V_GAP) + hh;
    layer.forEach((id, i) => {
      centered.set(id, {
        x: startX + i * (NODE_W + hGap),
        y: cy,
        width:  NODE_W,
        height: NODE_H,
      });
    });
  }

  // Phase 5 — edge waypoints using center +/- half-size border anchors.
  // Forward edges: bottom-of-source -> top-of-target, via elbow.
  // Reversed (back) edges: enter target from left side; stagger multiple rails
  // by 22px each so they don't overlap on wide diagrams.
  const BASE_DETOUR = NODE_W / 2 + 40;
  let backEdgeCount = 0;

  const posEdges = edges.map(e => {
    const A = centered.get(e.from);
    const B = centered.get(e.to);
    if (!A || !B) return { ...e, waypoints: [] };

    if (e.reversed) {
      const startX = B.x;
      const startY = B.y + B.height / 2;
      const endX   = A.x - A.width / 2;
      const endY   = A.y;
      const detour = BASE_DETOUR + backEdgeCount * 22;
      backEdgeCount++;
      const sideX  = Math.min(startX, A.x) - detour;
      const step   = 20;
      return { ...e, waypoints: [
        { x: startX, y: startY },
        { x: startX, y: startY + step },
        { x: sideX,  y: startY + step },
        { x: sideX,  y: endY          },
        { x: endX,   y: endY          },
      ]};
    }

    const ax = A.x;
    const ay = A.y + A.height / 2;
    const bx = B.x;
    const by = B.y - B.height / 2;
    const my = (ay + by) / 2;
    return { ...e, waypoints: [{ x: ax, y: ay }, { x: ax, y: my }, { x: bx, y: my }, { x: bx, y: by }] };
  });

  const posNodes = nodes.map(n => ({ ...n, ...centered.get(n.id) }));
  return { ...spec, nodes: posNodes, edges: posEdges };
}

// ─── Timeline ─────────────────────────────────────────────────────────────────
function layoutTimeline(spec) {
  const events = spec.events || [];
  const spineY = CANVAS_H / 2;
  const n = events.length;
  // Phase 3: compress spacing for 12 events.
  const spacing = n <= 8 ? 160 : Math.max(80, CANVAS_W / n);
  const totalW = (n - 1) * spacing;
  const startX = -totalW / 2;

  const posEvents = events.map((ev, i) => {
    const tickX  = startX + i * spacing;
    const above  = i % 2 === 0;
    // Phase 3: tighter offset for compressed timelines.
    const offset = n <= 8 ? 110 : 90;
    const labelY = above ? spineY - offset : spineY + offset;
    return { ...ev, tickX, tickY: spineY, labelX: tickX, labelY, above };
  });

  return { ...spec, events: posEvents, spineY, spineStartX: startX - 40, spineEndX: startX + totalW + 40 };
}

// ─── Mind Map ─────────────────────────────────────────────────────────────────
// Per-branch accent colours (10 distinct hues; cycles if >10 top-level branches).
const BRANCH_COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#ec4899', // pink
  '#14b8a6', // teal
];

// Estimate lines a label occupies at given chars-per-line.
function estimateLines(label, charsPerLine) {
  if (!label) return 1;
  const words = String(label).replace(/\\n/g, ' ').split(/\s+/);
  let lines = 1, cur = 0;
  for (const w of words) {
    if (!w) continue;
    const need = cur ? cur + 1 + w.length : w.length;
    if (need > charsPerLine && cur > 0) { lines++; cur = w.length; }
    else cur = need;
  }
  return lines;
}

// Mind-map node box dimensions. Height grows with wrapped line count.
const MM_W      = 144;
const MM_CPLW   = 17;   // estimated chars per line
const MM_LINE_H = 18;   // px per text line
const MM_PAD_V  = 14;   // vertical padding inside box (total top+bottom)

function mmNodeDims(label, isRoot) {
  const w = isRoot ? MM_W + 28 : MM_W;
  const cpl = isRoot ? Math.floor(w / 8.5) : MM_CPLW;
  const lines = estimateLines(label, cpl);
  const h = Math.max(36, lines * MM_LINE_H + MM_PAD_V);
  return { width: w, height: isRoot ? h + 8 : h };
}

// Nearest-border exit point from box centre (cx,cy) in unit direction (ux,uy).
function borderPt(cx, cy, hw, hh, ux, uy) {
  const tx = ux !== 0 ? hw / Math.abs(ux) : Infinity;
  const ty = uy !== 0 ? hh / Math.abs(uy) : Infinity;
  const t  = Math.min(tx, ty);
  return { x: cx + ux * t, y: cy + uy * t };
}

function layoutMindmap(spec) {
  const root = spec.root;
  if (!root) return spec;

  const rootChildren = root.children || [];
  const n1 = Math.max(1, rootChildren.length);

  // Radius at depth 1: ensure arc-length between siblings >= MM_W + 52 px.
  const R1 = Math.max(230, ((MM_W + 52) * n1) / (2 * Math.PI));
  // Radius at depth 2: enough space for grandchildren.
  const R2 = R1 + 210;
  const getR = depth => {
    if (depth === 0) return 0;
    if (depth === 1) return R1;
    if (depth === 2) return R2;
    return R2 + (depth - 2) * 170;
  };

  const posNodes = [];
  const posEdges = [];

  function place(node, depth, aStart, aEnd, parentMeta, branchIdx) {
    const r   = getR(depth);
    const mid = (aStart + aEnd) / 2;
    const x   = depth === 0 ? 0 : r * Math.cos(mid);
    const y   = depth === 0 ? 0 : r * Math.sin(mid);

    const dims  = mmNodeDims(node.label, depth === 0);
    const color = branchIdx >= 0 ? BRANCH_COLORS[branchIdx % BRANCH_COLORS.length] : null;

    posNodes.push({ ...node, x, y, depth, angle: mid, ...dims, branchIdx, branchColor: color });

    if (parentMeta) {
      const dx = x - parentMeta.x, dy = y - parentMeta.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / dist, uy = dy / dist;

      const pPt = borderPt(parentMeta.x, parentMeta.y, parentMeta.width / 2, parentMeta.height / 2,  ux,  uy);
      const cPt = borderPt(x, y, dims.width / 2, dims.height / 2, -ux, -uy);

      if (depth >= 2) {
        const cpx = (pPt.x + cPt.x) / 2, cpy = (pPt.y + cPt.y) / 2;
        posEdges.push({ from: parentMeta.id, to: node.id, branchIdx, branchColor: color,
          waypoints: [pPt, { x: cpx, y: cpy }, cPt], bezier: true });
      } else {
        posEdges.push({ from: parentMeta.id, to: node.id, branchIdx, branchColor: color,
          waypoints: [pPt, cPt], bezier: false });
      }
    }

    const children = node.children || [];
    if (!children.length) return;

    const gap = 0.03;
    const secSize = (aEnd - aStart) / children.length;
    children.forEach((child, i) => {
      const s = aStart + i * secSize + gap * secSize;
      const e = aStart + (i + 1) * secSize - gap * secSize;
      const bi = depth === 0 ? i : branchIdx;
      place(child, depth + 1, s, e,
        { id: node.id, x, y, width: dims.width, height: dims.height }, bi);
    });
  }

  place(root, 0, 0, 2 * Math.PI, null, -1);

  return { ...spec, posNodes, posEdges };
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function layout(spec) {
  switch (spec.type) {
    case 'flowchart': return layoutFlowchart(spec);
    case 'timeline':  return layoutTimeline(spec);
    case 'mindmap':   return layoutMindmap(spec);
    default:          return spec;
  }
}
