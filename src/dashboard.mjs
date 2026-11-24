import { OdooError } from './odoo.mjs';

function contains(value, needle) {
  return String(value ?? '').toLowerCase().includes(needle.toLowerCase());
}

// Validate that the API key really belongs to the allowed person before any
// business data is read. If the identity does not match, the app refuses to
// serve a dashboard.
export async function resolveAccount(client, config) {
  const uid = await client.authenticate();

  const [user] = await client.read('res.users', 'read', [[uid]], {
    fields: ['id', 'name', 'login', 'email', 'employee_id', 'department_id', 'company_id'],
  });

  if (!user) {
    throw new OdooError('Akun Odoo tidak ditemukan untuk API key ini');
  }

  let employee = null;
  if (user.employee_id?.[0]) {
    const [record] = await client.read('hr.employee', 'read', [[user.employee_id[0]]], {
      fields: ['id', 'name', 'job_title', 'department_id', 'parent_id', 'work_email', 'company_id'],
    });
    employee = record ?? null;
  }

  const identityText = [user.name, employee?.name, employee?.job_title, user.department_id?.[1]]
    .filter(Boolean)
    .join(' | ');

  if (!contains(identityText, config.account.nameContains)) {
    throw new OdooError(
      `API key ini bukan milik akun ${config.account.nameContains}. Ditemukan: ${identityText || user.login}. Dashboard dihentikan.`,
    );
  }

  const unitVerified = contains(identityText, config.account.unitContains);

  return {
    user: {
      id: user.id,
      name: user.name,
      login: user.login,
      email: user.email ?? null,
    },
    employee: employee
      ? {
          id: employee.id,
          name: employee.name,
          jobTitle: employee.job_title ?? null,
          department: employee.department_id?.[1] ?? null,
        }
      : null,
    company: user.company_id?.[1] ?? null,
    scope: {
      person: config.account.nameContains,
      unit: config.account.unitContains,
      unitVerified,
    },
    fetchedAt: new Date().toISOString(),
  };
}

const DAY = 24 * 60 * 60 * 1000;
const TZ = 'Asia/Jakarta';

const dayKeyFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function dayKey(date) {
  return dayKeyFormat.format(date);
}

function jakartaMidnight(now) {
  return new Date(`${dayKey(now)}T00:00:00+07:00`);
}

