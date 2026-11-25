const $ = (id) => document.getElementById(id);

let meta = null;
let stats = null;
let kpi = null;
let lastL2 = { logs: [], tinfo: {}, range: { from: '', to: '' } };
let rawL2 = { logs: [], tinfo: {}, range: { from: '', to: '' } };
const submitted = new Set(JSON.parse(localStorage.getItem('hdl_submitted_view') || '[]'));
const saveSubmitted = () => localStorage.setItem('hdl_submitted_view', JSON.stringify([...submitted]));

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function iso(d) { return d.toISOString().slice(0, 10); }
function rangeDefault() {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 13);
  return { from: iso(from), to: iso(to) };
}
function getL2Range() {
  const r = rangeDefault();
  return { from: $('l2-from').value || r.from, to: $('l2-to').value || r.to };
}

function diffMenit(a, b) {
  if (!a || !b) return null;
  const d = (new Date(String(b).replace(' ', 'T') + 'Z') - new Date(String(a).replace(' ', 'T') + 'Z')) / 60000;
  return d >= 0 ? Math.round(d) : null;
}
function fmtDur(m) {
  if (m === null || m === undefined) return '–';
  if (m < 60) return `${m} mnt`;
  if (m < 1440) return `${Math.floor(m / 60)}j ${m % 60}mnt`;
  return `${Math.floor(m / 1440)}h ${Math.floor((m % 1440) / 60)}j`;
}
const startOf = (t) => t.in_progress_date || t.assigned_date || null;
const endOf = (t) => t.solved_date || t.closed_date || null;
function waktuChip(t) {
  const s = startOf(t);
  const e = endOf(t);
  if (e) return `Selesai ${fmtDur(diffMenit(t.create_date, e))}`;
  if (s) return 'Dikerjakan';
  return 'Menunggu';
}

function stageClass(stage) {
  return `badge ${String(stage || '').replace(/\s+/g, '')}`;
}

async function api(path) {
  const r = await fetch(path, { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

// Navigation
document.querySelectorAll('.tab').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    const page = b.dataset.page;
    document.querySelectorAll('.page').forEach((p) => { p.hidden = p.id !== `page-${page}`; });
  });
});

function fillSelect(id, items, label) {
  const el = $(id);
  if (!el) return;
  const cur = el.value;
  el.innerHTML = `<option value="">${label}</option>` + (items || []).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  if ([...el.options].some((o) => o.value === cur)) el.value = cur;
}

function renderStats() {
  if (!meta) return;
  const closed = (meta.byStage || []).find((g) => g.stage_id?.[1] === 'Closed')?.__count || 0;
  const pct = meta.total ? Math.round((closed / meta.total) * 100) : 0;
  const new7 = stats ? stats.byDay.slice(-7).reduce((a, d) => a + d.total, 0) : null;
  const avg = kpi ? fmtDur(kpi.avgMenit) : '–';
  $('dash-stats').innerHTML = `
    <div class="stat"><div class="label">Tiket terbuka</div><div class="value">${meta.openCount ?? '–'}</div><div class="note">live</div></div>
    <div class="stat"><div class="label">Total tiket</div><div class="value">${meta.total ?? '–'}</div><div class="note">${new7 === null ? 'semua' : `+${new7} / 7 hari`}</div></div>
    <div class="stat"><div class="label">Progress selesai</div><div class="value">${pct}%</div><div class="note">${closed}/${meta.total ?? '?'} closed</div></div>
    <div class="stat"><div class="label">Rata-rata penanganan</div><div class="value">${avg}</div><div class="note">${kpi ? `${kpi.total} log L2` : 'memuat KPI…'}</div></div>`;

  const R = 70;
  const C = 2 * Math.PI * R;
  const frac = pct / 100;
  $('gauge').innerHTML = `
    <svg viewBox="0 0 200 120">
      <circle cx="100" cy="105" r="${R}" fill="none" stroke="#d7e0ea" stroke-width="14" />
      <circle cx="100" cy="105" r="${R}" fill="none" stroke="#003070" stroke-width="14" stroke-linecap="round"
        stroke-dasharray="${(C * frac * 0.52).toFixed(1)} ${C.toFixed(1)}" transform="rotate(207 100 105)" />
      <text x="100" y="95" text-anchor="middle" fill="#003070" font-size="24" font-weight="600">${pct}%</text>
    </svg>`;
  $('gauge-legend').innerHTML = `<span><i style="background:#003070"></i>Selesai ${closed}</span><span><i style="background:#d7e0ea"></i>Lainnya ${(meta.total || 0) - closed}</span>`;

  if (stats) {
    const max = Math.max(1, ...stats.byDay.map((d) => d.total));
    const W = 560;
    const H = 140;
    const bw = W / stats.byDay.length;
    $('bars').innerHTML = `<svg viewBox="0 0 ${W} ${H + 24}">` + stats.byDay.map((d, i) => {
      const h = Math.max(3, (d.total / max) * H);
      const x = (i * bw + 2).toFixed(1);
      const y = (H - h).toFixed(1);
      const fill = d.total ? '#003070' : '#d7e0ea';
      return `<rect x="${x}" y="${y}" width="${(bw - 5).toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${fill}" opacity="${d.total ? 1 : 0.55}"><title>${d.date}: ${d.total} tiket (${d.open} terbuka)</title></rect>` +
        (i % 2 ? '' : `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H + 16}" text-anchor="middle" fill="#6f8096" font-size="10">${d.date.slice(5)}</text>`);
    }).join('') + `</svg>`;
  }
}

function bindTicketRows(tbody) {
  tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
    tr.addEventListener('click', () => openDetail(parseInt(tr.dataset.id, 10)));
  });
}

