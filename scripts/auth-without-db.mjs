// Try authenticating without naming the database: Odoo derives it from the
// HTTP session (dbfilter). Read-only.
const BASE = 'https://helpdesk.indonet.id';
const LOGIN = process.env.FIELD_OPS_LOGIN ?? 'ridwan@indonet.id';
const KEY = process.env.FIELD_OPS_KEY ?? '06e28f33919855afdff731ea72acd4be325bba4e';

async function rpc(params, cookie) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(`${BASE}/jsonrpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params, id: 1 }),
      signal: controller.signal,
    });
    return { status: res.status, body: await res.text() };
  } catch (error) {
    return { status: 0, body: error.name === 'AbortError' ? 'timeout' : error.message };
  } finally {
    clearTimeout(timer);
  }
}

const version = await rpc({ service: 'common', method: 'version', args: [] });
console.log(`version: ${version.status} ${version.body.slice(0, 120)}`);

let cookie = '';
try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  const page = await fetch(`${BASE}/web/login`, { signal: controller.signal });
  clearTimeout(timer);
  cookie = (page.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  console.log(`login page: ${page.status} cookie=${cookie ? 'ada' : 'kosong'}`);
} catch (error) {
  console.log(`login page gagal: ${error.name === 'AbortError' ? 'timeout' : error.message}`);
}

for (const db of [null, false, '']) {
  const attempt = await rpc(
    { service: 'common', method: 'login', args: [db, LOGIN, KEY] },
    cookie || undefined,
  );
  console.log(`login db=${JSON.stringify(db)} -> ${attempt.status} ${attempt.body.slice(0, 220)}`);
}
