import { loadConfig } from '../src/config.mjs';
import { createClient } from '../src/odoo.mjs';
import { resolveAccount } from '../src/dashboard.mjs';

const config = loadConfig();
const client = createClient(config);
const account = await resolveAccount(client, config);
console.log(JSON.stringify({
  user: account.user,
  employee: account.employee,
  company: account.company,
  scope: account.scope,
}, null, 2));
