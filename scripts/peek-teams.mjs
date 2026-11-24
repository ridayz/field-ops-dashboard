import { loadConfig } from '../src/config.mjs';
import { createClient } from '../src/odoo.mjs';

const config = loadConfig();
const client = createClient(config);
await client.authenticate();

const teams = await client.searchRead('helpdesk.team', [], ['id', 'name'], { limit: 200 }).catch(e => ({ __error: e.message }));
console.log(JSON.stringify({ teams }, null, 2));

const open = await client.searchRead('helpdesk.ticket', [['stage_id.fold', '=', false]], ['id', 'number', 'name', 'team_id', 'user_id', 'stage_id'], { limit: 50 });
console.log(JSON.stringify({ open }, null, 2));
