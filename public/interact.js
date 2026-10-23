// interact.js — drag-to-move nodes with live edge attachment, double-click label editing

// ─── Coordinate helpers ───────────────────────────────────────────────────────
function screenToSVG(svgEl, clientX, clientY) {
  const pt = svgEl.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(svgEl.getScreenCTM().inverse());
}

function svgToScreen(svgEl, svgX, svgY) {
  const vb  = svgEl.viewBox.baseVal;
  const rc  = svgEl.getBoundingClientRect();
  const sx  = rc.width  / vb.width;
  const sy  = rc.height / vb.height;
  return { x: rc.left + (svgX - vb.x) * sx, y: rc.top + (svgY - vb.y) * sy, sx, sy };
}

// ─── Box-border clip: given a unit vector (ux,uy) from center of a box (hw,hh),
//     return t so that center + t*(ux,uy) lands on the box border.
function borderT(ux, uy, hw, hh) {
  const tx = ux !== 0 ? hw / Math.abs(ux) : Infinity;
  const ty = uy !== 0 ? hh / Math.abs(uy) : Infinity;
  return Math.min(tx, ty);
}

// ─── Live edge path for drag (flowchart — elbow route using center coords) ────
// A and B have .x/.y as center, .width/.height for size.
// For reversed back-edges, routes via a left-side detour so the path
// doesn't pierce intermediate nodes.
const LEFT_DETOUR_D = 120; // px left of the leftmost node x during drag

function liveEdgeD(A, B, reversed) {
  if (reversed) {
    // Reversed: original source = B, original target = A.
    // Draw path from B.bottom → step-down → left rail → A.y → A.left.
    const startX = B.x;
    const startY = B.y + B.height / 2;
    const endX   = A.x - A.width / 2;   // left edge of target
    const endY   = A.y;                 // vertical centre
    const sideX  = Math.min(startX, A.x) - LEFT_DETOUR_D;
    const step   = 20;
    return `M ${startX},${startY} L ${startX},${startY + step} L ${sideX},${startY + step} L ${sideX},${endY} L ${endX},${endY}`;
  }
  const ax = A.x;
  const ay = A.y + A.height / 2;
  const bx = B.x;
  const by = B.y - B.height / 2;
  const my = (ay + by) / 2;
  return `M ${ax},${ay} L ${ax},${my} L ${bx},${my} L ${bx},${by}`;
}

// ─── Live edge for mindmap: box-border clipped straight/quadratic ─────────────
function liveEdgeMindmap(A, B, bezier) {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / dist, uy = dy / dist;

  const tA = borderT(ux, uy, A.width / 2, A.height / 2);
  const sx = A.x + ux * tA, sy = A.y + uy * tA;

  const tB = borderT(ux, uy, B.width / 2, B.height / 2);
  const ex = B.x - ux * tB, ey = B.y - uy * tB;

  if (bezier) {
    const cpx = (sx + ex) / 2;
    const cpy = (sy + ey) / 2;
    return `M ${sx},${sy} Q ${cpx},${cpy} ${ex},${ey}`;
  }
  return `M ${sx},${sy} L ${ex},${ey}`;
}

// ─── Update every edge <g> that touches a given node ─────────────────────────
function updateEdgesFor(svgEl, movedId, nodesById, type) {
  svgEl.querySelectorAll('.ts-edge').forEach(eg => {
    const from = eg.getAttribute('data-from');
    const to   = eg.getAttribute('data-to');
    if (from !== movedId && to !== movedId) return;
    const A = nodesById.get(from);
    const B = nodesById.get(to);
    if (!A || !B) return;
    const reversed = eg.getAttribute('data-reversed') === '1';
    const bezier   = eg.getAttribute('data-bezier')   === '1';
    const pathEl   = eg.querySelector('path');
    if (!pathEl) return;

    let d;
    if (type === 'mindmap') {
      d = liveEdgeMindmap(A, B, bezier);
    } else {
      d = liveEdgeD(A, B, reversed);
    }
    pathEl.setAttribute('d', d);

    // Slide edge label to the correct midpoint of the new path
    let lx, ly;
    // For reversed back-edges (5 waypoints) place label on the vertical rail
    // (reversed is already declared above at the top of this forEach callback)
    if (reversed) {
      // Midpoint of the vertical rail leg (between 3rd and 4th elbow points)
      const Bnode = nodesById.get(to);
      const Anode = nodesById.get(from);
      if (Anode && Bnode) {
        const startX = Bnode.x, startY = Bnode.y + Bnode.height / 2;
        const endY   = Anode.y;   // vertical centre of target
        const sideX  = Math.min(startX, Anode.x) - 120;
        const step   = 20;
        lx = sideX - 8;
        ly = ((startY + step) + endY) / 2;
      } else {
        lx = (A.x + B.x) / 2;
        ly = (A.y + B.y) / 2;
      }
    } else {
      lx = (A.x + B.x) / 2;
      ly = (A.y + B.y) / 2;
    }
    const txt = eg.querySelector('text');
    if (txt) { txt.setAttribute('x', lx); txt.setAttribute('y', ly); }
    const bg  = eg.querySelector('rect[data-edge-bg]');
    if (bg)  {
      const w = parseFloat(bg.getAttribute('width') || '40');
      bg.setAttribute('x', lx - w / 2); bg.setAttribute('y', ly - 9);
    }
  });
}

