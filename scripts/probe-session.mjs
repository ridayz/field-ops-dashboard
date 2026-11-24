// Ask the live Odoo session what database it is attached to (unauthenticated).
const BASE = 'https://helpdesk.indonet.id';

async function postJson(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  return { status: res.status, text, cookie: res.headers.get('set-cookie') };
}

for (const path of ['/web/session/get_session_info', '/web/session/authenticate']) {
  try {
    const out = await postJson(path, path.endsWith('authenticate') ? { params: {} } : {});
    console.log(`\n== ${path} -> ${out.status}`);
    console.log(out.text.replace(/\s+/g, ' ').slice(0, 400));
    if (out.cookie) console.log(`cookie: ${out.cookie.split(';')[0]}`);
  } catch (error) {
    console.log(`\n== ${path} -> ${error.message}`);
  }
}

try {
  const res = await fetch(`${BASE}/web`, { redirect: 'manual' });
  console.log(`\n== /web -> ${res.status} ${res.headers.get('location') ?? ''}`);
} catch (error) {
  console.log(`/web -> ${error.message}`);
}
