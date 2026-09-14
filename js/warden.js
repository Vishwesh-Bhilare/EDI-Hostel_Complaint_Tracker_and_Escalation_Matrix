let _wardenTab = "active";
let _assignTargetId = null;
let _severityTargetId = null;
let _wardenEscalateTargetId = null;

function renderWardenView() {
  const active = activeComplaintsForWarden();
  const history = historyComplaintsForWarden();

  return `
    <div class="container pb-5" style="max-width: 780px;">
      <ul class="nav nav-pills mb-3" id="wardenTabs">
        <li class="nav-item">
          <button class="nav-link ${_wardenTab === "active" ? "active" : ""}" data-tab="active">Active (${active.length})</button>
        </li>
        <li class="nav-item">
          <button class="nav-link ${_wardenTab === "history" ? "active" : ""}" data-tab="history">History (${history.length})</button>
        </li>
      </ul>
      <div class="d-flex flex-column gap-2" id="wardenComplaintList">
        ${_wardenTab === "active" ? renderWardenActiveList(active) : renderWardenHistoryList(history)}
      </div>
    </div>

    <div class="modal fade" id="assignModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Assign maintenance staff</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <select class="form-select" id="assignSelect">
              ${usersByRole("maintenance").map(u => `<option value="${u.id}">${u.name}</option>`).join("")}
            </select>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-navy" id="assignConfirm">Assign</button>
          </div>
        </div>
      </div>
    </div>

    <div class="modal fade" id="severityModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Change severity</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <p class="small" style="color: var(--ink-soft);">
              Severity is auto-set from category at submission. Correct it here if a student's
              category choice overstates (or understates) the real urgency — this recalculates
              the SLA clock from now.
            </p>
            <label class="form-label">New severity</label>
            <select class="form-select mb-3" id="severitySelect">
              ${SEVERITY_LEVELS.map(s => `<option value="${s}">${s}</option>`).join("")}
            </select>
            <label class="form-label">Reason (optional)</label>
            <input type="text" class="form-control" id="severityReason" placeholder="e.g. Minor cosmetic issue, not urgent">
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-navy" id="severityConfirm">Save</button>
          </div>
        </div>
      </div>
    </div>

    <div class="modal fade" id="wardenEscalateModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Escalate to Chief Warden</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <p class="small" style="color: var(--ink-soft);">
              This moves the complaint out of your queue and into the Chief Warden's, ahead of any
              SLA deadline. A reason is required for the audit log.
            </p>
            <label class="form-label">Reason</label>
            <textarea class="form-control" id="wardenEscalateReason" rows="3" placeholder="Why does this need to go up the chain now?" required></textarea>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-danger" id="wardenEscalateConfirm">Escalate</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderWardenActiveList(list) {
  if (!list.length) return `<div class="empty-state">No active complaints right now.</div>`;
  return list.map(c => {
    const student = getUser(c.studentId);
    const assignee = c.assignedTo ? getUser(c.assignedTo) : null;
    let actions = "";
    if (c.status === "Pending") {
      actions = `<button class="btn btn-navy btn-sm" data-assign="${c.id}">Assign</button>`;
    } else if (c.status === "Assigned") {
      actions = `<span class="small" style="color: var(--ink-soft);">Assigned to ${assignee ? assignee.name : "-"}</span>`;
    } else if (c.status === "Under Review") {
      actions = `
        <button class="btn btn-teal btn-sm" data-resolve="${c.id}">Mark resolved</button>
        <button class="btn btn-outline-secondary btn-sm" data-reassign="${c.id}">Reassign</button>
      `;
    }
    // Manual escalation is only meaningful while the complaint is still
    // sitting with the Warden (level 0) — once it's been escalated, the
    // authority holding it uses their own "Escalate further" action instead.
    const canEscalate = c.escalationLevel === 0;
    return `
      <div class="complaint-row p-3">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div>
            <div class="title">${escapeHtml(c.title)}</div>
            <div class="meta">${c.category} &middot; ${c.id} &middot; from ${student ? student.name : "?"}</div>
          </div>
          <div class="d-flex flex-column align-items-end gap-1">
            ${statusBadge(c.status)}
            ${severityBadge(c.severity)}
          </div>
        </div>
        <div class="mt-2" style="color: var(--ink-soft); font-size: 0.9rem;">${escapeHtml(c.description)}</div>
        <div class="mt-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
          ${escalationBadge(c.escalationLevel)}
          <span class="small" style="color: var(--ink-soft);">Resolve by ${formatDueBy(c.resolutionDueAt)}</span>
        </div>
        <div class="mt-2 d-flex gap-2 flex-wrap">
          ${actions}
          <button class="btn btn-outline-secondary btn-sm" data-severity="${c.id}">Change severity</button>
          ${canEscalate ? `<button class="btn btn-outline-danger btn-sm" data-warden-escalate="${c.id}">Escalate</button>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function renderWardenHistoryList(list) {
  if (!list.length) return `<div class="empty-state">No resolved complaints yet.</div>`;
  return list.map(c => `
    <div class="complaint-row p-3">
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div>
          <div class="title">${escapeHtml(c.title)}</div>
          <div class="meta">${c.category} &middot; ${c.id}</div>
        </div>
        <div class="d-flex flex-column align-items-end gap-1">
          ${statusBadge(c.status)}
          ${severityBadge(c.severity)}
        </div>
      </div>
    </div>
  `).join("");
}

function attachWardenHandlers() {
  document.querySelectorAll("#wardenTabs [data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      _wardenTab = btn.getAttribute("data-tab");
      render();
    });
  });

  const modalEl = document.getElementById("assignModal");
  const modal = new bootstrap.Modal(modalEl);

  document.querySelectorAll("[data-assign]").forEach(btn => {
    btn.addEventListener("click", () => {
      _assignTargetId = btn.getAttribute("data-assign");
      modal.show();
    });
  });

  const confirmBtn = document.getElementById("assignConfirm");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", async () => {
      const maintenanceId = document.getElementById("assignSelect").value;
      await assignComplaint(_assignTargetId, maintenanceId, currentUser.id);
      modal.hide();
      render();
    });
  }

  document.querySelectorAll("[data-resolve]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await resolveComplaint(btn.getAttribute("data-resolve"), currentUser.id);
      render();
    });
  });

  document.querySelectorAll("[data-reassign]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await reassignComplaint(btn.getAttribute("data-reassign"), currentUser.id);
      render();
    });
  });

  const severityModalEl = document.getElementById("severityModal");
  const severityModal = new bootstrap.Modal(severityModalEl);

  document.querySelectorAll("[data-severity]").forEach(btn => {
    btn.addEventListener("click", () => {
      _severityTargetId = btn.getAttribute("data-severity");
      const c = COMPLAINTS.find(x => x.id === _severityTargetId);
      document.getElementById("severitySelect").value = c ? c.severity : "Medium";
      document.getElementById("severityReason").value = "";
      severityModal.show();
    });
  });

  const severityConfirm = document.getElementById("severityConfirm");
  if (severityConfirm) {
    severityConfirm.addEventListener("click", async () => {
      const newSeverity = document.getElementById("severitySelect").value;
      const reason = document.getElementById("severityReason").value.trim();
      await updateComplaintSeverity(_severityTargetId, newSeverity, currentUser.id, reason);
      severityModal.hide();
      render();
    });
  }

  const wardenEscalateModalEl = document.getElementById("wardenEscalateModal");
  const wardenEscalateModal = new bootstrap.Modal(wardenEscalateModalEl);

  document.querySelectorAll("[data-warden-escalate]").forEach(btn => {
    btn.addEventListener("click", () => {
      _wardenEscalateTargetId = btn.getAttribute("data-warden-escalate");
      document.getElementById("wardenEscalateReason").value = "";
      wardenEscalateModal.show();
    });
  });

  const wardenEscalateConfirm = document.getElementById("wardenEscalateConfirm");
  if (wardenEscalateConfirm) {
    wardenEscalateConfirm.addEventListener("click", async () => {
      const reason = document.getElementById("wardenEscalateReason").value.trim();
      if (!reason) {
        document.getElementById("wardenEscalateReason").focus();
        return;
      }
      await escalateManually(_wardenEscalateTargetId, currentUser.id, reason);
      wardenEscalateModal.hide();
      render();
    });
  }
}
