import { loadConfig } from '../src/config.mjs';
import { createClient } from '../src/odoo.mjs';

const config = loadConfig();
const client = createClient(config);
await client.authenticate();

const teams = await client.searchRead('helpdesk.ticket.team', [], ['id', 'name'], { limit: 300 });
const cibitung = teams.filter(t => /cibitung/i.test(t.name));
const fieldops = teams.filter(t => /field/i.test(t.name) && /op/i.test(t.name));
console.log(JSON.stringify({ count: teams.length, cibitung, fieldops, all: teams }, null, 2));