function ticketRow(t, withCustomer) {
  const stage = t.stage_id?.[1] || '-';
  return `<tr data-id="${t.id}">
    <td class="t">${esc(t.number || `#${t.id}`)}</td>
    <td>${esc(t.name || '')}</td>
    <td><span class="${stageClass(stage)}">${esc(stage)}</span></td>
    <td>${esc(t.team_id?.[1] || '-')}</td>
    <td>${esc(t.user_id?.[1] || '-')}</td>
    ${withCustomer ? `<td>${esc(t.ca_name || t.partner_id?.[1] || t.customer_id || '-')}</td>` : ''}
    <td>${esc(waktuChip(t))}</td>
    <td class="muted">${esc(String(t.write_date || '').slice(0, 16))}</td>
  </tr>`;
}

function extraRow(x) {
  return `<tr class="row-extra" title="Di luar akses baca akun ini — data dari log penanganan">
    <td class="t">${esc(x.number || '')} <span class="pill-tag">luar akses</span></td>
    <td>${esc(x.name || '')}</td>
    <td><span class="muted">tidak diketahui</span></td>
    <td>${esc(x.team || '-')}</td>
    <td>${esc(x.by || '-')}</td>
    <td>-</td>
    <td class="muted">${esc(String(x.last || '').slice(0, 16))}</td>
    <td class="muted">${esc(String(x.last || '').slice(0, 16))}</td>
  </tr>`;
}

async function loadMeta() {
  meta = await api('/api/meta');
  $('nav-open').textContent = meta.openCount ?? '';
  fillSelect('f-stage', meta.stages || [], 'Semua stage');
  fillSelect('f-team', meta.teams || [], 'Semua team');
  fillSelect('f-channel', meta.channels || [], 'Semua channel');
  fillSelect('l2-team', meta.teams || [], 'Semua team');
  fillSelect('kpi-team', meta.teams || [], 'Semua team');
  fillSelect('km-team', meta.teams || [], 'Semua team');
  ensureKmTeam();
  renderStats();
}

async function loadStats() {
  try {
    const team = $('f-team').value || '';
    stats = await api(`/api/stats?days=14${team ? `&team=${encodeURIComponent(team)}` : ''}`);
  } catch {
    stats = null;
  }
  renderStats();
}

async function loadOpen() {
  const j = await api('/api/tickets?scope=open');
  $('open-count').textContent = `${j.tickets.length} tiket`;
  const box = $('open-list');
  if (!j.tickets.length) {
    box.innerHTML = '<tr><td colspan="7" class="muted">Tidak ada tiket terbuka.</td></tr>';
    return;
  }
  box.innerHTML = j.tickets.map((t) => ticketRow(t, false)).join('');
  bindTicketRows(box);
}

async function loadTickets() {
  const hasFilter = $('f-stage').value || $('f-team').value || $('f-channel').value || $('f-q').value.trim();
  const box = $('ticket-list');
  box.innerHTML = '<tr><td colspan="8" class="muted">Memuat…</td></tr>';
  try {
    if (hasFilter) {
      const q = new URLSearchParams({
        stage: $('f-stage').value,
        team: $('f-team').value,
        channel: $('f-channel').value,
        q: $('f-q').value.trim(),
      });
      const j = await api(`/api/search?${q}`);
      let html = j.tickets.map((t) => ticketRow(t, true)).join('');
      if (!$('f-stage').value && !$('f-channel').value) {
        try {
          const xq = await api(`/api/tickets-extra?${new URLSearchParams({ q: $('f-q').value.trim(), team: $('f-team').value })}`);
          if ((xq.tickets || []).length) {
            html += `<tr><td colspan="8" class="muted">— ${xq.total} tiket cocok di luar akses akun (dari log penanganan) —</td></tr>` + xq.tickets.map(extraRow).join('');
          }
        } catch {}
      }
      box.innerHTML = html || '<tr><td colspan="8" class="muted">Tidak ada tiket cocok.</td></tr>';
      bindTicketRows(box);
      return;
    }
    const j = await api('/api/tickets?scope=latest');
    let html = j.tickets.map((t) => ticketRow(t, true)).join('');
    try {
      const x = await api('/api/tickets-extra');
      if ((x.tickets || []).length) {
        html += `<tr><td colspan="8" class="muted">— ${x.total} tiket lain di luar akses akun (dari log penanganan) —</td></tr>` + x.tickets.map(extraRow).join('');
      }
    } catch {}
    box.innerHTML = html || '<tr><td colspan="8" class="muted">Tidak ada tiket.</td></tr>';
    bindTicketRows(box);
  } catch (e) {
    box.innerHTML = `<tr><td colspan="8" class="muted">Gagal memuat: ${esc(e.message)}</td></tr>`;
  }
}

function fmtID(dt) {
  if (!dt) return '-';
  const d = new Date(String(dt).replace(' ', 'T') + 'Z');
  const p = (n) => String(n).padStart(2, '0');
  const h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(hh)}:${p(d.getMinutes())} ${ap}`;
}
function fmtMDY(dt) {
  if (!dt) return '';
  const d = new Date(String(dt).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  const h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${hh}:${p(d.getMinutes())} ${ap}`;
}
function fmtDateMDY(dt) {
  if (!dt) return '';
  const d = new Date(String(dt).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
}
function fmtTime12(dt) {
  if (!dt) return '';
  const d = new Date(String(dt).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  const h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${p(d.getMinutes())} ${ap}`;
}
function wibStamp(dt) {
  if (!dt) return '';
  const d = new Date(String(dt).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function openDetail(id) {
  const drawer = $('drawer');
  const detail = $('detail');
  detail.innerHTML = '<p class="muted">Memuat detail…</p>';
  drawer.hidden = false;
  try {
    const j = await api(`/api/tickets/${id}`);
    const t = j.ticket;
    const msgs = j.messages || [];
    const FLOW = ['New', 'Open', 'In Progress', 'Solved', 'Closed'];
    const cur = t.stage_id?.[1] || '';
    const curIdx = FLOW.indexOf(cur);
    const steps = FLOW.map((s, i) => {
      let cls = '';
      if (cur === 'Hold') cls = i < 2 ? 'done' : '';
      else if (i < curIdx) cls = 'done';
      else if (i === curIdx) cls = 'now';
      return `<span class="step ${cls}">${esc(s)}</span>`;
    }).join('');

    detail.innerHTML = `
      <h2>${esc(t.number || `#${t.id}`)}</h2>
      <div class="meta-line"><span class="${stageClass(cur)}">${esc(cur)}</span></div>
      <div class="stepper">${steps}</div>
      ${cur === 'Hold' ? '<p class="muted">Tiket ini sedang di-Hold.</p>' : ''}

      <h3>Waktu</h3>
      <dl class="kv">
        <dt>Mulai dikerjakan</dt><dd>${esc(startOf(t) || 'belum diambil')}</dd>
        <dt>Selesai / close</dt><dd>${esc(endOf(t) || 'belum selesai')}</dd>
        <dt>Respon</dt><dd>${esc(fmtDur(diffMenit(t.create_date, startOf(t))))} (dibuat → diambil)</dd>
        <dt>Pengerjaan</dt><dd>${esc(fmtDur(diffMenit(startOf(t), endOf(t))))} (diambil → close)</dd>
        <dt>Total</dt><dd>${esc(fmtDur(diffMenit(t.create_date, endOf(t))))} (dibuat → close)</dd>
        <dt>Lokasi</dt><dd>${esc(t.pop_location_id?.[1] || '-')}</dd>
      </dl>

      <h3>Detail</h3>
      <p><strong>${esc(t.name || '')}</strong></p>
      <dl class="kv">
        <dt>Customer</dt><dd>${esc(t.ca_name || t.partner_id?.[1] || '-')} ${t.customer_id ? `(${esc(t.customer_id)})` : ''}</dd>
        <dt>Team / Teknisi</dt><dd>${esc(t.team_id?.[1] || '-')} / ${esc(t.user_id?.[1] || '-')}</dd>
        <dt>Prioritas / Severity</dt><dd>${esc(t.priority || '-')} / ${esc(t.severity || '-')}</dd>
        <dt>Tipe / Channel</dt><dd>${esc(t.ticket_type_id?.[1] || '-')} / ${esc(t.channel_id?.[1] || '-')}</dd>
        <dt>Kategori</dt><dd>${esc(t.ticket_category_id?.[1] || t.category_id?.[1] || '-')} ${t.ticket_sub_category_id ? `/ ${esc(t.ticket_sub_category_id?.[1] || '')}` : ''}</dd>
        <dt>Dibuat / Update</dt><dd>${esc(t.create_date || '')} / ${esc(t.write_date || '')}</dd>
        <dt>Solved / Closed</dt><dd>${esc(t.solved_date || '-')} / ${esc(t.closed_date || '-')}</dd>
        <dt>SLA</dt><dd>${esc(t.sla_type_id?.[1] || '-')} ${t.is_sla_impact ? '(berdampak)' : ''}</dd>
        <dt>Downtime</dt><dd>${esc(t.downtime_start || '-')} → ${esc(t.downtime_end || '-')} (${esc(t.downtime_duration_hours ?? 0)} jam)</dd>
        <dt>Umur tiket</dt><dd>${esc(t.age_ticket ?? '-')} hari ${t.is_gamas ? '· GAMAS' : ''}</dd>
        <dt>Kontak</dt><dd>${esc(t.pic_customer || '-')} ${esc(t.phone_customer || '')} ${esc(t.contact_info || '')}</dd>
        <dt>Tag</dt><dd>${Array.isArray(t.tag_ids) ? esc(t.tag_ids.join(', ')) : '-'}</dd>
        <dt>Lampiran</dt><dd>${esc(t.message_attachment_count ?? 0)}</dd>
      </dl>

      <h3>Deskripsi</h3>
      <pre class="desc">${esc(t.description_text || '-')}</pre>
      ${t.action_description ? `<h3>Action</h3><pre class="desc">${esc(t.action_description)}</pre>` : ''}

      <h3>Update terakhir (${msgs.length})</h3>
      ${msgs.length ? msgs.map((m) => `<div class="msg"><b>${esc(m.author)}</b> <span class="muted">${esc(m.date)}</span><br>${esc(m.text).slice(0, 800)}</div>`).join('') : '<p class="muted">Belum ada log.</p>'}
    `;
  } catch (e) {
    detail.innerHTML = `<p class="muted">Gagal memuat detail: ${esc(e.message)}</p>`;
  }
}

function closeDrawer() { $('drawer').hidden = true; }
$('drawer-close').addEventListener('click', closeDrawer);
$('drawer').addEventListener('click', (e) => { if (e.target?.dataset?.close) closeDrawer(); });

// KPI & L2
async function loadKpi() {
  const team = $('kpi-team').value || '';
  $('kpi-team-label').textContent = team ? ($('kpi-team').selectedOptions[0]?.text || '') : 'semua team';
  try {
    kpi = await api(`/api/kpi-l2${team ? `?team=${encodeURIComponent(team)}` : ''}`);
    $('kpi-cards').innerHTML = `
      <div class="stat"><div class="label">Rata-rata penanganan</div><div class="value">${fmtDur(kpi.avgMenit)}</div><div class="note">ambil → selesai</div></div>
      <div class="stat"><div class="label">Penanganan selesai</div><div class="value">${kpi.selesai}/${kpi.total}</div><div class="note">log selesai / total</div></div>
      <div class="stat"><div class="label">Masih jalan</div><div class="value">${kpi.jalan}</div><div class="note">belum end</div></div>`;
    $('kpi-users').innerHTML = (kpi.users || []).map((u) => `<tr><td>${esc(u.name)}</td><td>${u.total} <span class="muted">(${u.selesai} selesai / ${u.jalan} jalan)</span></td><td>${fmtDur(u.avgMenit)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Belum ada data.</td></tr>';
    $('kpi-acts').innerHTML = (kpi.acts || []).map((a) => `<tr><td>${esc(a.name)}</td><td>${a.total} <span class="muted">(${a.selesai} selesai / ${a.jalan} jalan)</span></td><td>${fmtDur(a.avgMenit)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Belum ada data.</td></tr>';
  } catch (e) {
    $('kpi-cards').innerHTML = `<div class="muted">KPI gagal dimuat: ${esc(e.message)}</div>`;
    $('kpi-users').innerHTML = '';
    $('kpi-acts').innerHTML = '';
  }
  renderStats();
}

function l2Parts(lg) {
  const disp = lg.ticket_id?.[1] || '';
  const cut = disp.indexOf(' - ');
  const num = cut >= 0 ? disp.slice(0, cut) : disp;
  const title = cut >= 0 ? disp.slice(cut + 3) : '';
  const reason = (lg.reason || '').replace(/\s+/g, ' ').trim();
  const notes = [num, title, reason].filter(Boolean).join(' - ');
  return {
    num,
    title,
    reason,
    start: fmtMDY(lg.start_time),
    end: fmtMDY(lg.end_time),
    startDate: fmtDateMDY(lg.start_time),
    startTime: fmtTime12(lg.start_time),
    endDate: fmtDateMDY(lg.end_time),
    endTime: fmtTime12(lg.end_time),
    location: 'Jakarta Area',
    notes,
  };
}

function l2CopyText(lg) {
  const p = l2Parts(lg);
  return [
    `Ticket Number: ${p.num}`,
    `Start Date: ${p.startDate || '-'}`,
    `Start Time: ${p.startTime || '-'}`,
    `End Date: ${p.endDate || '-'}`,
    `End Time: ${p.endTime || '-'}`,
    `Location: ${p.location}`,
    `Notes: ${p.notes || '-'}`,
  ].join('\n');
}

async function copyText(txt, btn) {
  try { await navigator.clipboard.writeText(txt); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  if (btn) { const old = btn.textContent; btn.textContent = 'Disalin'; setTimeout(() => { btn.textContent = old; }, 1200); }
}

const L2_HEAD = ['No Tiket', 'Judul', 'Team', 'Teknisi', 'Aktivitas', 'Mulai (WIB)', 'Selesai (WIB)', 'Durasi (menit)', 'Durasi', 'Alasan', 'Stage Tiket', 'Solved By', 'Solved At (WIB)', 'Closed At (WIB)', 'Submit KPI'];
function l2Rows() {
  const { logs = [], tinfo = {} } = lastL2;
  return [L2_HEAD, ...logs.map((lg) => {
    const disp = lg.ticket_id?.[1] || '';
    const cut = disp.indexOf(' - ');
    const num = cut >= 0 ? disp.slice(0, cut) : disp;
    const title = cut >= 0 ? disp.slice(cut + 3) : '';
    const ti = tinfo[lg.ticket_id?.[0]] || {};
    const dur = diffMenit(lg.start_time, lg.end_time);
    return [num, title, lg.team_id?.[1] || '', lg.user_id?.[1] || '', lg.activity_id?.[1] || '',
      wibStamp(lg.start_time), wibStamp(lg.end_time), dur === null ? '' : dur, dur === null ? 'jalan' : fmtDur(dur), lg.reason || '',
      ti.stage_id?.[1] || (ti.id ? '' : 'luar akses'), ti.solved_by?.[1] || ti.solved_team?.[1] || '', wibStamp(ti.solved_date), wibStamp(ti.closed_date),
      submitted.has(lg.id) ? 'sudah' : 'belum'];
  })];
}

const D365_HEAD = ['Ticket Number', 'Start Date', 'Start Time', 'End Date', 'End Time', 'Location', 'Notes'];
function d365Rows() {
  const { logs = [] } = lastL2;
  const rows = logs
    .filter((lg) => /^HDT/i.test((lg.ticket_id?.[1] || '').split(' - ')[0]) && lg.start_time && lg.end_time)
    .map((lg) => {
      const p = l2Parts(lg);
      return [p.num, p.startDate, p.startTime, p.endDate, p.endTime, p.location, p.notes];
    });
  return [D365_HEAD, ...rows];
}
function csvCell(v) { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function downloadCsv(name, rows) {
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

function fillL2Users(logs) {
  const sel = $('l2-user');
  if (!sel) return;
  const cur = sel.value;
  const names = [...new Set(logs.map((l) => l.user_id?.[1]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  sel.innerHTML = `<option value="">Semua teknisi</option>` + names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

function getL2View() {
  let logs = [...(rawL2.logs || [])];
  const q = ($('l2-q')?.value || '').trim().toLowerCase();
  if (q) {
    logs = logs.filter((lg) => `${lg.ticket_id?.[1] || ''} ${lg.user_id?.[1] || ''} ${lg.reason || ''} ${lg.activity_id?.[1] || ''}`.toLowerCase().includes(q));
  }
  if ($('l2-unsub')?.checked) logs = logs.filter((lg) => !submitted.has(lg.id));
  if ($('l2-hdt')?.checked) logs = logs.filter((lg) => /^HDT/i.test((lg.ticket_id?.[1] || '').split(' - ')[0]));
  const status = $('l2-status')?.value || '';
  if (status === 'done') logs = logs.filter((lg) => !!lg.end_time);
  if (status === 'jalan') logs = logs.filter((lg) => !lg.end_time);
  const user = $('l2-user')?.value || '';
  if (user) logs = logs.filter((lg) => (lg.user_id?.[1] || '') === user);

  const sort = $('l2-sort')?.value || 'mulai_desc';
  const toMs = (s) => (s ? new Date(String(s).replace(' ', 'T') + 'Z').getTime() : NaN);
  const dur = (lg) => diffMenit(lg.start_time, lg.end_time);
  const num = (lg) => ((lg.ticket_id?.[1] || '').split(' - ')[0] || '');
  logs.sort((a, b) => {
    if (sort === 'mulai_asc') return (toMs(a.start_time) || 0) - (toMs(b.start_time) || 0);
    if (sort === 'mulai_desc') return (toMs(b.start_time) || 0) - (toMs(a.start_time) || 0);
    if (sort === 'selesai_desc') return (toMs(b.end_time) || 0) - (toMs(a.end_time) || 0);
    if (sort === 'durasi_desc') return (dur(b) ?? -1) - (dur(a) ?? -1);
    if (sort === 'durasi_asc') return (dur(a) ?? 1e12) - (dur(b) ?? 1e12);
    if (sort === 'tiket_asc') return num(a).localeCompare(num(b));
    return 0;
  });
  return logs;
}

function renderL2() {
  const logs = getL2View();
  lastL2 = { logs, tinfo: rawL2.tinfo || {}, range: rawL2.range || { from: '', to: '' } };
  const box = $('l2-list');
  const info = $('l2-info');
  const done = logs.filter((l) => l.end_time).length;
  const hdtDone = logs.filter((l) => /^HDT/i.test((l.ticket_id?.[1] || '').split(' - ')[0]) && l.end_time).length;
  if (info) info.textContent = `Tampil ${logs.length} log (selesai ${done}, jalan ${logs.length - done}) · HDT selesai ${hdtDone} · ekspor Dynamics hanya HDT yang punya Start & End`;

  if (!logs.length) {
    box.innerHTML = '<tr><td colspan="10" class="muted">Tidak ada log penanganan.</td></tr>';
    return;
  }
  box.innerHTML = logs.map((lg) => {
    const durm = diffMenit(lg.start_time, lg.end_time);
    const doneFlag = submitted.has(lg.id);
    const ti = (rawL2.tinfo || {})[lg.ticket_id?.[0]] || {};
    const bits = [];
    if (ti.create_date) bits.push(`buat ${esc(String(ti.create_date).slice(5, 16))}`);
    if (ti.user_id?.[1] && ti.assigned_date) bits.push(`take ${esc(String(ti.assigned_date).slice(5, 16))}`);
    if (ti.solved_by?.[1] || ti.solved_team?.[1]) bits.push(`solve ${esc(String(ti.solved_date || '').slice(5, 16))}`);
    if (ti.closed_by_l1?.[1]) bits.push(`close ${esc(String(ti.closed_date || '').slice(5, 16))}`);
    const logHtml = bits.length ? bits.map((b) => `<div class="logline">${b}</div>`).join('') : '<span class="muted">-</span>';
    const disp = lg.ticket_id?.[1] || `#${lg.id}`;
    const cut = disp.indexOf(' - ');
    const num = cut >= 0 ? disp.slice(0, cut) : disp;
    const title = cut >= 0 ? disp.slice(cut + 3) : '';
    const reason = lg.reason || '-';
    return `<tr class="${doneFlag ? 'submitted' : ''}">
      <td class="col-tiket">
        <div class="tiket-no">${esc(num)}</div>
        ${title ? `<div class="tiket-title" title="${esc(title)}">${esc(title)}</div>` : ''}
      </td>
      <td class="cell-nowrap">${esc(lg.user_id?.[1] || '-')}</td>
      <td class="cell-nowrap">${esc(lg.activity_id?.[1] || '-')}</td>
      <td class="cell-time">${esc(wibStamp(lg.start_time) || '-')}</td>
      <td class="cell-time">${lg.end_time ? esc(wibStamp(lg.end_time)) : '<span class="status-jalan">jalan…</span>'}</td>
      <td class="cell-durasi">${durm === null ? '<span class="muted">…</span>' : esc(fmtDur(durm))}</td>
      <td class="col-alasan"><div class="reason-text" title="${esc(reason)}">${esc(reason)}</div></td>
      <td class="logcell">${logHtml}</td>
      <td class="cell-aksi"><button class="btn sm" data-cp="${lg.id}">Copy</button></td>
      <td class="cell-aksi"><button class="btn sm ${doneFlag ? 'btn-done' : ''}" data-sub="${lg.id}">${doneFlag ? 'Sudah' : 'Tandai'}</button></td>
    </tr>`;
  }).join('');
  box.querySelectorAll('[data-cp]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const lg = logs.find((x) => String(x.id) === b.dataset.cp);
      if (lg) copyText(l2CopyText(lg), b);
    });
  });
  box.querySelectorAll('[data-sub]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(b.dataset.sub, 10);
      if (submitted.has(id)) submitted.delete(id); else submitted.add(id);
      saveSubmitted();
      renderL2();
    });
  });
}

