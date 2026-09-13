let _newComplaintPhoto = null;

function renderStudentView() {
  const complaints = complaintsForStudent(currentUser.id)
    .slice()
    .sort((a, b) => b.id.localeCompare(a.id));

  const listHtml = complaints.length ? complaints.map(studentComplaintCard).join("") :
    `<div class="empty-state">No complaints yet. Use "New complaint" to report an issue.</div>`;

  return `
    <div class="container pb-5" style="max-width: 720px;">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2 class="h5 mb-0">Your complaints</h2>
        <button class="btn btn-navy btn-sm" id="newComplaintBtn">+ New complaint</button>
      </div>
      <div class="d-flex flex-column gap-2" id="studentComplaintList">
        ${listHtml}
      </div>
    </div>

    <div class="modal fade" id="newComplaintModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">New complaint</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <form id="newComplaintForm">
              <div class="mb-3">
                <label class="form-label">Title</label>
                <input type="text" class="form-control" id="ncTitle" required maxlength="80" placeholder="e.g. Leaking tap in washroom">
              </div>
              <div class="mb-3">
                <label class="form-label">Category</label>
                <select class="form-select" id="ncCategory" required>
                  <option value="" disabled selected>Choose a category</option>
                  ${Object.keys(CATEGORIES).map(cat => `<option value="${cat}">${cat}</option>`).join("")}
                </select>
                <div class="form-text" id="ncPriorityPreview"></div>
              </div>
              <div class="mb-3">
                <label class="form-label">Description</label>
                <textarea class="form-control" id="ncDescription" rows="3" required placeholder="Describe the issue"></textarea>
              </div>
              <div class="mb-1">
                <label class="form-label">Photo (optional)</label>
                <input type="file" class="form-control" id="ncPhoto" accept="image/*">
                <img id="ncPhotoPreview" class="mt-2 rounded" style="max-height:120px; display:none;">
              </div>
              <div class="invalid-feedback d-block" id="ncError" style="display:none !important;"></div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-navy" id="ncSubmit">Submit complaint</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function studentComplaintCard(c) {
  return `
    <div class="complaint-row p-3">
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div>
          <div class="title">${escapeHtml(c.title)}</div>
          <div class="meta">${c.category} &middot; ${c.id} &middot; ${c.createdAt}</div>
        </div>
        <div class="d-flex flex-column align-items-end gap-1">
          ${statusBadge(c.status)}
          ${priorityBadge(c.priority)}
        </div>
      </div>
      <div class="mt-2" style="color: var(--ink-soft); font-size: 0.9rem;">${escapeHtml(c.description)}</div>
    </div>
  `;
}

function attachStudentHandlers() {
  const openBtn = document.getElementById("newComplaintBtn");
  const modalEl = document.getElementById("newComplaintModal");
  const modal = new bootstrap.Modal(modalEl);
  _newComplaintPhoto = null;

  openBtn.addEventListener("click", () => {
    document.getElementById("newComplaintForm").reset();
    document.getElementById("ncPriorityPreview").textContent = "";
    document.getElementById("ncPhotoPreview").style.display = "none";
    document.getElementById("ncError").style.setProperty("display", "none", "important");
    _newComplaintPhoto = null;
    modal.show();
  });

  document.getElementById("ncCategory").addEventListener("change", (e) => {
    const p = CATEGORIES[e.target.value];
    document.getElementById("ncPriorityPreview").textContent = p ? `Default priority: ${p}` : "";
  });

  document.getElementById("ncPhoto").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) { _newComplaintPhoto = null; return; }
    const reader = new FileReader();
    reader.onload = () => {
      _newComplaintPhoto = reader.result;
      const preview = document.getElementById("ncPhotoPreview");
      preview.src = reader.result;
      preview.style.display = "block";
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("ncSubmit").addEventListener("click", async () => {
    const title = document.getElementById("ncTitle").value.trim();
    const category = document.getElementById("ncCategory").value;
    const description = document.getElementById("ncDescription").value.trim();
    const errorEl = document.getElementById("ncError");

    if (!title || !category || !description) {
      errorEl.textContent = "Please fill in title, category, and description.";
      errorEl.style.setProperty("display", "block", "important");
      return;
    }

    try {
      await addComplaint({ title, category, description, photo: _newComplaintPhoto, studentId: currentUser.id });
    } catch (err) {
      errorEl.textContent = "Could not submit complaint: " + err.message;
      errorEl.style.setProperty("display", "block", "important");
      return;
    }
    modal.hide();
    render();
  });
}
