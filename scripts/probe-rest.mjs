// Some ticketing deployments expose their own REST controller instead of
// JSON-RPC. Probe likely paths with the API key, read-only GETs only.
import { httpRequest } from '../src/http.mjs';

const BASE = 'https://helpdesk.indonet.id';
const KEY = process.env.FIELD_OPS_KEY ?? '06e28f33919855afdff731ea72acd4be325bba4e';

const PATHS = [
  '/api',
  '/api/',
  '/api/tickets',
  '/api/ticket',
  '/api/v1/tickets',
  '/api/helpdesk/tickets',
  '/api/helpdesk',
  '/helpdesk/api/tickets',
  '/ticket/api',
  '/rest/tickets',
  '/web/api/tickets',
  '/api/auth/me',
  '/api/me',
  '/api/profile',
];

const AUTH = [
  ['Authorization', `Bearer ${KEY}`],
  ['X-Api-Key', KEY],
  ['api-key', KEY],
];

for (const path of PATHS) {
  const results = [];
  for (const [header, value] of AUTH) {
    try {
      const res = await httpRequest(`${BASE}${path}`, {
        headers: { [header]: value, Accept: 'application/json' },
        timeoutMs: 15000,
      });
      const snippet = res.body.replace(/\s+/g, ' ').slice(0, 70);
      results.push(`${header}:${res.status} ${snippet}`);
    } catch (error) {
      results.push(`${header}: ${error.code ?? error.message}`);
    }
  }
  console.log(`${path}\n  ${results.join('\n  ')}`);
}
