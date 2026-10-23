// test/layout.test.mjs — Phase 8 tests using node:test
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Import layout engines (ESM) ─────────────────────────────────────────────
// layout.js uses ES module syntax; we can't import browser-only APIs, but the
// layout engines only use Math/Array/Map so they are safe to run in Node.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join }  from 'node:path';

const __dir   = dirname(fileURLToPath(import.meta.url));
const layoutSrc = readFileSync(join(__dir, '../public/layout.js'), 'utf8');
// Remove the `export` keyword so we can eval in a plain scope.
const src = layoutSrc.replace(/^export\s+/m, '');
// Evaluate in global scope (safe — no side effects, no DOM).
const mod = new Function(`${src}; return { layout };`)();
const { layout } = mod;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function nodesOverlap(nodes) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const aw = a.width || 160, ah = a.height || 48;
      const bw = b.width || 160, bh = b.height || 48;
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      const overlapX = dx < (aw + bw) / 2 - 4;
      const overlapY = dy < (ah + bh) / 2 - 4;
      if (overlapX && overlapY) return [a.id, b.id];
    }
  }
  return null;
}

// ─── Flowchart tests ─────────────────────────────────────────────────────────
test('flowchart: user-registration sample — no node overlaps', () => {
  const spec = {
    type: 'flowchart',
    title: 'User Registration Flow',
    nodes: [
      { id: 'n1', label: 'Start',        shape: 'pill',         role: 'start' },
      { id: 'n2', label: 'Fill form',    shape: 'rounded-rect', role: 'step'  },
      { id: 'n3', label: 'Valid?',       shape: 'diamond',      role: 'decision' },
      { id: 'n4', label: 'Show errors',  shape: 'rect',         role: 'step'  },
      { id: 'n5', label: 'Create acct',  shape: 'rounded-rect', role: 'step'  },
      { id: 'n6', label: 'Welcome email',shape: 'rounded-rect', role: 'step'  },
      { id: 'n7', label: 'Done',         shape: 'circle',       role: 'end'   },
    ],
    edges: [
      { from: 'n1', to: 'n2', label: '' },
      { from: 'n2', to: 'n3', label: '' },
      { from: 'n3', to: 'n4', label: 'No' },
      { from: 'n4', to: 'n2', label: 'retry' },
      { from: 'n3', to: 'n5', label: 'Yes' },
      { from: 'n5', to: 'n6', label: '' },
      { from: 'n6', to: 'n7', label: '' },
    ],
  };
  const result = layout(spec);
  assert.equal(result.type, 'flowchart');
  assert.equal(result.nodes.length, spec.nodes.length);
  const overlap = nodesOverlap(result.nodes);
  assert.equal(overlap, null, `Nodes overlap: ${JSON.stringify(overlap)}`);
});

test('flowchart: CI/CD 21-node stress test — no node overlaps', () => {
  const nodes = [];
  for (let i = 1; i <= 21; i++) nodes.push({ id: `a${i}`, label: `Step ${i}`, shape: 'rounded-rect', role: 'step' });
  const edges = [];
  for (let i = 1; i < 21; i++) edges.push({ from: `a${i}`, to: `a${i+1}`, label: '' });
  // add some back-edges
  edges.push({ from: 'a4',  to: 'a2',  label: 'retry' });
  edges.push({ from: 'a7',  to: 'a5',  label: 'retry' });
  edges.push({ from: 'a11', to: 'a9',  label: 'rescan' });

  const spec = { type: 'flowchart', title: 'Big Flow', nodes, edges };
  const result = layout(spec);
  const overlap = nodesOverlap(result.nodes);
  assert.equal(overlap, null, `Nodes overlap: ${JSON.stringify(overlap)}`);
});

test('flowchart: back-edges produce 5 waypoints each', () => {
  const spec = {
    type: 'flowchart',
    title: 'Back Edge Test',
    nodes: [
      { id: 'a', label: 'A', shape: 'rect', role: 'start' },
      { id: 'b', label: 'B', shape: 'rect', role: 'step' },
      { id: 'c', label: 'C', shape: 'rect', role: 'end' },
    ],
    edges: [
      { from: 'a', to: 'b', label: '' },
      { from: 'b', to: 'c', label: '' },
      { from: 'c', to: 'a', label: 'loop' },
    ],
  };
  const result = layout(spec);
  const backEdge = result.edges.find(e => e.reversed);
  assert.ok(backEdge, 'Expected a reversed back-edge');
  assert.equal(backEdge.waypoints.length, 5, 'Back-edge should have 5 waypoints');
});

// ─── Timeline tests ───────────────────────────────────────────────────────────
test('timeline: 12-event layout — all events positioned', () => {
  const events = Array.from({ length: 12 }, (_, i) => ({
    id: `t${i+1}`, date: `Week ${i+1}`, label: `Event ${i+1}`, detail: '',
  }));
  const spec = { type: 'timeline', title: 'Big Timeline', events };
  const result = layout(spec);
  assert.equal(result.events.length, 12);
  for (const ev of result.events) {
    assert.ok(typeof ev.tickX === 'number', 'tickX must be a number');
    assert.ok(typeof ev.labelY === 'number', 'labelY must be a number');
  }
});

