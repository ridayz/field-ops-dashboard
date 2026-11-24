// Find the Odoo database name behind helpdesk.indonet.id and verify the key.
// Read-only: db list / version / login.
const BASE = 'https://helpdesk.indonet.id';
const LOGIN = process.env.FIELD_OPS_LOGIN ?? 'ridwan@indonet.id';
const KEY = process.env.FIELD_OPS_KEY ?? '06e28f33919855afdff731ea72acd4be325bba4e';

const CANDIDATES = [
  'indonet',
  'helpdesk',
  'indonet_helpdesk',
  'helpdesk_indonet',
  'indonet_helpdesk_prod',
  'indonet_prod',
  'indonet_production',
  'production',
  'helpdesk_prod',
  'ticketing',
  'indonet17',
  'indonet_v17',
];

async function rpc(service, method, args) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${BASE}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: 1 }),
      signal: controller.signal,
    });
    const payload = await res.json();
    if (payload.error) return { ok: false, reason: payload.error.data?.message ?? payload.error.message };
    return { ok: true, result: payload.result };
  } catch (error) {
    return { ok: false, reason: error.name === 'AbortError' ? 'timeout' : error.message };
  } finally {
    clearTimeout(timer);
  }
}

const listed = await rpc('db', 'list', []);
if (listed.ok) {
  console.log(`Database terdaftar: ${JSON.stringify(listed.result)}`);
} else {
  console.log(`db.list ditutup (${listed.reason})`);
}

// The login page sometimes embeds the database in its JS config.
try {
  const html = await fetch(`${BASE}/web/login`).then((res) => res.text());
  const match = html.match(/db[^a-z]{0,3}[:=]\s*["']([a-z0-9_-]+)["']/i);
  console.log(`login page db hint: ${match?.[1] ?? 'tidak ada'}`);
} catch {
  console.log('login page tidak terbaca');
}

for (const db of CANDIDATES) {
  const auth = await rpc('common', 'login', [db, LOGIN, KEY]);
  if (auth.ok && auth.result) {
    console.log(`MATCH db="${db}" uid=${auth.result}`);
  } else {
    console.log(`db="${db}" -> ${auth.reason}`);
  }
}
