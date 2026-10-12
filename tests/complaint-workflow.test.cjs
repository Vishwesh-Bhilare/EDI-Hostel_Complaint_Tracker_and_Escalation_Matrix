const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sqlDate = date => {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};
const hoursFromNow = hours => sqlDate(new Date(Date.now() + hours * 3600000));
function complaint(id, extra = {}) {
  return { id, title: `Tap report ${id}`, category: 'Cleanliness/Hygiene', severity: 'Medium',
    manual_severity: null, description: 'Please clean the shared washroom.', status: 'Pending',
    student_id: 1, hostel_block: 'Devgiri Boys Hostel', assigned_to: null, escalation_level: 0,
    created_at: hoursFromNow(-0.1), response_due_at: hoursFromNow(3),
    authority_response_due_at: hoursFromNow(3), authority_acknowledged: 0,
    resolution_due_at: hoursFromNow(12), final_due_at: hoursFromNow(24), ...extra };
}

function harness(complaints = [], escalations = []) {
  const roles = ['student', 'student', 'warden', 'chief_warden', 'college_authority', 'principal', 'maintenance'];
  const tables = { complaints: structuredClone(complaints), escalations: structuredClone(escalations),
    users: roles.map((role, i) => ({ id: i + 1, name: `User ${i + 1}`, role,
      email: `user${i + 1}@replace-me.hostelcare.local`, block: 'Devgiri Boys Hostel' })),
    pending_registrations: [], complaint_history: [], notifications: [] };
  const calls = [];
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => String(row[key]) === String(value));
  const API = {
    async snapshot(includeAccounts = false) {
      calls.push({ action: 'snapshot', includeAccounts });
      const names = includeAccounts ? Object.keys(tables) : ['complaints', 'complaint_history', 'escalations'];
      return { status: 'ok', data: Object.fromEntries(names.map(name => [name, structuredClone(tables[name])])) };
    },
    async select(table, options = {}) { return { status: 'ok', rows: structuredClone(tables[table].filter(r => matches(r, options.where))) }; },
    async insert(table, data) {
      const id = Math.max(0, ...tables[table].map(r => Number(r.id))) + 1;
      tables[table].push({ id, created_at: sqlDate(new Date()), triggered_at: sqlDate(new Date()),
        manual_severity: null, assigned_to: null, ...structuredClone(data) });
      calls.push({ action: 'insert', table, data });
      return { status: 'ok', insertedId: id, affected: 1 };
    },
    async update(table, data, where) {
      if (API.beforeUpdate) await API.beforeUpdate(table, data, where);
      const rows = tables[table].filter(r => matches(r, where));
      rows.forEach(r => Object.assign(r, structuredClone(data)));
      calls.push({ action: 'update', table, data, where });
      return { status: 'ok', affected: rows.length };
    },
    async notify() { if (API.failMail) throw new Error('Mail unavailable'); return { status: 'ok' }; }
  };
  const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const document = { addEventListener() {}, createElement() { return { set textContent(v) { this.value = v; }, get innerHTML() { return escape(this.value); } }; } };
  const context = vm.createContext({ API, console: { error() {} }, document, setInterval() {} });
  for (const file of ['complaint-policy.js', 'data.js', 'student.js', 'warden.js', 'authority.js', 'principal.js', 'maintenance.js', 'admin.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), context, { filename: file });
  }
  return { context, tables, calls, API, run: source => vm.runInContext(source, context) };
}

test('category defaults, threshold boundary, priority floors and safety categories', () => {
  const h = harness();
  assert.equal(h.run('effectiveComplaintSeverity("Cleanliness/Hygiene", 20)'), 'Medium');
  assert.equal(h.run('effectiveComplaintSeverity("Cleanliness/Hygiene", 21)'), 'High');
  assert.equal(h.run('effectiveComplaintSeverity("Internet/WiFi", 21)'), 'Medium');
  assert.equal(h.run('effectiveComplaintSeverity("Plumbing/Water", 200)'), 'High');
  assert.equal(h.run('effectiveComplaintSeverity("Security", 200, "Low")'), 'Critical');
  assert.equal(h.run('effectiveComplaintSeverity("Cleanliness/Hygiene", 21, "Low")'), 'High');
  assert.equal(h.run('effectiveComplaintSeverity("Cleanliness/Hygiene", 1, "Critical")'), 'Critical');
});

test('21 reports promote every open member; hostels, categories and resolved reports stay separate', async () => {
  const reports = Array.from({ length: 21 }, (_, i) => complaint(i + 1));
  reports.push(complaint(22, { hostel_block: 'Godavari Girls Hostel' }),
    complaint(23, { category: 'Food/Mess' }), complaint(24, { status: 'Resolved' }));
  const h = harness(reports);
  await h.run('initData()');
  assert.equal(h.tables.complaints.filter(c => c.severity === 'High').length, 21);
  assert.equal(h.tables.complaints[21].severity, 'Medium');
  assert.equal(h.tables.complaints[22].severity, 'Medium');
  assert.equal(h.tables.complaints[23].severity, 'Medium');
  assert.equal(h.run('groupComplaints(COMPLAINTS).length'), 3);
  assert.equal(h.run('groupComplaints(COMPLAINTS)[0].openCount'), 21);
  const deadline = h.tables.complaints[0].resolution_due_at;
  const count = h.calls.filter(c => c.action !== 'snapshot').length;
  await h.run('refreshComplaintData();');
  await h.run('syncGroupPriorities()');
  assert.equal(h.tables.complaints[0].resolution_due_at, deadline);
  assert.equal(h.calls.filter(c => c.action !== 'snapshot').length, count, 'reload must not restart clocks or write duplicate history');
});

