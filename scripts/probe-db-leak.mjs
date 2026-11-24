// Look for the database name leaking through the login page or headers.
const BASE = 'https://helpdesk.indonet.id';

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 25000);
const res = await fetch(`${BASE}/web/login`, { signal: controller.signal });
clearTimeout(timer);

const html = await res.text();
console.log(`status ${res.status}`);
console.log('headers:');
for (const [key, value] of res.headers) {
  if (/db|database|odoo/i.test(key)) console.log(`  ${key}: ${value}`);
}

const candidates = [...new Set(html.match(/[a-z0-9_.-]*(?:indonet|helpdesk|ticket)[a-z0-9_.-]*/gi) ?? [])];
console.log(`\ntoken mirip nama db di HTML: ${candidates.join(', ') || 'tidak ada'}`);

const scriptSrcs = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]).filter((s) => /asset|web/i.test(s));
console.log(`\nasset pertama: ${scriptSrcs[0] ?? '-'}`);
