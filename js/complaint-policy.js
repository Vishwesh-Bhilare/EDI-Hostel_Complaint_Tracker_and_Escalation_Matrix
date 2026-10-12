// Shared policy: one group is one category in one hostel. Individual reports
// remain intact; only unresolved reports contribute to the volume threshold.
const CATEGORY_SEVERITY = {
  "Maintenance": "Low",
  "Electrical": "Medium",
  "Plumbing/Water": "High",
  "Cleanliness/Hygiene": "Medium",
  "Security": "Critical",
  "Food/Mess": "Medium",
  "Internet/WiFi": "Low",
  "Other": "Medium"
};
const CATEGORIES = CATEGORY_SEVERITY;
const SEVERITY_LEVELS = ["Low", "Medium", "High", "Critical"];
const SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const GROUP_VOLUME_THRESHOLD = 20; // More than 20 means 21 or more.
const SLA_POLICY = {
  Low:      { responseHours: 6,    resolutionHours: 24, finalHours: 48 },
  Medium:   { responseHours: 3,    resolutionHours: 12, finalHours: 24 },
  High:     { responseHours: 1,    resolutionHours: 6,  finalHours: 12 },
  Critical: { responseHours: 0.25, resolutionHours: 2,  finalHours: 4 }
};

function complaintGroupKey(c) {
  return JSON.stringify([c.hostelBlock || "Unknown hostel", c.category]);
}

function higherSeverity(a, b) {
  return SEVERITY_ORDER[b] < SEVERITY_ORDER[a] ? b : a;
}

function effectiveComplaintSeverity(category, openCount, manualSeverity = null) {
  const base = CATEGORY_SEVERITY[category] || "Medium";
  const volumePriority = openCount > GROUP_VOLUME_THRESHOLD
    ? ({ Low: "Medium", Medium: "High" }[base] || base) : base;
  return higherSeverity(volumePriority, manualSeverity);
}

function groupComplaints(complaints) {
  const groups = new Map();
  for (const c of complaints) {
    const key = complaintGroupKey(c);
    if (!groups.has(key)) {
      groups.set(key, {
        key, hostelBlock: c.hostelBlock || "Unknown hostel", category: c.category,
        complaints: [], openCount: 0, severity: "Low", escalationLevel: 0,
        principalCount: 0, overdueCount: 0
      });
    }
    const group = groups.get(key);
    group.complaints.push(c);
    if (c.status !== "Resolved") {
      group.openCount++;
      group.severity = higherSeverity(group.severity, c.severity);
      group.escalationLevel = Math.max(group.escalationLevel, c.escalationLevel);
      if (c.escalationLevel === 3) group.principalCount++;
      if (authorityResponseOverdue(c)) group.overdueCount++;
    }
  }
  const result = [...groups.values()];
  for (const group of result) {
    if (!group.openCount) group.severity = group.complaints.reduce((severity, c) => higherSeverity(severity, c.severity), "Low");
  }
  return result.sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
    b.escalationLevel - a.escalationLevel || b.openCount - a.openCount ||
    a.key.localeCompare(b.key));
}

function authorityResponseOverdue(c, now = new Date()) {
  const due = c.authorityResponseDueAt || c.responseDueAt;
  return c.status !== "Resolved" && !c.authorityAcknowledged && !!due && now > due;
}

function canStudentEscalate(c, studentId, now = new Date()) {
  return c.studentId === studentId && c.escalationLevel < 3 && authorityResponseOverdue(c, now);
}
