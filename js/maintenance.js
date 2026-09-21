let _maintenancePhoto = null;
let _maintenanceTargetId = null;

function renderMaintenanceView() {
  const complaints = complaintsForMaintenance(currentUser.id);

  const listHtml = complaints.length
    ? complaints.map(maintenanceComplaintCard).join("")
    : `<div class="empty-state">No assigned complaints right now.</div>`;

  return `
    <div class="container pb-5" style="max-width: 720px;">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h2 class="h5 mb-1">Assigned complaints</h2>
          <div class="small" style="color: var(--ink-soft);">
            Complaints assigned to you
          </div>
        </div>
        <span class="small" style="color: var(--ink-soft);">
          ${complaints.length} active
        </span>
      </div>

      <div class="d-flex flex-column gap-2" id="maintenanceComplaintList">
        ${listHtml}
      </div>
    </div>

    <div class="modal fade" id="doneModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">

          <div class="modal-header">
            <h5 class="modal-title">Mark complaint as done</h5>
            <button
              type="button"
              class="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close">
            </button>
          </div>

          <div class="modal-body">
            <p class="small mb-3" style="color: var(--ink-soft);">
              Optionally attach a photo of the completed work.
            </p>

            <label for="donePhoto" class="form-label">
              Completion photo
            </label>

            <input
              type="file"
              class="form-control"
              id="donePhoto"
              accept="image/*"
            >

            <img
              id="donePhotoPreview"
              class="mt-3 rounded"
              alt="Completion photo preview"
              style="
                display: none;
                max-width: 100%;
                max-height: 180px;
                object-fit: cover;
              "
            >

            <div
              id="doneError"
              class="invalid-feedback d-block"
              style="display: none !important;">
            </div>
          </div>

          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-outline-secondary"
              data-bs-dismiss="modal">
              Cancel
            </button>

            <button
              type="button"
              class="btn btn-teal"
              id="doneConfirm">
              Mark done
            </button>
          </div>

        </div>
      </div>
    </div>
  `;
}

function maintenanceComplaintCard(c) {
  const student = getUser(c.studentId);

  return `
    <div class="complaint-row p-3">

      <div class="d-flex justify-content-between align-items-start gap-2">

        <div>
          <div class="title">
            ${escapeHtml(c.title)}
          </div>

          <div class="meta">
            ${escapeHtml(c.category)}
            &middot;
            ${escapeHtml(c.id)}
            &middot;
            From ${escapeHtml(student ? student.name : "Unknown")}
          </div>
        </div>

        <div class="d-flex flex-column align-items-end gap-1">
          ${statusBadge(c.status)}
          ${severityBadge(c.severity)}
        </div>

      </div>

      <div
        class="mt-2"
        style="color: var(--ink-soft); font-size: 0.9rem;">
        ${escapeHtml(c.description)}
      </div>

      ${
        c.photo
          ? `
            <div class="mt-3">
              <img
                src="${c.photo}"
                alt="Complaint photo"
                class="rounded"
                style="
                  max-width: 100%;
                  max-height: 180px;
                  object-fit: cover;
                ">
            </div>
          `
          : ""
      }

      <div class="mt-3">
        <button
          type="button"
          class="btn btn-teal btn-sm"
          data-mark-done="${escapeHtml(c.id)}">
          Mark done
        </button>
      </div>

    </div>
  `;
}

function attachMaintenanceHandlers() {
  _maintenancePhoto = null;
  _maintenanceTargetId = null;

  const modalEl = document.getElementById("doneModal");
  const modal = new bootstrap.Modal(modalEl);

  document.querySelectorAll("[data-mark-done]").forEach(button => {
    button.addEventListener("click", () => {
      _maintenanceTargetId = button.getAttribute("data-mark-done");
      _maintenancePhoto = null;

      const photoInput = document.getElementById("donePhoto");
      const preview = document.getElementById("donePhotoPreview");
      const errorEl = document.getElementById("doneError");

      photoInput.value = "";

      preview.src = "";
      preview.style.display = "none";

      errorEl.textContent = "";
      errorEl.style.setProperty("display", "none", "important");

      modal.show();
    });
  });

  document.getElementById("donePhoto").addEventListener("change", event => {
    const file = event.target.files[0];

    if (!file) {
      _maintenancePhoto = null;
      return;
    }

    if (!file.type.startsWith("image/")) {
      event.target.value = "";
      _maintenancePhoto = null;

      const errorEl = document.getElementById("doneError");
      errorEl.textContent = "Please select an image file.";
      errorEl.style.setProperty("display", "block", "important");

      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      _maintenancePhoto = reader.result;

      const preview = document.getElementById("donePhotoPreview");
      preview.src = reader.result;
      preview.style.display = "block";

      const errorEl = document.getElementById("doneError");
      errorEl.textContent = "";
      errorEl.style.setProperty("display", "none", "important");
    };

    reader.readAsDataURL(file);
  });

  document.getElementById("doneConfirm").addEventListener("click", async () => {
    const errorEl = document.getElementById("doneError");

    if (!_maintenanceTargetId) {
      errorEl.textContent = "No complaint selected.";
      errorEl.style.setProperty("display", "block", "important");
      return;
    }

    const complaint = COMPLAINTS.find(
      c => c.id === _maintenanceTargetId
    );

    if (!complaint) {
      errorEl.textContent = "Complaint could not be found.";
      errorEl.style.setProperty("display", "block", "important");
      return;
    }

    await markDone(
      _maintenanceTargetId,
      currentUser.id,
      _maintenancePhoto
    );

    modal.hide();

    _maintenanceTargetId = null;
    _maintenancePhoto = null;

    render();
  });
}