test('timeline: alternating above/below for even/odd events', () => {
  const events = Array.from({ length: 6 }, (_, i) => ({
    id: `e${i}`, date: `D${i}`, label: `Ev ${i}`, detail: '',
  }));
  const result = layout({ type: 'timeline', title: 'Alt', events });
  result.events.forEach((ev, i) => {
    assert.equal(ev.above, i % 2 === 0, `Event ${i} above should be ${i % 2 === 0}`);
  });
});

// ─── Mind map tests ───────────────────────────────────────────────────────────
test('mindmap: product-strategy sample — no node overlaps', () => {
  const spec = {
    type: 'mindmap',
    title: 'Product Strategy',
    root: {
      id: 'r0', label: 'Product Strategy',
      children: [
        { id: 'r1', label: 'Growth', children: [
          { id: 'r1a', label: 'SEO', children: [] },
          { id: 'r1b', label: 'Referral', children: [] },
        ]},
        { id: 'r2', label: 'Retention', children: [
          { id: 'r2a', label: 'Onboarding', children: [] },
        ]},
        { id: 'r3', label: 'Monetisation', children: [
          { id: 'r3a', label: 'Pro Tier', children: [] },
        ]},
        { id: 'r4', label: 'Infrastructure', children: [
          { id: 'r4a', label: 'Reliability', children: [] },
        ]},
      ],
    },
  };
  const result = layout(spec);
  assert.ok(result.posNodes.length > 0);
  const overlap = nodesOverlap(result.posNodes);
  assert.equal(overlap, null, `Mindmap nodes overlap: ${JSON.stringify(overlap)}`);
});

test('mindmap: 6-branch large sample — no node overlaps', () => {
  const spec = {
    type: 'mindmap',
    title: 'Eng Org',
    root: {
      id: 'e0', label: 'Engineering Org',
      children: Array.from({ length: 6 }, (_, bi) => ({
        id: `e${bi+1}`, label: `Branch ${bi+1}`,
        children: Array.from({ length: 3 }, (_, ci) => ({
          id: `e${bi+1}c${ci}`, label: `Leaf ${ci+1}`, children: [],
        })),
      })),
    },
  };
  const result = layout(spec);
  const overlap = nodesOverlap(result.posNodes);
  assert.equal(overlap, null, `Large mindmap overlaps: ${JSON.stringify(overlap)}`);
});

test('mindmap: branch colours are distinct per top-level branch', () => {
  const spec = {
    type: 'mindmap', title: 'Colors',
    root: { id: 'r0', label: 'Root', children: [
      { id: 'a', label: 'A', children: [] },
      { id: 'b', label: 'B', children: [] },
      { id: 'c', label: 'C', children: [] },
    ]},
  };
  const result = layout(spec);
  const depth1 = result.posNodes.filter(n => n.depth === 1);
  const colors = depth1.map(n => n.branchColor);
  const unique = new Set(colors);
  assert.equal(unique.size, depth1.length, 'Each top-level branch should have a distinct colour');
});

// ─── Share link tests ─────────────────────────────────────────────────────────
// These tests run in Node which may not have CompressionStream — we test the
// base64url fallback path by monkey-patching.
test('share: encode then decode round-trips the spec', async () => {
  const shareSrc = readFileSync(join(__dir, '../public/share.js'), 'utf8');
  const shareCode = shareSrc.replace(/^export\s+/mg, '');
  const shareMod = new Function(`${shareCode}; return { encodeShare, decodeShare };`)();

  const spec = { type: 'flowchart', title: 'Test', nodes: [], edges: [] };
  const encoded = await shareMod.encodeShare(spec);
  // Accept either compression format depending on runtime support.
  assert.ok(
    encoded.startsWith('b:') || encoded.startsWith('z:'),
    `Encoded value should start with b: or z:, got: ${encoded.slice(0, 4)}`
  );
  const decoded = await shareMod.decodeShare('#' + encoded);
  assert.deepEqual(decoded, spec, 'Decoded spec should match original');
});


// ─── JSON validation tests ────────────────────────────────────────────────────
test('server validation: rejects missing type', () => {
  const serverSrc = readFileSync(join(__dir, '../server/index.js'), 'utf8');
  // Extract normalizeAndValidate (renamed from validateSpec in the regression fix).
  const match = serverSrc.match(/function normalizeAndValidate\(spec\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'normalizeAndValidate should exist in server/index.js');
  // Smoke-test: confirm it throws on an empty spec.
  const VALID_SHAPES = new Set(['rect','rounded-rect','diamond','circle','pill']);
  const VALID_ROLES  = new Set(['start','end','step','decision','note']);
  function debugLog() {}
  const fn = new Function('VALID_SHAPES','VALID_ROLES','debugLog','spec',
    match[0].replace('function normalizeAndValidate(spec) ', '') + '; return undefined;'
  );
  assert.throws(() => fn(VALID_SHAPES, VALID_ROLES, debugLog, {}), Error);
});
