import { loadConfig } from '../src/config.mjs';
import { createClient } from '../src/odoo.mjs';

const config = loadConfig();
const client = createClient(config);
const uid = await client.authenticate();

const fields = await client.read('helpdesk.ticket', 'fields_get', [], { attributes: ['string', 'type', 'selection'] }).catch(e => ({ __error: e.message }));
if (fields.__error) {
  console.log(JSON.stringify({ error: fields.__error }));
  process.exit(0);
}
const wanted = ['name','stage_id','priority','partner_id','partner_name','user_id','create_uid','team_id','create_date','write_date','date_deadline','sla_deadline','kanban_state'];
console.log(JSON.stringify({
  uid,
  total: await client.searchCount('helpdesk.ticket', []),
  mine: await client.searchCount('helpdesk.ticket', ['|',['user_id','=',uid],['create_uid','=',uid]]),
  sampleKeys: Object.keys(fields).length,
  hasWanted: wanted.filter(f => f in fields),
  missingWanted: wanted.filter(f => !(f in fields)),
  prioritySel: fields.priority?.selection ?? null,
  hasStageFold: !!fields.stage_id,
}, null, 2));