// ─── Recompute waypoints in spec after drop (flowchart — center coords) ───────
function recomputeFlowchartWaypoints(spec) {
  const nm = new Map((spec.nodes || []).map(n => [n.id, n]));
  for (const e of (spec.edges || [])) {
    const A = nm.get(e.from), B = nm.get(e.to);
    if (!A || !B) continue;
    if (e.reversed) {
      // Original source = B, original target = A.
      // Enter A from its left side.
      const startX = B.x;
      const startY = B.y + B.height / 2;
      const endX   = A.x - A.width / 2;  // left edge of target
      const endY   = A.y;                // vertical centre of target
      const sideX  = Math.min(startX, A.x) - LEFT_DETOUR_D;
      const step   = 20;
      e.waypoints = [
        { x: startX, y: startY },
        { x: startX, y: startY + step },
        { x: sideX,  y: startY + step },
        { x: sideX,  y: endY          },
        { x: endX,   y: endY          },
      ];
    } else {
      const ax = A.x;
      const ay = A.y + A.height / 2;
      const bx = B.x;
      const by = B.y - B.height / 2;
      const my = (ay + by) / 2;
      e.waypoints = [{ x: ax, y: ay }, { x: ax, y: my }, { x: bx, y: my }, { x: bx, y: by }];
    }
  }
}

// ─── Recompute waypoints in spec after drop (mindmap — border-clipped) ────────
function recomputeMindmapWaypoints(spec) {
  const nm = new Map((spec.posNodes || []).map(n => [n.id, n]));
  for (const e of (spec.posEdges || [])) {
    const A = nm.get(e.from), B = nm.get(e.to);
    if (!A || !B) continue;

    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / dist, uy = dy / dist;

    const tA = borderT(ux, uy, A.width / 2, A.height / 2);
    const startX = A.x + ux * tA, startY = A.y + uy * tA;

    const tB = borderT(ux, uy, B.width / 2, B.height / 2);
    const endX = B.x - ux * tB, endY = B.y - uy * tB;

    if (e.bezier) {
      const cpx = (startX + endX) / 2;
      const cpy = (startY + endY) / 2;
      e.waypoints = [{ x: startX, y: startY }, { x: cpx, y: cpy }, { x: endX, y: endY }];
    } else {
      e.waypoints = [{ x: startX, y: startY }, { x: endX, y: endY }];
    }
  }
}

// ─── Label editor overlay ─────────────────────────────────────────────────────
let _activeInput = null;

function showLabelEditor(svgEl, node, onCommit) {
  if (_activeInput) { _activeInput.remove(); _activeInput = null; }

  const sc = svgToScreen(svgEl, node.x, node.y);
  const w  = (node.width  || 160) * sc.sx;
  const h  = (node.height || 48)  * sc.sy;

  const inp = document.createElement('input');
  inp.type  = 'text';
  inp.value = (node.label || '').replace(/\\n/g, ' ');
  inp.setAttribute('aria-label', 'Edit node label');

  const cs = getComputedStyle(document.body);
  Object.assign(inp.style, {
    position:   'fixed',
    left:       `${sc.x - w / 2}px`,
    top:        `${sc.y - h / 2}px`,
    width:      `${w}px`,
    height:     `${h}px`,
    minWidth:   '80px',
    fontSize:   `${Math.max(11, 13 * sc.sx)}px`,
    fontFamily: 'Inter, system-ui, sans-serif',
    textAlign:  'center',
    border:     '2px solid #6366f1',
    borderRadius: '8px',
    background: cs.getPropertyValue('--color-surface').trim() || '#fff',
    color:      cs.getPropertyValue('--color-text').trim()    || '#0f172a',
    padding:    '0 8px',
    outline:    'none',
    zIndex:     '9999',
    boxShadow:  '0 0 0 4px rgba(99,102,241,0.22)',
  });

  function commit() {
    const val = inp.value.trim();
    inp.remove();
    _activeInput = null;
    onCommit(val || node.label);
  }

  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { inp.remove(); _activeInput = null; }
  });

  document.body.appendChild(inp);
  _activeInput = inp;
  setTimeout(() => { inp.focus(); inp.select(); }, 0);
}