async function loadL2() {
  const team = $('l2-team').value || '';
  const q = $('l2-q').value.trim();
  const { from, to } = getL2Range();
  const box = $('l2-list');
  box.innerHTML = '<tr><td colspan="10" class="muted">Memuat…</td></tr>';
  try {
    const params = new URLSearchParams({ team, from, to, q });
    const j = await api(`/api/l2?${params}`);
    rawL2 = { logs: j.logs || [], tinfo: j.tinfo || {}, range: { from, to } };
    fillL2Users(rawL2.logs);
    renderL2();
  } catch (e) {
    box.innerHTML = `<tr><td colspan="10" class="muted">Gagal: ${esc(e.message)}</td></tr>`;
    if ($('l2-info')) $('l2-info').textContent = '';
  }
}

// KPI belum diinput (Cibitung FieldOps)
const KM_FROM_DEFAULT = '2026-08-01';
const KM_LOCATION = 'JAKARTA AREA';
let rawKm = { logs: [], baseline: [], done: [], range: { from: '', to: '' } };
let kmLastRows = [];
let kmTeamInit = false;

function ensureKmTeam() {
  if (kmTeamInit) return;
  const sel = $('km-team');
  if (!sel || sel.options.length < 2) return;
  if (!sel.value) {
    const opt = [...sel.options].find((o) => o.value === '17')
      || [...sel.options].find((o) => /cibitung/i.test(o.text) && /field/i.test(o.text));
    if (opt) sel.value = opt.value;
  }
  kmTeamInit = true;
}

