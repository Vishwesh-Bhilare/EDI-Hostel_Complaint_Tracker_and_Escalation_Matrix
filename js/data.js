/* Backend-backed data store.
   Same function names/signatures as the old in-memory mock, so
   app.js/student.js/warden.js/maintenance.js/admin.js didn't need to change
   for the parts that were already there.

   NEW in this revision: severity + the escalation matrix (see SRS section
   6.3). USERS / COMPLAINTS / PENDING_REGISTRATIONS / ESCALATIONS are loaded
   from MySQL (via js/api.js) on startup, kept in memory for instant
   re-renders, and pushed back to the backend whenever a mutating function
   below is called.

   Note: complaint photos are captured client-side as base64 data URLs, but
   the schema's photo/completion_photo columns are VARCHAR(255) (meant for a
   file path, not image bytes), so photos are intentionally NOT sent to the
   backend here — they stay visible only for the current browser session. */

// Category defaults, group counting and SLA windows live in complaint-policy.js.

// ---------------- Escalation chain ----------------
// Level 0 = with the Warden (default owner, no escalation yet).
// Levels 1-3 escalate up this chain, one step at a time, never skipping.
// The final hand-off goes to the Principal; it does not resolve the complaint.
const ESCALATION_CHAIN = [
  { level: 1, role: "chief_warden",      label: "Chief Warden" },
  { level: 2, role: "college_authority", label: "College Authority" },
  { level: 3, role: "principal",         label: "Principal" }
];

function roleForLevel(level) {
  const step = ESCALATION_CHAIN.find(s => s.level === level);
  return step ? step.role : "warden";
}

function labelForLevel(level) {
  if (!level) return "Warden";
  const step = ESCALATION_CHAIN.find(s => s.level === level);
  return step ? step.label : "Warden";
}

function levelForRole(role) {
  const step = ESCALATION_CHAIN.find(s => s.role === role);
  return step ? step.level : 0;
}

const HOSTEL_BLOCKS = ["Devgiri Boys Hostel", "Godavari Girls Hostel"];

let USERS = [];
let PENDING_REGISTRATIONS = [];
let COMPLAINTS = [];
let ESCALATIONS = [];

function getUser(id) {
  return USERS.find(u => u.id === id) || null;
}

function getUserByPrnOrEmail(identifier) {
  return USERS.find(u => u.prn === identifier || u.email === identifier) || null;
}

function usersByRole(role) {
  return USERS.filter(u => u.role === role);
}

