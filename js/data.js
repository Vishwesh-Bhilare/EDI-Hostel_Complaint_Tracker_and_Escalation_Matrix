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

// ---------------- Categories -> fixed default severity ----------------
// Students don't choose severity directly (that avoided real problems being
// under-reported and lame ones being flagged Critical). The category sets a
// sensible default; a warden can correct it via updateComplaintSeverity()
// if a student's category choice doesn't reflect the real urgency.
const CATEGORY_SEVERITY = {
  "Maintenance": "Low",
  "Electrical": "Medium",
  "Plumbing/Water": "High",
  "Cleanliness/Hygiene": "High",
  "Security": "Critical",
  "Food/Mess": "Medium",
  "Internet/WiFi": "Low",
  "Other": "Medium"
};

const CATEGORIES = CATEGORY_SEVERITY; // kept for backward-compat with any old references

const SEVERITY_LEVELS = ["Low", "Medium", "High", "Critical"];
const SEVERITY_ORDER = { "Critical": 0, "High": 1, "Medium": 2, "Low": 3 };

// ---------------- SLA policy per severity (SRS section 6.3) ----------------
// responseHours   - must be Assigned by this time, or it escalates
// resolutionHours - must be Resolved by this time, or it escalates further
// finalHours      - last-resort threshold; still unresolved past this point
//                   means every earlier level failed, so it goes to the top
const SLA_POLICY = {
  "Low":      { responseHours: 12,  resolutionHours: 72, finalHours: 144 },
  "Medium":   { responseHours: 6,   resolutionHours: 48, finalHours: 96 },
  "High":     { responseHours: 2,   resolutionHours: 24, finalHours: 48 },
  "Critical": { responseHours: 0.5, resolutionHours: 6,  finalHours: 12 }
};

// ---------------- Escalation chain ----------------
// Level 0 = with the Warden (default owner, no escalation yet).
// Levels 1-3 escalate up this chain, one step at a time, never skipping.
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

async function loadUsers() {
  const res = await API.select("users");
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

async function loadComplaints() {
  const [complaintsRes, historyRes] = await Promise.all([
    API.select("complaints"),
    API.select("complaint_history")
  ]);

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
    description: r.description,
    photo: null, // see note at top of file — not persisted, so not reloaded either
    completionPhoto: null,
    status: r.status,
    studentId: String(r.student_id),
    hostelBlock: r.hostel_block,
    assignedTo: r.assigned_to != null ? String(r.assigned_to) : null,
    escalationLevel: Number(r.escalation_level) || 0,
    responseDueAt: fromSqlDateTime(r.response_due_at),
    resolutionDueAt: fromSqlDateTime(r.resolution_due_at),
    finalDueAt: fromSqlDateTime(r.final_due_at),
    createdAt: r.created_at,
    history: historyByComplaint[String(r.id)] || []
  }));
}

async function loadEscalations() {
  const res = await API.select("escalations");
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

async function loadPendingRegistrations() {
  const res = await API.select("pending_registrations", { where: { status: "pending" } });
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
  await Promise.all([loadUsers(), loadComplaints(), loadPendingRegistrations(), loadEscalations()]);
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
}

function getPendingRegistrations() {
  return PENDING_REGISTRATIONS.filter(r => r.status === "pending");
}

// ---------------- Complaints ----------------

async function addComplaint({ title, category, description, photo, studentId }) {
  const severity = CATEGORY_SEVERITY[category] || "Medium";
  const student = getUser(studentId);
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
    responseDueAt, resolutionDueAt, finalDueAt,
    createdAt: nowStamp(),
    history: [{ at: nowStamp(), text: note }]
  };
  COMPLAINTS.unshift(c);
  return c;
}

// Warden-only correction of a mis-categorized complaint's severity. Recomputes
// the SLA due-by timestamps from *now* using the new severity, so lowering an
// inflated severity genuinely relaxes the clock instead of just relabeling it.
async function updateComplaintSeverity(complaintId, newSeverity, wardenId, reason) {
  const c = COMPLAINTS.find(x => x.id === complaintId);
  if (!c || !SLA_POLICY[newSeverity]) return;

  const oldSeverity = c.severity;
  if (oldSeverity === newSeverity) return;

  const policy = SLA_POLICY[newSeverity];
  const now = new Date();
  const responseDueAt = addHours(now, policy.responseHours);
  const resolutionDueAt = addHours(now, policy.resolutionHours);
  const finalDueAt = addHours(now, policy.finalHours);

  await API.update("complaints", {
    severity: newSeverity,
    response_due_at: toSqlDateTime(responseDueAt),
    resolution_due_at: toSqlDateTime(resolutionDueAt),
    final_due_at: toSqlDateTime(finalDueAt)
  }, { id: Number(complaintId) });

  const warden = getUser(wardenId);
  const note = `Severity changed from ${oldSeverity} to ${newSeverity} by ${warden.name}` +
    (reason ? ` — ${reason}` : "");
  await API.insert("complaint_history", { complaint_id: Number(complaintId), note });

  c.severity = newSeverity;
  c.responseDueAt = responseDueAt;
  c.resolutionDueAt = resolutionDueAt;
  c.finalDueAt = finalDueAt;
  c.history.push({ at: nowStamp(), text: note });
}