function toOdooUtc(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function priorityLabel(fields, value) {
  const selection = fields.priority?.selection ?? [];
  const pair = selection.find(([key]) => key === value);
  return pair ? pair[1] : null;
}

function emptyDashboard(account) {
  return {
    account,
    generatedAt: new Date().toISOString(),
    source: { model: 'helpdesk.ticket', available: false },
    totals: { open: 0, late: 0, dueToday: 0, closedThisMonth: 0, total: 0 },
    stages: [],
    priorities: [],
    daily: [],
    queue: [],
    attention: [],
  };
}

export async function buildDashboard(client, account, range = '30d') {
  let fields;
  try {
    fields = await client.read('helpdesk.ticket', 'fields_get', [], {
      attributes: ['string', 'type', 'selection'],
    });
  } catch (error) {
    if (error instanceof OdooError) {
      return { ...emptyDashboard(account), note: error.message };
    }
    throw error;
  }

  const wanted = [
    'id',
    'name',
    'number',
    'stage_id',
    'priority',
    'partner_id',
    'partner_name',
    'team_id',
    'user_id',
    'create_date',
    'write_date',
    'date_deadline',
    'sla_deadline',
    'kanban_state',
  ].filter((field) => field in fields);

  const stagesRaw = await client.read('helpdesk.ticket.stage', 'search_read', [[]], {
    fields: ['id', 'name', 'sequence', 'fold'],
    order: 'sequence asc',
    limit: 100,
  }).catch(() => []);

  const stageById = new Map(stagesRaw.map((stage) => [stage.id, stage]));

  const now = new Date();
  const windowDays = range === '7d' ? 7 : range === '90d' ? 90 : 30;
  const todayStart = jakartaMidnight(now);
  const windowStart = new Date(todayStart.getTime() - (windowDays - 1) * DAY);
  const monthStart = new Date(`${dayKey(now).slice(0, 7)}-01T00:00:00+07:00`);

  // Scope: semua tiket yang akun ini boleh lihat di Odoo (sama seperti helpdesk-lokal).
  const baseDomain = [];

  const [openRecords, closedThisMonth, createdRecords] = await Promise.all([
    client.searchRead('helpdesk.ticket', [...baseDomain, ['stage_id.fold', '=', false]], wanted, {
      order: 'write_date desc',
      limit: 1000,
    }),
    client.searchCount('helpdesk.ticket', [
      ...baseDomain,
      ['stage_id.fold', '=', true],
      ['write_date', '>=', toOdooUtc(monthStart)],
    ]),
    client.searchRead('helpdesk.ticket', [...baseDomain, ['create_date', '>=', toOdooUtc(windowStart)]], ['create_date'], {
      limit: 5000,
    }),
  ]);

  const normalize = (record) => {
    const stage = stageById.get(record.stage_id?.[0]) ?? null;
    const deadline = record.sla_deadline || record.date_deadline || null;
    const deadlineDate = deadline ? new Date(`${deadline.replace(' ', 'T')}Z`) : null;
    const late = Boolean(deadlineDate && deadlineDate < now && !stage?.fold);
    const number = record.number && String(record.number).trim() ? String(record.number).trim() : null;
    return {
      id: record.id,
      ref: number ?? `#${record.id}`,
      subject: record.name ?? '(tanpa judul)',
      customer: record.partner_id?.[1] ?? record.partner_name ?? null,
      customerEmail: record.partner_email ?? null,
      stage: stage?.name ?? record.stage_id?.[1] ?? 'Tanpa tahap',
      stageId: stage?.id ?? record.stage_id?.[0] ?? null,
      priority: priorityLabel(fields, record.priority),
      team: record.team_id?.[1] ?? null,
      assignee: record.user_id?.[1] ?? null,
      createdAt: record.create_date ?? null,
      updatedAt: record.write_date ?? null,
      deadline,
      deadlineDate: deadlineDate ? deadlineDate.toISOString() : null,
      late,
      kanban: record.kanban_state ?? null,
    };
  };

  const open = openRecords.map(normalize);

  const stageCounts = new Map();
  for (const ticket of open) {
    stageCounts.set(ticket.stage, (stageCounts.get(ticket.stage) ?? 0) + 1);
  }

  const priorityCounts = new Map();
  for (const ticket of open) {
    const key = ticket.priority ?? 'Normal';
    priorityCounts.set(key, (priorityCounts.get(key) ?? 0) + 1);
  }

  const dailyMap = new Map();
  for (let index = 0; index < windowDays; index += 1) {
    dailyMap.set(dayKey(new Date(windowStart.getTime() + index * DAY)), 0);
  }
  for (const record of createdRecords) {
    const created = record.create_date ? new Date(`${record.create_date.replace(' ', 'T')}Z`) : null;
    if (!created) continue;
    const key = dayKey(created);
    if (dailyMap.has(key)) dailyMap.set(key, dailyMap.get(key) + 1);
  }

  const today = dayKey(now);
  const dueToday = open.filter((ticket) => {
    if (!ticket.deadlineDate) return false;
    return dayKey(new Date(ticket.deadlineDate)) === today;
  }).length;
  const attention = [...open]
    .filter((ticket) => ticket.late || ticket.deadlineDate)
    .sort((a, b) => {
      if (a.late !== b.late) return a.late ? -1 : 1;
      return String(a.deadlineDate ?? '9999').localeCompare(String(b.deadlineDate ?? '9999'));
    })
    .slice(0, 6);

  return {
    account,
    generatedAt: new Date().toISOString(),
    source: {
      model: 'helpdesk.ticket',
      available: true,
      fields: wanted,
      stages: stagesRaw.map((stage) => ({ id: stage.id, name: stage.name, fold: stage.fold })),
      team: null,
      scope: 'all',
    },
    window: { days: windowDays, from: dayKey(windowStart), to: today },
    totals: {
      open: open.length,
      late: open.filter((ticket) => ticket.late).length,
      dueToday,
      closedThisMonth,
      total: open.length + closedThisMonth,
    },
    stages: [...stageCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    priorities: [...priorityCounts.entries()].map(([name, count]) => ({ name, count })),
    daily: [...dailyMap.entries()].map(([date, count]) => ({ date, count })),
    queue: open
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 100),
    attention,
  };
}
