let currentUser = null;

function priorityBadge(priority) {
  const cls = {
    "High": "p-high",
    "Moderate": "p-moderate",
    "Low": "p-low",
    "Undetermined": "p-undetermined"
  }[priority] || "p-undetermined";

  return `<span class="badge-priority ${cls}">${priority} priority</span>`;
}

function statusBadge(status) {
  const cls = {
    "Pending": "st-pending",
    "Assigned": "st-assigned",
    "Under Review": "st-review",
    "Resolved": "st-resolved"
  }[status] || "st-pending";

  return `<span class="badge-status ${cls}">${status}</span>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function login(userId) {
  currentUser = getUser(userId);
  render();
}

function logout() {
  currentUser = null;
  render();
}

function render() {
  const root = document.getElementById("app");

  if (!currentUser) {
    root.innerHTML = renderLogin();

    // Attach click handlers to the login account cards.
    attachViewHandlers();

    return;
  }

  let topbar = renderTopbar();
  let body = "";

  if (currentUser.role === "student") {
    body = renderStudentView();
  } else if (currentUser.role === "warden") {
    body = renderWardenView();
  } else if (currentUser.role === "maintenance") {
    body = renderMaintenanceView();
  }

  root.innerHTML = topbar + body;

  attachViewHandlers();
}

function renderTopbar() {
  const roleLabel = {
    student: "Student",
    warden: "Warden",
    maintenance: "Maintenance"
  }[currentUser.role];

  return `
    <div class="hct-topbar px-3 px-md-4 py-3 d-flex justify-content-between align-items-center mb-4">
      <div>
        <div class="brand">Hostel Complaint Tracker</div>
        <div class="role-tag">${roleLabel} &middot; ${escapeHtml(currentUser.name)}</div>
      </div>
      <button class="btn btn-outline-light btn-sm" id="logoutBtn">Log out</button>
    </div>
  `;
}

function renderLogin() {
  const groups = [
    { role: "student", label: "Students" },
    { role: "warden", label: "Warden" },
    { role: "maintenance", label: "Maintenance" }
  ];

  const groupHtml = groups.map(g => `
    <div class="mb-4">
      <div
        class="text-uppercase small fw-medium mb-2"
        style="color: var(--ink-soft); letter-spacing:0.04em;"
      >
        ${g.label}
      </div>

      <div class="row g-2">
        ${usersByRole(g.role).map(u => `
          <div class="col-6 col-md-4">
            <div
              class="hct-account-card hct-card p-3"
              data-login="${u.id}"
            >
              <div class="fw-medium">${escapeHtml(u.name)}</div>
              <div
                class="small"
                style="color: var(--ink-soft);"
              >
                ${u.role === "student" ? "Room " + (u.room || "") : g.label}
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");

  return `
    <div class="container py-5" style="max-width: 640px;">
      <div class="text-center mb-4">
        <h1 class="h3 mb-1">Hostel Complaint Tracker</h1>
        <p style="color: var(--ink-soft);">
          Pick a demo account to continue.
        </p>
      </div>

      ${groupHtml}
    </div>
  `;
}

function attachViewHandlers() {
  const root = document.getElementById("app");

  // Login account cards
  const loginCards = root.querySelectorAll("[data-login]");

  loginCards.forEach(el => {
    el.addEventListener("click", () => {
      login(el.getAttribute("data-login"));
    });
  });

  // Logout
  const logoutBtn = document.getElementById("logoutBtn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }

  // Role-specific handlers
  if (currentUser && currentUser.role === "student") {
    attachStudentHandlers();
  }

  if (currentUser && currentUser.role === "warden") {
    attachWardenHandlers();
  }

  if (currentUser && currentUser.role === "maintenance") {
    attachMaintenanceHandlers();
  }
}

document.addEventListener("DOMContentLoaded", render);