const kmToMs = (s) => (s ? new Date(String(s).replace(' ', 'T') + 'Z').getTime() : NaN);

function kmNum(lg) {
  const disp = lg.ticket_id?.[1] || '';
  const m = disp.match(/HDT-\d{4}-\d+/i);
  if (m) return m[0].toUpperCase();
  const cut = disp.indexOf(' - ');
  return (cut >= 0 ? disp.slice(0, cut) : disp).trim().toUpperCase();
}
function kmTitle(lg) {
  const disp = lg.ticket_id?.[1] || '';
  const cut = disp.indexOf(' - ');
  return cut >= 0 ? disp.slice(cut + 3) : '';
}

function kmRows() {
  const q = ($('km-q')?.value || '').trim().toLowerCase();
  const unique = $('km-unique')?.checked !== false;
  const showDone = $('km-show-done')?.checked === true;
  const doneSet = new Set((rawKm.done || []).map((t) => String(t).toUpperCase()));

  const groups = new Map();
  for (const lg of rawKm.logs || []) {
    const num = lg.ticket_no || kmNum(lg);
    if (!num) continue;
    if (!showDone && doneSet.has(num)) continue;
    const key = unique ? num : `log:${lg.id}`;
    let g = groups.get(key);
    if (!g) { g = { id: lg.id, num, logs: [] }; groups.set(key, g); }
    g.logs.push(lg);
  }

  const rows = [...groups.values()].map((g) => {
    const starts = g.logs.filter((l) => l.start_time).sort((a, b) => kmToMs(a.start_time) - kmToMs(b.start_time));
    const ends = g.logs.filter((l) => l.end_time).sort((a, b) => kmToMs(b.end_time) - kmToMs(a.end_time));
    const first = starts[0] || g.logs[0];
    const last = ends[0] || g.logs[0];
    const title = g.logs.map(kmTitle).sort((a, b) => b.length - a.length)[0] || '';
    const reasons = [...new Set(g.logs.map((l) => (l.reason || '').replace(/\s+/g, ' ').trim()).filter(Boolean))];
    const reason = reasons.join(' | ');
    return {
      id: g.id,
      num: g.num,
      title,
      count: g.logs.length,
      start: first.start_time || '',
      end: last.end_time || '',
      startMs: kmToMs(first.start_time),
      endMs: kmToMs(last.end_time),
      reason,
      notes: [g.num, title, reason].filter(Boolean).join(' - '),
      done: doneSet.has(g.num),
    };
  });

  const all = rows;
  const filtered = q ? rows.filter((r) => `${r.num} ${r.title} ${r.reason}`.toLowerCase().includes(q)) : rows;
  const sort = $('km-sort')?.value || 'mulai_asc';
  const dur = (r) => (Number.isFinite(r.startMs) && Number.isFinite(r.endMs) ? r.endMs - r.startMs : null);
  filtered.sort((a, b) => {
    if (sort === 'mulai_desc') return (b.startMs || 0) - (a.startMs || 0);
    if (sort === 'selesai_desc') return (b.endMs || 0) - (a.endMs || 0);
    if (sort === 'durasi_desc') return (dur(b) ?? -1) - (dur(a) ?? -1);
    if (sort === 'durasi_asc') return (dur(a) ?? Infinity) - (dur(b) ?? Infinity);
    if (sort === 'tiket_asc') return a.num.localeCompare(b.num);
    return (a.startMs || 0) - (b.startMs || 0);
  });
  return { rows: filtered, all };
}

