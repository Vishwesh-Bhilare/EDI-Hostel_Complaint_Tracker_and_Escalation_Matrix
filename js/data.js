/* Backend-backed data store.
   Same function names/signatures as the old in-memory mock, so
   app.js/student.js/warden.js/maintenance.js/admin.js didn't need to change.
   USERS / COMPLAINTS / PENDING_REGISTRATIONS are loaded from MySQL (via
   js/api.js) on startup, kept in memory for instant re-renders, and pushed
   back to the backend whenever a mutating function below is called.

   Note: complaint photos are captured client-side as base64 data URLs, but
   the schema's photo/completion_photo columns are VARCHAR(255) (meant for a
   file path, not image bytes), so photos are intentionally NOT sent to the
   backend here — they stay visible only for the current browser session. */

const CATEGORIES = {
  "Maintenance": "Low",
  "Electrical": "Moderate",
  "Plumbing/Water": "High",
  "Cleanliness/Hygiene": "High",
  "Security": "Moderate",
  "Food/Mess": "Moderate",
  "Internet/WiFi": "Low",
  "Other": "Undetermined"
};

const PRIORITY_ORDER = { "High": 0, "Moderate": 1, "Undetermined": 2, "Low": 3 };

const HOSTEL_BLOCKS = ["Devgiri Boys Hostel", "Godavari Girls Hostel"];

let USERS = [];
let PENDING_REGISTRATIONS = [];
let COMPLAINTS = [];

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
    priority: r.priority,
    description: r.description,
    photo: null, // see note at top of file — not persisted, so not reloaded either
    completionPhoto: null,
    status: r.status,
    studentId: String(r.student_id),
    assignedTo: r.assigned_to != null ? String(r.assigned_to) : null,
    createdAt: r.created_at,
    history: historyByComplaint[String(r.id)] || []
  }));
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
  await Promise.all([loadUsers(), loadComplaints(), loadPendingRegistrations()]);
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
  const priority = CATEGORIES[category] || "Undetermined";
  const res = await API.insert("complaints", {
    title, category, priority, description,
    status: "Pending", student_id: Number(studentId)
  });

  const student = getUser(studentId);
  const note = `Complaint submitted by ${student.name}`;
  await API.insert("complaint_history", { complaint_id: res.insertedId, note });

  const c = {
    id: String(res.insertedId),
    title, category, priority, description,
    photo: photo || null, // client-side only, see note at top of file
    status: "Pending",
    studentId,
    assignedTo: null,
    createdAt: nowStamp(),
    history: [{ at: nowStamp(), text: note }]
  };
  COMPLAINTS.unshift(c);
  return c;
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

async function resolveComplaint(complaintId, wardenId) {
  const c = COMPLAINTS.find(x => x.id === complaintId);
  if (!c) return;

  await API.update("complaints", { status: "Resolved" }, { id: Number(complaintId) });
  const note = `Marked resolved by ${getUser(wardenId).name}`;
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

function complaintsForStudent(studentId) {
  return COMPLAINTS.filter(c => c.studentId === studentId);
}

function complaintsForMaintenance(maintenanceId) {
  return COMPLAINTS.filter(c => c.assignedTo === maintenanceId && c.status !== "Resolved");
}

function activeComplaintsForWarden() {
  return COMPLAINTS.filter(c => c.status !== "Resolved")
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

function historyComplaintsForWarden() {
  return COMPLAINTS.filter(c => c.status === "Resolved");
}
