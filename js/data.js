/* Mock in-memory data store.
   No backend yet — everything here resets on page refresh.
   When the MySQL backend is added, these functions are the layer to swap out. */

const CATEGORIES = {
  "Maintenance": "Low",
  "Electrical": "Moderate",
  "Plumbing/Water": "High",
  "Cleanliness/Hygiene": "High",
  "Security": "Moderate",
  "Food/Mess": "Moderate",
  "Internet/WiFi": "Low",
  "Other": "Undetermined"
};

const PRIORITY_ORDER = { "High": 0, "Moderate": 1, "Undetermined": 2, "Low": 3 };

const USERS = [
  { id: "s1", name: "Tushar", role: "student", room: "B-204" },
  { id: "s2", name: "Mahesh", role: "student", room: "B-118" },
  { id: "w1", name: "Warden A", role: "warden" },
  { id: "m1", name: "Maintenance Staff A", role: "maintenance" },
  { id: "m2", name: "Maintenance Staff B", role: "maintenance" }
];

function getUser(id) {
  return USERS.find(u => u.id === id) || null;
}

function usersByRole(role) {
  return USERS.filter(u => u.role === role);
}

let _nextId = 1;
function nextComplaintId() {
  return "C" + String(_nextId++).padStart(4, "0");
}

function nowStamp() {
  return new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/* status values: "Pending" | "Assigned" | "Under Review" | "Resolved" */
let COMPLAINTS = [];

function seedComplaints() {
  COMPLAINTS = [
    {
      id: nextComplaintId(),
      title: "Leaking tap in common washroom",
      category: "Plumbing/Water",
      priority: "High",
      description: "The tap near the second-floor washroom has been leaking since yesterday night.",
      photo: null,
      status: "Assigned",
      studentId: "s1",
      assignedTo: "m1",
      createdAt: nowStamp(),
      history: [
        { at: nowStamp(), text: "Complaint submitted by Tushar" },
        { at: nowStamp(), text: "Assigned to Maintenance Staff A by Warden A" }
      ]
    },
    {
      id: nextComplaintId(),
      title: "WiFi not working on 3rd floor",
      category: "Internet/WiFi",
      priority: "Low",
      description: "No WiFi signal in rooms 301 to 310 since this morning.",
      photo: null,
      status: "Pending",
      studentId: "s2",
      assignedTo: null,
      createdAt: nowStamp(),
      history: [
        { at: nowStamp(), text: "Complaint submitted by Mahesh" }
      ]
    },
    {
      id: nextComplaintId(),
      title: "Corridor light flickering",
      category: "Electrical",
      priority: "Moderate",
      description: "The tube light outside room B-204 flickers constantly at night.",
      photo: null,
      status: "Under Review",
      studentId: "s1",
      assignedTo: "m2",
      createdAt: nowStamp(),
      history: [
        { at: nowStamp(), text: "Complaint submitted by Tushar" },
        { at: nowStamp(), text: "Assigned to Maintenance Staff B by Warden A" },
        { at: nowStamp(), text: "Marked done by Maintenance Staff B, awaiting warden review" }
      ]
    },
    {
      id: nextComplaintId(),
      title: "Mess food quality complaint",
      category: "Food/Mess",
      priority: "Moderate",
      description: "Rice was undercooked at dinner for the past two days.",
      photo: null,
      status: "Resolved",
      studentId: "s2",
      assignedTo: "m1",
      createdAt: nowStamp(),
      history: [
        { at: nowStamp(), text: "Complaint submitted by Mahesh" },
        { at: nowStamp(), text: "Assigned to Maintenance Staff A by Warden A" },
        { at: nowStamp(), text: "Marked done by Maintenance Staff A, awaiting warden review" },
        { at: nowStamp(), text: "Marked resolved by Warden A" }
      ]
    }
  ];
}
seedComplaints();

function addComplaint({ title, category, description, photo, studentId }) {
  const c = {
    id: nextComplaintId(),
    title,
    category,
    priority: CATEGORIES[category] || "Undetermined",
    description,
    photo: photo || null,
    status: "Pending",
    studentId,
    assignedTo: null,
    createdAt: nowStamp(),
    history: [{ at: nowStamp(), text: `Complaint submitted by ${getUser(studentId).name}` }]
  };
  COMPLAINTS.unshift(c);
  return c;
}

function assignComplaint(complaintId, maintenanceId, wardenId) {
  const c = COMPLAINTS.find(x => x.id === complaintId);
  if (!c) return;
  c.assignedTo = maintenanceId;
  c.status = "Assigned";
  c.history.push({ at: nowStamp(), text: `Assigned to ${getUser(maintenanceId).name} by ${getUser(wardenId).name}` });
}

function markDone(complaintId, maintenanceId, photo) {
  const c = COMPLAINTS.find(x => x.id === complaintId);
  if (!c) return;
  c.status = "Under Review";
  if (photo) c.completionPhoto = photo;
  c.history.push({ at: nowStamp(), text: `Marked done by ${getUser(maintenanceId).name}, awaiting warden review` });
}

function resolveComplaint(complaintId, wardenId) {
  const c = COMPLAINTS.find(x => x.id === complaintId);
  if (!c) return;
  c.status = "Resolved";
  c.history.push({ at: nowStamp(), text: `Marked resolved by ${getUser(wardenId).name}` });
}

function reassignComplaint(complaintId, wardenId) {
  const c = COMPLAINTS.find(x => x.id === complaintId);
  if (!c) return;
  c.status = "Assigned";
  c.history.push({ at: nowStamp(), text: `Sent back to ${getUser(c.assignedTo).name} by ${getUser(wardenId).name}` });
}

function complaintsForStudent(studentId) {
  return COMPLAINTS.filter(c => c.studentId === studentId);
}

function complaintsForMaintenance(maintenanceId) {
  return COMPLAINTS.filter(c => c.assignedTo === maintenanceId && c.status !== "Resolved");
}

function activeComplaintsForWarden() {
  return COMPLAINTS.filter(c => c.status !== "Resolved")
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

function historyComplaintsForWarden() {
  return COMPLAINTS.filter(c => c.status === "Resolved");
}