function kmParts(r) {
  return {
    num: r.num,
    startDate: fmtDateMDY(r.start),
    startTime: fmtTime12(r.start),
    endDate: fmtDateMDY(r.end),
    endTime: fmtTime12(r.end),
    location: KM_LOCATION,
    notes: r.notes,
  };
}

function d365Text(p) {
  return [
    `Ticket Number: ${p.num}`,
    `Start Date: ${p.startDate || '-'}`,
    `Start Time: ${p.startTime || '-'}`,
    `End Date: ${p.endDate || '-'}`,
    `End Time: ${p.endTime || '-'}`,
    `Location: ${p.location}`,
    `Notes: ${p.notes || '-'}`,
  ].join('\n');
}

function renderKm() {
  const box = $('km-list');
  if (!box) return;
  const { rows, all } = kmRows();
  kmLastRows = rows;

  const nav = $('nav-missing');
  if (nav) {
    nav.textContent = String(all.length);
    nav.hidden = !all.length;
  }
  const info = $('km-info');
  if (info) {
    const logs = (rawKm.logs || []).length;
    info.textContent = `${all.length} tiket belum diinput · ${logs} log HDT · ${(rawKm.baseline || []).length} tiket sudah ada di Dynamics (snapshot) · ${(rawKm.done || []).length} ditandai dari dashboard`;
  }

  if (!rows.length) {
    const note = (rawKm.logs || []).length
      ? 'Tidak ada yang cocok dengan filter.'
      : 'Tidak ada tiket Cibitung yang belum diinput.';
    box.innerHTML = `<tr><td colspan="10" class="muted">${note}</td></tr>`;
    return;
  }

  box.innerHTML = rows.map((r, i) => {
    const durm = Number.isFinite(r.startMs) && Number.isFinite(r.endMs) ? Math.round((r.endMs - r.startMs) / 60000) : null;
    const p = kmParts(r);
    const c = (field, inner, cls = '') =>
      `<td class="${cls}"><div class="cell-copy-wrap">${inner}<button class="btn xs cell-copy-btn" data-kmcopy="${i}:${field}" title="Copy kolom ini">Copy</button></div></td>`;
    return `<tr class="${r.done ? 'submitted' : ''}">
      ${c('num', `<div class="cell-val"><div class="tiket-no">${esc(p.num)}</div>${r.count > 1 ? `<span class="pill-tag">${r.count} log</span>` : ''}</div>`, 'col-tiket')}
      ${c('title', `<div class="cell-val reason-text" title="${esc(r.title || '')}">${esc(r.title || '-')}</div>`, 'col-judul')}
      ${c('startDate', `<span class="cell-val cell-time">${esc(p.startDate || '-')}</span>`, 'col-tgl')}
      ${c('startTime', `<span class="cell-val cell-time">${esc(p.startTime || '-')}</span>`, 'col-jam')}
      ${c('endDate', `<span class="cell-val cell-time">${esc(p.endDate || '-')}</span>`, 'col-tgl')}
      ${c('endTime', `<span class="cell-val cell-time">${esc(p.endTime || '-')}</span>`, 'col-jam')}
      <td class="cell-durasi">${durm === null ? '<span class="muted">…</span>' : esc(fmtDur(durm))}</td>
      ${c('location', `<span class="cell-val cell-nowrap">${esc(p.location || '-')}</span>`, 'col-lokasi')}
      ${c('notes', `<div class="cell-val reason-text" title="${esc(p.notes)}">${esc(p.notes)}</div>`, 'km-notes')}
      <td class="cell-aksi">
        <button class="btn sm ${r.done ? 'btn-done' : ''}" data-kmdone="${esc(r.num)}" data-done="${r.done ? '1' : '0'}">${r.done ? 'Batal' : 'Sudah'}</button>
      </td>
    </tr>`;
  }).join('');

  box.querySelectorAll('[data-kmdone]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      markKm(b.dataset.kmdone, b.dataset.done !== '1');
    });
  });
  box.querySelectorAll('[data-kmcopy]').forEach((td) => {
    td.addEventListener('click', async (e) => {
      e.stopPropagation();
      const [idx, field] = String(td.dataset.kmcopy || '').split(':');
      const r = kmLastRows[parseInt(idx, 10)];
      if (!r) return;
      const p = kmParts(r);
      const val = field === 'title' ? (r.title || '-') : (p[field] ?? '-');
      await copyText(String(val));
      td.classList.add('copied');
      setTimeout(() => td.classList.remove('copied'), 700);
    });
  });
}