test('submitting the 21st report promotes the existing group and preserves photos across refresh', async () => {
  const h = harness(Array.from({ length: 20 }, (_, i) => complaint(i + 1)));
  await h.run('initData()');
  await h.run('addComplaint({ title: "Another dirty washroom", category: "Cleanliness/Hygiene", description: "Needs cleaning", studentId: "1", photo: "data:image/png;base64,test" })');
  assert.equal(h.tables.complaints.length, 21);
  assert.ok(h.tables.complaints.every(c => c.severity === 'High'));
  await h.run('refreshComplaintData()');
  assert.equal(h.run('COMPLAINTS.find(c => c.id === "21").photo'), 'data:image/png;base64,test');
});

test('manual increase survives reload; removing it cannot erase volume priority or extend a deadline', async () => {
  const h = harness(Array.from({ length: 21 }, (_, i) => complaint(i + 1)));
  await h.run('initData()');
  await h.run('updateComplaintSeverity("1", "Critical", "3", "Urgent health risk")');
  const deadline = h.tables.complaints[0].final_due_at;
  await h.run('initData()');
  assert.equal(h.tables.complaints[0].severity, 'Critical');
  await h.run('updateComplaintSeverity("1", "auto", "3", "Return to automatic")');
  assert.equal(h.tables.complaints[0].severity, 'High');
  assert.equal(h.tables.complaints[0].final_due_at, deadline);
});

test('student escalation requires ownership, missed response, no acknowledgement and a reason', async () => {
  const h = harness([complaint(1, { authority_response_due_at: hoursFromNow(-0.01) })]);
  await h.run('initData()');
  await assert.rejects(h.run('escalateManually("1", "2", "No response")'), /own complaint/);
  await assert.rejects(h.run('escalateManually("1", "1", " ")'), /reason/);
  await h.run('escalateManually("1", "1", "Warden has not responded")');
  assert.equal(h.tables.complaints[0].escalation_level, 1);
  assert.equal(h.tables.escalations[0].triggered_by, '1');
  assert.equal(h.tables.complaint_history.filter(x => x.note.startsWith('Escalated')).length, 1);
  await assert.rejects(h.run('escalateManually("1", "1", "Again")'), /response deadline/);
});

test('acknowledgement blocks response escalation but unresolved work still breaches resolution SLA', async () => {
  const h = harness([complaint(1, { authority_response_due_at: hoursFromNow(-0.01) })]);
  await h.run('initData()');
  await h.run('acknowledgeComplaint("1", "3")');
  await h.run('checkEscalations()');
  assert.equal(h.tables.complaints[0].escalation_level, 0);
  await assert.rejects(h.run('escalateManually("1", "1", "No reply")'), /response deadline/);
  h.tables.complaints[0].resolution_due_at = hoursFromNow(-0.01);
  await h.run('checkEscalations()');
  assert.equal(h.tables.complaints[0].escalation_level, 2);
  assert.deepEqual(h.tables.escalations.map(e => e.level), [1, 2]);
});

test('each receiving authority has its own response deadline; Principal is the final level', async () => {
  const h = harness([complaint(1, { escalation_level: 1, authority_response_due_at: hoursFromNow(-0.01) })]);
  await h.run('initData()');
  await h.run('checkEscalations()');
  assert.equal(h.tables.complaints[0].escalation_level, 2);
  assert.ok(h.tables.complaints[0].authority_response_due_at > sqlDate(new Date()));
  h.tables.complaints[0].authority_response_due_at = hoursFromNow(-0.01);
  await h.run('checkEscalations()');
  assert.equal(h.tables.complaints[0].escalation_level, 3);
  h.tables.complaints[0].authority_response_due_at = hoursFromNow(-0.01);
  await h.run('checkEscalations()');
  assert.equal(h.tables.escalations.length, 2);
  await assert.rejects(h.run('escalateManually("1", "6", "Further")'), /cannot escalate/);
});

test('resolved complaints are excluded and final breaches record every intermediate level once', async () => {
  const h = harness([complaint(1, { final_due_at: hoursFromNow(-0.01) }),
    complaint(2, { status: 'Resolved', final_due_at: hoursFromNow(-1) })]);
  await h.run('initData()');
  await Promise.all([h.run('checkEscalations()'), h.run('checkEscalations()')]);
  assert.deepEqual(h.tables.escalations.map(e => e.level), [1, 2, 3]);
  assert.equal(h.tables.complaints[1].escalation_level, 0);
});

