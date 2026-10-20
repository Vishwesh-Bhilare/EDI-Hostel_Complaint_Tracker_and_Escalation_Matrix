/* Thin client for the backend's single /api endpoint.
   The Java server (TcpServer + RequestHandler) accepts a generic
   { action: "select"|"insert"|"update"|"delete", table, ... } JSON body
   and returns { status: "ok"|"error", ... }. This file is the only place
   in the frontend that knows that shape. */

const API_ENDPOINT = "/api";

async function apiRequest(action, table, extra) {
  if (typeof location !== "undefined" && location.protocol === "file:") {
    throw new Error("Open http://localhost:8080 through the Java server, rather than opening index.html directly.");
  }
  const payload = Object.assign({ action, table }, extra || {});

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (res.status === 503) throw new Error("Server is busy. Please retry shortly.");
    const json = await res.json();
    if (json.status === "error") {
      throw new Error(json.message || `Request failed: ${action} ${table}`);
    }
    return json;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("The server took too long to respond. Refresh to check whether the operation completed.");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

const API = {
  snapshot: (includeAccounts = false) => apiRequest("snapshot", null, { includeAccounts }),
  select: (table, opts) => apiRequest("select", table, opts),
  insert: (table, data) => apiRequest("insert", table, { data }),
  update: (table, data, where) => apiRequest("update", table, { data, where }),
  remove: (table, where) => apiRequest("delete", table, { where }),
  // Returns after a queued audit row is saved; SMTP runs on separate workers.
  notify: (to, subject, body, complaintId, role) => apiRequest("notify", null, { to, subject, body, complaintId, role })
};
