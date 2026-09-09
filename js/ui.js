/* Shared UI chrome: top bar, guards, toasts, formatting helpers. */
const HCUI = (() => {
  const DASH_BY_ROLE = {
    resident: "resident-dashboard.html",
    maintenance_staff: "staff-dashboard.html",
    warden: "warden-dashboard.html",
    deputy_warden: "warden-dashboard.html",
    chief_warden: "warden-dashboard.html",
    dean: "warden-dashboard.html",
    director: "warden-dashboard.html",
    admin: "admin-dashboard.html",
  };

  function requireSession() {
    const s = HC.getSession();
    if (!s) {
      window.location.href = "index.html";
      return null;
    }
    return s;
  }

  function requireRole(roles) {
    const s = requireSession();
    if (!s) return null;
    if (!roles.includes(s.role)) {
      window.location.href = DASH_BY_ROLE[s.role] || "index.html";
      return null;
    }
    return s;
  }

  function dashboardFor(role) {
    return DASH_BY_ROLE[role] || "index.html";
  }

  function initials(name) {
    return (name || "?").split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
  }

  function renderTopbar(session, opts) {
    opts = opts || {};
    const bar = document.getElementById("topbar");
    if (!bar) return;
    const unread = HC.NOTIFICATIONS_FOR(session).length;
    bar.innerHTML = `
      <a class="app-brand" href="${dashboardFor(session.role)}"><span class="brand-mark small">HC</span><span><strong>HostelCare</strong><small>${opts.subtitle || "Complaint Tracker"}</small></span></a>
      <div class="user-area">
        <button class="notification-btn" id="notifBtn" aria-label="Notifications">🔔${unread ? "<i></i>" : ""}</button>
        <div class="user-avatar">${initials(session.name)}</div>
        <div class="user-meta"><strong>${session.name}</strong><small>${HC.ROLE_LABELS[session.role]}${session.hostel_block ? " · " + session.hostel_block : ""}</small></div>
        <button class="logout-btn" id="logoutBtn">Logout</button>
      </div>`;
    document.getElementById("logoutBtn").addEventListener("click", () => {
      HC.AUTH_LOGOUT();
      window.location.href = "index.html";
    });
    const notifBtn = document.getElementById("notifBtn");
    if (notifBtn) notifBtn.addEventListener("click", () => showNotifications(session));
  }

  function showNotifications(session) {
    const list = HC.NOTIFICATIONS_FOR(session);
    const body = list.length
      ? list.map(n => `<div class="notif-row"><strong>${labelForNotif(n)}</strong><small>${timeAgo(n.created_at)}</small></div>`).join("")
      : `<p class="muted small-muted">No notifications yet.</p>`;
    openModal("Notifications", body);
  }
  function labelForNotif(n) {
    switch (n.type) {
      case "NEW_COMPLAINT": return `New complaint ${n.payload.complaint_id} needs attention`;
      case "ASSIGNED": return `Complaint ${n.payload.complaint_id} assigned to maintenance staff`;
      case "ESCALATION": return `Complaint ${n.payload.complaint_id} escalated (L${n.payload.level}): ${n.payload.reason}`;
      case "RESOLVED": return `Complaint ${n.payload.complaint_id} marked resolved`;
      default: return n.type;
    }
  }

  function openModal(title, bodyHtml) {
    let el = document.getElementById("hcModal");
    if (!el) {
      el = document.createElement("div");
      el.id = "hcModal";
      el.className = "modal-backdrop";
      document.body.appendChild(el);
    }
    el.innerHTML = `<div class="success-modal generic-modal">
      <button class="modal-close" id="hcModalClose" aria-label="Close">×</button>
      <h2>${title}</h2>
      <div class="modal-body">${bodyHtml}</div>
    </div>`;
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
    document.getElementById("hcModalClose").addEventListener("click", closeModalGeneric);
    el.addEventListener("click", (e) => { if (e.target === el) closeModalGeneric(); });
  }
  function closeModalGeneric() {
    const el = document.getElementById("hcModal");
    if (el) { el.classList.remove("open"); el.setAttribute("aria-hidden", "true"); }
  }

  function toast(message, kind) {
    let host = document.getElementById("toastHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "toastHost";
      document.body.appendChild(host);
    }
    const t = document.createElement("div");
    t.className = "toast " + (kind || "info");
    t.textContent = message;
    host.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 250); }, 3400);
  }

  function timeAgo(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1) return "just now";
    if (min < 60) return min + "m ago";
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + "h ago";
    return Math.floor(hr / 24) + "d ago";
  }

  function countdown(ts) {
    const diff = ts - Date.now();
    const overdue = diff < 0;
    const abs = Math.abs(diff);
    const h = Math.floor(abs / 3600000);
    const m = Math.floor((abs % 3600000) / 60000);
    const s = Math.floor((abs % 60000) / 1000);
    const label = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
    return { overdue, label };
  }

  function statusBadgeClass(status) {
    if (status === "Open") return "badge-open";
    if (status === "Acknowledged" || status === "Assigned") return "badge-progress";
    if (status.startsWith("Escalated")) return "badge-escalated";
    if (status === "Resolved" || status === "Closed") return "badge-resolved";
    if (status === "Withdrawn") return "badge-muted";
    return "badge-muted";
  }
  function severityBadgeClass(sev) {
    return { Low: "sev-low", Medium: "sev-medium", High: "sev-high", Critical: "sev-critical" }[sev] || "sev-medium";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  return { requireSession, requireRole, dashboardFor, renderTopbar, toast, timeAgo, countdown, statusBadgeClass, severityBadgeClass, openModal, closeModalGeneric, esc, initials };
})();

// Run the performance policy/escalation engine on every page that loads ui.js so breaches
// keep getting detected as long as any HostelCare tab is open. Once the
// MySQL/JDBC backend exists this becomes a real scheduled service (B09/B06)
// instead of a client-side setInterval.
if (typeof HC !== "undefined") HC.startEngine();
