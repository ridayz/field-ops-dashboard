// Try the remaining public entry points that can name the database.
const BASE = 'https://helpdesk.indonet.id';
const PATHS = [
  '/web/database/selector',
  '/web/database/manager',
  '/web/database/list',
  '/web/database/get_list',
];

for (const path of PATHS) {
  try {
    const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
    const text = await res.text();
    console.log(`\n== ${path} -> ${res.status} (${res.headers.get('content-type') ?? ''})`);
    console.log(text.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/\s+/g, ' ').slice(0, 300));
  } catch (error) {
    console.log(`\n== ${path} -> ${error.message}`);
  }
}
