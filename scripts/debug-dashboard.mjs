import { loadConfig } from '../src/config.mjs';
import { createClient } from '../src/odoo.mjs';
import { resolveAccount, buildDashboard } from '../src/dashboard.mjs';

const config = loadConfig();
const client = createClient(config);
console.log('auth...');
const account = await resolveAccount(client, config);
console.log('account ok', account.user.name, account.user.id);
console.log('dashboard...');
const data = await buildDashboard(client, account, '30d');
console.log(JSON.stringify({ totals: data.totals, stages: data.stages, queue: data.queue?.length, note: data.note }, null, 2));
