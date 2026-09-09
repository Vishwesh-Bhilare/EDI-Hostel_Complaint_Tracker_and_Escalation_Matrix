/*
 * HostelCare data/service layer.
 *
 * This file contains the browser-side business logic for the prototype.
 * Persistent application state is stored in normalized MySQL tables through
 * the lightweight JDBC server at /api/state/<key>. JSON is only the HTTP
 * transport format. Browser-local state (the current session and testing-mode
 * preference) remains in localStorage.
 *
 * Existing localStorage hc_* data is migrated to MySQL automatically when a
 * server-side collection is empty, then the legacy browser copy is removed.
 */
const HC = (() => {
  const NS = "hc_";
  const K = {
    users: NS + "users",
    complaints: NS + "complaints",
    assignments: NS + "assignments",
    escalations: NS + "escalations",
    feedback: NS + "feedback",
    notifications: NS + "notifications",
    audit: NS + "audit",
    session: NS + "session",
    seeded: NS + "seeded_v2",
    testing: NS + "testing_mode",
  };

  // ---------- low-level storage helpers ----------
  // Sessions and the demo timer preference are intentionally browser-local.
  // Everything else is persisted through the JDBC-backed /api/state endpoint.
  function isBrowserLocalKey(key) {
    return key === K.session || key === K.testing;
  }

  function stateUrl(key) {
    return "/api/state/" + encodeURIComponent(key);
  }

  function readLocal(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeLocal(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function putServerRaw(key, raw) {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", stateUrl(key), false);
    xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8");
    xhr.send(raw);
    return xhr.status === 204 || (xhr.status >= 200 && xhr.status < 300);
  }

  function read(key, fallback) {
    if (isBrowserLocalKey(key)) return readLocal(key, fallback);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", stateUrl(key), false);
      xhr.send();

      if (xhr.status === 200) {
        const value = JSON.parse(xhr.responseText);
        // Once MySQL is authoritative, remove any old persistent browser copy.
        localStorage.removeItem(key);
        return value;
      }

      if (xhr.status === 404) {
        // One-time migration path from the old browser-only implementation.
        const legacyRaw = localStorage.getItem(key);
        if (legacyRaw !== null) {
          try {
            const legacyValue = JSON.parse(legacyRaw);
            if (putServerRaw(key, legacyRaw)) {
              localStorage.removeItem(key);
              return legacyValue;
            }
          } catch (migrationError) {
            console.warn("HostelCare: could not migrate legacy key", key, migrationError);
          }
        }
        return fallback;
      }

      console.error("HostelCare persistence read failed:", key, xhr.status, xhr.responseText);
    } catch (e) {
      console.error("HostelCare persistence server is unavailable. Start the project with run.bat/run.sh.", e);
    }

    // Offline fallback keeps the UI usable, but data written here is not
    // guaranteed to survive a change of browser origin. The normal supported
    // launch path is the JDBC server included with this project.
    return readLocal(key, fallback);
  }

  function write(key, value) {
    if (isBrowserLocalKey(key)) {
      writeLocal(key, value);
      return;
    }

    const raw = JSON.stringify(value);
    try {
      if (putServerRaw(key, raw)) {
        // MySQL is authoritative; do not retain persistent entity JSON locally.
        localStorage.removeItem(key);
        return;
      }
      console.error("HostelCare persistence write failed:", key);
    } catch (e) {
      console.error("HostelCare persistence server is unavailable. Start the project with run.bat/run.sh.", e);
    }

    localStorage.setItem(key, raw);
  }
  function uid(prefix) {
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function nowISO() {
    return new Date().toISOString();
  }
  function correlationId() {
    return "req_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // ---------- Performance policy / escalation matrix (SRS section 6.3) ----------
  // Duration unit is milliseconds. TESTING_SCALE compresses hours into
  // seconds so the escalation engine can be observed in a live demo instead
  // of waiting real hours; Admin > Settings can toggle it.
  const HOUR = 3600 * 1000;
  const MIN = 60 * 1000;

  const PERFORMANCE_MATRIX = {
    Low: {
      response: 12 * HOUR, resolution: 72 * HOUR,
      chain: [
        { level: 1, role: "maintenance_staff", label: "Maintenance Staff" },
        { level: 2, role: "warden", label: "Warden" },
      ],
    },
    Medium: {
      response: 6 * HOUR, resolution: 48 * HOUR,
      chain: [
        { level: 1, role: "warden", label: "Warden" },
        { level: 2, role: "deputy_warden", label: "Assistant / Deputy Warden" },
        { level: 3, role: "chief_warden", label: "Chief Warden" },
      ],
    },
    High: {
      response: 2 * HOUR, resolution: 24 * HOUR,
      chain: [
        { level: 1, role: "warden", label: "Warden" },
        { level: 2, role: "chief_warden", label: "Chief Warden" },
        { level: 3, role: "dean", label: "Dean of Student Welfare" },
      ],
    },
    Critical: {
      response: 30 * MIN, resolution: 6 * HOUR,
      chain: [
        { level: 1, role: "warden", label: "Warden + Security" },
        { level: 2, role: "chief_warden", label: "Chief Warden" },
        { level: 3, role: "dean", label: "Dean of Student Welfare" },
        { level: 4, role: "director", label: "Director / Principal" },
      ],
    },
  };

  function testingMode() {
    return read(K.testing, false);
  }
  function setTestingMode(on) {
    write(K.testing, !!on);
  }
  function scale(ms) {
    // In testing mode, 1 hour of resolution time becomes 20 seconds of wall time.
    return testingMode() ? Math.round(ms / HOUR) * 20 * 1000 || 5000 : ms;
  }

  const ROLE_LABELS = {
    resident: "Resident",
    maintenance_staff: "Maintenance Staff",
    warden: "Warden",
    deputy_warden: "Assistant / Deputy Warden",
    chief_warden: "Chief Warden",
    dean: "Dean of Student Welfare",
    director: "Director / Principal",
    admin: "Administrator",
  };

  const CATEGORIES = ["Maintenance / Repair", "Electrical", "Plumbing / Water", "Cleanliness / Hygiene", "Security", "Food / Mess", "Internet / Wi-Fi", "Other"];
  const BLOCKS = ["Block A", "Block B", "Block C", "Block D"];

  // ---------- seed data ----------
  function seed() {
    if (read(K.seeded, false)) return;
    const users = [
      { user_id: "u_admin", name: "Admin Office", username: "AD900001", password: "admin123", role: "admin", room_no: null, hostel_block: null, status: "active" },
      { user_id: "u_res1", name: "Rahul Sharma", username: "TY123456", password: "resident123", role: "resident", room_no: "B-204", hostel_block: "Block B", status: "active" },
      { user_id: "u_res2", name: "Ananya Iyer", username: "TY123457", password: "resident123", role: "resident", room_no: "A-110", hostel_block: "Block A", status: "active" },
      { user_id: "u_staff1", name: "Suresh Patil", username: "ST200001", password: "staff123", role: "maintenance_staff", room_no: null, hostel_block: null, status: "active" },
      { user_id: "u_staff2", name: "Meena Kulkarni", username: "ST200002", password: "staff123", role: "maintenance_staff", room_no: null, hostel_block: null, status: "active" },
      { user_id: "u_ward_a", name: "Prakash Rane", username: "WD300001", password: "warden123", role: "warden", room_no: null, hostel_block: "Block A", status: "active" },
      { user_id: "u_ward_b", name: "Sunita Deshmukh", username: "WD300002", password: "warden123", role: "warden", room_no: null, hostel_block: "Block B", status: "active" },
      { user_id: "u_dep1", name: "Kiran Joshi", username: "WD400001", password: "warden123", role: "deputy_warden", room_no: null, hostel_block: null, status: "active" },
      { user_id: "u_chief1", name: "Dr. Vikram Nair", username: "WD500001", password: "warden123", role: "chief_warden", room_no: null, hostel_block: null, status: "active" },
      { user_id: "u_dean1", name: "Dr. Leela Menon", username: "WD600001", password: "warden123", role: "dean", room_no: null, hostel_block: null, status: "active" },
      { user_id: "u_dir1", name: "Dr. A. Fernandes", username: "WD700001", password: "warden123", role: "director", room_no: null, hostel_block: null, status: "active" },
    ];
    write(K.users, users);
    write(K.complaints, []);
    write(K.assignments, []);
    write(K.escalations, []);
    write(K.feedback, []);
    write(K.notifications, []);
    write(K.audit, []);
    write(K.seeded, true);
  }

  function audit(actor, action, target, outcome, metadata) {
    const events = read(K.audit, []);
    events.unshift({
      correlation_id: correlationId(),
      actor: actor ? `${actor.role}:${actor.username}` : "system",
      action, target, outcome,
      timestamp: nowISO(),
      metadata: metadata || {},
    });
    write(K.audit, events.slice(0, 500));
  }

  function notify(recipientRole, recipientBlock, type, payload) {
    const list = read(K.notifications, []);
    list.unshift({
      notification_id: uid("ntf"),
      recipient_role: recipientRole,
      recipient_block: recipientBlock || null,
      type, payload,
      created_at: nowISO(),
      read: false,
    });
    write(K.notifications, list.slice(0, 300));
  }

  // ---------- session ----------
  function AUTH_LOGIN(username, password) {
    const users = read(K.users, []);
    const user = users.find(u => u.username.toLowerCase() === String(username).trim().toLowerCase());
    if (!user || user.password !== password || user.status !== "active") {
      audit(null, "AUTH_LOGIN", username, "UNAUTHENTICATED");
      return { ok: false, error: "UNAUTHENTICATED", message: "Invalid institutional ID or password." };
    }
    const session = { user_id: user.user_id, username: user.username, name: user.name, role: user.role, hostel_block: user.hostel_block, room_no: user.room_no, issued_at: nowISO() };
    write(K.session, session);
    audit(session, "AUTH_LOGIN", user.user_id, "OK");
    return { ok: true, session };
  }
  function AUTH_LOGOUT() {
    const s = getSession();
    if (s) audit(s, "AUTH_LOGOUT", s.user_id, "OK");
    localStorage.removeItem(K.session);
  }
  function getSession() {
    return read(K.session, null);
  }
  function REGISTER(data) {
    const users = read(K.users, []);
    if (users.some(u => u.username.toLowerCase() === data.username.toLowerCase())) {
      return { ok: false, error: "CONFLICT", message: "That institutional ID is already registered." };
    }
    const user = {
      user_id: uid("u"), name: data.name, username: data.username, password: data.password,
      role: "resident", room_no: data.room_no, hostel_block: data.hostel_block, status: "active", email: data.email,
    };
    users.push(user);
    write(K.users, users);
    audit(null, "REGISTER", user.user_id, "OK", { role: "resident" });
    return { ok: true, user_id: user.user_id };
  }

  function listUsers() { return read(K.users, []); }
  function findUser(user_id) { return listUsers().find(u => u.user_id === user_id); }
  function staffList() { return listUsers().filter(u => u.role === "maintenance_staff" && u.status === "active"); }
  function ADMIN_CREATE_USER(actor, data) {
    if (!actor || actor.role !== "admin") return { ok: false, error: "FORBIDDEN" };
    const users = read(K.users, []);
    if (users.some(u => u.username.toLowerCase() === data.username.toLowerCase())) {
      return { ok: false, error: "CONFLICT", message: "Institutional ID already exists." };
    }
    const user = { user_id: uid("u"), name: data.name, username: data.username, password: data.password || "changeme123", role: data.role, room_no: null, hostel_block: data.hostel_block || null, status: "active" };
    users.push(user);
    write(K.users, users);
    audit(actor, "ADMIN_CREATE_USER", user.user_id, "OK", { role: data.role });
    return { ok: true, user_id: user.user_id };
  }
  function ADMIN_SET_USER_STATUS(actor, user_id, status) {
    if (!actor || actor.role !== "admin") return { ok: false, error: "FORBIDDEN" };
    const users = read(K.users, []);
    const u = users.find(x => x.user_id === user_id);
    if (!u) return { ok: false, error: "NOT_FOUND" };
    u.status = status;
    write(K.users, users);
    audit(actor, "ADMIN_SET_USER_STATUS", user_id, "OK", { status });
    return { ok: true };
  }

  // ---------- complaints ----------
  function complaints() { return read(K.complaints, []); }
  function saveComplaints(list) { write(K.complaints, list); }

  function policyFor(category, severity) {
    return PERFORMANCE_MATRIX[severity];
  }

  function COMPLAINT_CREATE(actor, data, idempotency_key) {
    if (!actor || actor.role !== "resident") return { ok: false, error: "FORBIDDEN" };
    const list = complaints();
    const dup = list.find(c => c.idempotency_key === idempotency_key && c.resident_id === actor.user_id);
    if (dup) {
      audit(actor, "COMPLAINT_CREATE", dup.complaint_id, "CONFLICT", { idempotent_replay: true });
      return { ok: true, complaint: dup, replay: true };
    }
    const policy = policyFor(data.category, data.severity);
    if (!policy) return { ok: false, error: "INVALID_REQUEST", message: "Unknown severity/category." };
    const created_at = Date.now();
    const response_ms = scale(policy.response);
    const resolution_ms = scale(policy.resolution);
    const complaint = {
      complaint_id: "HC-" + new Date().getFullYear() + "-" + String(100000 + list.length + Math.floor(Math.random() * 800000)).slice(0, 6),
      resident_id: actor.user_id,
      resident_name: actor.name,
      room_no: actor.room_no,
      hostel_block: data.hostel_block || actor.hostel_block,
      category: data.category,
      severity: data.severity,
      description: data.description,
      evidence_name: data.evidence_name || null,
      status: "Open",
      level: 1,
      current_role: policy.chain[0].role,
      acknowledged: false,
      acknowledged_at: null,
      created_at,
      response_due: created_at + response_ms,
      resolution_due: created_at + resolution_ms,
      resolved_at: null,
      resolution_note: null,
      breach_flag: false,
      version: 1,
      idempotency_key,
    };
    list.unshift(complaint);
    saveComplaints(list);
    notify(policy.chain[0].role, complaint.hostel_block, "NEW_COMPLAINT", { complaint_id: complaint.complaint_id });
    audit(actor, "COMPLAINT_CREATE", complaint.complaint_id, "OK", { category: data.category, severity: data.severity });
    return { ok: true, complaint };
  }

  function scopedComplaints(actor) {
    const all = complaints();
    if (!actor) return [];
    switch (actor.role) {
      case "resident":
        return all.filter(c => c.resident_id === actor.user_id);
      case "warden":
        return all.filter(c => c.hostel_block === actor.hostel_block);
      case "maintenance_staff": {
        const mine = new Set(read(K.assignments, []).filter(a => a.staff_id === actor.user_id).map(a => a.complaint_id));
        return all.filter(c => mine.has(c.complaint_id));
      }
      case "deputy_warden":
      case "chief_warden":
      case "dean":
      case "director":
      case "admin":
        return all;
      default:
        return [];
    }
  }

  function COMPLAINT_LIST(actor, filters) {
    filters = filters || {};
    let list = scopedComplaints(actor);
    if (filters.status) list = list.filter(c => c.status === filters.status);
    if (filters.severity) list = list.filter(c => c.severity === filters.severity);
    if (filters.category) list = list.filter(c => c.category === filters.category);
    if (filters.hostel_block) list = list.filter(c => c.hostel_block === filters.hostel_block);
    if (filters.q) {
      const q = filters.q.toLowerCase();
      list = list.filter(c => c.description.toLowerCase().includes(q) || c.complaint_id.toLowerCase().includes(q) || (c.resident_name || "").toLowerCase().includes(q));
    }
    return list.sort((a, b) => b.created_at - a.created_at);
  }

  function COMPLAINT_GET(actor, complaint_id) {
    const c = complaints().find(x => x.complaint_id === complaint_id);
    if (!c) return { ok: false, error: "NOT_FOUND" };
    const visible = scopedComplaints(actor).some(x => x.complaint_id === complaint_id);
    if (!visible) return { ok: false, error: "FORBIDDEN" };
    return { ok: true, complaint: c, escalations: escalationsFor(complaint_id), assignment: assignmentFor(complaint_id), feedback: feedbackFor(complaint_id) };
  }

  function canAct(actor, complaint, atLevelRole) {
    if (!actor) return false;
    if (actor.role === "admin") return true;
    if (atLevelRole === "warden" && actor.role === "warden") return actor.hostel_block === complaint.hostel_block;
    return actor.role === atLevelRole;
  }

  function chainFor(complaint) { return PERFORMANCE_MATRIX[complaint.severity].chain; }
  function roleAtLevel(complaint, level) {
    const chain = chainFor(complaint);
    const step = chain.find(c => c.level === level) || chain[chain.length - 1];
    return step.role;
  }

  function COMPLAINT_ACKNOWLEDGE(actor, complaint_id) {
    const list = complaints();
    const c = list.find(x => x.complaint_id === complaint_id);
    if (!c) return { ok: false, error: "NOT_FOUND" };
    if (["Resolved", "Closed", "Withdrawn"].includes(c.status)) return { ok: false, error: "CONFLICT" };
    if (!canAct(actor, c, c.current_role)) return { ok: false, error: "FORBIDDEN" };
    if (c.acknowledged) return { ok: false, error: "CONFLICT", message: "Already acknowledged." };
    c.acknowledged = true;
    c.acknowledged_at = Date.now();
    c.status = c.status.startsWith("Escalated") ? c.status : "Acknowledged";
    c.version++;
    saveComplaints(list);
    audit(actor, "COMPLAINT_ACKNOWLEDGE", complaint_id, "OK");
    return { ok: true, complaint: c };
  }

  function COMPLAINT_ASSIGN(actor, complaint_id, staff_id) {
    const list = complaints();
    const c = list.find(x => x.complaint_id === complaint_id);
    if (!c) return { ok: false, error: "NOT_FOUND" };
    if (["Resolved", "Closed", "Withdrawn"].includes(c.status)) return { ok: false, error: "CONFLICT" };
    const isWardenOfBlock = actor.role === "warden" && actor.hostel_block === c.hostel_block;
    if (!(actor.role === "admin" || isWardenOfBlock || ["deputy_warden", "chief_warden", "dean", "director"].includes(actor.role))) {
      return { ok: false, error: "FORBIDDEN" };
    }
    const staff = findUser(staff_id);
    if (!staff || staff.role !== "maintenance_staff") return { ok: false, error: "INVALID_REQUEST", message: "Not a registered maintenance staff member." };
    const assignments = read(K.assignments, []);
    const existing = assignments.find(a => a.complaint_id === complaint_id && a.status === "active");
    if (existing) existing.status = "reassigned";
    assignments.push({ assignment_id: uid("asg"), complaint_id, staff_id, assigned_at: nowISO(), status: "active" });
    write(K.assignments, assignments);
    c.status = "Assigned";
    c.version++;
    saveComplaints(list);
    notify("maintenance_staff", null, "ASSIGNED", { complaint_id, staff_id });
    audit(actor, "COMPLAINT_ASSIGN", complaint_id, "OK", { staff_id });
    return { ok: true, complaint: c };
  }

  function assignmentFor(complaint_id) {
    const assignments = read(K.assignments, []);
    return assignments.filter(a => a.complaint_id === complaint_id).sort((a, b) => new Date(b.assigned_at) - new Date(a.assigned_at))[0] || null;
  }

  function COMPLAINT_RESOLVE(actor, complaint_id, note) {
    const list = complaints();
    const c = list.find(x => x.complaint_id === complaint_id);
    if (!c) return { ok: false, error: "NOT_FOUND" };
    const asg = assignmentFor(complaint_id);
    if (!asg || asg.status !== "active") return { ok: false, error: "CONFLICT", message: "Complaint is not currently assigned." };
    if (!(actor.role === "admin" || (actor.role === "maintenance_staff" && asg.staff_id === actor.user_id))) return { ok: false, error: "FORBIDDEN" };
    if (!note || !note.trim()) return { ok: false, error: "INVALID_REQUEST", message: "A resolution note is required." };
    c.status = "Resolved";
    c.resolved_at = Date.now();
    c.resolution_note = note.trim();
    c.version++;
    saveComplaints(list);
    notify("resident", null, "RESOLVED", { complaint_id });
    audit(actor, "COMPLAINT_RESOLVE", complaint_id, "OK");
    return { ok: true, complaint: c };
  }

  function COMPLAINT_WITHDRAW(actor, complaint_id) {
    const list = complaints();
    const c = list.find(x => x.complaint_id === complaint_id);
    if (!c) return { ok: false, error: "NOT_FOUND" };
    if (actor.role !== "resident" || c.resident_id !== actor.user_id) return { ok: false, error: "FORBIDDEN" };
    if (c.status !== "Open") return { ok: false, error: "CONFLICT", message: "Complaint can only be withdrawn before assignment/acknowledgement." };
    c.status = "Withdrawn";
    c.version++;
    saveComplaints(list);
    audit(actor, "COMPLAINT_WITHDRAW", complaint_id, "OK");
    return { ok: true, complaint: c };
  }

  function escalate(c, reason, manual, actor) {
    const chain = chainFor(c);
    if (c.level >= chain.length) {
      c.breach_flag = true;
      return;
    }
    c.level += 1;
    const step = chain.find(s => s.level === c.level);
    c.current_role = step.role;
    c.status = `Escalated-L${c.level}`;
    c.acknowledged = false;
    // restart the response clock at the new level so it can be measured again
    const policy = PERFORMANCE_MATRIX[c.severity];
    c.response_due = Date.now() + scale(policy.response);
    if (!manual) {
      // give the resolution clock a shorter follow-up window if it was a resolution breach
      c.resolution_due = Math.max(c.resolution_due, Date.now() + scale(policy.resolution) / 2);
    }
    c.version++;
    const escalations = read(K.escalations, []);
    escalations.unshift({
      escalation_id: uid("esc"), complaint_id: c.complaint_id, level: c.level,
      escalated_to_role: step.role, reason, triggered_at: nowISO(),
      manual: !!manual, actor: actor ? actor.username : "system", acknowledged: false,
    });
    write(K.escalations, escalations);
    notify(step.role, c.hostel_block, "ESCALATION", { complaint_id: c.complaint_id, level: c.level, reason });
    audit(actor, "ESCALATION_TRIGGER", c.complaint_id, "OK", { level: c.level, reason, manual: !!manual });
  }

  function ESCALATION_MANUAL(actor, complaint_id, reason) {
    const list = complaints();
    const c = list.find(x => x.complaint_id === complaint_id);
    if (!c) return { ok: false, error: "NOT_FOUND" };
    if (["Resolved", "Closed", "Withdrawn"].includes(c.status)) return { ok: false, error: "CONFLICT" };
    if (!canAct(actor, c, c.current_role) && actor.role !== "admin") return { ok: false, error: "FORBIDDEN" };
    if (!reason || !reason.trim()) return { ok: false, error: "INVALID_REQUEST", message: "A reason is required for manual escalation." };
    escalate(c, "Manual escalation: " + reason.trim(), true, actor);
    saveComplaints(list);
    return { ok: true, complaint: c };
  }

  function ESCALATION_ACK(actor, escalation_id, decision, reason) {
    const escalations = read(K.escalations, []);
    const e = escalations.find(x => x.escalation_id === escalation_id);
    if (!e) return { ok: false, error: "NOT_FOUND" };
    const list = complaints();
    const c = list.find(x => x.complaint_id === e.complaint_id);
    if (!c) return { ok: false, error: "NOT_FOUND" };
    if (!canAct(actor, c, e.escalated_to_role)) return { ok: false, error: "FORBIDDEN" };
    e.acknowledged = true;
    e.ack_by = actor.username;
    e.decision = decision;
    e.decision_reason = reason || "";
    write(K.escalations, escalations);
    audit(actor, "ESCALATION_ACK", e.complaint_id, "OK", { escalation_id, decision });
    return { ok: true };
  }

  function escalationsFor(complaint_id) {
    return read(K.escalations, []).filter(e => e.complaint_id === complaint_id).sort((a, b) => new Date(a.triggered_at) - new Date(b.triggered_at));
  }

  function FEEDBACK_SUBMIT(actor, complaint_id, rating, reopen) {
    const list = complaints();
    const c = list.find(x => x.complaint_id === complaint_id);
    if (!c) return { ok: false, error: "NOT_FOUND" };
    if (actor.role !== "resident" || c.resident_id !== actor.user_id) return { ok: false, error: "FORBIDDEN" };
    if (c.status !== "Resolved") return { ok: false, error: "CONFLICT", message: "Only resolved complaints can receive feedback." };
    const feedback = read(K.feedback, []);
    feedback.unshift({ feedback_id: uid("fb"), complaint_id, resident_id: actor.user_id, rating: rating || null, reopened: !!reopen, submitted_at: nowISO() });
    write(K.feedback, feedback);
    if (reopen) {
      c.status = assignmentFor(complaint_id) ? "Assigned" : `Escalated-L${c.level}`;
      c.resolved_at = null;
      const policy = PERFORMANCE_MATRIX[c.severity];
      c.resolution_due = Date.now() + scale(policy.resolution);
    } else {
      c.status = "Closed";
    }
    c.version++;
    saveComplaints(list);
    audit(actor, "FEEDBACK_SUBMIT", complaint_id, "OK", { reopened: !!reopen });
    return { ok: true, complaint: c };
  }
  function feedbackFor(complaint_id) {
    return read(K.feedback, []).filter(f => f.complaint_id === complaint_id);
  }

  // ---------- background escalation engine (simulates B09 timer queue + B06) ----------
  function checkBreaches() {
    const list = complaints();
    const now = Date.now();
    let changed = false;
    for (const c of list) {
      if (["Resolved", "Closed", "Withdrawn"].includes(c.status)) continue;
      if (c.breach_flag) continue;
      if (!c.acknowledged && now > c.response_due) {
        escalate(c, "Response deadline breached", false, null);
        changed = true;
      } else if (now > c.resolution_due) {
        escalate(c, "Resolution deadline breached", false, null);
        changed = true;
      }
    }
    if (changed) saveComplaints(list);
  }
  function startEngine() {
    checkBreaches();
    setInterval(checkBreaches, 4000);
  }

  // ---------- analytics ----------
  function ANALYTICS_SUMMARY(actor) {
    const list = scopedComplaints(actor);
    const now = Date.now();
    const open = list.filter(c => !["Resolved", "Closed", "Withdrawn"].includes(c.status)).length;
    const resolved = list.filter(c => ["Resolved", "Closed"].includes(c.status)).length;
    const escalated = list.filter(c => c.status.startsWith("Escalated")).length;
    const breached = list.filter(c => c.breach_flag || (!["Resolved", "Closed", "Withdrawn"].includes(c.status) && now > c.resolution_due)).length;
    const total = list.length || 1;
    const complianceRate = Math.round(((total - breached) / total) * 100);
    const bySeverity = {};
    ["Low", "Medium", "High", "Critical"].forEach(s => bySeverity[s] = list.filter(c => c.severity === s).length);
    return { total: list.length, open, resolved, escalated, breached, complianceRate, bySeverity };
  }

  function NOTIFICATIONS_FOR(actor) {
    if (!actor) return [];
    const all = read(K.notifications, []);
    return all.filter(n => n.recipient_role === actor.role && (!n.recipient_block || n.recipient_block === actor.hostel_block || actor.role === "admin")).slice(0, 20);
  }

  function AUDIT_LIST(actor) {
    if (!actor || actor.role !== "admin") return [];
    return read(K.audit, []);
  }

  seed();

  return {
    PERFORMANCE_MATRIX, ROLE_LABELS, CATEGORIES, BLOCKS,
    AUTH_LOGIN, AUTH_LOGOUT, getSession, REGISTER,
    listUsers, findUser, staffList, ADMIN_CREATE_USER, ADMIN_SET_USER_STATUS,
    COMPLAINT_CREATE, COMPLAINT_LIST, COMPLAINT_GET, COMPLAINT_ACKNOWLEDGE,
    COMPLAINT_ASSIGN, COMPLAINT_RESOLVE, COMPLAINT_WITHDRAW,
    ESCALATION_MANUAL, ESCALATION_ACK, escalationsFor,
    FEEDBACK_SUBMIT, feedbackFor,
    ANALYTICS_SUMMARY, NOTIFICATIONS_FOR, AUDIT_LIST,
    testingMode, setTestingMode, startEngine, checkBreaches,
    uid, nowISO,
  };
})();
