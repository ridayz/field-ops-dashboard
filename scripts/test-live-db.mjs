import { postJson } from '../src/http.mjs';

const BASE = 'https://helpdesk.indonet.id';
const db = 'indonet_helpdesk_live';
const login = process.env.FIELD_OPS_LOGIN ?? 'ridwan@indonet.id';
const key = process.env.FIELD_OPS_KEY ?? '06e28f33919855afdff731ea72acd4be325bba4e';

const res = await postJson(
  `${BASE}/jsonrpc`,
  {
    jsonrpc: '2.0',
    method: 'call',
    params: { service: 'common', method: 'login', args: [db, login, key] },
    id: 1,
  },
  { timeoutMs: 25000 },
);

console.log(res.body);
