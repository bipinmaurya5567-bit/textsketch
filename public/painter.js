// painter.js — SVGPainter: pure SVG DOM, no innerHTML (design.md §4)

const SVG_NS = 'http://www.w3.org/2000/svg';
const NODE_W = 160;
const NODE_H = 48;

// ─── SVG element factory ──────────────────────────────────────────────────────
function el(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// ─── Text wrapping ────────────────────────────────────────────────────────────
// Returns an array of line strings.
function splitLines(label, charsPerLine) {
  const raw = (label || '').replace(/\\n/g, '\n');
  const lines = [];
  for (const paragraph of raw.split('\n')) {
    const words = paragraph.split(' ');
    let current = '';
    for (const w of words) {
      if (!w) continue;
      if (!current) { current = w; continue; }
      if ((current + ' ' + w).length <= charsPerLine) {
        current += ' ' + w;
      } else {
        lines.push(current);
        current = w;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [''];
}

function wrapText(parent, label, maxW, theme, opts = {}) {
  const { fontSize = 13, fontWeight = '400', fill } = opts;
  const charsPerLine = Math.max(8, Math.floor(maxW / (fontSize * 0.55)));
  const lines = splitLines(label, charsPerLine);
  const lineH  = fontSize + 4;
  const totalH = lines.length * lineH;
  const startDy = -(totalH / 2) + lineH / 2;

  const txt = el('text', {
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
    'font-family': 'Inter, system-ui, sans-serif',
    'font-size': String(fontSize),
    'font-weight': fontWeight,
    fill: fill ?? theme.nodeText,
    style: 'pointer-events:none;',
  });

  lines.forEach((line, i) => {
    const ts = el('tspan', { x: '0', dy: i === 0 ? `${startDy}` : `${lineH}` });
    ts.textContent = line;
    txt.appendChild(ts);
  });

  parent.appendChild(txt);
  return lines.length;
}

// ─── Defs block ───────────────────────────────────────────────────────────────
function buildDefs(svg, theme) {
  const defs = el('defs');

  // Arrow marker
  const marker = el('marker', {
    id: 'arrow',
    markerWidth: '10',
    markerHeight: '7',
    refX: '9',
    refY: '3.5',
    orient: 'auto',
  });
  const arrowPath = el('path', {
    d: 'M 0 0 L 10 3.5 L 0 7 Z',
    fill: theme.edgeStroke,
  });
  marker.appendChild(arrowPath);
  defs.appendChild(marker);

  // Arrow marker reversed (accent colour)
  const markerRev = el('marker', {
    id: 'arrow-rev',
    markerWidth: '10',
    markerHeight: '7',
    refX: '9',
    refY: '3.5',
    orient: 'auto',
  });
  const arrowRevPath = el('path', {
    d: 'M 0 0 L 10 3.5 L 0 7 Z',
    fill: theme.accent,
  });
  markerRev.appendChild(arrowRevPath);
  defs.appendChild(markerRev);

  // Drop shadow filter
  const filter = el('filter', { id: 'shadow', x: '-10%', y: '-10%', width: '120%', height: '120%' });
  const fds = el('feDropShadow', { dx: '0', dy: '2', stdDeviation: '3', 'flood-opacity': '0.12' });
  filter.appendChild(fds);
  defs.appendChild(filter);

  // Subtle gradient for node fill
  const grad = el('linearGradient', { id: 'nodeGrad', x1: '0', y1: '0', x2: '0', y2: '1' });
  const s1 = el('stop', { offset: '0%', 'stop-color': '#fff', 'stop-opacity': '0.04' });
  const s2 = el('stop', { offset: '100%', 'stop-color': '#000', 'stop-opacity': '0.0' });
  grad.appendChild(s1);
  grad.appendChild(s2);
  defs.appendChild(grad);

  svg.appendChild(defs);
}

// ─── Node fill by role ────────────────────────────────────────────────────────
function nodeFill(node, theme) {
  if (node.role === 'start')    return theme.startFill;
  if (node.role === 'end')      return theme.endFill;
  if (node.role === 'decision') return theme.decisionFill;
  return theme.nodeFill;
}

// ─── Draw a single node shape ─────────────────────────────────────────────────
// node.x / node.y are CENTER coordinates.
function drawNode(node, theme) {
  const g = el('g', {
    transform: `translate(${node.x},${node.y})`,
    class: 'ts-node',
    'data-node-id': node.id,
    'data-w': String(node.width),
    'data-h': String(node.height),
  });
  const hw = node.width / 2;
  const hh = node.height / 2;
  const fill = nodeFill(node, theme);

  let shape;
  switch (node.shape) {
    case 'rect':
      shape = el('rect', { x: -hw, y: -hh, width: node.width, height: node.height,
        rx: '2', fill, stroke: theme.nodeStroke, 'stroke-width': '1.5',
        filter: 'url(#shadow)' });
      break;
    case 'diamond': {
      const pts = `0,${-hh * 1.2} ${hw * 1.3},0 0,${hh * 1.2} ${-hw * 1.3},0`;
      shape = el('polygon', { points: pts, fill, stroke: theme.nodeStroke,
        'stroke-width': '1.5', filter: 'url(#shadow)' });
      break;
    }
    case 'circle':
      shape = el('circle', { cx: '0', cy: '0', r: hh,
        fill, stroke: theme.nodeStroke, 'stroke-width': '1.5',
        filter: 'url(#shadow)' });
      break;
    case 'pill':
      shape = el('rect', { x: -hw, y: -hh, width: node.width, height: node.height,
        rx: hh, fill, stroke: theme.nodeStroke, 'stroke-width': '1.5',
        filter: 'url(#shadow)' });
      break;
    case 'rounded-rect':
    default:
      shape = el('rect', { x: -hw, y: -hh, width: node.width, height: node.height,
        rx: '12', fill, stroke: theme.nodeStroke, 'stroke-width': '1.5',
        filter: 'url(#shadow)' });
      break;
  }

  g.appendChild(shape);
  wrapText(g, node.label, node.width - 16, theme);
  return g;
}

// ─── Draw an edge path ────────────────────────────────────────────────────────
function drawEdge(edge, theme, strokeOverride) {
  const pts = edge.waypoints;
  if (!pts || pts.length < 2) return null;

  const g = el('g');

  let d;
  if (edge.bezier && pts.length === 3) {
    d = `M ${pts[0].x},${pts[0].y} Q ${pts[1].x},${pts[1].y} ${pts[2].x},${pts[2].y}`;
  } else if (pts.length === 2) {
    d = `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`;
  } else {
    d = `M ${pts[0].x},${pts[0].y}` + pts.slice(1).map(p => ` L ${p.x},${p.y}`).join('');
  }

  const markerId = edge.reversed ? 'url(#arrow-rev)' : 'url(#arrow)';
  const stroke   = strokeOverride ?? (edge.reversed ? theme.accent : theme.edgeStroke);

  const path = el('path', {
    d,
    fill: 'none',
    stroke,
    'stroke-width': '1.5',
    'marker-end': markerId,
  });
  g.appendChild(path);

  // Edge label — place at midpoint of the middle segment, not behind nodes
  if (edge.label) {
    // For a 4-waypoint orthogonal path: the visible middle segment is the
    // horizontal leg (pts[1] → pts[2]).  Use its midpoint so the label floats
    // on open space rather than on top of a node.
    let lx, ly;
    if (pts.length === 4) {
      // Normal elbow: horizontal leg is pts[1]→pts[2]
      lx = (pts[1].x + pts[2].x) / 2;
      ly = pts[1].y;
    } else if (pts.length === 5) {
      // Back-edge left-side detour: vertical rail is pts[2]→pts[3]
      lx = pts[2].x - 8;  // slightly left of the rail
      ly = (pts[2].y + pts[3].y) / 2;
    } else {
      const mid = pts[Math.floor(pts.length / 2)];
      lx = mid.x;
      ly = mid.y;
    }

    const labelW = Math.max(36, edge.label.length * 7 + 10);
    const bg = el('rect', {
      x: lx - labelW / 2, y: ly - 9, width: labelW, height: 16,
      fill: theme.bg, rx: '3', 'stroke': theme.edgeStroke, 'stroke-width': '0.5',
      'data-edge-bg': '1',
    });
    const txt = el('text', {
      x: lx, y: ly,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      'font-size': '11',
      'font-family': 'Inter, system-ui, sans-serif',
      fill: theme.edgeLabel,
    });
    txt.textContent = edge.label;
    g.appendChild(bg);
    g.appendChild(txt);
  }

  return g;
}

// ─── Flowchart painter ────────────────────────────────────────────────────────
function paintFlowchart(svg, spec, theme) {
  // edges first (below nodes)
  for (const edge of spec.edges) {
    const eg = drawEdge(edge, theme);
    if (eg) {
      eg.setAttribute('class', 'ts-edge');
      eg.setAttribute('data-from',     edge.from);
      eg.setAttribute('data-to',       edge.to);
      eg.setAttribute('data-reversed', edge.reversed ? '1' : '0');
      eg.setAttribute('data-bezier',   '0');
      svg.appendChild(eg);
    }
  }
  for (const node of spec.nodes) {
    svg.appendChild(drawNode(node, theme));
  }
}

// ─── Timeline painter ─────────────────────────────────────────────────────────
// Cards grow to fit wrapped detail text; no fixed cardH.
function paintTimeline(svg, spec, theme) {
  const { events, spineY, spineStartX, spineEndX } = spec;

  // Spine line
  svg.appendChild(el('line', {
    x1: spineStartX, y1: spineY, x2: spineEndX, y2: spineY,
    stroke: theme.spineLine, 'stroke-width': '2',
  }));

  for (const ev of events) {
    const { tickX, tickY, labelX, labelY, above } = ev;

    const cardW    = 140;
    const TITLE_H  = 18; // px per title line
    const DETAIL_H = 15; // px per detail line
    const PADDING  = 10; // vertical padding inside card

    const charsPerTitle  = Math.floor((cardW - 16) / (12 * 0.55));
    const charsPerDetail = Math.floor((cardW - 16) / (10 * 0.55));
    const titleLines  = splitLines(ev.label,  charsPerTitle);
    const detailLines = ev.detail ? splitLines(ev.detail, charsPerDetail) : [];

    const contentH = titleLines.length * TITLE_H + detailLines.length * DETAIL_H;
    const cardH    = contentH + PADDING * 2;

    // Card anchor: labelY is the CENTER of the card
    const cardTop = labelY - cardH / 2;

    // Tick mark
    svg.appendChild(el('line', {
      x1: tickX, y1: tickY - 8, x2: tickX, y2: tickY + 8,
      stroke: theme.accent, 'stroke-width': '2',
    }));

    // Connector from tick to card
    const connY1 = above ? tickY - 8  : tickY + 8;
    const connY2 = above ? cardTop + cardH : cardTop;
    svg.appendChild(el('line', {
      x1: tickX, y1: connY1, x2: tickX, y2: connY2,
      stroke: theme.spineLine, 'stroke-width': '1', 'stroke-dasharray': '4,3',
    }));

    // Date bubble on spine
    const dateW = Math.max(48, ev.date.length * 8 + 16);
    svg.appendChild(el('rect', {
      x: tickX - dateW / 2, y: tickY - 10, width: dateW, height: 20,
      rx: '10', fill: theme.accent,
    }));
    const dateTxt = el('text', {
      x: tickX, y: tickY,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': '11', 'font-weight': '600',
      'font-family': 'Inter, system-ui, sans-serif',
      fill: '#ffffff',
    });
    dateTxt.textContent = ev.date;
    svg.appendChild(dateTxt);

    // Card background (grows with content)
    svg.appendChild(el('rect', {
      x: labelX - cardW / 2, y: cardTop,
      width: cardW, height: cardH,
      rx: '8', fill: theme.nodeFill, stroke: theme.nodeStroke,
      'stroke-width': '1', filter: 'url(#shadow)',
    }));

    // Title lines — stacked from top of card + padding
    let curY = cardTop + PADDING + TITLE_H / 2;
    for (const line of titleLines) {
      const t = el('text', {
        x: labelX, y: curY,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-size': '12', 'font-weight': '600',
        'font-family': 'Inter, system-ui, sans-serif',
        fill: theme.nodeText,
      });
      t.textContent = line;
      svg.appendChild(t);
      curY += TITLE_H;
    }

    // Detail lines
    for (const line of detailLines) {
      const t = el('text', {
        x: labelX, y: curY,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-size': '10',
        'font-family': 'Inter, system-ui, sans-serif',
        fill: theme.edgeLabel,
      });
      t.textContent = line;
      svg.appendChild(t);
      curY += DETAIL_H;
    }
  }
}

// ─── Mind map painter ─────────────────────────────────────────────────────────
function paintMindmap(svg, spec, theme) {
  const { posNodes, posEdges } = spec;
  if (!posNodes) return;

  // edges first (below nodes)
  for (const edge of posEdges) {
    const eg = drawEdge(edge, theme, edge.branchColor || theme.accent);
    if (eg) {
      eg.setAttribute('class', 'ts-edge');
      eg.setAttribute('data-from',   edge.from);
      eg.setAttribute('data-to',     edge.to);
      eg.setAttribute('data-reversed','0');
      eg.setAttribute('data-bezier',  edge.bezier ? '1' : '0');
      svg.appendChild(eg);
    }
  }

  for (const node of posNodes) {
    const hw = node.width / 2;
    const hh = node.height / 2;
    const g = el('g', {
      transform: `translate(${node.x},${node.y})`,
      class: 'ts-node',
      'data-node-id': node.id,
      'data-w': String(node.width),
      'data-h': String(node.height),
    });

    if (node.depth === 0) {
      // Root — accent pill
      const fill = theme.accent;
      g.appendChild(el('rect', {
        x: -hw, y: -hh, width: node.width, height: node.height,
        rx: hh,
        fill, stroke: 'none', filter: 'url(#shadow)',
      }));
      wrapText(g, node.label, node.width - 20, theme, { fontSize: 14, fontWeight: '700', fill: '#fff' });
    } else if (node.depth === 1) {
      // Branch — coloured rounded rect
      const fill = node.branchColor || theme.accent;
      g.appendChild(el('rect', {
        x: -hw, y: -hh, width: node.width, height: node.height,
        rx: '10',
        fill, stroke: 'none', filter: 'url(#shadow)',
      }));
      wrapText(g, node.label, node.width - 16, theme, { fontSize: 13, fontWeight: '600', fill: '#fff' });
    } else {
      // Leaf — subtle fill with coloured left border
      const accent = node.branchColor || theme.accent;
      g.appendChild(el('rect', {
        x: -hw, y: -hh, width: node.width, height: node.height,
        rx: '7',
        fill: theme.nodeFill, stroke: theme.nodeStroke, 'stroke-width': '1.2',
        filter: 'url(#shadow)',
      }));
      // Coloured left accent bar
      g.appendChild(el('rect', {
        x: -hw, y: -hh, width: '4', height: node.height,
        rx: '2', fill: accent, stroke: 'none',
      }));
      wrapText(g, node.label, node.width - 20, theme, { fontSize: 12 });
    }

    svg.appendChild(g);
  }
}


// ─── Compute bounding box ─────────────────────────────────────────────────────
function bbox(spec) {
  const PAD = 60;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function expand(cx, cy, w = 0, h = 0) {
    minX = Math.min(minX, cx - w / 2);
    minY = Math.min(minY, cy - h / 2);
    maxX = Math.max(maxX, cx + w / 2);
    maxY = Math.max(maxY, cy + h / 2);
  }

  if (spec.type === 'flowchart') {
    // node.x / node.y are CENTER coords
    for (const n of spec.nodes) expand(n.x, n.y, n.width, n.height);
    for (const e of spec.edges) for (const p of (e.waypoints || [])) expand(p.x, p.y);
  } else if (spec.type === 'timeline') {
    expand(spec.spineStartX, spec.spineY);
    expand(spec.spineEndX,   spec.spineY);
    for (const ev of (spec.events || [])) {
      // Cards can grow tall; use generous 90 px height for bbox
      expand(ev.labelX, ev.labelY, 160, 90);
    }
  } else if (spec.type === 'mindmap') {
    for (const n of (spec.posNodes || [])) expand(n.x, n.y, n.width || NODE_W, n.height || NODE_H);
    for (const e of (spec.posEdges || [])) for (const p of (e.waypoints || [])) expand(p.x, p.y);
  }

  if (!isFinite(minX)) { minX = -400; minY = -300; maxX = 400; maxY = 300; }

  return {
    x: minX - PAD,
    y: minY - PAD,
    w: (maxX - minX) + PAD * 2,
    h: (maxY - minY) + PAD * 2,
  };
}

// ─── Public paint function ────────────────────────────────────────────────────
export function paint(positionedSpec, theme) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');

  buildDefs(svg, theme);

  // Background rect
  const bb = bbox(positionedSpec);
  svg.setAttribute('viewBox', `${bb.x} ${bb.y} ${bb.w} ${bb.h}`);
  svg.appendChild(el('rect', { x: bb.x, y: bb.y, width: bb.w, height: bb.h, fill: theme.bg }));

  // Title
  if (positionedSpec.title) {
    const titleEl = el('text', {
      x: bb.x + bb.w / 2,
      y: bb.y + 28,
      'text-anchor': 'middle',
      'font-size': '16',
      'font-weight': '700',
      'font-family': 'Inter, system-ui, sans-serif',
      fill: theme.titleText,
    });
    titleEl.textContent = positionedSpec.title;
    svg.appendChild(titleEl);
  }

  switch (positionedSpec.type) {
    case 'flowchart': paintFlowchart(svg, positionedSpec, theme); break;
    case 'timeline':  paintTimeline(svg, positionedSpec, theme);  break;
    case 'mindmap':   paintMindmap(svg, positionedSpec, theme);   break;
  }

  return svg;
}
