// test/server.test.mjs
// Tests: GET /api/health, trust proxy, mocked-AI response scenarios.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';

// ─── Spin up the server on a random free port ─────────────────────────────────
process.env.PORT           = '0';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key-placeholder';
process.env.NODE_ENV       = 'test';

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join }  from 'node:path';

const __dir  = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let _server;
const express    = require('express');
const origListen = express.application.listen;
express.application.listen = function (...args) {
  _server = origListen.apply(this, args);
  return _server;
};

require(join(__dir, '../server/index.js'));

before(async () => {
  await new Promise((resolve, reject) => {
    if (!_server) return reject(new Error('Server not captured'));
    if (_server.listening) return resolve();
    _server.once('listening', resolve);
    _server.once('error', reject);
  });
});

after(() => {
  if (!_server) return;
  if (typeof _server.closeAllConnections === 'function') _server.closeAllConnections();
  return new Promise(resolve => _server.close(resolve));
});

// ─── HTTP helper ─────────────────────────────────────────────────────────────
function request(method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const { port } = _server.address();
    const payload  = body ? JSON.stringify(body) : undefined;
    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Helpers to load/extract server internals for unit tests ─────────────────
import { readFileSync } from 'node:fs';
const serverSrc = readFileSync(join(__dir, '../server/index.js'), 'utf8');

function extractFn(src, name) {
  // Pull out a named function (works for function declarations and arrow/anon).
  const fnPattern = new RegExp(`function ${name}\\s*\\([^)]*\\)\\s*\\{`);
  const match = fnPattern.exec(src);
  if (!match) throw new Error(`Could not find function ${name} in server/index.js`);
  let depth = 0, start = match.index, i = start;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    i++;
  }
  return src.slice(start, i);
}

// Extract and wrap normalizeAndValidate so we can call it directly.
const normSrc = extractFn(serverSrc, 'normalizeAndValidate');
const DEBUG_AI_stub = false;
const VALID_SHAPES = new Set(['rect', 'rounded-rect', 'diamond', 'circle', 'pill']);
const VALID_ROLES  = new Set(['start', 'end', 'step', 'decision', 'note']);
function debugLog() {}
const normalizeAndValidate = new Function(
  'VALID_SHAPES', 'VALID_ROLES', 'debugLog',
  `${normSrc}; return normalizeAndValidate;`
)(VALID_SHAPES, VALID_ROLES, debugLog);

// Extract extractJSON.
const extractJSONSrc = extractFn(serverSrc, 'extractJSON');
const extractJSON = new Function(`${extractJSONSrc}; return extractJSON;`)();

// Extract extractTextFromCandidate.
const extractTextSrc = extractFn(serverSrc, 'extractTextFromCandidate');
const extractTextFromCandidate = new Function(`${extractTextSrc}; return extractTextFromCandidate;`)();

