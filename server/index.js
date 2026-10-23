'use strict';
require('dotenv').config();

const express = require('express');
const https   = require('https');
const path    = require('path');

const app = express();

// ─── Opt-in debug logging (DEBUG_AI=1 env var, off by default) ───────────────
// Logs only: failure category, finish reason, output length, validation errors.
// Never logs user text or the API key.
const DEBUG_AI = process.env.DEBUG_AI === '1';
function debugLog(...args) {
  if (DEBUG_AI) console.debug('[DEBUG_AI]', ...args);
}

// ─── Trust Render proxy (req.ip = X-Forwarded-For[0]) ────────────────────────
app.set('trust proxy', 1);

// ─── Security headers ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; " +
    "font-src https://fonts.gstatic.com; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "object-src 'none'; " +
    "base-uri 'none';"
  );
  next();
});

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Config ───────────────────────────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('ERROR: GEMINI_API_KEY is not set.');
}

const GEMINI_MODEL    = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const GEMINI_API_BASE = 'generativelanguage.googleapis.com';
const FALLBACK_MODELS = [
  GEMINI_MODEL,
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
];
const MODEL_CHAIN = [...new Set(FALLBACK_MODELS)];
let   activeModel = MODEL_CHAIN[0];

// ─── Rate limiting: per-IP, 20 req / 10 min ───────────────────────────────────
const rateBuckets = new Map();
const RATE_LIMIT  = 20;
const RATE_WINDOW = 10 * 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  let b = rateBuckets.get(ip);
  if (!b || now - b.windowStart > RATE_WINDOW) {
    b = { tokens: RATE_LIMIT, windowStart: now };
    rateBuckets.set(ip, b);
  }
  if (b.tokens <= 0) return false;
  b.tokens--;
  return true;
}

setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW;
  for (const [ip, b] of rateBuckets) {
    if (b.windowStart < cutoff) rateBuckets.delete(ip);
  }
}, 15 * 60 * 1000).unref();

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a diagram extraction assistant.
The user will provide a block of text and a desired diagram type.
Return ONLY a JSON object matching the DiagramSpec schema below.
Do not wrap it in markdown. Do not add backticks. Do not explain.

Schema:
  type: "flowchart" | "timeline" | "mindmap"
  title: string (<= 60 chars)
  nodes: array of Node (for flowchart only)
  edges: array of Edge (for flowchart only)
  events: array of Event (for timeline only)
  root: TreeNode (for mindmap only)

Node:     { id: string, label: string, shape: "rect"|"rounded-rect"|"diamond"|"circle"|"pill", role: "start"|"end"|"step"|"decision"|"note" }
Edge:     { from: string, to: string, label: string }
Event:    { id: string, date: string, label: string, detail: string }
TreeNode: { id: string, label: string, children: TreeNode[] }

Rules:
- Use at most 20 nodes for flowcharts.
- Use at most 12 events for timelines.
- Mind map depth must not exceed 3.
- Labels must be concise (<= 8 words each).
- IDs must be short alphanumeric strings (n1, n2, r0, e1, ...).
- For flowchart: every edge.from and edge.to must reference a valid node id.
- Output raw JSON only.

