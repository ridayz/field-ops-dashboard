import { createClient } from './odoo.mjs';
import { loadConfig } from './config.mjs';
import { loadKpiState } from './kpi-state.mjs';

const TICKET_LIST_FIELDS = [
  'id', 'number', 'name', 'priority', 'severity', 'stage_id', 'team_id',
  'user_id', 'partner_id', 'customer_id', 'ca_name', 'create_date', 'write_date', 'last_stage_update',
  'channel_id', 'ticket_type_id', 'is_gamas', 'age_ticket',
  'assigned_date', 'in_progress_date', 'solved_date', 'closed_date',
  'ticket_duration', 'solved_duration', 'progress_duration', 'pop_location_id',
];

const TICKET_DETAIL_FIELDS = [
  ...TICKET_LIST_FIELDS,
  'description', 'phone_customer', 'pic_customer',
  'contact_info', 'ca_id', 'solved_by', 'solved_team',
  'sla_type_id', 'is_sla_impact', 'downtime_start', 'downtime_end', 'downtime_duration_hours',
  'ticket_category_id', 'ticket_sub_category_id', 'category_id', 'tag_ids', 'kanban_state',
  'parent_ticket_id', 'action_description', 'message_attachment_count',
];

function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function ticketNo(display) {
  const m = String(display || '').match(/HDT-\d{4}-\d+/i);
  if (m) return m[0].toUpperCase();
  const disp = String(display || '');
  const cut = disp.indexOf(' - ');
  return (cut >= 0 ? disp.slice(0, cut) : disp).trim().toUpperCase();
}