function nowStamp() {
  return new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

// ---------------- Date helpers ----------------
// MySQL TIMESTAMP columns round-trip through this backend as plain strings
// like "2026-09-15 10:23:45" or "2026-09-15 10:23:45.0" (java.sql.Timestamp#toString()).
// That isn't reliably parsed by `new Date(...)` across browsers, so both
// directions are done by hand instead of trusting Date parsing/formatting.

function pad2(n) { return String(n).padStart(2, "0"); }

// JS Date -> "YYYY-MM-DD HH:mm:ss" for sending to the backend
function toSqlDateTime(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ` +
         `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

// "YYYY-MM-DD HH:mm:ss[.fraction]" (or null) -> JS Date (or null)
function fromSqlDateTime(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function formatDueBy(date) {
  if (!date) return "-";
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

// ---------------- Initial load from the backend ----------------

async function loadUsers(res = null) {
  if (!res) res = await API.select("users");
  USERS = res.rows.map(r => ({
    id: String(r.id),
    name: r.name,
    role: r.role,
    prn: r.prn,
    email: r.email,
    password: r.password,
    block: r.block,
    room: r.room
  }));
}

async function loadComplaints(complaintsRes = null, historyRes = null) {
  const previous = new Map(COMPLAINTS.map(c => [c.id, c]));
  if (!complaintsRes || !historyRes) {
    [complaintsRes, historyRes] = await Promise.all([
      API.select("complaints"), API.select("complaint_history")
    ]);
  }
  if (complaintsRes.rows.some(r => !Object.prototype.hasOwnProperty.call(r, "authority_acknowledged"))) {
    throw new Error("Database needs mysql/migrate_complaint_groups.sql before using complaint groups.");
  }

  const historyByComplaint = {};
  historyRes.rows.forEach(h => {
    const key = String(h.complaint_id);
    (historyByComplaint[key] = historyByComplaint[key] || []).push({ at: h.created_at, text: h.note });
  });

  COMPLAINTS = complaintsRes.rows.map(r => ({
    id: String(r.id),
    title: r.title,
    category: r.category,
    severity: r.severity,
    manualSeverity: r.manual_severity || null,
    description: r.description,
    photo: previous.get(String(r.id))?.photo || null,
    completionPhoto: previous.get(String(r.id))?.completionPhoto || null,
    status: r.status,
    studentId: String(r.student_id),
    hostelBlock: r.hostel_block,
    assignedTo: r.assigned_to != null ? String(r.assigned_to) : null,
    escalationLevel: Number(r.escalation_level) || 0,
    responseDueAt: fromSqlDateTime(r.response_due_at),
    authorityResponseDueAt: fromSqlDateTime(r.authority_response_due_at),
    authorityAcknowledged: Number(r.authority_acknowledged) === 1,
    resolutionDueAt: fromSqlDateTime(r.resolution_due_at),
    finalDueAt: fromSqlDateTime(r.final_due_at),
    createdAt: r.created_at,
    submittedAt: fromSqlDateTime(r.created_at),
    history: historyByComplaint[String(r.id)] || []
  }));
}

async function loadEscalations(res = null) {
  if (!res) res = await API.select("escalations");
  ESCALATIONS = res.rows
    .map(r => ({
      id: String(r.id),
      complaintId: String(r.complaint_id),
      level: Number(r.level),
      escalatedToRole: r.escalated_to_role,
      reason: r.reason,
      triggeredBy: r.triggered_by,
      triggeredAt: r.triggered_at
    }))
    .sort((a, b) => (a.triggeredAt < b.triggeredAt ? 1 : -1));
}

async function loadPendingRegistrations(res = null) {
  if (!res) res = await API.select("pending_registrations", { where: { status: "pending" } });
  PENDING_REGISTRATIONS = res.rows.map(r => ({
    id: String(r.id),
    name: r.name,
    prn: r.prn,
    email: r.email,
    password: r.password,
    block: r.block,
    requestedAt: r.requested_at,
    status: r.status
  }));
}

async function initData() {
  const { data } = await API.snapshot(true);
  await Promise.all([loadUsers({ rows: data.users }), loadComplaints({ rows: data.complaints }, { rows: data.complaint_history }),
    loadPendingRegistrations({ rows: data.pending_registrations }), loadEscalations({ rows: data.escalations })]);
  await syncGroupPriorities();
}

async function refreshComplaintData() {
  const { data } = await API.snapshot();
  await Promise.all([loadComplaints({ rows: data.complaints }, { rows: data.complaint_history }),
    loadEscalations({ rows: data.escalations })]);
}

// Bound independent work instead of starting one request for every group member.
async function runInParallel(tasks, limit = 4) {
  let next = 0;
  let failure = null;
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (!failure && next < tasks.length) {
      const task = tasks[next++];
      try { await task(); } catch (err) { failure = err; }
    }
  }));
  if (failure) throw failure;
}

function authorityStartedAt(c) {
  const event = ESCALATIONS.find(e => e.complaintId === c.id && e.level === c.escalationLevel);
  return (event && fromSqlDateTime(event.triggeredAt)) || c.submittedAt;
}

// Counts every unresolved report once using a Map. Deadline changes are anchored
// to submission / authority hand-off, never to a reload or repeated submission.
// Earlier deadlines are retained even if volume later drops below the threshold.
async function syncGroupPriorities() {
  const tasks = [];
  for (const group of groupComplaints(COMPLAINTS)) {
    for (const c of group.complaints) {
      if (c.status === "Resolved") continue;
      const severity = effectiveComplaintSeverity(c.category, group.openCount, c.manualSeverity);
      const policy = SLA_POLICY[severity];
      const submitted = c.submittedAt;
      if (!submitted) continue;
      const earlier = (current, proposed) => current && current < proposed ? current : proposed;
      const responseDueAt = earlier(c.responseDueAt, addHours(submitted, policy.responseHours));
      const resolutionDueAt = earlier(c.resolutionDueAt, addHours(submitted, policy.resolutionHours));
      const finalDueAt = earlier(c.finalDueAt, addHours(submitted, policy.finalHours));
      const authorityResponseDueAt = earlier(c.authorityResponseDueAt,
        addHours(authorityStartedAt(c) || submitted, policy.responseHours));
      const fields = { severity, response_due_at: toSqlDateTime(responseDueAt),
        resolution_due_at: toSqlDateTime(resolutionDueAt), final_due_at: toSqlDateTime(finalDueAt),
        authority_response_due_at: toSqlDateTime(authorityResponseDueAt) };
      const changed = severity !== c.severity || responseDueAt.getTime() !== c.responseDueAt?.getTime() ||
        resolutionDueAt.getTime() !== c.resolutionDueAt?.getTime() || finalDueAt.getTime() !== c.finalDueAt?.getTime() ||
        authorityResponseDueAt.getTime() !== c.authorityResponseDueAt?.getTime();
      if (!changed) continue;
      tasks.push(async () => {
      await API.update("complaints", fields, { id: Number(c.id) });
      if (severity !== c.severity) {
        const note = `Priority ${c.severity} -> ${severity}: default ${CATEGORY_SEVERITY[c.category] || "Medium"}, ${group.openCount} open reports in ${group.hostelBlock}/${group.category}`;
        await API.insert("complaint_history", { complaint_id: Number(c.id), note: note.slice(0, 255) });
        c.history.push({ at: nowStamp(), text: note });
      }
      Object.assign(c, { severity, responseDueAt, resolutionDueAt, finalDueAt, authorityResponseDueAt });
      });
    }
  }
  await runInParallel(tasks);
}

// ---------------- Registration ----------------

async function submitRegistration({ name, prn, email, password, block }) {
  const res = await API.insert("pending_registrations", { name, prn, email, password, block, status: "pending" });
  const reg = {
    id: String(res.insertedId),
    name, prn, email, password, block,
    requestedAt: nowStamp(),
    status: "pending"
  };
  PENDING_REGISTRATIONS.push(reg);
  return reg;
}

async function approveRegistration(regId, roomAssignment) {
  const reg = PENDING_REGISTRATIONS.find(r => r.id === regId);
  if (!reg) return null;

  const room = roomAssignment || "TBD";
  const res = await API.insert("users", {
    name: reg.name, role: "student", prn: reg.prn, email: reg.email,
    password: reg.password, block: reg.block, room
  });

  const newUser = {
    id: String(res.insertedId), name: reg.name, role: "student",
    prn: reg.prn, email: reg.email, password: reg.password, block: reg.block, room
  };
  USERS.push(newUser);

  await API.update("pending_registrations", { status: "approved" }, { id: Number(regId) });
  reg.status = "approved";
  PENDING_REGISTRATIONS = PENDING_REGISTRATIONS.filter(r => r.id !== regId);
  return newUser;
}

async function rejectRegistration(regId, reason) {
  const reg = PENDING_REGISTRATIONS.find(r => r.id === regId);
  if (!reg) return;
  const rejectionReason = reason || "Rejected by admin";
  await API.update("pending_registrations", { status: "rejected", rejection_reason: rejectionReason }, { id: Number(regId) });
  reg.status = "rejected";
  reg.rejectionReason = rejectionReason;
  PENDING_REGISTRATIONS = PENDING_REGISTRATIONS.filter(r => r.id !== regId);
}

function getPendingRegistrations() {
  return PENDING_REGISTRATIONS.filter(r => r.status === "pending");
}

// ---------------- Complaints ----------------

async function addComplaint({ title, category, description, photo, studentId }) {
  await refreshComplaintData();
  const student = getUser(studentId);
  if (!student || student.role !== "student") throw new Error("A student account is required.");
  const openCount = COMPLAINTS.filter(c => c.status !== "Resolved" &&
    c.category === category && c.hostelBlock === student.block).length + 1;
  const severity = effectiveComplaintSeverity(category, openCount);
  const policy = SLA_POLICY[severity];
  const now = new Date();
  const responseDueAt = addHours(now, policy.responseHours);
  const resolutionDueAt = addHours(now, policy.resolutionHours);
  const finalDueAt = addHours(now, policy.finalHours);

  const res = await API.insert("complaints", {
    title, category, severity, description,
    status: "Pending",
    student_id: Number(studentId),
    hostel_block: student ? student.block : null,
    escalation_level: 0,
    response_due_at: toSqlDateTime(responseDueAt),
    authority_response_due_at: toSqlDateTime(responseDueAt),
    authority_acknowledged: 0,
    resolution_due_at: toSqlDateTime(resolutionDueAt),
    final_due_at: toSqlDateTime(finalDueAt)
  });

  const note = `Complaint submitted by ${student.name} (${severity} severity, auto-bound from category)`;
  await API.insert("complaint_history", { complaint_id: res.insertedId, note });

  const c = {
    id: String(res.insertedId),
    title, category, severity, description,
    photo: photo || null, // client-side only, see note at top of file
    status: "Pending",
    studentId,
    hostelBlock: student ? student.block : null,
    assignedTo: null,
    escalationLevel: 0,
    manualSeverity: null,
    authorityAcknowledged: false,
    authorityResponseDueAt: responseDueAt,
    responseDueAt, resolutionDueAt, finalDueAt,
    submittedAt: now,
    createdAt: nowStamp(),
    history: [{ at: nowStamp(), text: note }]
  };
  COMPLAINTS.unshift(c);
  await syncGroupPriorities();
  await notifyStudentStatus(c, "Complaint submitted");
  return c;
}

// A manual priority is a floor: it cannot defeat a category or volume priority.
// Selecting "auto" removes the floor; it does not restart or extend deadlines.
async function updateComplaintSeverity(complaintId, newSeverity, wardenId, reason) {
  await refreshComplaintData();
  const c = COMPLAINTS.find(x => x.id === complaintId);
  if (!c || c.status === "Resolved" || (newSeverity !== "auto" && !SLA_POLICY[newSeverity])) return;
  const warden = getUser(wardenId);
  if (!warden || warden.role !== "warden" || c.escalationLevel !== 0) throw new Error("Only the current warden can change priority.");
  const manualSeverity = newSeverity === "auto" ? null : newSeverity;
  await API.update("complaints", { manual_severity: manualSeverity }, { id: Number(complaintId) });
  c.manualSeverity = manualSeverity;
  const note = `Manual priority ${manualSeverity || "cleared (automatic)"} by ${warden.name}` +
    (reason ? ` — ${reason}` : "");
  await API.insert("complaint_history", { complaint_id: Number(complaintId), note: note.slice(0, 255) });
  c.history.push({ at: nowStamp(), text: note });
  await syncGroupPriorities();
}

async function assignComplaint(complaintId, maintenanceId, wardenId) {
  await refreshComplaintData();
  const c = COMPLAINTS.find(x => x.id === complaintId);
  if (!c) return;
  if (getUser(wardenId)?.role !== "warden" || c.escalationLevel !== 0 || c.status !== "Pending") throw new Error("Only the current warden can assign a pending complaint.");
  if (getUser(maintenanceId)?.role !== "maintenance") throw new Error("Please select maintenance staff.");
  const result = await API.update("complaints", { assigned_to: Number(maintenanceId), status: "Assigned", authority_acknowledged: 1 },
    { id: Number(complaintId), escalation_level: 0, status: "Pending" });
  if (!result.affected) throw new Error("The complaint has changed. Refresh its queue.");
  const note = `Assigned to ${getUser(maintenanceId).name} by ${getUser(wardenId).name}`;
  await API.insert("complaint_history", { complaint_id: Number(complaintId), note });

  c.assignedTo = maintenanceId;
  c.status = "Assigned";
  c.authorityAcknowledged = true;
  c.history.push({ at: nowStamp(), text: note });
  await notifyStudentStatus(c, note);
}

async function markDone(complaintId, maintenanceId, photo) {
  await refreshComplaintData();
  const c = COMPLAINTS.find(x => x.id === complaintId);
  if (!c) return;
  if (c.assignedTo !== maintenanceId || c.status !== "Assigned") throw new Error("Only assigned work can be marked done.");

  await API.update("complaints", { status: "Under Review" }, { id: Number(complaintId) });
  const note = `Marked done by ${getUser(maintenanceId).name}, awaiting warden review`;
  await API.insert("complaint_history", { complaint_id: Number(complaintId), note });

  c.status = "Under Review";
  if (photo) c.completionPhoto = photo; // client-side only, see note at top of file
  c.history.push({ at: nowStamp(), text: note });
  await notifyStudentStatus(c, note);
}

async function resolveComplaint(complaintId, resolverId) {
  await refreshComplaintData();
  const c = COMPLAINTS.find(x => x.id === complaintId);
  if (!c) return;
  if (c.status === "Resolved") return;
  if (getUser(resolverId)?.role !== roleForLevel(c.escalationLevel) ||
    (c.escalationLevel === 0 && c.status !== "Under Review")) throw new Error("Only the current authority can resolve this complaint; warden review requires completed work.");
  const result = await API.update("complaints", { status: "Resolved", authority_acknowledged: 1 },
    { id: Number(complaintId), escalation_level: c.escalationLevel, status: c.status });
  if (!result.affected) throw new Error("The complaint has changed. Refresh its queue.");
  const note = `Marked resolved by ${getUser(resolverId).name}`;
  await API.insert("complaint_history", { complaint_id: Number(complaintId), note });

  c.status = "Resolved";
  c.authorityAcknowledged = true;
  c.history.push({ at: nowStamp(), text: note });
  await syncGroupPriorities();
  await notifyStudentStatus(c, note);
}

async function reassignComplaint(complaintId, wardenId) {
  await refreshComplaintData();
  const c = COMPLAINTS.find(x => x.id === complaintId);
  if (!c) return;
  if (getUser(wardenId)?.role !== "warden" || c.escalationLevel !== 0 || c.status !== "Under Review") throw new Error("Only the current warden can send reviewed work back.");

  await API.update("complaints", { status: "Assigned" }, { id: Number(complaintId) });
  const note = `Sent back to ${getUser(c.assignedTo).name} by ${getUser(wardenId).name}`;
  await API.insert("complaint_history", { complaint_id: Number(complaintId), note });

  c.status = "Assigned";
  c.history.push({ at: nowStamp(), text: note });
  await notifyStudentStatus(c, note);
}

// Manual escalation: an authority can push a complaint up one level early
// (SRS FR-07/ESCALATION_ACK — "escalate manually" requires a recorded reason).
async function escalateManually(complaintId, byUserId, reason) {
  await refreshComplaintData();
  const c = COMPLAINTS.find(x => x.id === complaintId);
  const actor = getUser(byUserId);
  if (!c || !actor || c.escalationLevel >= 3 || c.status === "Resolved") throw new Error("This complaint cannot escalate further.");
  if (!reason || !reason.trim()) throw new Error("Please give a reason for escalation.");
  const currentRole = roleForLevel(c.escalationLevel);
  if (actor.role === "student") {
    if (!canStudentEscalate(c, actor.id)) throw new Error("Escalation is available only for your own complaint after an unanswered response deadline.");
  } else if (actor.role !== currentRole) {
    throw new Error("Only the current authority can escalate this complaint.");
  }
  return recordEscalation(c, c.escalationLevel + 1, byUserId, reason.trim().slice(0, 180));
}

async function acknowledgeComplaint(complaintId, actorId) {
  await refreshComplaintData();
  const c = COMPLAINTS.find(x => x.id === complaintId);
  const actor = getUser(actorId);
  if (!c || c.status === "Resolved" || c.authorityAcknowledged) return;
  if (!actor || actor.role !== roleForLevel(c.escalationLevel)) throw new Error("Only the current authority can acknowledge this complaint.");
  const result = await API.update("complaints", { authority_acknowledged: 1 },
    { id: Number(c.id), escalation_level: c.escalationLevel, authority_acknowledged: 0 });
  if (!result.affected) return;
  c.authorityAcknowledged = true;
  const note = `Acknowledged by ${actor.name} (${labelForLevel(c.escalationLevel)})`;
  await API.insert("complaint_history", { complaint_id: Number(c.id), note });
  c.history.push({ at: nowStamp(), text: note });
  await notifyStudentStatus(c, note);
}

// Shared by both the auto-sweep and manual escalation. Never skips a level.
async function recordEscalation(c, newLevel, byUserId, reason) {
  const role = roleForLevel(newLevel);
  const authorityResponseDueAt = addHours(new Date(), SLA_POLICY[c.severity].responseHours);
  const where = { id: Number(c.id), escalation_level: c.escalationLevel, status: c.status };
  if (!byUserId || getUser(byUserId)?.role === "student") where.authority_acknowledged = c.authorityAcknowledged ? 1 : 0;
  const result = await API.update("complaints", { escalation_level: newLevel,
    authority_response_due_at: toSqlDateTime(authorityResponseDueAt), authority_acknowledged: 0 }, where);
  // Another browser may have already changed the queue or acknowledged it.
  if (!result.affected) return false;
  await API.insert("escalations", {
    complaint_id: Number(c.id),
    level: newLevel,
    escalated_to_role: role,
    reason: reason.slice(0, 180),
    triggered_by: byUserId || "system"
  });

  const actorName = byUserId ? (getUser(byUserId) ? getUser(byUserId).name : byUserId) : "System";
  const note = `Escalated to ${labelForLevel(newLevel)} (${reason}) — by ${actorName}`;
  await API.insert("complaint_history", { complaint_id: Number(c.id), note: note.slice(0, 255) });

  c.escalationLevel = newLevel;
  c.authorityResponseDueAt = authorityResponseDueAt;
  c.authorityAcknowledged = false;
  c.history.push({ at: nowStamp(), text: note });
  ESCALATIONS.unshift({
    id: `local-${Date.now()}`,
    complaintId: c.id,
    level: newLevel,
    escalatedToRole: role,
    reason,
    triggeredBy: byUserId || "system",
    triggeredAt: toSqlDateTime(new Date())
  });

  // Best-effort only: the escalation above is already committed, so a
  // slow/unconfigured/failing mail step must never surface as an error to
  // whoever triggered this (the auto-sweep or a warden's manual click).
  try {
    await notifyEscalation(c, newLevel, role, reason);
  } catch (err) {
    console.error("notifyEscalation failed:", err);
  }
  return true;
}

// ---------------- Notifications ----------------
// Staff addresses are configured in the users table. Seeded staff addresses use
// this placeholder domain so a fresh local installation cannot accidentally
// send mail outside the system.
const PLACEHOLDER_EMAIL_DOMAIN = "@replace-me.hostelcare.local";

function isRealEmail(email) {
  return !!email && !email.toLowerCase().endsWith(PLACEHOLDER_EMAIL_DOMAIN);
}

// Sends and audits one message without allowing a mail failure to interrupt a
// complaint workflow. Every status update and escalation uses this helper.
async function notifyRecipient(complaintId, audience, user, subject, body) {
  if (!user || !isRealEmail(user.email)) {
    await logNotification(complaintId, audience, (user && user.email) || "(none)", subject, "skipped");
    return;
  }

  try {
    await API.notify(user.email, subject, body, Number(complaintId), audience);
    // The backend owns the queued -> sent/failed audit lifecycle. Acceptance is
    // not delivery, so never write a misleading "sent" row from the browser.
  } catch (err) {
    console.error("Notification delivery failed:", err);
    await logNotification(complaintId, audience, user.email, subject, "failed");
  }
}

// The student is notified for every persisted status change, including the
// initial submitted/Pending state. This is deliberately separate from the
// escalation email so a complaint still has a clear current-status update.
async function notifyStudentStatus(c, event) {
  const student = getUser(c.studentId);
  const subject = `[HostelCare] Complaint #${c.id} status: ${c.status}`;
  const body =
    `${event}\n\n` +
    `Complaint #${c.id}: ${c.title}\n` +
    `Current status: ${c.status}\n` +
    `Current queue: ${labelForLevel(c.escalationLevel)}\n` +
    `Severity: ${c.severity}\n` +
    `Time: ${nowStamp()}\n\n` +
    `You will receive another update when the complaint status changes.`;
  await notifyRecipient(c.id, "student", student, subject, body);
}

// An escalation has two audiences: the student who raised the complaint and
// the authority receiving it. Each delivery is independent so an unavailable
// address never prevents the complaint from moving to the next queue.
async function notifyEscalation(c, newLevel, role, reason) {
  const student = getUser(c.studentId);
  const authorityRecipients = usersByRole(role);
  const recipients = [];

  if (student) recipients.push({ user: student, audience: "student" });
  authorityRecipients.forEach(user => recipients.push({ user, audience: role }));

  const authorityLabel = labelForLevel(newLevel);
  const subject = `[HostelCare] Complaint #${c.id} escalated to ${authorityLabel}`;
  const details =
    `Complaint #${c.id}: ${c.title}\n` +
    `Category: ${c.category}\n` +
    `Severity: ${c.severity}\n` +
    `Current status: ${c.status}\n` +
    `Hostel Block: ${c.hostelBlock || "—"}\n` +
    `Submitted by: ${student ? student.name : "Resident"}\n` +
    `Description: ${c.description || "—"}\n` +
    `Escalated to: ${authorityLabel}\n` +
    `Reason: ${reason}\n` +
    `Time: ${nowStamp()}\n\n`;

  await runInParallel(recipients.map(({ user, audience }) => async () => {
    const body = audience === "student"
      ? `Your complaint has been forwarded to ${authorityLabel}.\n\n${details}` +
        `You will receive updates here as the complaint is handled.`
      : `Hello ${user.name || authorityLabel},\n\n` +
        `A complaint has been escalated to you as ${authorityLabel}.\n\n${details}` +
        `Log in to HostelCare to view and act on this complaint.`;

    await notifyRecipient(c.id, audience, user, subject, body);
  }));
}

// Logging is itself best-effort — a failed audit write must never mask
// (or get mistaken for) the actual send outcome above.
async function logNotification(complaintId, role, email, subject, status) {
  try {
    await API.insert("notifications", {
      complaint_id: Number(complaintId), role, email, subject, status
    });
  } catch (err) {
    console.error("logNotification failed:", err);
  }
}

// ---------------- Dev/testing helper ----------------
// Backdates a complaint's due-by timestamps and immediately runs the real
// checkEscalations() sweep, so this exercises the actual auto-detection
// code path (not a shortcut around it) — useful since real SLA windows are
// hours long and nobody wants to wait that out to test the escalation
// engine. Writes its own honest history note first, so the audit trail
// clearly separates "someone forced this into the past for testing" from
// the auto-escalation entry that follows it.
async function debugForceOverdue(complaintId, actorId) {
  const c = COMPLAINTS.find(x => x.id === complaintId);
  if (!c || c.status === "Resolved") return;

  const past = new Date(Date.now() - 60 * 1000); // 1 minute in the past
  await API.update("complaints", {
    response_due_at: toSqlDateTime(past),
    resolution_due_at: toSqlDateTime(past),
    final_due_at: toSqlDateTime(past),
    authority_response_due_at: toSqlDateTime(past)
  }, { id: Number(complaintId) });

  const actor = getUser(actorId);
  const note = `[Test] Due-by timestamps set to the past by ${actor ? actor.name : actorId} to test escalation`;
  await API.insert("complaint_history", { complaint_id: Number(complaintId), note });

  c.responseDueAt = past;
  c.resolutionDueAt = past;
  c.finalDueAt = past;
  c.authorityResponseDueAt = past;
  c.history.push({ at: nowStamp(), text: note });

  await checkEscalations(); // this is the real, unattended detection logic
}

// ---------------- The escalation engine (SLA breach sweep) ----------------
// Refresh before each browser-driven sweep so other students' reports and
// authorities' acknowledgements participate. Coalesce overlapping local sweeps.
let escalationSweepPromise = null;
function checkEscalations({ refresh = true } = {}) {
  if (escalationSweepPromise) return escalationSweepPromise;
  escalationSweepPromise = sweepEscalations(refresh).finally(() => { escalationSweepPromise = null; });
  return escalationSweepPromise;
}

async function sweepEscalations(refresh = true) {
  if (refresh) {
    await refreshComplaintData();
    await syncGroupPriorities();
  }
  const now = new Date();
  for (const c of COMPLAINTS) {
    if (c.status === "Resolved") continue;

    let targetLevel = c.escalationLevel;
    if (c.finalDueAt && now > c.finalDueAt) {
      targetLevel = 3;
    } else if (c.resolutionDueAt && now > c.resolutionDueAt) {
      targetLevel = Math.max(targetLevel, 2);
    }
    if (c.escalationLevel < 3 && authorityResponseOverdue(c, now)) {
      targetLevel = Math.max(targetLevel, c.escalationLevel + 1);
    }

    while (c.escalationLevel < targetLevel) {
      const reason = authorityResponseOverdue(c, now) ? "Authority response deadline missed (auto)" : "Resolution SLA breach (auto)";
      if (!await recordEscalation(c, c.escalationLevel + 1, null, reason)) break;
    }
  }
}

function complaintsForStudent(studentId) {
  return COMPLAINTS.filter(c => c.studentId === studentId);
}

function complaintsForMaintenance(maintenanceId) {
  return COMPLAINTS.filter(c => c.assignedTo === maintenanceId && c.status !== "Resolved");
}

function activeComplaintsForWarden() {
  return COMPLAINTS.filter(c => c.escalationLevel === 0 && c.status !== "Resolved")
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

function historyComplaintsForWarden() {
  return COMPLAINTS.filter(c => c.status === "Resolved");
}

// Complaints currently sitting with a given escalation authority (chief
// warden / college authority), most urgent (least time left) first.
function complaintsAtLevel(level) {
  return COMPLAINTS.filter(c => c.escalationLevel === level && c.status !== "Resolved")
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

// Complaints that have ever reached (or passed through) a given authority's
// level, regardless of current status — their "handled" history tab.
function complaintsEverAtLevel(level) {
  const ids = new Set(ESCALATIONS.filter(e => e.level === level).map(e => e.complaintId));
  return COMPLAINTS.filter(c => ids.has(c.id));
}

// ---------------- Org-wide monitoring (Principal dashboard) ----------------

function orgWideStats() {
  const total = COMPLAINTS.length;
  const open = COMPLAINTS.filter(c => c.status !== "Resolved").length;
  const resolved = COMPLAINTS.filter(c => c.status === "Resolved").length;
  const escalated = COMPLAINTS.filter(c => c.escalationLevel > 0 && c.status !== "Resolved").length;
  const breachedFinal = COMPLAINTS.filter(c => c.escalationLevel === 3 && c.status !== "Resolved").length;

  // SLA compliance: resolved complaints that never had to escalate.
  const resolvedComplaints = COMPLAINTS.filter(c => c.status === "Resolved");
  const compliantResolved = resolvedComplaints.filter(c => c.escalationLevel === 0).length;
  const complianceRate = resolvedComplaints.length
    ? Math.round((compliantResolved / resolvedComplaints.length) * 100)
    : 100;

  return { total, open, resolved, escalated, breachedFinal, complianceRate };
}

function allComplaintsSorted() {
  return COMPLAINTS.slice().sort((a, b) => {
    if (a.escalationLevel !== b.escalationLevel) return b.escalationLevel - a.escalationLevel;
    return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  });
}
