/* Thin client for the backend's single /api endpoint.
   The Java server (TcpServer + RequestHandler) accepts a generic
   { action: "select"|"insert"|"update"|"delete", table, ... } JSON body
   and returns { status: "ok"|"error", ... }. This file is the only place
   in the frontend that knows that shape. */

const API_ENDPOINT = "/api";

async function apiRequest(action, table, extra) {
  const payload = Object.assign({ action, table }, extra || {});

  const res = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  if (json.status === "error") {
    throw new Error(json.message || `Request failed: ${action} ${table}`);
  }
  return json;
}

const API = {
  select: (table, opts) => apiRequest("select", table, opts),
  insert: (table, data) => apiRequest("insert", table, { data }),
  update: (table, data, where) => apiRequest("update", table, { data, where }),
  remove: (table, where) => apiRequest("delete", table, { where }),
  // Not a table action — the server hands this straight to its mailer
  // instead of touching MySQL. See jdbc/RequestHandler.java#handleNotify.
  notify: (to, subject, body) => apiRequest("notify", null, { to, subject, body })
};