// ─── Existing integration tests ───────────────────────────────────────────────
test('GET /api/health returns 200 with status ok', async () => {
  const { status, body } = await request('GET', '/api/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.ok('model' in body);
  assert.ok('keyLoaded' in body);
});

test('trust proxy: X-Forwarded-For is used by the rate limiter', async () => {
  const fakeIP = `10.0.0.${Math.floor(Math.random() * 200) + 10}`;
  const headers = { 'X-Forwarded-For': fakeIP };
  const body    = { text: 'a'.repeat(10), type: 'flowchart' };
  let rateLimited = false;
  for (let i = 0; i < 25; i++) {
    const res = await request('POST', '/api/generate', { headers, body });
    if (res.status === 429) { rateLimited = true; break; }
  }
  assert.ok(rateLimited, 'Expected 429 after >20 requests from same IP');
});

test('trust proxy: different X-Forwarded-For IPs get independent buckets', async () => {
  const ip1 = `10.1.${Math.floor(Math.random() * 255)}.1`;
  const ip2 = `10.2.${Math.floor(Math.random() * 255)}.1`;
  const body = { text: 'a'.repeat(10), type: 'flowchart' };
  const r1 = await request('POST', '/api/generate', { headers: { 'X-Forwarded-For': ip1 }, body });
  const r2 = await request('POST', '/api/generate', { headers: { 'X-Forwarded-For': ip2 }, body });
  assert.notEqual(r1.status, 429, 'ip1 should not be rate-limited on first request');
  assert.notEqual(r2.status, 429, 'ip2 should not be rate-limited on first request');
});

// ─── Unit tests: extractJSON ──────────────────────────────────────────────────
test('extractJSON: strips leading ```json fence', () => {
  const raw = '```json\n{"type":"flowchart"}\n```';
  const out = extractJSON(raw);
  assert.equal(out, '{"type":"flowchart"}');
  assert.doesNotThrow(() => JSON.parse(out));
});

test('extractJSON: strips plain ``` fence', () => {
  const raw = '```\n{"type":"mindmap"}\n```';
  const out = extractJSON(raw);
  assert.doesNotThrow(() => JSON.parse(out));
});

test('extractJSON: extracts outermost {...} ignoring preamble', () => {
  const raw = 'Sure! Here is the JSON:\n{"type":"timeline","title":"T","events":[]}\nHope that helps!';
  const out = extractJSON(raw);
  assert.doesNotThrow(() => JSON.parse(out));
  assert.equal(JSON.parse(out).type, 'timeline');
});

// ─── Unit tests: extractTextFromCandidate ────────────────────────────────────
test('extractTextFromCandidate: joins non-thought parts only', () => {
  const candidate = {
    content: {
      parts: [
        { text: 'I am reasoning...', thought: true },
        { text: '{"type":"flowchart"}' },
      ],
    },
  };
  const text = extractTextFromCandidate(candidate);
  assert.equal(text, '{"type":"flowchart"}');
});

test('extractTextFromCandidate: single non-thought part (non-thinking model)', () => {
  const candidate = {
    content: {
      parts: [{ text: '{"type":"mindmap"}' }],
    },
  };
  assert.equal(extractTextFromCandidate(candidate), '{"type":"mindmap"}');
});

test('extractTextFromCandidate: returns null when all parts are thought', () => {
  const candidate = {
    content: {
      parts: [{ text: 'thinking...', thought: true }],
    },
  };
  assert.equal(extractTextFromCandidate(candidate), null);
});

// ─── Unit tests: normalizeAndValidate ────────────────────────────────────────
test('normalizeAndValidate: valid flowchart passes unchanged', () => {
  const spec = {
    type: 'flowchart', title: 'Login',
    nodes: [
      { id: 'n1', label: 'Start', shape: 'pill', role: 'start' },
      { id: 'n2', label: 'End',   shape: 'circle', role: 'end' },
    ],
    edges: [{ from: 'n1', to: 'n2', label: '' }],
  };
  assert.doesNotThrow(() => normalizeAndValidate(spec));
});

test('normalizeAndValidate: overlong label is truncated not rejected', () => {
  const longLabel = 'A'.repeat(200);
  const spec = {
    type: 'flowchart', title: 'X',
    nodes: [{ id: 'n1', label: longLabel, shape: 'rect', role: 'step' }],
    edges: [],
  };
  assert.doesNotThrow(() => normalizeAndValidate(spec));
  assert.ok(spec.nodes[0].label.length <= 120, 'label should be truncated to 120');
});

test('normalizeAndValidate: duplicate node ids are made unique', () => {
  const spec = {
    type: 'flowchart', title: 'Dup',
    nodes: [
      { id: 'n1', label: 'A', shape: 'rect', role: 'step' },
      { id: 'n1', label: 'B', shape: 'rect', role: 'step' }, // duplicate
    ],
    edges: [],
  };
  assert.doesNotThrow(() => normalizeAndValidate(spec));
  const ids = spec.nodes.map(n => n.id);
  assert.equal(new Set(ids).size, 2, 'Both nodes should have unique ids');
});

test('normalizeAndValidate: dangling edge is dropped not rejected', () => {
  const spec = {
    type: 'flowchart', title: 'Dangling',
    nodes: [{ id: 'n1', label: 'A', shape: 'rect', role: 'step' }],
    edges: [
      { from: 'n1', to: 'n1', label: '' },   // valid self-loop
      { from: 'n1', to: 'MISSING', label: '' }, // dangling
    ],
  };
  assert.doesNotThrow(() => normalizeAndValidate(spec));
  assert.equal(spec.edges.length, 1, 'Dangling edge should be dropped');
  assert.equal(spec.edges[0].to, 'n1');
});

test('normalizeAndValidate: unknown shape defaults to rect', () => {
  const spec = {
    type: 'flowchart', title: 'Shape',
    nodes: [{ id: 'n1', label: 'A', shape: 'hexagon', role: 'step' }],
    edges: [],
  };
  assert.doesNotThrow(() => normalizeAndValidate(spec));
  assert.equal(spec.nodes[0].shape, 'rect');
});

test('normalizeAndValidate: unknown role defaults to step', () => {
  const spec = {
    type: 'flowchart', title: 'Role',
    nodes: [{ id: 'n1', label: 'A', shape: 'rect', role: 'gateway' }],
    edges: [],
  };
  assert.doesNotThrow(() => normalizeAndValidate(spec));
  assert.equal(spec.nodes[0].role, 'step');
});

test('normalizeAndValidate: rejects when type is invalid', () => {
  assert.throws(() => normalizeAndValidate({ type: 'gantt', title: 'X' }), /Invalid or missing type/);
});

// ─── Login input as a mocked model response ───────────────────────────────────
// Simulates what the model should return for the login flow description.
test('normalizeAndValidate: login-flow mocked response passes', () => {
  const loginSpec = {
    type: 'flowchart',
    title: 'Login Flow',
    nodes: [
      { id: 'n1', label: 'Enter credentials', shape: 'rounded-rect', role: 'step' },
      { id: 'n2', label: 'Valid credentials?', shape: 'diamond', role: 'decision' },
      { id: 'n3', label: '2FA enabled?', shape: 'diamond', role: 'decision' },
      { id: 'n4', label: 'Send OTP', shape: 'rounded-rect', role: 'step' },
      { id: 'n5', label: 'Enter OTP', shape: 'rounded-rect', role: 'step' },
      { id: 'n6', label: 'OTP valid?', shape: 'diamond', role: 'decision' },
      { id: 'n7', label: 'Dashboard', shape: 'rounded-rect', role: 'end' },
      { id: 'n8', label: 'Error message', shape: 'rect', role: 'note' },
      { id: 'n9', label: 'Try again', shape: 'rounded-rect', role: 'step' },
    ],
    edges: [
      { from: 'n1', to: 'n2', label: '' },
      { from: 'n2', to: 'n3', label: 'Yes' },
      { from: 'n2', to: 'n8', label: 'No' },
      { from: 'n3', to: 'n4', label: '2FA on' },
      { from: 'n3', to: 'n7', label: '2FA off' },
      { from: 'n4', to: 'n5', label: '' },
      { from: 'n5', to: 'n6', label: '' },
      { from: 'n6', to: 'n7', label: 'Valid' },
      { from: 'n6', to: 'n8', label: 'Invalid' },
      { from: 'n8', to: 'n9', label: '' },
      { from: 'n9', to: 'n1', label: '' },
    ],
  };
  assert.doesNotThrow(() => normalizeAndValidate(loginSpec));
  assert.equal(loginSpec.type, 'flowchart');
  assert.equal(loginSpec.nodes.length, 9);
});

test('normalizeAndValidate: truncated JSON (no closing brace) rejects via JSON.parse', () => {
  const truncated = '{"type":"flowchart","title":"X","nodes":[{"id":"n1"';
  assert.throws(() => JSON.parse(truncated), SyntaxError, 'truncated JSON should fail JSON.parse');
});

// ─── JSON validation tests (legacy) ──────────────────────────────────────────
test('server validation: rejects missing type', () => {
  assert.throws(() => normalizeAndValidate({}), Error);
});
