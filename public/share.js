// share.js — shareable link encode/decode using CompressionStream (Phase 4)
// Falls back to plain base64url when CompressionStream is unavailable.

async function compress(str) {
  const bytes = new TextEncoder().encode(str);
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const chunks = [];
    const reader = cs.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const out = new Uint8Array(chunks.reduce((a, b) => a + b.length, 0));
    let offset = 0;
    for (const c of chunks) { out.set(c, offset); offset += c.length; }
    return 'z:' + btoa(String.fromCharCode(...out)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
  // Fallback: plain base64url
  return 'b:' + btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function decompress(encoded) {
  if (encoded.startsWith('z:')) {
    const b64 = encoded.slice(2).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const chunks = [];
    const reader = ds.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const out = new Uint8Array(chunks.reduce((a, b) => a + b.length, 0));
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return new TextDecoder().decode(out);
  }
  if (encoded.startsWith('b:')) {
    const b64 = encoded.slice(2).replace(/-/g, '+').replace(/_/g, '/');
    return decodeURIComponent(escape(atob(b64)));
  }
  throw new Error('Unknown share format');
}

export async function encodeShare(spec) {
  const json = JSON.stringify(spec);
  return compress(json);
}

export async function decodeShare(hash) {
  const encoded = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!encoded) return null;
  try {
    const json = await decompress(encoded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function copyShareLink(spec, toast) {
  try {
    const encoded = await encodeShare(spec);
    const url = `${location.origin}${location.pathname}#${encoded}`;
    await navigator.clipboard.writeText(url);
    toast('Link copied!', 'success');
  } catch {
    toast('Could not copy link', 'error');
  }
}
