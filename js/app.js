let currentUser = null;
let appPage = "welcome"; // welcome | login | signup

const ROLE_LABELS = {
  student: "Student",
  warden: "Warden",
  chief_warden: "Chief Warden",
  college_authority: "College Authority",
  principal: "Principal",
  maintenance: "Maintenance",
  admin: "Admin"
};

function severityBadge(severity) {
  const cls = {
    "Critical": "sv-critical",
    "High": "sv-high",
    "Medium": "sv-medium",
    "Low": "sv-low"
  }[severity] || "sv-medium";

  return `<span class="badge-severity ${cls}">${severity}</span>`;
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

function escalationBadge(level) {
  if (!level) return `<span class="badge-escalation esc-none">With Warden</span>`;
  const cls = { 1: "esc-1", 2: "esc-2", 3: "esc-3" }[level] || "esc-1";
  return `<span class="badge-escalation ${cls}">Escalated &rarr; ${labelForLevel(level)}</span>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// Two-letter initials for avatar circles, e.g. "Alex Rao" -> "AR"
function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function login(userIdentifier, password = null) {
  const user = getUserByPrnOrEmail(userIdentifier) || getUser(userIdentifier);
  if (!user) return false;

  // If password is provided, verify it
  if (password !== null && user.password && user.password !== password) {
    return false;
  }

  currentUser = user;
  render();
  return true;
}

function logout() {
  currentUser = null;
  appPage = "welcome";
  render();
}

function render() {
  const root = document.getElementById("app");

  if (!currentUser) {
    if (appPage === "welcome") {
      root.innerHTML = renderWelcome();
      attachWelcomeHandlers();
    } else if (appPage === "login") {
      root.innerHTML = renderLogin();
      attachLoginHandlers();
    } else if (appPage === "signup") {
      root.innerHTML = renderSignup();
      attachSignupHandlers();
    }
    return;
  }

  let topbar = renderTopbar();
  let body = "";

  if (currentUser.role === "student") {
    body = renderStudentView();
  } else if (currentUser.role === "warden") {
    body = renderWardenView();
  } else if (currentUser.role === "chief_warden" || currentUser.role === "college_authority") {
    body = renderAuthorityView(currentUser.role);
  } else if (currentUser.role === "principal") {
    body = renderPrincipalView();
  } else if (currentUser.role === "maintenance") {
    body = renderMaintenanceView();
  } else if (currentUser.role === "admin") {
    body = renderAdminView();
  }

  root.innerHTML = topbar + body;
  attachViewHandlers();
}

function renderTopbar() {
  const roleLabel = ROLE_LABELS[currentUser.role] || currentUser.role;

  return `
    <div class="hct-topbar px-3 px-md-4 pt-4 pb-4 mb-4">
      <div class="d-flex justify-content-between align-items-center mb-1" style="position: relative; z-index: 1;">
        <div class="d-flex align-items-center gap-3">
          <div class="hct-avatar">${initials(currentUser.name)}</div>
          <div>
            <div class="brand">Hi, ${escapeHtml(currentUser.name.split(" ")[0])} 👋</div>
            <div class="role-tag">${roleLabel} &middot; Hostel Complaint Tracker</div>
          </div>
        </div>
        <button class="btn btn-outline-light btn-sm" id="logoutBtn">Log out</button>
      </div>
    </div>
  `;
}

function renderWelcome() {
  return `
    <div class="welcome-hero text-center">
      <div class="eyebrow-mark">🏠</div>
      <h1 class="h3 mb-1 fw-bold">Hostel Complaint Tracker</h1>
      <p class="mb-0">Log issues, track fixes, and keep every hostel block accountable.</p>
    </div>

    <div class="container py-4" style="max-width: 640px;">
      <div class="section-label mb-2">Get started</div>
      <div class="row g-3">
        <div class="col-6">
          <button class="quick-tile" id="loginBtn">
            <div class="quick-tile-icon qt-forest">→</div>
            <div class="qt-title">Login</div>
            <div class="qt-sub">Access your dashboard</div>
          </button>
        </div>
        <div class="col-6">
          <button class="quick-tile" id="signupBtn">
            <div class="quick-tile-icon qt-sage">＋</div>
            <div class="qt-title">Sign up</div>
            <div class="qt-sub">Register as a student</div>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderLogin() {
  const groups = [
    { role: "student", label: "Students" },
    { role: "warden", label: "Warden" },
    { role: "chief_warden", label: "Chief Warden" },
    { role: "college_authority", label: "College Authority" },
    { role: "principal", label: "Principal" },
    { role: "maintenance", label: "Maintenance" },
    { role: "admin", label: "Admin" }
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
              <div class="mini-avatar">${initials(u.name)}</div>
              <div>
                <div class="fw-medium">${escapeHtml(u.name)}</div>
                <div
                  class="small"
                  style="color: var(--ink-soft);"
                >
                  ${u.role === "student" ? "PRN: " + (u.prn || "") : g.label}
                </div>
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");

  return `
    <div class="welcome-hero text-center py-4">
      <h1 class="h3 mb-1 fw-bold">Welcome back</h1>
      <p class="mb-0">Pick a demo account or sign in with your PRN / email.</p>
    </div>

    <div class="container py-4" style="max-width: 640px;">
      ${groupHtml}

      <div class="mt-4 pt-3 border-top">
        <p class="small mb-2">Not a demo user?</p>
        <input type="text" class="form-control mb-2" id="loginPrn" placeholder="PRN or Email">
        <input type="password" class="form-control mb-2" id="loginPassword" placeholder="Password">
        <div class="invalid-feedback d-block" id="loginError" style="display:none !important; margin-bottom: 0.5rem;"></div>
        <button class="btn btn-navy w-100" id="customLoginBtn">Login with PRN/Email</button>
      </div>

      <div class="text-center mt-3">
        <button class="btn btn-link btn-sm" id="backToWelcome">← Back</button>
      </div>
    </div>
  `;
}

function renderSignup() {
  return `
    <div class="welcome-hero text-center py-4">
      <h1 class="h3 mb-1 fw-bold">Student Registration</h1>
      <p class="mb-0">Apply to join the hostel complaint system.</p>
    </div>

    <div class="container py-4" style="max-width: 520px;">
      <form id="signupForm" class="hct-card p-4">
        <div class="mb-3">
          <label class="form-label">Full Name</label>
          <input type="text" class="form-control" id="sigName" required placeholder="Your full name">
        </div>

        <div class="mb-3">
          <label class="form-label">PRN (Student ID)</label>
          <input type="text" class="form-control" id="sigPrn" required placeholder="e.g., B24CE1003" pattern="[A-Z][0-9]{2}[A-Z]{2}[0-9]{4}">
          <div class="form-text">Format: B24CE1003</div>
        </div>

        <div class="mb-3">
          <label class="form-label">Email</label>
          <input type="email" class="form-control" id="sigEmail" required placeholder="name@mmcoe.edu.in">
          <div class="form-text">Must end with @mmcoe.edu.in</div>
        </div>

        <div class="mb-3">
          <label class="form-label">Password</label>
          <input type="password" class="form-control" id="sigPassword" required placeholder="Create a password" minlength="6">
        </div>

        <div class="mb-3">
          <label class="form-label">Hostel Block</label>
          <select class="form-select" id="sigBlock" required>
            <option value="" disabled selected>Choose your hostel block</option>
            ${HOSTEL_BLOCKS.map(b => `<option value="${b}">${b}</option>`).join("")}
          </select>
        </div>

        <div class="invalid-feedback d-block" id="sigError" style="display:none !important; margin-bottom: 1rem;"></div>

        <button type="button" class="btn btn-navy w-100" id="sigSubmitBtn">Submit Registration</button>
      </form>

      <div class="text-center mt-3">
        <p class="small mb-0">Already registered? <button class="btn btn-link btn-sm" id="goToLogin">Login here</button></p>
      </div>
    </div>
  `;
}

function attachWelcomeHandlers() {
  document.getElementById("loginBtn").addEventListener("click", () => {
    appPage = "login";
    render();
  });

  document.getElementById("signupBtn").addEventListener("click", () => {
    appPage = "signup";
    render();
  });
}

function attachLoginHandlers() {
  const root = document.getElementById("app");

  const loginCards = root.querySelectorAll("[data-login]");
  loginCards.forEach(el => {
    el.addEventListener("click", () => login(el.getAttribute("data-login")));
  });

  document.getElementById("customLoginBtn").addEventListener("click", () => {
    const prn = document.getElementById("loginPrn").value.trim();
    const password = document.getElementById("loginPassword").value.trim();
    const errorEl = document.getElementById("loginError");

    if (!prn) {
      if (errorEl) {
        errorEl.textContent = "Please enter PRN or Email.";
        errorEl.style.setProperty("display", "block", "important");
      }
      return;
    }

    if (!login(prn, password)) {
      if (errorEl) {
        errorEl.textContent = "Invalid PRN/Email or password.";
        errorEl.style.setProperty("display", "block", "important");
      }
      return;
    }

    if (errorEl) {
      errorEl.style.setProperty("display", "none", "important");
    }
  });

  document.getElementById("backToWelcome").addEventListener("click", () => {
    appPage = "welcome";
    render();
  });
}

function attachSignupHandlers() {
  document.getElementById("sigSubmitBtn").addEventListener("click", async () => {
    const name = document.getElementById("sigName").value.trim();
    const prn = document.getElementById("sigPrn").value.trim();
    const email = document.getElementById("sigEmail").value.trim();
    const password = document.getElementById("sigPassword").value.trim();
    const block = document.getElementById("sigBlock").value;
    const errorEl = document.getElementById("sigError");

    if (!email.endsWith("@mmcoe.edu.in")) {
      errorEl.textContent = "Email must end with @mmcoe.edu.in";
      errorEl.style.setProperty("display", "block", "important");
      return;
    }

    if (!name || !prn || !email || !password || !block) {
      errorEl.textContent = "All fields are required.";
      errorEl.style.setProperty("display", "block", "important");
      return;
    }

    try {
      await submitRegistration({ name, prn, email, password, block });
    } catch (err) {
      errorEl.textContent = "Could not submit registration: " + err.message;
      errorEl.style.setProperty("display", "block", "important");
      return;
    }

    errorEl.textContent = "";
    errorEl.style.setProperty("display", "none", "important");

    alert("Registration submitted! An admin will review your request shortly.");
    appPage = "login";
    render();
  });

  document.getElementById("goToLogin").addEventListener("click", () => {
    appPage = "login";
    render();
  });
}

function attachViewHandlers() {
  const root = document.getElementById("app");

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  if (currentUser && currentUser.role === "student") {
    attachStudentHandlers();
  }

  if (currentUser && currentUser.role === "warden") {
    attachWardenHandlers();
  }

  if (currentUser && (currentUser.role === "chief_warden" || currentUser.role === "college_authority")) {
    attachAuthorityHandlers(currentUser.role);
  }

  if (currentUser && currentUser.role === "principal") {
    attachPrincipalHandlers();
  }

  if (currentUser && currentUser.role === "maintenance") {
    attachMaintenanceHandlers();
  }

  if (currentUser && currentUser.role === "admin") {
    attachAdminHandlers();
  }
}

// Runs the SLA-breach sweep, then re-renders if something actually changed
// (so an idle screen doesn't visibly flicker every poll for no reason).
async function runEscalationSweepAndRender() {
  const before = COMPLAINTS.map(c => c.escalationLevel).join(",");
  await checkEscalations();
  const after = COMPLAINTS.map(c => c.escalationLevel).join(",");
  if (before !== after && currentUser) {
    render();
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const root = document.getElementById("app");
  root.innerHTML = `<div class="container py-5 text-center"><p>Loading...</p></div>`;
  try {
    await initData();
  } catch (err) {
    root.innerHTML = `
      <div class="container py-5 text-center" style="max-width: 480px;">
        <h5>Could not reach the backend</h5>
        <p class="small" style="color: var(--ink-soft);">${escapeHtml(err.message)}</p>
        <p class="small" style="color: var(--ink-soft);">Make sure the Java server is running and MySQL is reachable, then reload.</p>
      </div>
    `;
    return;
  }

  await checkEscalations(); // catch anything that breached while nobody was watching
  render();

  // Poll for SLA breaches every 30s so escalation happens without anyone
  // having to click anything (see the note in js/data.js#checkEscalations).
  setInterval(runEscalationSweepAndRender, 30000);
});
