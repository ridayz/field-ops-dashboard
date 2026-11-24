// Try plausible database names on helpdesk.indonet.id. Read-only.
// A "password authentication failed" style error means the db exists and only
// the credentials were wrong; "database ... does not exist" means keep looking.
import { postJson } from '../src/http.mjs';

const BASE = 'https://helpdesk.indonet.id';
const LOGIN = process.env.FIELD_OPS_LOGIN ?? 'ridwan@indonet.id';
const KEY = process.env.FIELD_OPS_KEY ?? '06e28f33919855afdff731ea72acd4be325bba4e';

const NAMES = [
  'helpdesk.indonet.id',
  'indonet.co.id',
  'indonet_id',
  'indonet',
  'helpdesk',
  'hd',
  'indonet_hd',
  'hd_indonet',
  'indonet_helpdesk',
  'helpdesk_indonet',
  'helpdeskindonet',
  'indonethelpdesk',
  'helpdesk_indonet_id',
  'indonet_odoo',
  'odoo_indonet',
  'indonet-hd',
  'hd-indonet',
  'helpdesk_indonet_prod',
  'indonet17',
  'indonet_2024',
  'indonet_isp',
  'ticketing_indonet',
  'odoo',
  'odoo17',
  'erp',
  'ticketing',
  'tiket',
  'helpdesk_prod',
  'helpdesk17',
  'indonet_prod',
  'indonet_erp',
  'erp_indonet',
  'indonet_cs',
  'cs_indonet',
  'indonet_it',
  'it_indonet',
];

for (const db of NAMES) {
  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: { service: 'common', method: 'login', args: [db, LOGIN, KEY] },
    id: 1,
  };

  try {
    const res = await postJson(`${BASE}/jsonrpc`, payload, { timeoutMs: 20000 });
    const body = JSON.parse(res.body);
    if (body.result) {
      console.log(`MATCH db="${db}" uid=${body.result}`);
      break;
    }
    const message = String(body.error?.data?.message ?? body.error?.message ?? '').replace(/\s+/g, ' ');
    const exists = !/does not exist/i.test(message);
    console.log(`db="${db}" -> ${exists ? 'DB ADA, kredensial salah' : 'tidak ada'}`);
    if (exists) console.log(`   ${message.slice(0, 200)}`);
  } catch (error) {
    console.log(`db="${db}" -> gagal konek (${error.message})`);
  }
}
