let currentUser = null;
let appPage = "welcome"; // welcome | login | signup

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
  } else if (currentUser.role === "maintenance") {
    body = renderMaintenanceView();
  } else if (currentUser.role === "admin") {
    body = renderAdminView();
  }

  root.innerHTML = topbar + body;
  attachViewHandlers();
}

function renderTopbar() {
  const roleLabel = {
    student: "Student",
    warden: "Warden",
    maintenance: "Maintenance",
    admin: "Admin"
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

function renderWelcome() {
  return `
    <div class="container py-5" style="max-width: 640px;">
      <div class="text-center mb-5">
        <h1 class="h3 mb-1">Hostel Complaint Tracker</h1>
        <p style="color: var(--ink-soft);">Manage hostel complaints efficiently.</p>
      </div>
      <div class="d-grid gap-2">
        <button class="btn btn-navy btn-lg" id="loginBtn">Login</button>
        <button class="btn btn-outline-navy btn-lg" id="signupBtn">Sign up</button>
      </div>
    </div>
  `;
}

function renderLogin() {
  const groups = [
    { role: "student", label: "Students" },
    { role: "warden", label: "Warden" },
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
              <div class="fw-medium">${escapeHtml(u.name)}</div>
              <div
                class="small"
                style="color: var(--ink-soft);"
              >
                ${u.role === "student" ? "PRN: " + (u.prn || "") : g.label}
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
        <h1 class="h3 mb-1">Login</h1>
        <p style="color: var(--ink-soft);">Pick a demo account or use PRN / email.</p>
      </div>

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
    <div class="container py-5" style="max-width: 520px;">
      <div class="text-center mb-4">
        <h1 class="h3 mb-1">Student Registration</h1>
        <p style="color: var(--ink-soft);">Apply to join the hostel complaint system.</p>
      </div>

      <form id="signupForm">
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

  if (currentUser && currentUser.role === "maintenance") {
    attachMaintenanceHandlers();
  }

  if (currentUser && currentUser.role === "admin") {
    attachAdminHandlers();
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
  render();
});