// ─── Flatten a mindmap tree ───────────────────────────────────────────────────
function flattenTree(root) {
  if (!root) return [];
  return [root, ...(root.children || []).flatMap(flattenTree)];
}

// ─── Main entry point ─────────────────────────────────────────────────────────
export function makeInteractive(svgEl, posSpec, onSpecChange) {
  if (!svgEl || !posSpec) return;

  const type = posSpec.type;
  const nodeArray =
    type === 'mindmap'  ? (posSpec.posNodes || []) :
    type === 'timeline' ? [] :
    (posSpec.nodes || []);

  const nodesById = new Map(nodeArray.map(n => [n.id, n]));

  // ── Drag state ─────────────────────────────────────────────────────────────
  let drag = null;

  function endDrag() {
    if (!drag) return;
    drag.g.style.cursor = 'grab';
    drag.g.style.filter = '';
    drag = null;
    if (type === 'flowchart') recomputeFlowchartWaypoints(posSpec);
    else if (type === 'mindmap') recomputeMindmapWaypoints(posSpec);
    onSpecChange(posSpec);
  }

  svgEl.addEventListener('pointerdown', e => {
    if (type === 'timeline') return;
    const g = e.target.closest('[data-node-id]');
    if (!g) return;
    const id = g.getAttribute('data-node-id');
    const node = nodesById.get(id);
    if (!node) return;
    e.preventDefault();
    svgEl.setPointerCapture(e.pointerId);
    const sp = screenToSVG(svgEl, e.clientX, e.clientY);
    drag = { id, g, sp, ox: node.x, oy: node.y };
    g.style.cursor = 'grabbing';
    g.style.filter = 'brightness(1.07)';
  });

  svgEl.addEventListener('pointermove', e => {
    if (!drag) return;
    e.preventDefault();
    const cur  = screenToSVG(svgEl, e.clientX, e.clientY);
    const node = nodesById.get(drag.id);
    node.x = drag.ox + (cur.x - drag.sp.x);
    node.y = drag.oy + (cur.y - drag.sp.y);
    drag.g.setAttribute('transform', `translate(${node.x},${node.y})`);
    updateEdgesFor(svgEl, drag.id, nodesById, type);
  });

  svgEl.addEventListener('pointerup',     endDrag);
  svgEl.addEventListener('pointercancel', endDrag);

  // ── Double-click → label editor ───────────────────────────────────────────
  svgEl.addEventListener('dblclick', e => {
    const g = e.target.closest('[data-node-id]');
    if (!g) return;
    e.preventDefault();
    const id = g.getAttribute('data-node-id');
    const node = nodesById.get(id);
    if (!node) return;

    showLabelEditor(svgEl, node, newLabel => {
      node.label = newLabel;
      if (type === 'mindmap') {
        const flat = flattenTree(posSpec.root);
        const src  = flat.find(n => n.id === id);
        if (src) src.label = newLabel;
      }
      onSpecChange(posSpec);
    });
  });

  // ── Grab cursor on all draggable nodes ────────────────────────────────────
  if (type !== 'timeline') {
    svgEl.querySelectorAll('[data-node-id]').forEach(g => { g.style.cursor = 'grab'; });
  }

  // ── Hint: double-click tooltip on hover ───────────────────────────────────
  svgEl.querySelectorAll('[data-node-id]').forEach(g => {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    t.textContent = type === 'timeline' ? 'Double-click to edit' : 'Drag to move • Double-click to edit';
    g.insertBefore(t, g.firstChild);
  });
}