function dateRange(field, from, to) {
  const f = field || 'create_date';
  const d = [];
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) d.push([f, '>=', from]);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const t = new Date(`${to}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + 1);
    d.push([f, '<', t.toISOString().slice(0, 10)]);
  }
  return d;
}

export async function createHelpdeskApi() {
  const config = loadConfig();
  const client = createClient(config);

  let uid = null;
  let odooOk = false;
  let odooErr = 'belum dicek';

  async function ensureAuth() {
    if (uid) return uid;
    uid = await client.authenticate();
    return uid;
  }

  async function kw(model, method, args = [], kwargs = {}) {
    await ensureAuth();
    return client.read(model, method, args, kwargs);
  }

  let cache = { at: 0, meta: null, latest: [], open: [] };
  let numCache = { at: 0, rows: [] };
  let l2Cache = { at: 0, rows: [] };
  let kpiCache = { key: '', at: 0, rows: [] };
  const pollMs = 60000;

  async function ticketIdsByNumber(q) {
    if (Date.now() - numCache.at > 60000) {
      numCache = {
        at: Date.now(),
        rows: await kw('helpdesk.ticket', 'search_read', [[], ['id', 'number']], { limit: 5000 }),
      };
    }
    const ql = String(q || '').toLowerCase();
    if (!ql) return numCache.rows.map((t) => t.id);
    return numCache.rows.filter((t) => String(t.number || '').toLowerCase().includes(ql)).map((t) => t.id);
  }

  async function ticketQDomain(q) {
    const ids = await ticketIdsByNumber(q);
    return [
      '|', ['id', 'in', ids.length ? ids : [0]],
      '|', '|', '|',
      ['name', 'ilike', q],
      ['number', 'ilike', q],
      ['customer_id', 'ilike', q],
      ['ca_name', 'ilike', q],
    ];
  }

  async function recentL2() {
    if (Date.now() - l2Cache.at > 60000) {
      l2Cache = {
        at: Date.now(),
        rows: await kw(
          'helpdesk.ticket.l2',
          'search_read',
          [[], ['id', 'ticket_id', 'team_id', 'user_id', 'start_time', 'end_time', 'activity_id', 'reason', 'create_date']],
          { order: 'create_date desc', limit: 1500 },
        ),
      };
    }
    return l2Cache.rows;
  }

  async function refreshCache() {
    await ensureAuth();
    const [stages, teams, channels, total, openCount, byStage, open, latest] = await Promise.all([
      kw('helpdesk.ticket.stage', 'search_read', [[], ['id', 'name', 'sequence']], { order: 'sequence' }).catch(() => []),
      kw('helpdesk.ticket.team', 'search_read', [[], ['id', 'name']], {}).catch(() => []),
      kw('helpdesk.ticket.channel', 'search_read', [[], ['id', 'name']], {}).catch(() => []),
      kw('helpdesk.ticket', 'search_count', [[]]).catch(() => 0),
      kw('helpdesk.ticket', 'search_count', [[['stage_id.name', 'not in', ['Closed', 'Solved', 'Cancelled']]]]).catch(() => 0),
      kw('helpdesk.ticket', 'read_group', [[], ['stage_id']], { groupby: ['stage_id'], lazy: false }).catch(() => []),
      kw(
        'helpdesk.ticket',
        'search_read',
        [[['stage_id.name', 'not in', ['Closed', 'Solved', 'Cancelled']]], TICKET_LIST_FIELDS],
        { order: 'write_date desc', limit: 2000 },
      ).catch(() => []),
      kw('helpdesk.ticket', 'search_read', [[], TICKET_LIST_FIELDS], { order: 'write_date desc', limit: 2000 }).catch(() => []),
    ]);

    cache = {
      at: Date.now(),
      meta: { stages, teams, channels, total, openCount, byStage },
      latest,
      open,
    };
    odooOk = true;
    odooErr = '';
  }

  async function ensureCache() {
    if (!cache.at || Date.now() - cache.at > pollMs) await refreshCache();
    return cache;
  }

  async function health() {
    try {
      await ensureCache();
      return { ok: odooOk, err: odooErr, cachedAt: cache.at, pollMs };
    } catch (e) {
      odooOk = false;
      odooErr = e.message;
      return { ok: false, err: odooErr, cachedAt: cache.at, pollMs };
    }
  }

  async function meta() {
    const c = await ensureCache();
    return { ...c.meta, cachedAt: c.at };
  }

  async function tickets(params) {
    const c = await ensureCache();
    let list = params.scope === 'open' ? c.open : c.latest;
    const { stage, team, channel, q } = params;
    if (stage) list = list.filter((t) => String(t.stage_id?.[0]) === String(stage));
    if (team) list = list.filter((t) => String(t.team_id?.[0]) === String(team));
    if (channel) list = list.filter((t) => String(t.channel_id?.[0]) === String(channel));
    if (q) {
      const ql = String(q).toLowerCase();
      list = list.filter((t) => `${t.number} ${t.name} ${t.customer_id || ''} ${t.ca_name || ''}`.toLowerCase().includes(ql));
    }
    return { tickets: list, cachedAt: c.at };
  }

  async function ticketsExtra(params) {
    const q = String(params.q || '').trim().toLowerCase();
    const team = params.team;
    const recent = await recentL2();
    const seen = new Map();
    for (const r of recent) {
      const tid = r.ticket_id?.[0];
      if (!tid) continue;
      const cd = r.create_date || '';
      const cur = seen.get(tid);
      if (!cur || cd > cur.last) {
        seen.set(tid, {
          id: tid,
          disp: r.ticket_id?.[1] || `#${tid}`,
          team: r.team_id?.[1] || '-',
          teamId: r.team_id?.[0] || null,
          by: r.user_id?.[1] || '-',
          last: cd,
        });
      }
    }
    const readable = new Set(await ticketIdsByNumber(''));
    let extra = [...seen.values()].filter((t) => !readable.has(t.id));
    if (team) extra = extra.filter((t) => String(t.teamId) === String(team));
    if (q) extra = extra.filter((t) => t.disp.toLowerCase().includes(q));
    extra.sort((a, b) => (a.last < b.last ? 1 : -1));
    const out = extra.slice(0, 500).map((t) => {
      const i = t.disp.indexOf(' - ');
      return {
        id: t.id,
        number: i >= 0 ? t.disp.slice(0, i) : t.disp,
        name: i >= 0 ? t.disp.slice(i + 3) : '',
        team: t.team,
        teamId: t.teamId,
        by: t.by,
        last: t.last,
      };
    });
    return { tickets: out, total: extra.length, live: true };
  }

  async function search(params) {
    const q = String(params.q || '').trim();
    const team = params.team;
    const stage = params.stage;
    const ch = params.channel;
    const domain = dateRange('', params.from, params.to);
    if (team) domain.push(['team_id', '=', parseInt(team, 10)]);
    if (stage) domain.push(['stage_id', '=', parseInt(stage, 10)]);
    if (ch) domain.push(['channel_id', '=', parseInt(ch, 10)]);
    if (q) domain.push(...(await ticketQDomain(q)));
    const list = await kw('helpdesk.ticket', 'search_read', [domain, TICKET_LIST_FIELDS], { order: 'write_date desc', limit: 30 });
    return { tickets: list, live: true };
  }

  async function ticketDetail(id) {
    const det = await kw('helpdesk.ticket', 'search_read', [[['id', '=', id]], TICKET_DETAIL_FIELDS], {});
    if (!det?.length) return { error: 'tiket tidak ditemukan', status: 404 };
    const t = det[0];
    t.description_text = stripHtml(t.description);
    let messages = [];
    try {
      const msgs = await kw(
        'mail.message',
        'search_read',
        [[['model', '=', 'helpdesk.ticket'], ['res_id', '=', t.id]], ['id', 'author_id', 'date', 'body', 'message_type']],
        { order: 'date desc', limit: 10 },
      );
      messages = (msgs || []).map((mm) => ({
        id: mm.id,
        author: mm.author_id?.[1] || '',
        date: mm.date,
        type: mm.message_type,
        text: stripHtml(mm.body).slice(0, 2000),
      }));
    } catch {
      messages = [];
    }
    return { ticket: t, messages };
  }

  async function stats(params) {
    const days = Math.min(parseInt(params.days || '14', 10) || 14, 60);
    const team = params.team;
    const keys = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      keys.push(d.toISOString().slice(0, 10));
    }
    const list = await kw('helpdesk.ticket', 'search_read', [[], ['id', 'create_date', 'stage_id']], { limit: 5000 });
    const byDay = keys.map((k) => ({ date: k, total: 0, open: 0 }));
    const idx = Object.fromEntries(keys.map((k, i) => [k, i]));
    for (const t of list) {
      const k = String(t.create_date || '').slice(0, 10);
      if (k in idx) {
        byDay[idx[k]].total += 1;
        const st = t.stage_id?.[1] || '';
        if (!['Closed', 'Solved', 'Cancelled'].includes(st)) byDay[idx[k]].open += 1;
      }
    }
    const l2dom = team ? [['team_id', '=', parseInt(team, 10)]] : [];
    let logs = [];
    try {
      logs = await kw('helpdesk.ticket.l2', 'search_read', [l2dom, ['id', 'create_date', 'end_time']], { order: 'create_date desc', limit: 3000 });
    } catch {
      logs = [];
    }
    const l2ByDay = keys.map((k) => ({ date: k, total: 0, done: 0 }));
    for (const l of logs) {
      const k = String(l.create_date || '').slice(0, 10);
      if (k in idx) {
        l2ByDay[idx[k]].total += 1;
        if (l.end_time) l2ByDay[idx[k]].done += 1;
      }
    }
    return { byDay, l2ByDay, l2Sampled: logs.length };
  }

  async function l2(params) {
    const team = params.team;
    const q = String(params.q || '').trim();
    const LF = ['id', 'ticket_id', 'team_id', 'user_id', 'start_time', 'end_time', 'activity_id', 'reason', 'create_date'];

    if (q) {
      const recent = await recentL2();
      const ql = q.toLowerCase();
      const { from, to } = params;
      const byLocal = recent.filter(
        (r) =>
          (!team || String(r.team_id?.[0]) === String(team)) &&
          (!from || String(r.create_date || '') >= from) &&
          (!to || String(r.create_date || '') <= to) &&
          `${r.ticket_id?.[1] || ''} ${r.user_id?.[1] || ''} ${r.reason || ''} ${r.activity_id?.[1] || ''}`
            .toLowerCase()
            .includes(ql),
      );
      const qd = await ticketQDomain(q);
      const tids = await kw('helpdesk.ticket', 'search_read', [qd], { fields: ['id'], limit: 500 }).then((rows) => rows.map((r) => r.id)).catch(() => []);
      let byTicket = [];
      if (tids.length) {
        const d2 = dateRange('', from, to);
        if (team) d2.push(['team_id', '=', parseInt(team, 10)]);
        d2.push(['ticket_id', 'in', tids]);
        byTicket = await kw('helpdesk.ticket.l2', 'search_read', [d2, LF], { order: 'create_date desc', limit: 30 }).catch(() => []);
      }
      const seenIds = new Set();
      const logs = [...byLocal, ...byTicket].filter((r) => !seenIds.has(r.id) && seenIds.add(r.id)).slice(0, 30);
      const etids = [...new Set(logs.map((r) => r.ticket_id?.[0]).filter(Boolean))];
      let tinfo = {};
      if (etids.length) {
        try {
          const rows = await kw(
            'helpdesk.ticket',
            'search_read',
            [[['id', 'in', etids]], ['id', 'number', 'stage_id', 'create_date', 'create_uid', 'write_date', 'write_uid', 'assigned_date', 'user_id', 'solved_date', 'solved_by', 'solved_team', 'closed_date', 'closed_by_l1']],
            {},
          );
          tinfo = Object.fromEntries(rows.map((t) => [t.id, t]));
        } catch {
          tinfo = {};
        }
      }
      return { logs, tinfo, live: true };
    }

    const domain = dateRange('', params.from, params.to);
    if (team) domain.push(['team_id', '=', parseInt(team, 10)]);
    if (params.jalan === '1') domain.push(['end_time', '=', false]);
    let lim = parseInt(params.limit || '30', 10);
    if (!lim || lim < 1) lim = 30;
    if (lim > 500) lim = 500;
    const logs = await kw('helpdesk.ticket.l2', 'search_read', [domain, LF], { order: 'create_date desc', limit: lim });
    const tids2 = [...new Set(logs.map((r) => r.ticket_id?.[0]).filter(Boolean))];
    let tinfo2 = {};
    if (tids2.length) {
      try {
        const rows2 = await kw(
          'helpdesk.ticket',
          'search_read',
          [[['id', 'in', tids2]], ['id', 'number', 'stage_id', 'create_date', 'create_uid', 'write_date', 'write_uid', 'assigned_date', 'user_id', 'solved_date', 'solved_by', 'solved_team', 'closed_date', 'closed_by_l1']],
          {},
        );
        tinfo2 = Object.fromEntries(rows2.map((t) => [t.id, t]));
      } catch {
        tinfo2 = {};
      }
    }
    return { logs, tinfo: tinfo2, live: true };
  }

  async function kpiL2(params) {
    const team = params.team;
    const domain = [];
    if (team) domain.push(['team_id', '=', parseInt(team, 10)]);
    let rows = [];
    try {
      rows = await kw(
        'helpdesk.ticket.l2',
        'search_read',
        [domain, ['id', 'user_id', 'start_time', 'end_time', 'activity_id']],
        { order: 'create_date desc', limit: 2000 },
      );
    } catch {
      rows = [];
    }
    const mins = (a, b) => {
      if (!a || !b) return null;
      const d = (new Date(`${String(b).replace(' ', 'T')}Z`) - new Date(`${String(a).replace(' ', 'T')}Z`)) / 60000;
      return d >= 0 && d < 43200 ? Math.round(d) : null;
    };
    const avg = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
    const now = Date.now();
    const durs = [];
    const byUser = {};
    const byAct = {};
    let jalan = 0;
    for (const r of rows) {
      const d = mins(r.start_time, r.end_time);
      let eff = null;
      if (d !== null) {
        eff = d;
        durs.push(d);
      } else {
        jalan += 1;
        if (r.start_time) {
          const m = Math.round((now - new Date(`${String(r.start_time).replace(' ', 'T')}Z`).getTime()) / 60000);
          if (m >= 0 && m < 43200) eff = m;
        }
      }
      const un = r.user_id?.[1] || 'Tanpa nama';
      byUser[un] = byUser[un] || { n: 0, done: 0, durs: [] };
      byUser[un].n += 1;
      if (d !== null) byUser[un].done += 1;
      if (eff !== null) byUser[un].durs.push(eff);

      const an = r.activity_id?.[1] || 'Lainnya';
      byAct[an] = byAct[an] || { n: 0, done: 0, durs: [] };
      byAct[an].n += 1;
      if (d !== null) byAct[an].done += 1;
      if (eff !== null) byAct[an].durs.push(eff);
    }
    const users = Object.entries(byUser)
      .map(([name, v]) => ({ name, total: v.n, selesai: v.done, jalan: v.n - v.done, avgMenit: avg(v.durs) }))
      .sort((a, b) => b.total - a.total);
    const acts = Object.entries(byAct)
      .map(([name, v]) => ({ name, total: v.n, selesai: v.done, jalan: v.n - v.done, avgMenit: avg(v.durs) }))
      .sort((a, b) => b.total - a.total);
    return { total: rows.length, selesai: durs.length, jalan, avgMenit: avg(durs), users, acts };
  }

  async function kpiMissing(params) {
    const team = params.team === '' ? '' : (params.team || '17');
    const from = /^\d{4}-\d{2}-\d{2}$/.test(params.from || '') ? params.from : '2026-08-01';
    const to = /^\d{4}-\d{2}-\d{2}$/.test(params.to || '') ? params.to : new Date().toISOString().slice(0, 10);
    const key = `${team}|${from}|${to}`;
    if (kpiCache.key !== key || Date.now() - kpiCache.at > pollMs) {
      const domain = dateRange('', from, to);
      if (team) domain.push(['team_id', '=', parseInt(team, 10)]);
      const rows = await kw(
        'helpdesk.ticket.l2',
        'search_read',
        [domain, ['id', 'ticket_id', 'team_id', 'user_id', 'start_time', 'end_time', 'activity_id', 'reason', 'create_date']],
        { order: 'start_time asc', limit: 500 },
      );
      kpiCache = { key, at: Date.now(), rows };
    }
    const state = await loadKpiState();
    const logs = kpiCache.rows
      .filter((r) => {
        const num = ticketNo(r.ticket_id?.[1]);
        if (!/^HDT-\d{4}-\d+$/.test(num)) return false;
        if (!r.start_time || !r.end_time) return false;
        return !state.baseline.has(num);
      })
      .map((r) => ({ ...r, ticket_no: ticketNo(r.ticket_id?.[1]) }));
    return {
      team,
      range: { from, to },
      logs,
      baseline: [...state.baseline].sort(),
      done: [...state.done].sort(),
      cachedAt: kpiCache.at,
      live: true,
    };
  }

  return {
    config,
    client,
    ensureAuth,
    health,
    meta,
    tickets,
    ticketsExtra,
    search,
    ticketDetail,
    refreshCache,
    stats,
    l2,
    kpiL2,
    kpiMissing,
  };
}
