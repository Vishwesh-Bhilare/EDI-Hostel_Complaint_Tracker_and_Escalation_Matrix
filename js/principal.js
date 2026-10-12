/* Principal dashboard for organization-wide monitoring and final-level
   escalations. */

let _principalTab = "overview";
let _principalFilters = { block: "all", status: "open", severity: "all" };

function renderPrincipalView() {
  return `
    <div class="container pb-5" style="max-width: 960px;">
      <div class="mb-3">
        <h2 class="h5 mb-1">Principal dashboard</h2>
        <div class="small" style="color: var(--ink-soft);">
          One issue group per hostel and category, with every student report available inside.
        </div>
      </div>

      <ul class="nav nav-pills mb-3" id="principalTabs">
        <li class="nav-item"><button class="nav-link ${_principalTab === "overview" ? "active" : ""}" data-ptab="overview">Overview</button></li>
        <li class="nav-item"><button class="nav-link ${_principalTab === "all" ? "active" : ""}" data-ptab="all">Issue groups</button></li>
        <li class="nav-item"><button class="nav-link ${_principalTab === "escalations" ? "active" : ""}" data-ptab="escalations">Escalation log</button></li>
      </ul>

      ${
        _principalTab === "overview" ? renderPrincipalOverview() :
        _principalTab === "all" ? renderPrincipalAllComplaints() :
        renderPrincipalEscalationLog()
      }
    </div>
  `;
}

function renderPrincipalOverview() {
  const groups = groupComplaints(COMPLAINTS).filter(g => g.openCount);
  const principalGroups = groups.filter(g => g.principalCount).length;
  const cards = [
    { label: "Open issue groups", value: groups.length, tone: "" },
    { label: "High / Critical groups", value: groups.filter(g => ["High", "Critical"].includes(g.severity)).length, tone: "warn" },
    { label: "Groups needing Principal", value: principalGroups, tone: "danger" }
  ];

  const banner = principalGroups ? `
    <div class="principal-alert-banner">
      <span>&#9888; ${principalGroups} issue group${principalGroups > 1 ? "s need" : " needs"} Principal attention. Open a group to acknowledge or resolve its reports.</span>
    </div>
  ` : "";

  return `
    ${banner}
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
    <h3 class="h6 mt-4 mb-3">Open issues by hostel</h3>
    <div class="d-flex flex-column gap-3">${groups.map(group => renderPrincipalGroup(group)).join("") || `<div class="empty-state">No open issues.</div>`}</div>
  `;
}

