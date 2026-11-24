// Find the Odoo endpoint for indonet and verify the API key.
// Read-only: common/version + common/login only.
const API_KEY = process.env.FIELD_OPS_KEY ?? '06e28f33919855afdff731ea72acd4be325bba4e';
const LOGIN = process.env.FIELD_OPS_LOGIN ?? 'ridwan@indonet.id';

const CANDIDATE_URLS = [
  'https://indonet.odoo.com',
  'https://erp.indonet.co.id',
  'https://odoo.indonet.co.id',
  'https://indonet.co.id',
  'https://app.indonet.co.id',
  'https://portal.indonet.co.id',
  'https://hq.indonet.co.id',
  'https://system.indonet.co.id',
  'https://erp.indonet.net',
  'https://odoo.indonet.net',
];

const CANDIDATE_DBS = ['indonet', 'indonet-id', 'indonet_id', 'indonet_production', 'production'];

async function rpc(baseUrl, service, method, args) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${baseUrl}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: { service, method, args },
        id: 1,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const payload = await res.json();
    if (payload.error) {
      return { ok: false, reason: payload.error.data?.message ?? payload.error.message, error: payload.error };
    }
    return { ok: true, result: payload.result };
  } catch (error) {
    return { ok: false, reason: error.name === 'AbortError' ? 'timeout' : error.message };
  } finally {
    clearTimeout(timer);
  }
}

for (const base of CANDIDATE_URLS) {
  const version = await rpc(base, 'common', 'version', []);
  if (!version.ok) {
    console.log(`${base} -> bukan Odoo (${version.reason})`);
    continue;
  }
  console.log(`${base} -> ODOO ${version.result?.server_version ?? '?'} (db host: ${version.result?.server_serie ?? '?'})`);
  for (const db of CANDIDATE_DBS) {
    const login = await rpc(base, 'common', 'login', [db, LOGIN, API_KEY]);
    if (login.ok && login.result) {
      console.log(`  MATCH db="${db}" uid=${login.result} url=${base}`);
    } else {
      console.log(`  db="${db}" -> gagal (${login.reason})`);
    }
  }
}
