let _adminTab = "pending";
let _approveTargetId = null;

function renderAdminView() {
  const pending = getPendingRegistrations();

  const listHtml = pending.length ? pending.map(adminRegistrationCard).join("") :
    `<div class="empty-state">No pending registrations.</div>`;

  return `
    <div class="container pb-5" style="max-width: 760px;">
      <h2 class="h5 mb-3">Pending Registrations (${pending.length})</h2>
      <div class="d-flex flex-column gap-2" id="adminRegList">
        ${listHtml}
      </div>
    </div>

    <div class="modal fade" id="approveModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Approve Registration</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label">Assign Room Number</label>
              <input type="text" class="form-control" id="approveRoom" placeholder="e.g., B-204">
            </div>
            <div class="form-text">Leave blank to assign manually later.</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-teal" id="approveConfirm">Approve</button>
          </div>
        </div>
      </div>
    </div>

    <div class="modal fade" id="rejectModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Reject Registration</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <label class="form-label">Reason (optional)</label>
            <textarea class="form-control" id="rejectReason" rows="3" placeholder="Why are you rejecting this registration?"></textarea>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-danger" id="rejectConfirm">Reject</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function adminRegistrationCard(reg) {
  return `
    <div class="complaint-row p-3">
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div>
          <div class="title">${escapeHtml(reg.name)}</div>
          <div class="meta">PRN: ${escapeHtml(reg.prn)} &middot; ${escapeHtml(reg.email)}</div>
          <div class="meta" style="margin-top: 0.25rem;">Block: ${escapeHtml(reg.block)} &middot; ${reg.requestedAt}</div>
        </div>
      </div>
      <div class="mt-3 d-flex gap-2">
        <button class="btn btn-teal btn-sm" data-approve="${reg.id}">Approve</button>
        <button class="btn btn-danger btn-sm" data-reject="${reg.id}">Reject</button>
      </div>
    </div>
  `;
}

function attachAdminHandlers() {
  const approveModalEl = document.getElementById("approveModal");
  const approveModal = new bootstrap.Modal(approveModalEl);

  const rejectModalEl = document.getElementById("rejectModal");
  const rejectModal = new bootstrap.Modal(rejectModalEl);

  document.querySelectorAll("[data-approve]").forEach(btn => {
    btn.addEventListener("click", () => {
      _approveTargetId = btn.getAttribute("data-approve");
      document.getElementById("approveRoom").value = "";
      approveModal.show();
    });
  });

  document.getElementById("approveConfirm").addEventListener("click", () => {
    const room = document.getElementById("approveRoom").value.trim();
    approveRegistration(_approveTargetId, room || null);
    approveModal.hide();
    render();
  });

  document.querySelectorAll("[data-reject]").forEach(btn => {
    btn.addEventListener("click", () => {
      _approveTargetId = btn.getAttribute("data-reject");
      document.getElementById("rejectReason").value = "";
      rejectModal.show();
    });
  });

  document.getElementById("rejectConfirm").addEventListener("click", () => {
    const reason = document.getElementById("rejectReason").value.trim();
    rejectRegistration(_approveTargetId, reason);
    rejectModal.hide();
    render();
  });
}
