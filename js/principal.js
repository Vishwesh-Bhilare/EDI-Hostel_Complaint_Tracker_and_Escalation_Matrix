/* Principal dashboard. Two jobs:
   1. Monitor everyone's activity — every complaint, every block, every role,
      not scoped like a warden's view (this is the "clean dashboard" ask).
   2. Own the top of the escalation chain (Level 3) — reuses the same queue
      component the other authorities use, via js/authority.js. */

let _principalTab = "overview";
let _principalFilters = { block: "all", status: "all", severity: "all" };

const PRINCIPAL_LEVEL = 3; // Principal sits at the top of the chain

function renderPrincipalView() {
  return `
    <div class="container pb-5" style="max-width: 960px;">
      <div class="mb-3">
        <h2 class="h5 mb-1">Principal dashboard</h2>
        <div class="small" style="color: var(--ink-soft);">
          Organization-wide view across every hostel block, role and complaint.
        </div>
      </div>

      <ul class="nav nav-pills mb-3" id="principalTabs">
        <li class="nav-item"><button class="nav-link ${_principalTab === "overview" ? "active" : ""}" data-ptab="overview">Overview</button></li>
        <li class="nav-item"><button class="nav-link ${_principalTab === "all" ? "active" : ""}" data-ptab="all">All complaints</button></li>
        <li class="nav-item"><button class="nav-link ${_principalTab === "escalations" ? "active" : ""}" data-ptab="escalations">Escalation log</button></li>
        <li class="nav-item"><button class="nav-link ${_principalTab === "queue" ? "active" : ""}" data-ptab="queue">My queue (${complaintsAtLevel(PRINCIPAL_LEVEL).length})</button></li>
      </ul>

      ${
        _principalTab === "overview" ? renderPrincipalOverview() :
        _principalTab === "all" ? renderPrincipalAllComplaints() :
        _principalTab === "escalations" ? renderPrincipalEscalationLog() :
        renderAuthorityQueueSection(PRINCIPAL_LEVEL)
      }
    </div>
    ${authorityModalsHtml()}
  `;
}

function renderPrincipalOverview() {
  const s = orgWideStats();
  const cards = [
    { label: "Total complaints", value: s.total, tone: "" },
    { label: "Currently open", value: s.open, tone: "" },
    { label: "Resolved", value: s.resolved, tone: "success" },
    { label: "Currently escalated", value: s.escalated, tone: "warn" },
    { label: "At Principal (final level)", value: s.breachedFinal, tone: "danger" },
    { label: "SLA compliance (never escalated)", value: s.complianceRate + "%", tone: "" }
  ];

  return `
    <div class="row g-3 mb-4">
      ${cards.map(c => `
        <div class="col-6 col-md-4">
          <div class="hct-card p-3 stat-card stat-${c.tone}">
            <div class="stat-value">${c.value}</div>
            <div class="stat-label">${c.label}</div>
          </div>
        </div>
      `).join("")}
    </div>

    <div class="hct-card p-3">
      <h3 class="h6 mb-3">By hostel block</h3>
      ${renderBlockBreakdown()}
    </div>
  `;
}

function renderBlockBreakdown() {
  const rows = HOSTEL_BLOCKS.map(block => {
    const inBlock = COMPLAINTS.filter(c => c.hostelBlock === block);
    const open = inBlock.filter(c => c.status !== "Resolved").length;
    const escalated = inBlock.filter(c => c.escalationLevel > 0 && c.status !== "Resolved").length;
    return `
      <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
        <div>
          <div class="fw-medium">${escapeHtml(block)}</div>
          <div class="small" style="color: var(--ink-soft);">${inBlock.length} total complaints</div>
        </div>
        <div class="text-end">
          <div class="small">${open} open</div>
          <div class="small" style="color: var(--priority-high, #C0392B);">${escalated} escalated</div>
        </div>
      </div>
    `;
  }).join("");
  return rows || `<div class="empty-state">No complaints recorded yet.</div>`;
}