async function markKm(num, done) {
  try {
    const res = await fetch('/api/kpi-done', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: num, done }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
    rawKm.done = (j.doneTickets || []).map((t) => String(t).toUpperCase());
    renderKm();
  } catch (e) {
    $('errbar').textContent = `Gagal menandai ${num}: ${e.message}`;
    $('errbar').hidden = false;
  }
}

function kmCsvRows() {
  const { rows } = kmRows();
  const head = ['Ticket Number', 'Start Date', 'Start Time', 'End Date', 'End Time', 'Location', 'Notes'];
  return [head, ...rows.map((r) => {
    const p = kmParts(r);
    return [p.num, p.startDate, p.startTime, p.endDate, p.endTime, p.location, p.notes];
  })];
}

async function loadKpiMissing() {
  const box = $('km-list');
  const team = $('km-team')?.value ?? '17';
  const from = $('km-from')?.value || KM_FROM_DEFAULT;
  const to = $('km-to')?.value || iso(new Date());
  if (box && !(rawKm.logs || []).length) box.innerHTML = '<tr><td colspan="10" class="muted">Memuat…</td></tr>';
  try {
    const params = new URLSearchParams({ team, from, to });
    const j = await api(`/api/kpi-missing?${params}`);
    rawKm = {
      logs: j.logs || [],
      baseline: j.baseline || [],
      done: (j.done || []).map((t) => String(t).toUpperCase()),
      range: { from, to },
    };
    renderKm();
    if ($('km-sync')) $('km-sync').textContent = `dimuat ${new Date().toLocaleTimeString('id-ID')} · ${from} s/d ${to}`;
  } catch (e) {
    if (box) box.innerHTML = `<tr><td colspan="10" class="muted">Gagal memuat: ${esc(e.message)}</td></tr>`;
    if ($('km-sync')) $('km-sync').textContent = 'gagal memuat';
  }
}

