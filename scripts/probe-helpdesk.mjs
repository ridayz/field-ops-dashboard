// Inspect https://helpdesk.indonet.id: is it Odoo JSON-RPC, or another helpdesk
// stack? Read-only.
const BASE = 'https://helpdesk.indonet.id';

const controller = (ms) => {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

async function show(path) {
  try {
    const res = await fetch(`${BASE}${path}`, { signal: controller(8000), redirect: 'manual' });
    const text = await res.text();
    console.log(`\n== ${path} -> ${res.status} ${res.headers.get('content-type') ?? ''}`);
    console.log(`server: ${res.headers.get('server') ?? '-'} | powered-by: ${res.headers.get('x-powered-by') ?? '-'}`);
    if (res.headers.get('location')) console.log(`location: ${res.headers.get('location')}`);
    console.log(text.replace(/\s+/g, ' ').slice(0, 260));
  } catch (error) {
    console.log(`\n== ${path} -> ${error.name === 'AbortError' ? 'timeout' : error.message}`);
  }
}

await show('/');
await show('/web/login');
await show('/api/health');
await show('/rest/api/2/serverInfo');

const version = await fetch(`${BASE}/jsonrpc`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'call',
    params: { service: 'common', method: 'version', args: [] },
    id: 1,
  }),
  signal: controller(10000),
})
  .then(async (res) => `${res.status} ${(await res.text()).replace(/\s+/g, ' ').slice(0, 240)}`)
  .catch((error) => (error.name === 'AbortError' ? 'timeout' : error.message));

console.log(`\n== /jsonrpc -> ${version}`);