function renderPrincipalAllComplaints() {
  const filterBar = `
    <div class="d-flex gap-2 flex-wrap mb-3">
      <select class="form-select form-select-sm w-auto" id="pFilterBlock">
        <option value="all">All blocks</option>
        ${HOSTEL_BLOCKS.map(b => `<option value="${b}" ${_principalFilters.block === b ? "selected" : ""}>${b}</option>`).join("")}
      </select>
      <select class="form-select form-select-sm w-auto" id="pFilterStatus">
        <option value="all">All statuses</option>
        ${["Pending", "Assigned", "Under Review", "Resolved"].map(s => `<option value="${s}" ${_principalFilters.status === s ? "selected" : ""}>${s}</option>`).join("")}
      </select>
      <select class="form-select form-select-sm w-auto" id="pFilterSeverity">
        <option value="all">All severities</option>
        ${SEVERITY_LEVELS.map(s => `<option value="${s}" ${_principalFilters.severity === s ? "selected" : ""}>${s}</option>`).join("")}
      </select>
    </div>
  `;

  let list = allComplaintsSorted();
  if (_principalFilters.block !== "all") list = list.filter(c => c.hostelBlock === _principalFilters.block);
  if (_principalFilters.status !== "all") list = list.filter(c => c.status === _principalFilters.status);
  if (_principalFilters.severity !== "all") list = list.filter(c => c.severity === _principalFilters.severity);

  const rows = list.length ? list.map(c => {
    const student = getUser(c.studentId);
    const assignee = c.assignedTo ? getUser(c.assignedTo) : null;
    return `
      <div class="complaint-row p-3">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div>
            <div class="title">${escapeHtml(c.title)}</div>
            <div class="meta">
              ${c.category} &middot; ${c.id} &middot; ${escapeHtml(c.hostelBlock || "-")}
              &middot; from ${student ? student.name : "?"}
              ${assignee ? ` &middot; assigned to ${assignee.name}` : ""}
            </div>
          </div>
          <div class="d-flex flex-column align-items-end gap-1">
            ${statusBadge(c.status)}
            ${severityBadge(c.severity)}
          </div>
        </div>
        <div class="mt-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
          ${escalationBadge(c.escalationLevel)}
          <span class="small" style="color: var(--ink-soft);">Resolve by ${formatDueBy(c.resolutionDueAt)}</span>
        </div>
      </div>
    `;
  }).join("") : `<div class="empty-state">No complaints match these filters.</div>`;

  return filterBar + `<div class="d-flex flex-column gap-2">${rows}</div>`;
}

function renderPrincipalEscalationLog() {
  if (!ESCALATIONS.length) return `<div class="empty-state">No escalations have been triggered yet.</div>`;

  const rows = ESCALATIONS.slice(0, 50).map(e => {
    const c = COMPLAINTS.find(x => x.id === e.complaintId);
    const actor = e.triggeredBy === "system" ? "System (auto)" : (getUser(e.triggeredBy) ? getUser(e.triggeredBy).name : e.triggeredBy);
    return `
      <div class="complaint-row p-3">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div>
            <div class="title">${c ? escapeHtml(c.title) : "(deleted complaint)"} &middot; ${e.complaintId}</div>
            <div class="meta">${escapeHtml(e.reason)} &middot; triggered by ${escapeHtml(actor)}</div>
          </div>
          <div class="text-end">
            ${escalationBadge(e.level)}
            <div class="small mt-1" style="color: var(--ink-soft);">${e.triggeredAt}</div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  return `<div class="d-flex flex-column gap-2">${rows}</div>`;
}

function attachPrincipalHandlers() {
  document.querySelectorAll("#principalTabs [data-ptab]").forEach(btn => {
    btn.addEventListener("click", () => {
      _principalTab = btn.getAttribute("data-ptab");
      render();
    });
  });

  if (_principalTab === "all") {
    const blockSel = document.getElementById("pFilterBlock");
    const statusSel = document.getElementById("pFilterStatus");
    const severitySel = document.getElementById("pFilterSeverity");
    if (blockSel) blockSel.addEventListener("change", (e) => { _principalFilters.block = e.target.value; render(); });
    if (statusSel) statusSel.addEventListener("change", (e) => { _principalFilters.status = e.target.value; render(); });
    if (severitySel) severitySel.addEventListener("change", (e) => { _principalFilters.severity = e.target.value; render(); });
  }

  if (_principalTab === "queue") {
    attachAuthorityQueueHandlers(PRINCIPAL_LEVEL);
  }
}