async function assignComplaint(complaintId, maintenanceId, wardenId) {
  const c = COMPLAINTS.find(x => x.id === complaintId);
  if (!c) return;

  await API.update("complaints", { assigned_to: Number(maintenanceId), status: "Assigned" }, { id: Number(complaintId) });
  const note = `Assigned to ${getUser(maintenanceId).name} by ${getUser(wardenId).name}`;
  await API.insert("complaint_history", { complaint_id: Number(complaintId), note });

  c.assignedTo = maintenanceId;
  c.status = "Assigned";
  c.history.push({ at: nowStamp(), text: note });
}

async function markDone(complaintId, maintenanceId, photo) {
  const c = COMPLAINTS.find(x => x.id === complaintId);
  if (!c) return;

  await API.update("complaints", { status: "Under Review" }, { id: Number(complaintId) });
  const note = `Marked done by ${getUser(maintenanceId).name}, awaiting warden review`;
  await API.insert("complaint_history", { complaint_id: Number(complaintId), note });

  c.status = "Under Review";
  if (photo) c.completionPhoto = photo; // client-side only, see note at top of file
  c.history.push({ at: nowStamp(), text: note });
}

async function resolveComplaint(complaintId, resolverId) {
  const c = COMPLAINTS.find(x => x.id === complaintId);
  if (!c) return;

  await API.update("complaints", { status: "Resolved" }, { id: Number(complaintId) });
  const note = `Marked resolved by ${getUser(resolverId).name}`;
  await API.insert("complaint_history", { complaint_id: Number(complaintId), note });

  c.status = "Resolved";
  c.history.push({ at: nowStamp(), text: note });
}

async function reassignComplaint(complaintId, wardenId) {
  const c = COMPLAINTS.find(x => x.id === complaintId);
  if (!c) return;

  await API.update("complaints", { status: "Assigned" }, { id: Number(complaintId) });
  const note = `Sent back to ${getUser(c.assignedTo).name} by ${getUser(wardenId).name}`;
  await API.insert("complaint_history", { complaint_id: Number(complaintId), note });

  c.status = "Assigned";
  c.history.push({ at: nowStamp(), text: note });
}

// Manual escalation: an authority can push a complaint up one level early
// (SRS FR-07/ESCALATION_ACK — "escalate manually" requires a recorded reason).
async function escalateManually(complaintId, byUserId, reason) {
  const c = COMPLAINTS.find(x => x.id === complaintId);
  if (!c || c.escalationLevel >= 3 || c.status === "Resolved") return;

  await recordEscalation(c, c.escalationLevel + 1, byUserId, reason || "Manually escalated");
}

// Shared by both the auto-sweep and manual escalation. Never skips a level.
async function recordEscalation(c, newLevel, byUserId, reason) {
  const role = roleForLevel(newLevel);

  await API.update("complaints", { escalation_level: newLevel }, { id: Number(c.id) });
  await API.insert("escalations", {
    complaint_id: Number(c.id),
    level: newLevel,
    escalated_to_role: role,
    reason,
    triggered_by: byUserId || "system"
  });

  const actorName = byUserId ? (getUser(byUserId) ? getUser(byUserId).name : byUserId) : "System";
  const note = `Escalated to ${labelForLevel(newLevel)} (${reason}) — by ${actorName}`;
  await API.insert("complaint_history", { complaint_id: Number(c.id), note });

  c.escalationLevel = newLevel;
  c.history.push({ at: nowStamp(), text: note });
  ESCALATIONS.unshift({
    id: `local-${Date.now()}`,
    complaintId: c.id,
    level: newLevel,
    escalatedToRole: role,
    reason,
    triggeredBy: byUserId || "system",
    triggeredAt: nowStamp()
  });
}

// ---------------- The escalation engine (SLA breach sweep) ----------------
// The backend is a plain CRUD relay with no scheduler, so there's no true
// server-side timer queue here. Instead this sweep re-checks every open
// complaint's due-by timestamps whenever it's called, and escalates one
// level at a time — never skipping — logging every step. app.js calls this
// on every render and on a periodic interval, so a breach still gets caught
// (and audited) without requiring anyone to manually click anything, which
// is the behavior the SRS actually cares about even though the underlying
// mechanism here is a poll, not a min-heap.
async function checkEscalations() {
  const now = new Date();
  for (const c of COMPLAINTS) {
    if (c.status === "Resolved") continue;

    let targetLevel = c.escalationLevel;
    if (c.finalDueAt && now > c.finalDueAt) {
      targetLevel = 3;
    } else if (c.resolutionDueAt && now > c.resolutionDueAt) {
      targetLevel = Math.max(targetLevel, 2);
    } else if (c.responseDueAt && now > c.responseDueAt && c.status === "Pending") {
      targetLevel = Math.max(targetLevel, 1);
    }

    while (c.escalationLevel < targetLevel) {
      await recordEscalation(c, c.escalationLevel + 1, null, "SLA breach (auto)");
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
  return COMPLAINTS.filter(c => c.status !== "Resolved")
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

function historyComplaintsForWarden() {
  return COMPLAINTS.filter(c => c.status === "Resolved");
}

// Complaints currently sitting with a given escalation authority (chief
// warden / college authority / principal), most urgent (least time left) first.
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