test('a concurrent acknowledgement prevents stale escalation and duplicate audit records', async () => {
  const h = harness([complaint(1, { authority_response_due_at: hoursFromNow(-0.01) })]);
  await h.run('initData()');
  h.API.beforeUpdate = (table, data) => {
    if (table === 'complaints' && data.escalation_level) h.tables.complaints[0].authority_acknowledged = 1;
  };
  await h.run('checkEscalations()');
  assert.equal(h.tables.escalations.length, 0);
  assert.equal(h.tables.complaints[0].escalation_level, 0);
});

test('warden/maintenance review loop remains valid; Principal can resolve only current final-level reports', async () => {
  const h = harness([complaint(1), complaint(2, { escalation_level: 3 })]);
  await h.run('initData()');
  await h.run('assignComplaint("1", "7", "3")');
  assert.equal(h.tables.complaints[0].authority_acknowledged, 1);
  await h.run('markDone("1", "7", null)');
  await h.run('reassignComplaint("1", "3")');
  await h.run('markDone("1", "7", null)');
  await h.run('resolveComplaint("1", "3")');
  assert.equal(h.tables.complaints[0].status, 'Resolved');
  await assert.rejects(h.run('resolveComplaint("2", "3")'), /current authority/);
  await h.run('resolveComplaint("2", "6")');
  assert.equal(h.tables.complaints[1].status, 'Resolved');
});

test('Principal overview and filtered view render one collapsed group for 21 reports', async () => {
  const h = harness(Array.from({ length: 21 }, (_, i) => complaint(i + 1, { escalation_level: 3 })));
  await h.run('initData();');
  h.run('currentUser = getUser("6")');
  const html = h.run('renderPrincipalView()');
  assert.equal((html.match(/<section class="hct-card p-3 issue-group/g) || []).length, 1);
  assert.match(html, /<strong>21<\/strong> open reports/);
  assert.match(html, /Default Medium &rarr; High/);
  assert.match(html, /View 21 student reports/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  assert.equal((html.match(/data-principal-resolve=/g) || []).length, 21);
  h.run('_principalTab = "all"; _principalFilters.status = "Pending"');
  assert.match(h.run('renderPrincipalView()'), /<strong>21<\/strong> open reports/);
  h.run('_principalFilters.block = "Godavari Girls Hostel"');
  assert.match(h.run('renderPrincipalView()'), /No issue groups match/);
});

test('resolved-only groups preserve their recorded priority and escalation log is grouped', async () => {
  const h = harness([complaint(1, { status: 'Resolved', severity: 'Critical' }), complaint(2)],
    [{ id: 1, complaint_id: 1, level: 1, triggered_by: 'system', triggered_at: hoursFromNow(-1), reason: 'SLA' },
      { id: 2, complaint_id: 2, level: 2, triggered_by: 'system', triggered_at: hoursFromNow(-0.5), reason: 'SLA' }]);
  await h.run('initData()');
  assert.equal(h.run('groupComplaints(COMPLAINTS.filter(c => c.status === "Resolved"))[0].severity'), 'Critical');
  const html = h.run('renderPrincipalEscalationLog()');
  assert.equal((html.match(/<section /g) || []).length, 1);
  assert.match(html, /2 escalation events/);
});

test('startup and refresh each use a single snapshot; initial sweep reuses loaded data', async () => {
  const h = harness([complaint(1)]);
  await h.run('initData()');
  assert.equal(h.calls.filter(c => c.action === 'snapshot').length, 1);
  assert.equal(h.calls.find(c => c.action === 'snapshot').includeAccounts, true);
  h.calls.length = 0;
  await h.run('checkEscalations({ refresh: false })');
  assert.equal(h.calls.length, 0);
  await h.run('refreshComplaintData()');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].action, 'snapshot');
});

test('group priority writes run concurrently with a maximum of four requests', async () => {
  const h = harness(Array.from({ length: 21 }, (_, i) => complaint(i + 1)));
  let active = 0, maximum = 0;
  h.API.beforeUpdate = async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--;
  };
  await h.run('initData()');
  assert.equal(maximum, 4);
  assert.ok(h.tables.complaints.every(c => c.severity === 'High'));
});

test('queued notifications are not mislabeled sent by the frontend', async () => {
  const h = harness([complaint(1)]);
  h.tables.users[0].email = 'test@example.invalid';
  const delivered = [];
  h.API.notify = async (...args) => { delivered.push(args); return { status: 'ok', delivery: 'queued', notificationId: 7 }; };
  await h.run('initData()');
  await h.run('notifyStudentStatus(COMPLAINTS[0], "Test status")');
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0][3], 1);
  assert.equal(delivered[0][4], 'student');
  assert.equal(h.tables.notifications.length, 0, 'backend owns the queued/sent/failed record');
});

test('file URL API requests give an actionable error without fetching', async () => {
  const apiContext = vm.createContext({ location: { protocol: 'file:' } });
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'api.js'), 'utf8'), apiContext);
  await assert.rejects(vm.runInContext('API.snapshot()', apiContext), /http:\/\/localhost:8080/);
});
