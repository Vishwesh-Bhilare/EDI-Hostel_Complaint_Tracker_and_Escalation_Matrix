# HostelCare Frontend

A frontend prototype for the **Hostel Complaint Tracker & Escalation Matrix**.

## Pages

- `index.html` — Login
- `signup.html` — Resident signup  
- `complaint.html` — Complaint submission

## Current Features

- Responsive HTML/CSS/JavaScript UI
- Password show/hide
- Client-side validation
- Self-registration flow
- Severity-based SLA matrix
- Escalation path visualization
- Character counter
- Evidence upload UI
- Success modal with complaint ID

## Quick Start

Open `index.html` in your browser, or serve locally with:
```bash
python -m http.server 8000
```

Then visit: http://localhost:8000

## Backend Integration

Replace demo navigation with API calls:
- `AUTH_LOGIN` — User authentication
- `COMPLAINT_CREATE` — Submit complaint with SLA binding
- `COMPLAINT_LIST` — Fetch user complaints
- `FEEDBACK_SUBMIT` — Escalation feedback