// Events
$('btn-refresh').addEventListener('click', () => refreshAll(true));
['f-stage', 'f-team', 'f-channel'].forEach((id) => $(id).addEventListener('change', () => { loadTickets(); loadKpi(); loadStats(); }));
let qT;
$('f-q').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(loadTickets, 300); });

$('l2-team').addEventListener('change', loadL2);
$('l2-from').addEventListener('change', loadL2);
$('l2-to').addEventListener('change', loadL2);
$('l2-unsub').addEventListener('change', renderL2);
$('l2-hdt').addEventListener('change', renderL2);
$('l2-status').addEventListener('change', renderL2);
$('l2-user').addEventListener('change', renderL2);
$('l2-sort').addEventListener('change', renderL2);
let l2T;
$('l2-q').addEventListener('input', () => { clearTimeout(l2T); l2T = setTimeout(loadL2, 300); });
$('l2-today').addEventListener('click', () => { const d = iso(new Date()); $('l2-from').value = d; $('l2-to').value = d; loadL2(); });
$('l2-7d').addEventListener('click', () => { const t = new Date(); const f = new Date(); f.setDate(t.getDate() - 6); $('l2-from').value = iso(f); $('l2-to').value = iso(t); loadL2(); });
$('l2-30d').addEventListener('click', () => { const t = new Date(); const f = new Date(); f.setDate(t.getDate() - 29); $('l2-from').value = iso(f); $('l2-to').value = iso(t); loadL2(); });
$('l2-aug').addEventListener('click', () => {
  $('l2-from').value = '2026-08-01';
  $('l2-to').value = iso(new Date());
  const teamSel = $('l2-team');
  if (teamSel && [...teamSel.options].some((o) => o.value === '17')) teamSel.value = '17';
  if ($('l2-hdt')) $('l2-hdt').checked = true;
  if ($('l2-status')) $('l2-status').value = 'done';
  loadL2();
});

