/* Shared view for the two mid-chain escalation authorities: Chief Warden
   (level 1) and College Authority (level 2). Principal (level 3) reuses
   renderAuthorityQueueSection()/attachAuthorityQueueHandlers() below inside
   its own dashboard in js/principal.js, since it also owns a queue at the
   top of the chain in addition to its org-wide monitoring view. */

let _authorityTab = "queue";
let _escalateTargetId = null;

function renderAuthorityView(role) {
  const level = levelForRole(role);
  const label = labelForLevel(level);

  return `
    <div class="container pb-5" style="max-width: 780px;">
      <div class="mb-3">
        <h2 class="h5 mb-1">${label} queue</h2>
        <div class="small" style="color: var(--ink-soft);">
          Complaints currently escalated to you (Level ${level}).
        </div>
      </div>
      ${renderAuthorityQueueSection(level)}
    </div>
    ${authorityModalsHtml()}
  `;
}

// Reusable body: tabs + list + "handled by me" history. Used directly by
// the two mid-chain roles, and embedded inside the Principal dashboard.
function renderAuthorityQueueSection(level) {
  const queue = complaintsAtLevel(level);
  const handled = complaintsEverAtLevel(level).filter(c => c.escalationLevel !== level || c.status === "Resolved");

  return `
    <ul class="nav nav-pills mb-3" id="authorityTabs" data-level="${level}">
      <li class="nav-item">
        <button class="nav-link ${_authorityTab === "queue" ? "active" : ""}" data-atab="queue">In my queue (${queue.length})</button>
      </li>
      <li class="nav-item">
        <button class="nav-link ${_authorityTab === "handled" ? "active" : ""}" data-atab="handled">Previously handled (${handled.length})</button>
      </li>
    </ul>
    <div class="d-flex flex-column gap-2" id="authorityComplaintList">
      ${_authorityTab === "queue" ? renderAuthorityQueueList(queue, level) : renderAuthorityHandledList(handled)}
    </div>
  `;
}

function renderAuthorityQueueList(list, level) {
  if (!list.length) return `<div class="empty-state">Nothing escalated to you right now.</div>`;
  return list.map(c => {
    const student = getUser(c.studentId);
    const canEscalateFurther = level < 3;
    const rowClass = level === 3 ? "complaint-row esc-final p-3" : "complaint-row p-3";
    return `
      <div class="${rowClass}">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div>
            <div class="title">${escapeHtml(c.title)}</div>
            <div class="meta">${c.category} &middot; ${c.id} &middot; from ${student ? student.name : "?"} &middot; ${escapeHtml(c.hostelBlock || "-")}</div>
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
        <div class="mt-3 d-flex gap-2 flex-wrap">
          <button class="btn btn-teal btn-sm" data-authority-resolve="${c.id}">Resolve</button>
          ${canEscalateFurther ? `<button class="btn btn-outline-danger btn-sm" data-authority-escalate="${c.id}">Escalate further</button>` : ""}
          ${debugEscalateButtonHtml(c.id)}
        </div>
      </div>
    `;
  }).join("");
}

function renderAuthorityHandledList(list) {
  if (!list.length) return `<div class="empty-state">Nothing has passed through your level yet.</div>`;
  return list.slice(0, 25).map(c => `
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
      <div class="mt-2">${escalationBadge(c.escalationLevel)}</div>
    </div>
  `).join("");
}

function authorityModalsHtml() {
  return `
    <div class="modal fade" id="authorityEscalateModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Escalate further</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <p class="small" style="color: var(--ink-soft);">
              This moves the complaint one level up the chain immediately. A reason is required for the audit log.
            </p>
            <label class="form-label">Reason</label>
            <textarea class="form-control" id="authorityEscalateReason" rows="3" placeholder="Why does this need higher authority?" required></textarea>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-danger" id="authorityEscalateConfirm">Escalate</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function attachAuthorityHandlers(role) {
  const level = levelForRole(role);
  attachAuthorityQueueHandlers(level);
}

// Wires up the tabs/actions for whichever container renders
// renderAuthorityQueueSection() — shared by the standalone view and by the
// Principal dashboard's embedded queue tab.
function attachAuthorityQueueHandlers(level) {
  attachDebugEscalateHandlers();
  document.querySelectorAll("#authorityTabs [data-atab]").forEach(btn => {
    btn.addEventListener("click", () => {
      _authorityTab = btn.getAttribute("data-atab");
      render();
    });
  });

  document.querySelectorAll("[data-authority-resolve]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await resolveComplaint(btn.getAttribute("data-authority-resolve"), currentUser.id);
      render();
    });
  });

  const escalateModalEl = document.getElementById("authorityEscalateModal");
  if (!escalateModalEl) return;
  const escalateModal = new bootstrap.Modal(escalateModalEl);

  document.querySelectorAll("[data-authority-escalate]").forEach(btn => {
    btn.addEventListener("click", () => {
      _escalateTargetId = btn.getAttribute("data-authority-escalate");
      document.getElementById("authorityEscalateReason").value = "";
      escalateModal.show();
    });
  });

  const confirmBtn = document.getElementById("authorityEscalateConfirm");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", async () => {
      const reason = document.getElementById("authorityEscalateReason").value.trim();
      if (!reason) {
        document.getElementById("authorityEscalateReason").focus();
        return;
      }
      await escalateManually(_escalateTargetId, currentUser.id, reason);
      escalateModal.hide();
      render();
    });
  }
}