function renderBlockBreakdown() {
  const rows = HOSTEL_BLOCKS.map(block => {
    const inBlock = COMPLAINTS.filter(c => c.hostelBlock === block);
    const groups = groupComplaints(inBlock).filter(g => g.openCount);
    const open = groups.length;
    const escalated = groups.filter(g => g.escalationLevel > 0).length;
    return `
      <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
        <div>
          <div class="fw-medium">${escapeHtml(block)}</div>
           <div class="small" style="color: var(--ink-soft);">${inBlock.filter(c => c.status !== "Resolved").length} open student reports</div>
        </div>
        <div class="text-end">
           <div class="small">${open} open group${open === 1 ? "" : "s"}</div>
           <div class="small" style="color: var(--priority-high, #C0392B);">${escalated} escalated group${escalated === 1 ? "" : "s"}</div>
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
        <option value="open" ${_principalFilters.status === "open" ? "selected" : ""}>Open reports</option>
        <option value="all" ${_principalFilters.status === "all" ? "selected" : ""}>All statuses</option>
        ${["Pending", "Assigned", "Under Review", "Resolved"].map(s => `<option value="${s}" ${_principalFilters.status === s ? "selected" : ""}>${s}</option>`).join("")}
      </select>
      <select class="form-select form-select-sm w-auto" id="pFilterSeverity">
        <option value="all">All severities</option>
        ${SEVERITY_LEVELS.map(s => `<option value="${s}" ${_principalFilters.severity === s ? "selected" : ""}>${s}</option>`).join("")}
      </select>
    </div>
  `;

  // Group the complete dataset first: filters must not change the volume count.
  let groups = groupComplaints(COMPLAINTS);
  if (_principalFilters.block !== "all") groups = groups.filter(g => g.hostelBlock === _principalFilters.block);
  if (_principalFilters.severity !== "all") groups = groups.filter(g => g.severity === _principalFilters.severity);
  const rows = groups.map(group => {
    const visible = group.complaints.filter(c => _principalFilters.status === "all" ||
      (_principalFilters.status === "open" ? c.status !== "Resolved" : c.status === _principalFilters.status));
    return visible.length ? renderPrincipalGroup(group, visible) : "";
  }).filter(Boolean).join("");
  return filterBar + `<div class="d-flex flex-column gap-3">${rows || `<div class="empty-state">No issue groups match these filters.</div>`}</div>`;
}

function renderPrincipalGroup(group, reports = group.complaints.filter(c => c.status !== "Resolved")) {
  const base = CATEGORY_SEVERITY[group.category] || "Medium";
  const volume = effectiveComplaintSeverity(group.category, group.openCount);
  const rows = reports.map(c => {
    const student = getUser(c.studentId);
    const assignee = c.assignedTo ? getUser(c.assignedTo) : null;
    const rowClass = c.escalationLevel === 3 ? "complaint-row esc-final p-3" : "complaint-row p-3";
    return `
      <div class="${rowClass}">
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
        <p class="small mt-2 mb-0">${escapeHtml(c.description || "")}</p>
        <div class="mt-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
          ${escalationBadge(c.escalationLevel)}
          <span class="small" style="color: var(--ink-soft);">Resolve by ${formatDueBy(c.resolutionDueAt)}</span>
        </div>
        <div class="mt-2">${authorityResponseHtml(c)}</div>
        ${c.escalationLevel === 3 && c.status !== "Resolved" ? `<div class="d-flex gap-2 mt-2">
          ${!c.authorityAcknowledged ? `<button class="btn btn-outline-secondary btn-sm" data-acknowledge="${c.id}">Acknowledge</button>` : ""}
          <button class="btn btn-teal btn-sm" data-principal-resolve="${c.id}">Resolve report</button>
        </div>` : ""}
      </div>
    `;
  }).join("");
  return `<section class="hct-card p-3 issue-group ${group.principalCount ? "issue-group-final" : ""}">
    <div class="d-flex justify-content-between align-items-start gap-2">
      <div><h3 class="h6 mb-1">${escapeHtml(group.category)}</h3><div class="small">${escapeHtml(group.hostelBlock)}</div></div>
      ${severityBadge(group.severity)}
    </div>
    <div class="d-flex gap-3 flex-wrap mt-2 small">
      <span><strong>${group.openCount}</strong> open reports</span><span>${group.complaints.length} total reports</span>
      ${group.principalCount ? `<span class="text-danger">${group.principalCount} with Principal</span>` : ""}
      ${group.overdueCount ? `<span class="text-danger">${group.overdueCount} unanswered overdue</span>` : ""}
    </div>
    <div class="small mt-2">Default ${base}${group.openCount > GROUP_VOLUME_THRESHOLD ? ` &rarr; ${volume} (${group.openCount} open reports, above ${GROUP_VOLUME_THRESHOLD})` : ` &middot; Volume boost starts at ${GROUP_VOLUME_THRESHOLD + 1} open reports`}${group.severity !== volume ? " &middot; Manual priority also applies" : ""}</div>
    <details class="mt-3"><summary>View ${reports.length} student report${reports.length === 1 ? "" : "s"}</summary>
      <div class="d-flex flex-column gap-2 mt-3">${rows}</div>
    </details>
  </section>`;
}

function renderPrincipalEscalationLog() {
  if (!ESCALATIONS.length) return `<div class="empty-state">No escalations have been triggered yet.</div>`;

  const complaintsById = new Map(COMPLAINTS.map(c => [c.id, c]));
  const grouped = new Map();
  for (const e of ESCALATIONS.slice(0, 50)) {
    const c = complaintsById.get(e.complaintId);
    const key = c ? complaintGroupKey(c) : "deleted";
    if (!grouped.has(key)) grouped.set(key, { c, events: [] });
    grouped.get(key).events.push(e);
  }
  const rows = [...grouped.values()].map(group => {
    const events = group.events.map(e => {
    const c = complaintsById.get(e.complaintId);
    const actor = e.triggeredBy === "system" ? "System (auto)" : (getUser(e.triggeredBy) ? getUser(e.triggeredBy).name : e.triggeredBy);
    const rowClass = e.level === 3 ? "complaint-row esc-final p-3" : "complaint-row p-3";
    return `
      <div class="${rowClass}">
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
    return `<section class="hct-card p-3"><h3 class="h6 mb-1">${escapeHtml(group.c?.category || "Deleted reports")}</h3>
      <div class="small mb-2">${escapeHtml(group.c?.hostelBlock || "Unknown hostel")} &middot; ${group.events.length} escalation events</div>
      <details><summary>View escalation history</summary><div class="d-flex flex-column gap-2 mt-3">${events}</div></details></section>`;
  }).join("");

  return `<div class="d-flex flex-column gap-2">${rows}</div>`;
}

function attachPrincipalHandlers() {
  document.querySelectorAll("[data-principal-resolve]").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await resolveComplaint(btn.getAttribute("data-principal-resolve"), currentUser.id);
        render();
      } catch (err) { alert(err.message); btn.disabled = false; }
    });
  });
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
}