document.querySelectorAll('#page-penanganan th.sortable').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    const sel = $('l2-sort');
    if (!sel) return;
    if (sel.value === key) {
      const toggles = {
        mulai_desc: 'mulai_asc', mulai_asc: 'mulai_desc',
        selesai_desc: 'mulai_desc',
        durasi_desc: 'durasi_asc', durasi_asc: 'durasi_desc',
        tiket_asc: 'mulai_desc',
      };
      sel.value = toggles[key] || key;
    } else {
      sel.value = key;
    }
    renderL2();
  });
});

$('km-team').addEventListener('change', loadKpiMissing);
$('km-from').addEventListener('change', loadKpiMissing);
$('km-to').addEventListener('change', loadKpiMissing);
$('km-sort').addEventListener('change', renderKm);
$('km-unique').addEventListener('change', renderKm);
$('km-show-done').addEventListener('change', renderKm);
let kmT;
$('km-q').addEventListener('input', () => { clearTimeout(kmT); kmT = setTimeout(renderKm, 200); });

document.querySelectorAll('#page-kpi-missing th.sortable').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.kmsort;
    const sel = $('km-sort');
    if (!sel) return;
    if (sel.value === key) {
      const toggles = {
        tiket_asc: 'mulai_asc',
        mulai_asc: 'mulai_desc', mulai_desc: 'mulai_asc',
        selesai_desc: 'mulai_asc',
        durasi_desc: 'durasi_asc', durasi_asc: 'durasi_desc',
      };
      sel.value = toggles[key] || 'mulai_asc';
    } else {
      sel.value = key;
    }
    renderKm();
  });
});

$('km-copy').addEventListener('click', () => {
  const rows = kmCsvRows();
  if (rows.length < 2) return;
  copyText(rows.map((r) => r.join('\t')).join('\n'), $('km-copy'));
});
$('km-csv').addEventListener('click', () => {
  const rows = kmCsvRows();
  if (rows.length < 2) return;
  const r = rawKm.range;
  downloadCsv(`kpi-belum-diinput_${r.from}_sd_${r.to}.csv`, rows);
});

$('l2-csv').addEventListener('click', () => {
  const rows = l2Rows();
  if (rows.length < 2) return;
  const r = lastL2.range;
  downloadCsv(`log-penanganan_${r.from}_sd_${r.to}.csv`, rows);
});
$('l2-copyall').addEventListener('click', () => {
  const rows = l2Rows();
  if (rows.length < 2) return;
  copyText(rows.map((r) => r.join('\t')).join('\n'), $('l2-copyall'));
});
$('l2-csv-d365')?.addEventListener('click', () => {
  const rows = d365Rows();
  if (rows.length < 2) return;
  const r = lastL2.range;
  downloadCsv(`dynamics-gangguan_${r.from}_sd_${r.to}.csv`, rows);
});
$('l2-copy-d365')?.addEventListener('click', () => {
  const rows = d365Rows();
  if (rows.length < 2) return;
  copyText(rows.map((r) => r.join('\t')).join('\n'), $('l2-copy-d365'));
});
$('kpi-team').addEventListener('change', loadKpi);

async function refreshAll(manual) {
  $('errbar').hidden = true;
  try {
    if (manual) await api('/api/refresh');
    await loadMeta();
    await Promise.all([loadOpen(), loadTickets(), loadStats(), loadL2(), loadKpi(), loadKpiMissing()]);
    const h = await api('/api/health');
    $('sync-state').textContent = h.ok ? `tersambung · ${new Date(h.cachedAt || Date.now()).toLocaleTimeString('id-ID')}` : `putus: ${h.err || ''}`;
    $('sync-state').style.color = h.ok ? '' : 'var(--amber)';
  } catch (e) {
    $('errbar').textContent = `${e.message} (data lama mungkin masih ditampilkan)`;
    $('errbar').hidden = false;
    $('sync-state').textContent = 'gagal menyambung';
    $('sync-state').style.color = 'var(--amber)';
  }
}

(async () => {
  const r0 = rangeDefault();
  $('l2-from').value = r0.from;
  $('l2-to').value = r0.to;
  $('km-from').value = KM_FROM_DEFAULT;
  $('km-to').value = iso(new Date());
  $('brand-sub').textContent = 'Ridwan · memuat…';
  await refreshAll(false);
  $('brand-sub').textContent = 'Ridwan · Semua tiket (read-only)';
  setInterval(() => refreshAll(false), 60000);
})();
