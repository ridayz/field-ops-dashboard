// Dump the database selector page to see whether it names the database.
const BASE = 'https://helpdesk.indonet.id';

const res = await fetch(`${BASE}/web/database/selector`);
const html = await res.text();

const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
console.log(`title: ${title}`);

const body = html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
console.log(`\ntext:\n${body.slice(0, 1200)}`);

const links = [...html.matchAll(/(?:href|action)="([^"]+)"/g)].map((m) => m[1]);
console.log(`\nlinks:\n${[...new Set(links)].join('\n')}`);

const inputs = [...html.matchAll(/<input[^>]+>/gi)].map((m) => m[0]);
console.log(`\ninputs:\n${inputs.join('\n')}`);