Auto-type selection rules (apply ONLY when the requested type is "auto"):
- Choose "timeline" when the text describes events with dates, phases, weeks, or milestones.
- Choose "flowchart" when the text describes a process, workflow, decision tree, or step-by-step procedure.
- Choose "mindmap" when the text describes topics, categories, or a hierarchy without clear time order or process flow.`;

// ─── Valid shape/role sets for normalization ───────────────────────────────────
const VALID_SHAPES = new Set(['rect', 'rounded-rect', 'diamond', 'circle', 'pill']);
const VALID_ROLES  = new Set(['start', 'end', 'step', 'decision', 'note']);

// ─── normalizeAndValidate ─────────────────────────────────────────────────────
// Normalizes minor slips in-place; throws only for unrecoverable problems.
// - Truncates labels > 120 chars instead of rejecting.
// - Makes duplicate node ids unique instead of rejecting.
// - Drops edges referencing missing nodes instead of rejecting.
// - Defaults unknown shapes/roles instead of rejecting.
// - Fails only if no usable nodes remain or the type is missing/invalid.
function normalizeAndValidate(spec) {
  const validTypes = ['flowchart', 'timeline', 'mindmap'];
  if (!spec || typeof spec !== 'object') throw new Error('Response is not a JSON object.');
  if (!validTypes.includes(spec.type))   throw new Error('Invalid or missing type "' + spec.type + '".');
  if (typeof spec.title !== 'string')    throw new Error('Missing or invalid title.');
  if (spec.title.length > 60) spec.title = spec.title.slice(0, 60);

  if (spec.type === 'flowchart') {
    if (!Array.isArray(spec.nodes)) throw new Error('flowchart must have a nodes array.');
    if (!Array.isArray(spec.edges)) throw new Error('flowchart must have an edges array.');
    if (spec.nodes.length > 40)     throw new Error('Too many nodes (max 40).');

    const ids  = new Set();
    const seen = new Map(); // original id => renamed id (for de-dup)
    for (const n of spec.nodes) {
      if (!n.id || typeof n.id !== 'string') throw new Error('Node missing id.');
      let uid = n.id;
      let counter = 2;
      while (ids.has(uid)) uid = n.id + '_' + counter++;
      if (uid !== n.id) {
        debugLog('Duplicate node id "' + n.id + '" renamed to "' + uid + '"');
        seen.set(n.id, uid);
        n.id = uid;
      }
      ids.add(uid);
      if (typeof n.label === 'string' && n.label.length > 120) n.label = n.label.slice(0, 120);
      if (!VALID_SHAPES.has(n.shape)) { debugLog('Unknown shape "' + n.shape + '" -> rect'); n.shape = 'rect'; }
      if (!VALID_ROLES.has(n.role))   { debugLog('Unknown role "'  + n.role  + '" -> step'); n.role  = 'step'; }
    }

    if (ids.size === 0) throw new Error('flowchart has no usable nodes.');

    for (const e of spec.edges) {
      if (seen.has(e.from)) e.from = seen.get(e.from);
      if (seen.has(e.to))   e.to   = seen.get(e.to);
    }
    const before = spec.edges.length;
    spec.edges = spec.edges.filter(e => {
      const ok = ids.has(e.from) && ids.has(e.to);
      if (!ok) debugLog('Dropping dangling edge ' + e.from + ' -> ' + e.to);
      return ok;
    });
    if (spec.edges.length < before) {
      console.warn('normalizeAndValidate: dropped ' + (before - spec.edges.length) + ' dangling edge(s).');
    }
  }

  if (spec.type === 'timeline') {
    if (!Array.isArray(spec.events)) throw new Error('timeline must have an events array.');
    if (spec.events.length > 12)     throw new Error('Too many events (max 12).');
    for (const ev of spec.events) {
      if (typeof ev.label === 'string' && ev.label.length > 120) ev.label = ev.label.slice(0, 120);
    }
  }

  if (spec.type === 'mindmap') {
    if (!spec.root || typeof spec.root !== 'object') throw new Error('mindmap must have a root object.');
  }
}

// ─── Strip markdown fences and extract outermost {...} block ──────────────────
function extractJSON(text) {
  let s = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const start = s.indexOf('{');
  const end   = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) s = s.slice(start, end + 1);
  return s;
}

// ─── Join only the non-thought text parts from a Gemini candidate ─────────────
// FIX: The regression was reading only parts[0].text.  When the model is a
// thinking model, parts[0] has thought:true (the reasoning block) and the
// actual JSON answer lives in later parts.  We now filter out thought parts
// and join all remaining text parts.
function extractTextFromCandidate(candidate) {
  const parts = candidate && candidate.content && candidate.content.parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const text = parts
    .filter(function(p) { return !p.thought; })
    .map(function(p)    { return p.text || ''; })
    .join('');
  return text.trim() || null;
}

// ─── callGeminiOnce ───────────────────────────────────────────────────────────
// promptOverride: if set, replaces the normal user message (used for retries
// with corrective feedback).
function callGeminiOnce(userText, diagramType, model, promptOverride) {
  return new Promise(function(resolve, reject) {
    const typeInstruction = diagramType === 'auto'
      ? 'Diagram type: auto (you must choose the best type based on the text)'
      : 'Diagram type: ' + diagramType;

    const userPart = promptOverride != null
      ? promptOverride
      : 'Text:\n' + userText + '\n\n' + typeInstruction;

    const bodyObj = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userPart }] }],
      generationConfig: {
        temperature:     0.2,
        // Raised from 2048 to 8192 — 2048 was too small for dense flowcharts
        // and caused truncated JSON, which triggered the parse-error retry loop.
        maxOutputTokens:  8192,
        // JSON output mode: forces the model to emit valid JSON with no fences.
        // Documented: ai.google.dev/api/generate-content#v1beta.GenerationConfig
        responseMimeType: 'application/json',
        // thinkingBudget=0 disables thinking on thinking-capable models so
        // thought tokens cannot eat into the output budget.
        thinkingConfig: { thinkingBudget: 0 },
      },
    };

    const body    = JSON.stringify(bodyObj);
    const apiPath = '/v1beta/models/' + model + ':generateContent';
    const options = {
      hostname: GEMINI_API_BASE,
      path:     apiPath + '?key=' + GEMINI_API_KEY,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };

    const req = https.request(options, function(res) {
      let raw = '';
      res.on('data', function(chunk) { raw += chunk; });
      res.on('end', function() {
        if (res.statusCode === 503) return reject({ status: 503, message: 'overloaded', raw: raw });
        if (res.statusCode === 429) return reject({ status: 429, message: 'Gemini rate limit hit. Try again in a moment.' });
        if (res.statusCode !== 200) return reject({ status: 502, message: 'Gemini API returned HTTP ' + res.statusCode + '.' });
        try {
          const parsed      = JSON.parse(raw);
          const candidate   = parsed && parsed.candidates && parsed.candidates[0];
          const finishReason = (candidate && candidate.finishReason) || 'UNKNOWN';
          const text        = extractTextFromCandidate(candidate);

          debugLog('finishReason=' + finishReason + ' outputLength=' + (text ? text.length : 0));

          if (finishReason === 'MAX_TOKENS') {
            debugLog('failure-category=TRUNCATED');
            return reject({ status: 502, message: 'truncated' });
          }
          if (!text) {
            debugLog('failure-category=EMPTY_RESPONSE');
            return reject({ status: 502, message: 'Gemini returned an empty response.' });
          }
          resolve(text);
        } catch(e) {
          reject({ status: 502, message: 'Could not parse Gemini response.' });
        }
      });
    });
    req.on('error', function(err) { reject({ status: 502, message: 'Network error: ' + err.message }); });
    req.setTimeout(30000, function() {
      req.destroy();
      reject({ status: 504, message: 'AI request timed out (30 s). Try again.' });
    });
    req.write(body);
    req.end();
  });
}

// ─── callGemini: model-fallback chain + per-model retry ──────────────────────
async function callGemini(userText, diagramType, promptOverride) {
  let lastErr;
  for (const model of MODEL_CHAIN) {
    for (const delay of [0, 3000]) {
      if (delay > 0) {
        console.warn('/api/generate [' + model + ']: still overloaded, retrying in ' + (delay/1000) + ' s...');
        await new Promise(function(r) { setTimeout(r, delay); });
      }
      try {
        const result = await callGeminiOnce(userText, diagramType, model, promptOverride);
        if (model !== activeModel) {
          console.log('/api/generate: switched to fallback model "' + model + '"');
          activeModel = model;
        }
        return result;
      } catch(err) {
        lastErr = err;
        if (err.status === 503 || err.status === 504) continue;
        break;
      }
    }
    if (lastErr && (lastErr.status === 503 || lastErr.status === 504)) {
      console.warn('/api/generate [' + model + ']: overloaded after retries, trying next model...');
      continue;
    }
    throw lastErr;
  }
  throw { status: 503, message: 'All AI models are overloaded. Please try again in a moment.' };
}

// ─── GET /api/health ──────────────────────────────────────────────────────────
app.get('/api/health', function(_req, res) {
  res.json({ status: 'ok', model: activeModel, keyLoaded: !!GEMINI_API_KEY });
});

// ─── POST /api/generate ───────────────────────────────────────────────────────
app.post('/api/generate', async function(req, res) {
  const ip = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded (20 requests / 10 min). Try again later.' });
  }

  const { text, type } = req.body;
  const validTypes = ['flowchart', 'timeline', 'mindmap', 'auto'];

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: '`text` is required and must be a non-empty string.' });
  }
  if (text.length > 4000) {
    return res.status(400).json({ error: '`text` must be at most 4000 characters.' });
  }
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: '`type` must be "flowchart", "timeline", "mindmap", or "auto".' });
  }
  if (!GEMINI_API_KEY) {
    return res.status(502).json({ error: 'Server is missing GEMINI_API_KEY. Check your .env file.' });
  }

  try {
    // ── Attempt 1 ────────────────────────────────────────────────────────────
    let rawText;
    try {
      rawText = await callGemini(text, type);
    } catch(err) {
      if (err.status === 504) {
        return res.status(504).json({ error: 'The AI took too long to respond. Please try again.' });
      }
      throw err;
    }

    let cleaned = extractJSON(rawText);
    let spec;

    try {
      spec = JSON.parse(cleaned);
    } catch(parseErr) {
      // ── Attempt 2: corrective prompt with parse error ─────────────────────
      debugLog('failure-category=PARSE_ERROR attempt=1 outputLength=' + cleaned.length);
      const correctionPrompt =
        'Your previous output failed because: could not parse as JSON (' + parseErr.message + ').\n' +
        'Text:\n' + text + '\n\n' +
        'Diagram type: ' + (type === 'auto' ? 'auto (choose best type)' : type) + '\n\n' +
        'Return ONLY corrected JSON with no markdown, no code fences, no explanation.';

      let rawText2;
      try {
        rawText2 = await callGemini(text, type, correctionPrompt);
      } catch(err2) {
        if (err2.status === 504) return res.status(504).json({ error: 'The AI took too long to respond. Please try again.' });
        throw err2;
      }

      const cleaned2 = extractJSON(rawText2);
      try {
        spec = JSON.parse(cleaned2);
      } catch {
        debugLog('failure-category=PARSE_ERROR attempt=2 outputLength=' + cleaned2.length);
        return res.status(502).json({ error: 'The AI returned malformed output after two attempts. Try again.' });
      }
    }

    // ── Normalize + validate ─────────────────────────────────────────────────
    try {
      normalizeAndValidate(spec);
    } catch(ve) {
      debugLog('failure-category=VALIDATION attempt=1 message="' + ve.message + '"');

      // ── Attempt 2: send validation error back to model ───────────────────
      const correctionPrompt =
        'Your previous output failed schema validation because: ' + ve.message + '.\n' +
        'Text:\n' + text + '\n\n' +
        'Diagram type: ' + (type === 'auto' ? 'auto (choose best type)' : type) + '\n\n' +
        'Return ONLY corrected JSON with no markdown, no code fences, no explanation.';

      let rawText2;
      try {
        rawText2 = await callGemini(text, type, correctionPrompt);
      } catch(err2) {
        if (err2.status === 504) return res.status(504).json({ error: 'The AI took too long to respond. Please try again.' });
        throw err2;
      }

      const cleaned2 = extractJSON(rawText2);
      let spec2;
      try {
        spec2 = JSON.parse(cleaned2);
      } catch {
        debugLog('failure-category=PARSE_ERROR_AFTER_VALIDATION_RETRY');
        return res.status(502).json({ error: 'The AI returned malformed output after two attempts. Try again.' });
      }

      try {
        normalizeAndValidate(spec2);
        spec = spec2;
      } catch(ve2) {
        debugLog('failure-category=VALIDATION attempt=2 message="' + ve2.message + '"');
        return res.status(502).json({ error: 'The AI response did not match the required schema. Try again.' });
      }
    }

    return res.status(200).json(spec);
  } catch(err) {
    const status  = err.status || 502;
    const message = err.message || 'Unexpected error calling the AI.';
    console.error('/api/generate error [' + status + ']:', message);
    return res.status(status).json({ error: message });
  }
});

// ─── Legacy stub ──────────────────────────────────────────────────────────────
app.post('/api/parse', function(_req, res) {
  res.status(410).json({ error: 'Use /api/generate instead.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', function() {
  console.log('TextSketch running at http://localhost:' + PORT);
  console.log('Gemini model  : ' + GEMINI_MODEL);
  console.log('API key loaded: ' + (GEMINI_API_KEY ? 'yes (' + GEMINI_API_KEY.slice(0, 8) + '...)' : 'NO -- check .env'));
  if (DEBUG_AI) console.log('DEBUG_AI mode: ON');
});
