// 1) ask the web session for its database name, 2) try the web login form with
// the API key. Read-only.
const BASE = 'https://helpdesk.indonet.id';
const LOGIN = process.env.FIELD_OPS_LOGIN ?? 'ridwan@indonet.id';
const KEY = process.env.FIELD_OPS_KEY ?? '06e28f33919855afdff731ea72acd4be325bba4e';

async function get(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    return await fetch(`${BASE}${path}`, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const loginPage = await get('/web/login');
const setCookies = loginPage.headers.getSetCookie?.() ?? [];
const cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
const html = await loginPage.text();
const csrf = html.match(/name="csrf_token"[^>]*value="([^"]+)"/)?.[1] ?? '';
console.log(`login page ${loginPage.status}; cookie ${cookie ? 'ada' : 'kosong'}; csrf ${csrf ? 'ada' : 'kosong'}`);

const infoRes = await get('/web/session/get_session_info', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: '{}',
});
console.log(`\nsession_info -> ${infoRes.status}`);
console.log((await infoRes.text()).slice(0, 400));

const form = new URLSearchParams({ csrf_token: csrf, login: LOGIN, password: KEY, redirect: '' });
const loginRes = await get('/web/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    Cookie: cookie,
    Referer: `${BASE}/web/login`,
  },
  body: form.toString(),
  redirect: 'manual',
});
console.log(`\nPOST /web/login -> ${loginRes.status} location=${loginRes.headers.get('location') ?? '-'}`);
const after = (loginRes.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ') || cookie;
const check = await get('/web/session/get_session_info', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: after },
  body: '{}',
});
const checkText = await check.text();
console.log(`session setelah login -> ${check.status}`);
console.log(checkText.slice(0, 500));
