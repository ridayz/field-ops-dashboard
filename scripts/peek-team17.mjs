import { loadConfig } from '../src/config.mjs';
import { createClient } from '../src/odoo.mjs';

const config = loadConfig();
const client = createClient(config);
await client.authenticate();
const domain = [['team_id', '=', 17]];
console.log(JSON.stringify({
  total: await client.searchCount('helpdesk.ticket', domain),
  open: await client.searchCount('helpdesk.ticket', [...domain, ['stage_id.fold', '=', false]]),
  sample: await client.searchRead('helpdesk.ticket', domain, ['id','number','name','stage_id','team_id','user_id','create_date','write_date'], {limit: 5, order: 'write_date desc'}),
}, null, 2));
