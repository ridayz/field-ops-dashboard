// Establish an Odoo web session, then ask it for its database name.
const BASE = 'https://helpdesk.indonet.id';

const loginPage = await fetch(`${BASE}/web/login`);
const cookies = (loginPage.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]);
console.log(`GET /web/login -> ${loginPage.status}`);
console.log(`cookies: ${cookies.join(' | ') || '(kosong)'}`);

const sessionInfo = await fetch(`${BASE}/web/session/get_session_info`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(cookies.length ? { Cookie: cookies.join('; ') } : {}),
  },
  body: '{}',
});
const info = await sessionInfo.text();
console.log(`\nPOST /web/session/get_session_info -> ${sessionInfo.status}`);
console.log(info.slice(0, 500));

// Some builds expose the db through the webclient bootstrap config.
if (cookies.length) {
  const page = await fetch(`${BASE}/web`, {
    headers: { Cookie: cookies.join('; ') },
    redirect: 'manual',
  });
  const html = await page.text();
  const dbHints = [...html.matchAll(/["']db["']\s*:\s*["']([^"']+)["']/g)].map((m) => m[1]);
  const infoHints = [...html.matchAll(/__session_info__\s*=\s*([\s\S]{0,2000}?)<\/script>/g)].map((m) => m[1]);
  console.log(`\nGET /web -> ${page.status} ${page.headers.get('location') ?? ''}`);
  console.log(`db hint di /web: ${dbHints.join(', ') || 'tidak ada'}`);
  if (infoHints.length) console.log(`session info: ${infoHints[0].replace(/\s+/g, ' ').slice(0, 300)}`);
}
