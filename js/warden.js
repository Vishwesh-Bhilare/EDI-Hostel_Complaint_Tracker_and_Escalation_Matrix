let _wardenTab = "active";
let _assignTargetId = null;

function renderWardenView() {
  const active = activeComplaintsForWarden();
  const history = historyComplaintsForWarden();

  return `
    <div class="container pb-5" style="max-width: 760px;">
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
    return `
      <div class="complaint-row p-3">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div>
            <div class="title">${escapeHtml(c.title)}</div>
            <div class="meta">${c.category} &middot; ${c.id} &middot; from ${student ? student.name : "?"}</div>
          </div>
          <div class="d-flex flex-column align-items-end gap-1">
            ${statusBadge(c.status)}
            ${priorityBadge(c.priority)}
          </div>
        </div>
        <div class="mt-2" style="color: var(--ink-soft); font-size: 0.9rem;">${escapeHtml(c.description)}</div>
        <div class="mt-2 d-flex gap-2">${actions}</div>
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
          ${priorityBadge(c.priority)}
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
    confirmBtn.addEventListener("click", () => {
      const maintenanceId = document.getElementById("assignSelect").value;
      assignComplaint(_assignTargetId, maintenanceId, currentUser.id);
      modal.hide();
      render();
    });
  }

  document.querySelectorAll("[data-resolve]").forEach(btn => {
    btn.addEventListener("click", () => {
      resolveComplaint(btn.getAttribute("data-resolve"), currentUser.id);
      render();
    });
  });

  document.querySelectorAll("[data-reassign]").forEach(btn => {
    btn.addEventListener("click", () => {
      reassignComplaint(btn.getAttribute("data-reassign"), currentUser.id);
      render();
    });
  });
}
