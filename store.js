// Couche de stockage : utilise Vercel KV / Upstash Redis si configuré,
// sinon une mémoire temporaire (utile pour tester avant de brancher la base).
const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!global.__memstore) global.__memstore = {};
const mem = global.__memstore;

function configured() { return !!(URL && TOKEN); }

async function redis(cmd) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  if (!r.ok) throw new Error('Erreur stockage ' + r.status);
  return (await r.json()).result;
}

async function getJSON(key, def) {
  if (!configured()) return (key in mem) ? mem[key] : def;
  const v = await redis(['GET', key]);
  return v ? JSON.parse(v) : def;
}

async function setJSON(key, val) {
  if (!configured()) { mem[key] = val; return; }
  await redis(['SET', key, JSON.stringify(val)]);
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return await new Promise((resolve) => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

module.exports = { getJSON, setJSON, configured, readBody };
