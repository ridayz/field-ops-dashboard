// Introspection: what can this API key actually read?
// Read-only. Writes a report to docs/data-inventory.md and prints a summary.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { createClient } from '../src/odoo.mjs';

const CANDIDATES = [
  ['project.task', 'Task / pekerjaan lapangan', ['user_ids', 'project_id', 'stage_id', 'date_deadline', 'planned_date_begin']],
  ['project.project', 'Proyek', ['user_id', 'partner_id', 'date_start']],
  ['helpdesk.ticket', 'Tiket helpdesk', ['user_id', 'stage_id', 'partner_id', 'create_date']],
  ['crm.lead', 'Lead / opportunity', ['user_id', 'stage_id', 'partner_id', 'expected_revenue']],
  ['sale.order', 'Sales order', ['user_id', 'partner_id', 'state', 'amount_total']],
  ['purchase.order', 'Purchase order', ['user_id', 'partner_id', 'state', 'amount_total']],
  ['stock.picking', 'Transfer stok', ['user_id', 'partner_id', 'state', 'scheduled_date']],
  ['stock.move', 'Detail pergerakan stok', ['picking_id', 'product_id', 'quantity']],
  ['mrp.production', 'Manufacturing order', ['user_id', 'product_id', 'state']],
  ['fleet.vehicle', 'Kendaraan', ['driver_id', 'model_id', 'license_plate']],
  ['fleet.vehicle.log.services', 'Servis kendaraan', ['vehicle_id', 'amount', 'date']],
  ['hr.attendance', 'Absensi', ['employee_id', 'check_in', 'check_out']],
  ['hr.leave', 'Cuti / izin', ['employee_id', 'holiday_status_id', 'date_from', 'date_to']],
  ['hr.expense', 'Reimbursement', ['employee_id', 'total_amount', 'state']],
  ['maintenance.request', 'Permintaan maintenance', ['user_id', 'stage_id', 'equipment_id']],
  ['account.move', 'Invoice / tagihan', ['invoice_user_id', 'partner_id', 'state', 'amount_total']],
  ['res.partner', 'Kontak / customer', ['user_id', 'parent_id', 'city']],
];

const config = loadConfig();
const client = createClient(config);

const uid = await client.authenticate();
const [me] = await client.read('res.users', 'read', [[uid]], {
  fields: ['name', 'login', 'employee_id'],
});
console.log(`Login sebagai: ${me.name} (uid ${uid})`);

let modules = [];
try {
  modules = await client.searchRead(
    'ir.module.module',
    [['state', '=', 'installed']],
    ['name', 'shortdesc'],
    { limit: 400 },
  );
} catch {
  console.log('Modul tidak bisa dibaca (akses technical dimatikan). Lanjut ke model.');
}

const lines = [];
lines.push(`# Data yang bisa ditarik — ${me.name}`);
lines.push('');
lines.push(`Dibuat: ${new Date().toISOString()}`);
lines.push('');
lines.push('## Modul terpasang');
lines.push('');
if (modules.length === 0) {
  lines.push('- tidak terbaca');
} else {
  for (const mod of modules.sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`- \`${mod.name}\` — ${mod.shortdesc}`);
  }
}
lines.push('');
lines.push('## Model bisnis');
lines.push('');
lines.push('| Model | Arti | Terbaca | Jumlah baris terlihat | Field kunci |');
lines.push('| --- | --- | --- | --- | --- |');

for (const [model, label, keys] of CANDIDATES) {
  let row = `| \`${model}\` | ${label} | tidak ada | — | — |`;
  try {
    const fields = await client.read(model, 'fields_get', [], { attributes: ['string', 'type'] });
    const available = keys.filter((field) => field in fields);
    const count = await client.searchCount(model, []);
    row = `| \`${model}\` | ${label} | ya | ${count} | ${available.join(', ') || '—'} |`;
  } catch {
    // model missing or not readable for this user
  }
  lines.push(row);
  console.log(row);
}

lines.push('');
lines.push('## Model kustom (x_)');
lines.push('');
try {
  const custom = await client.searchRead(
    'ir.model',
    [['model', 'like', 'x_']],
    ['model', 'name'],
    { limit: 100 },
  );
  if (custom.length === 0) lines.push('- tidak ada');
  for (const item of custom) lines.push(`- \`${item.model}\` — ${item.name}`);
} catch {
  lines.push('- tidak terbaca');
}

const out = join(config.root, 'docs', 'data-inventory.md');
writeFileSync(out, `${lines.join('\n')}\n`, 'utf8');
console.log(`\nLaporan: ${out}`);
