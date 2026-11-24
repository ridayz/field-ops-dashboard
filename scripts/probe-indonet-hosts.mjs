// Probe the subdomains found in certificate transparency logs for an Odoo
// JSON-RPC endpoint. Read-only.
const HOSTS = [
  'album.indonet.id',
  'data-intelligence.indonet.id',
  'doc-nw.indonet.id',
  'ecplan.indonet.id',
  'gitlab.indonet.id',
  'graylog.indonet.id',
  'gws.indonet.id',
  'ipamanage.indonet.id',
  'ipositif.indonet.id',
  'lg.indonet.id',
  'mailmarketing.indonet.id',
  'mblast.indonet.id',
  'myproject.indonet.id',
  'npm.indonet.id',
  'rpki.indonet.id',
  'stat.indonet.id',
  'tacacs.indonet.id',
  'wiki.indonet.id',
];

async function probe(base) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(`${base}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: { service: 'common', method: 'version', args: [] },
        id: 1,
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // not JSON
    }
    if (parsed?.result) return `${base} -> ODOO ${parsed.result.server_version ?? '?'}`;
    return `${base} -> HTTP ${res.status} ${text.replace(/\s+/g, ' ').slice(0, 70)}`;
  } catch (error) {
    return `${base} -> ${error.name === 'AbortError' ? 'timeout' : 'tidak terjangkau'}`;
  } finally {
    clearTimeout(timer);
  }
}

const results = await Promise.all(HOSTS.map((host) => probe(`https://${host}`)));
console.log(results.join('\n'));
