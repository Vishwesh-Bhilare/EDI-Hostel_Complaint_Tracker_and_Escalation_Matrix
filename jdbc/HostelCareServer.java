import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Executors;

/**
 * Lightweight HostelCare development server.
 *
 * It serves the existing HTML/CSS/JS files and preserves the frontend's
 * /api/state/<key> contract, but persistent collections are now mapped to the
 * normalized MySQL tables (users, complaints, assignments, etc.) instead of a
 * JSON app_state table.
 */
public class HostelCareServer {
    private static final int DEFAULT_PORT = 8000;
    private static final int MAX_STATE_BYTES = 8 * 1024 * 1024;
    private static final Path ROOT = Paths.get(".").toAbsolutePath().normalize();

    public static void main(String[] args) throws Exception {
        int port = resolvePort();

        try (Connection conn = DBConnection.getConnection()) {
            RelationalStateStore.prepareSchemaCompatibility(conn);
            RelationalStateStore.migrateLegacyAppStateIfPresent(conn);
        }

        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/api/state/", new StateHandler());
        server.createContext("/api/health", new HealthHandler());
        server.createContext("/", new StaticFileHandler());
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();

        System.out.println("HostelCare server started successfully.");
        System.out.println("Storage mode: normalized MySQL tables (no app_state JSON storage).");
        System.out.println("Open: http://localhost:" + port + "/");
        System.out.println("Project root: " + ROOT);
        System.out.println("Press Ctrl+C to stop.");
    }

    private static int resolvePort() {
        String raw = System.getenv("HOSTELCARE_PORT");
        if (raw == null || raw.isBlank()) return DEFAULT_PORT;
        try {
            int port = Integer.parseInt(raw.trim());
            return port >= 1 && port <= 65535 ? port : DEFAULT_PORT;
        } catch (NumberFormatException ignored) {
            return DEFAULT_PORT;
        }
    }

    private static final class HealthHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendText(exchange, 405, "Method Not Allowed", "text/plain; charset=utf-8");
                return;
            }
            try (Connection conn = DBConnection.getConnection()) {
                boolean legacy = RelationalStateStore.tableExists(conn, "app_state");
                String json = "{\"ok\":true,\"database\":\"connected\",\"storage\":\"relational\",\"legacy_app_state_present\":" + legacy + "}";
                sendText(exchange, 200, json, "application/json; charset=utf-8");
            } catch (SQLException e) {
                sendText(exchange, 503,
                        "{\"ok\":false,\"database\":\"unavailable\"}",
                        "application/json; charset=utf-8");
            }
        }
    }

    private static final class StateHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String method = exchange.getRequestMethod().toUpperCase(Locale.ROOT);
            if ("OPTIONS".equals(method)) {
                addCorsHeaders(exchange.getResponseHeaders());
                exchange.sendResponseHeaders(204, -1);
                exchange.close();
                return;
            }

            String prefix = "/api/state/";
            String rawPath = exchange.getRequestURI().getPath();
            if (!rawPath.startsWith(prefix) || rawPath.length() <= prefix.length()) {
                sendText(exchange, 400, "Missing storage key.", "text/plain; charset=utf-8");
                return;
            }

            String key = URLDecoder.decode(rawPath.substring(prefix.length()), StandardCharsets.UTF_8);
            if (!RelationalStateStore.isSupportedKey(key)) {
                sendText(exchange, 404, "Unknown state collection.", "text/plain; charset=utf-8");
                return;
            }

            try {
                switch (method) {
                    case "GET" -> handleGet(exchange, key);
                    case "PUT" -> handlePut(exchange, key);
                    case "DELETE" -> handleDelete(exchange, key);
                    default -> sendText(exchange, 405, "Method Not Allowed", "text/plain; charset=utf-8");
                }
            } catch (IllegalArgumentException e) {
                sendText(exchange, 400, e.getMessage(), "text/plain; charset=utf-8");
            } catch (SQLException e) {
                e.printStackTrace();
                sendText(exchange, 500, "Database operation failed.", "text/plain; charset=utf-8");
            }
        }

        private static void handleGet(HttpExchange exchange, String key) throws SQLException, IOException {
            try (Connection conn = DBConnection.getConnection()) {
                Object state = RelationalStateStore.load(conn, key);
                // Preserve the old api.js migration contract: an empty server-side
                // collection is treated as missing so legacy browser-local data can
                // be uploaded once. After a successful upload api.js removes it.
                if (RelationalStateStore.isEmptyState(state)) {
                    sendText(exchange, 404, "Not Found", "text/plain; charset=utf-8");
                    return;
                }
                sendText(exchange, 200, MiniJson.stringify(state), "application/json; charset=utf-8");
            }
        }

        private static void handlePut(HttpExchange exchange, String key) throws SQLException, IOException {
            byte[] body = readLimited(exchange.getRequestBody(), MAX_STATE_BYTES);
            if (body.length == 0) {
                sendText(exchange, 400, "Request body is required.", "text/plain; charset=utf-8");
                return;
            }

            Object parsed = MiniJson.parse(new String(body, StandardCharsets.UTF_8));
            try (Connection conn = DBConnection.getConnection()) {
                boolean oldAutoCommit = conn.getAutoCommit();
                conn.setAutoCommit(false);
                try {
                    RelationalStateStore.save(conn, key, parsed);
                    conn.commit();
                } catch (SQLException | RuntimeException e) {
                    conn.rollback();
                    throw e;
                } finally {
                    conn.setAutoCommit(oldAutoCommit);
                }
            }
            sendText(exchange, 204, "", "application/json; charset=utf-8");
        }

        private static void handleDelete(HttpExchange exchange, String key) throws SQLException, IOException {
            try (Connection conn = DBConnection.getConnection()) {
                boolean oldAutoCommit = conn.getAutoCommit();
                conn.setAutoCommit(false);
                try {
                    RelationalStateStore.clear(conn, key);
                    conn.commit();
                } catch (SQLException | RuntimeException e) {
                    conn.rollback();
                    throw e;
                } finally {
                    conn.setAutoCommit(oldAutoCommit);
                }
            }
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
        }
    }

    /**
     * Maps the unchanged browser collection contract to normalized SQL rows.
     * JSON is used only as the HTTP serialization format; it is not the
     * persistence format for application entities.
     */
    private static final class RelationalStateStore {
        private static final String USERS = "hc_users";
        private static final String COMPLAINTS = "hc_complaints";
        private static final String ASSIGNMENTS = "hc_assignments";
        private static final String ESCALATIONS = "hc_escalations";
        private static final String FEEDBACK = "hc_feedback";
        private static final String NOTIFICATIONS = "hc_notifications";
        private static final String AUDIT = "hc_audit";
        private static final String SEEDED = "hc_seeded_v2";

        private static final List<String> MIGRATION_ORDER = List.of(
                USERS, COMPLAINTS, ASSIGNMENTS, ESCALATIONS,
                FEEDBACK, NOTIFICATIONS, AUDIT, SEEDED
        );

        static boolean isSupportedKey(String key) {
            return MIGRATION_ORDER.contains(key);
        }

        static boolean isEmptyState(Object state) {
            if (state instanceof Boolean b) return !b;
            if (state instanceof List<?> list) return list.isEmpty();
            return state == null;
        }

        static void prepareSchemaCompatibility(Connection conn) throws SQLException {
            requireTable(conn, "users");
            requireTable(conn, "complaints");
            requireTable(conn, "assignments");
            requireTable(conn, "escalation_events");
            requireTable(conn, "feedback");
            requireTable(conn, "notifications");
            requireTable(conn, "audit_events");

            ensureColumn(conn, "users", "app_user_key", "VARCHAR(50) NULL");
            ensureColumn(conn, "assignments", "app_assignment_key", "VARCHAR(50) NULL");
            ensureColumn(conn, "escalation_events", "app_escalation_key", "VARCHAR(50) NULL");
            ensureColumn(conn, "feedback", "app_feedback_key", "VARCHAR(50) NULL");
            ensureColumn(conn, "notifications", "app_notification_key", "VARCHAR(50) NULL");

            assignKnownAndMissingUserKeys(conn);
            assignMissingKeys(conn, "assignments", "assignment_id", "app_assignment_key", "db_asg_");
            assignMissingKeys(conn, "escalation_events", "escalation_id", "app_escalation_key", "db_esc_");
            assignMissingKeys(conn, "feedback", "feedback_id", "app_feedback_key", "db_fb_");
            assignMissingKeys(conn, "notifications", "notification_id", "app_notification_key", "db_ntf_");
            normalizeLegacyDemoPasswordPlaceholders(conn);
        }

        private static void requireTable(Connection conn, String table) throws SQLException {
            if (!tableExists(conn, table)) {
                throw new SQLException("Required table '" + table + "' does not exist. Import sql/hostelcare_schema.sql once, then restart.");
            }
        }

        static boolean tableExists(Connection conn, String table) throws SQLException {
            DatabaseMetaData meta = conn.getMetaData();
            try (ResultSet rs = meta.getTables(conn.getCatalog(), null, table, new String[]{"TABLE"})) {
                if (rs.next()) return true;
            }
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?")) {
                ps.setString(1, table);
                try (ResultSet rs = ps.executeQuery()) {
                    rs.next();
                    return rs.getInt(1) > 0;
                }
            }
        }

        private static boolean columnExists(Connection conn, String table, String column) throws SQLException {
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?")) {
                ps.setString(1, table);
                ps.setString(2, column);
                try (ResultSet rs = ps.executeQuery()) {
                    rs.next();
                    return rs.getInt(1) > 0;
                }
            }
        }

        private static void ensureColumn(Connection conn, String table, String column, String definition) throws SQLException {
            if (columnExists(conn, table, column)) return;
            try (Statement st = conn.createStatement()) {
                st.executeUpdate("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
            }
        }

        private static void assignKnownAndMissingUserKeys(Connection conn) throws SQLException {
            Map<String, String> known = new LinkedHashMap<>();
            known.put("AD900001", "u_admin");
            known.put("TY123456", "u_res1");
            known.put("TY123457", "u_res2");
            known.put("ST200001", "u_staff1");
            known.put("ST200002", "u_staff2");
            known.put("WD300001", "u_ward_a");
            known.put("WD300002", "u_ward_b");
            known.put("WD400001", "u_dep1");
            known.put("WD500001", "u_chief1");
            known.put("WD600001", "u_dean1");
            known.put("WD700001", "u_dir1");

            try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE users SET app_user_key = ? WHERE username = ? AND (app_user_key IS NULL OR app_user_key = '')")) {
                for (Map.Entry<String, String> e : known.entrySet()) {
                    ps.setString(1, e.getValue());
                    ps.setString(2, e.getKey());
                    ps.addBatch();
                }
                ps.executeBatch();
            }
            assignMissingKeys(conn, "users", "user_id", "app_user_key", "db_u_");
        }

        private static void assignMissingKeys(Connection conn, String table, String idColumn, String keyColumn, String prefix) throws SQLException {
            try (Statement st = conn.createStatement()) {
                st.executeUpdate("UPDATE " + table + " SET " + keyColumn + " = CONCAT('" + prefix + "', " + idColumn + ") " +
                        "WHERE " + keyColumn + " IS NULL OR " + keyColumn + " = ''");
            }
        }

        private static void normalizeLegacyDemoPasswordPlaceholders(Connection conn) throws SQLException {
            Map<String, String> demoPasswords = new LinkedHashMap<>();
            demoPasswords.put("AD900001", "admin123");
            demoPasswords.put("TY123456", "resident123");
            demoPasswords.put("TY123457", "resident123");
            demoPasswords.put("ST200001", "staff123");
            demoPasswords.put("ST200002", "staff123");
            demoPasswords.put("WD300001", "warden123");
            demoPasswords.put("WD300002", "warden123");
            demoPasswords.put("WD400001", "warden123");
            demoPasswords.put("WD500001", "warden123");
            demoPasswords.put("WD600001", "warden123");
            demoPasswords.put("WD700001", "warden123");

            String sql = "UPDATE users SET password_hash = ? WHERE username = ? AND password_hash LIKE '$2a$10$REPLACE_WITH_BCRYPT_HASH_%'";
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                for (Map.Entry<String, String> e : demoPasswords.entrySet()) {
                    ps.setString(1, e.getValue());
                    ps.setString(2, e.getKey());
                    ps.addBatch();
                }
                ps.executeBatch();
            }
        }

        static void migrateLegacyAppStateIfPresent(Connection conn) throws SQLException {
            if (!tableExists(conn, "app_state")) return;

            Map<String, String> legacy = new LinkedHashMap<>();
            try (PreparedStatement ps = conn.prepareStatement("SELECT storage_key, json_value FROM app_state");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) legacy.put(rs.getString(1), rs.getString(2));
            }

            boolean oldAutoCommit = conn.getAutoCommit();
            conn.setAutoCommit(false);
            try {
                for (String key : MIGRATION_ORDER) {
                    String raw = legacy.get(key);
                    if (raw == null) continue;
                    save(conn, key, MiniJson.parse(raw));
                }
                try (Statement st = conn.createStatement()) {
                    st.executeUpdate("DROP TABLE app_state");
                }
                conn.commit();
                if (!legacy.isEmpty()) {
                    System.out.println("Migrated legacy app_state data into normalized relational tables and removed app_state.");
                }
            } catch (SQLException | RuntimeException e) {
                conn.rollback();
                throw new SQLException("Legacy app_state migration failed; the old table was left intact. " + e.getMessage(), e);
            } finally {
                conn.setAutoCommit(oldAutoCommit);
            }
        }

        static Object load(Connection conn, String key) throws SQLException {
            return switch (key) {
                case USERS -> loadUsers(conn);
                case COMPLAINTS -> loadComplaints(conn);
                case ASSIGNMENTS -> loadAssignments(conn);
                case ESCALATIONS -> loadEscalations(conn);
                case FEEDBACK -> loadFeedback(conn);
                case NOTIFICATIONS -> loadNotifications(conn);
                case AUDIT -> loadAudit(conn);
                case SEEDED -> hasUsers(conn);
                default -> throw new IllegalArgumentException("Unsupported collection: " + key);
            };
        }

        static void save(Connection conn, String key, Object value) throws SQLException {
            switch (key) {
                case USERS -> saveUsers(conn, asList(value, key));
                case COMPLAINTS -> saveComplaints(conn, asList(value, key));
                case ASSIGNMENTS -> saveAssignments(conn, asList(value, key));
                case ESCALATIONS -> saveEscalations(conn, asList(value, key));
                case FEEDBACK -> saveFeedback(conn, asList(value, key));
                case NOTIFICATIONS -> saveNotifications(conn, asList(value, key));
                case AUDIT -> saveAudit(conn, asList(value, key));
                case SEEDED -> { /* derived from whether users exist; no row is needed */ }
                default -> throw new IllegalArgumentException("Unsupported collection: " + key);
            }
        }

        static void clear(Connection conn, String key) throws SQLException {
            String table = switch (key) {
                case AUDIT -> "audit_events";
                case NOTIFICATIONS -> "notifications";
                case FEEDBACK -> "feedback";
                case ESCALATIONS -> "escalation_events";
                case ASSIGNMENTS -> "assignments";
                case COMPLAINTS -> "complaints";
                case USERS -> "users";
                case SEEDED -> null;
                default -> throw new IllegalArgumentException("Unsupported collection: " + key);
            };
            if (table == null) return;
            try (Statement st = conn.createStatement()) {
                st.executeUpdate("DELETE FROM " + table);
            }
        }

        private static boolean hasUsers(Connection conn) throws SQLException {
            try (Statement st = conn.createStatement(); ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM users")) {
                rs.next();
                return rs.getInt(1) > 0;
            }
        }

        private static List<Object> loadUsers(Connection conn) throws SQLException {
            List<Object> out = new ArrayList<>();
            String sql = "SELECT app_user_key, name, username, password_hash, email, role, room_no, hostel_block, status FROM users ORDER BY user_id";
            try (PreparedStatement ps = conn.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("user_id", rs.getString("app_user_key"));
                    m.put("name", rs.getString("name"));
                    m.put("username", rs.getString("username"));
                    m.put("password", rs.getString("password_hash"));
                    m.put("email", rs.getString("email"));
                    m.put("role", rs.getString("role"));
                    m.put("room_no", rs.getString("room_no"));
                    m.put("hostel_block", rs.getString("hostel_block"));
                    m.put("status", rs.getString("status"));
                    out.add(m);
                }
            }
            return out;
        }

        private static void saveUsers(Connection conn, List<Object> rows) throws SQLException {
            String find = "SELECT user_id FROM users WHERE app_user_key = ? OR LOWER(username) = LOWER(?) ORDER BY (app_user_key = ?) DESC LIMIT 1";
            String insert = "INSERT INTO users (app_user_key, name, username, password_hash, email, role, room_no, hostel_block, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
            String update = "UPDATE users SET app_user_key=?, name=?, username=?, password_hash=?, email=COALESCE(?, email), role=?, room_no=?, hostel_block=?, status=? WHERE user_id=?";

            try (PreparedStatement findPs = conn.prepareStatement(find);
                 PreparedStatement insertPs = conn.prepareStatement(insert);
                 PreparedStatement updatePs = conn.prepareStatement(update)) {
                for (Object row : rows) {
                    Map<String, Object> m = asMap(row, USERS);
                    String appKey = requiredString(m, "user_id");
                    String username = requiredString(m, "username");
                    Integer dbId = null;

                    findPs.setString(1, appKey);
                    findPs.setString(2, username);
                    findPs.setString(3, appKey);
                    try (ResultSet rs = findPs.executeQuery()) {
                        if (rs.next()) dbId = rs.getInt(1);
                    }

                    PreparedStatement ps = dbId == null ? insertPs : updatePs;
                    int i = 1;
                    ps.setString(i++, appKey);
                    ps.setString(i++, requiredString(m, "name"));
                    ps.setString(i++, username);
                    ps.setString(i++, stringValue(m.get("password"), ""));
                    setNullableString(ps, i++, m.get("email"));
                    ps.setString(i++, requiredString(m, "role"));
                    setNullableString(ps, i++, m.get("room_no"));
                    setNullableString(ps, i++, m.get("hostel_block"));
                    ps.setString(i++, stringValue(m.get("status"), "active"));
                    if (dbId != null) ps.setInt(i, dbId);
                    ps.executeUpdate();
                }
            }
        }

        private static List<Object> loadComplaints(Connection conn) throws SQLException {
            List<Object> out = new ArrayList<>();
            String sql = """
                    SELECT c.*, u.app_user_key AS resident_app_key, u.name AS resident_name
                    FROM complaints c
                    JOIN users u ON u.user_id = c.resident_id
                    ORDER BY c.created_at DESC, c.complaint_id DESC
                    """;
            try (PreparedStatement ps = conn.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("complaint_id", rs.getString("complaint_id"));
                    m.put("resident_id", rs.getString("resident_app_key"));
                    m.put("resident_name", rs.getString("resident_name"));
                    m.put("room_no", rs.getString("room_no"));
                    m.put("hostel_block", rs.getString("hostel_block"));
                    m.put("category", rs.getString("category"));
                    m.put("severity", rs.getString("severity"));
                    m.put("description", rs.getString("description"));
                    m.put("evidence_name", rs.getString("evidence_name"));
                    m.put("status", rs.getString("status"));
                    m.put("level", rs.getInt("level"));
                    m.put("current_role", rs.getString("current_authority_role"));
                    m.put("acknowledged", rs.getBoolean("acknowledged"));
                    m.put("acknowledged_at", epochMillis(rs.getTimestamp("acknowledged_at")));
                    m.put("created_at", epochMillis(rs.getTimestamp("created_at")));
                    m.put("response_due", epochMillis(rs.getTimestamp("response_due")));
                    m.put("resolution_due", epochMillis(rs.getTimestamp("resolution_due")));
                    m.put("resolved_at", epochMillis(rs.getTimestamp("resolved_at")));
                    m.put("resolution_note", rs.getString("resolution_note"));
                    m.put("breach_flag", rs.getBoolean("breach_flag"));
                    m.put("version", rs.getInt("version"));
                    m.put("idempotency_key", rs.getString("idempotency_key"));
                    out.add(m);
                }
            }
            return out;
        }

        private static void saveComplaints(Connection conn, List<Object> rows) throws SQLException {
            String find = "SELECT complaint_id FROM complaints WHERE complaint_id = ?";
            String userLookup = "SELECT user_id FROM users WHERE app_user_key = ? LIMIT 1";
            String insert = """
                    INSERT INTO complaints
                    (complaint_id, resident_id, category, severity, hostel_block, room_no, description, evidence_name,
                     status, level, current_authority_role, acknowledged, acknowledged_at, created_at, response_due,
                     resolution_due, resolved_at, resolution_note, breach_flag, version, idempotency_key)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """;
            String update = """
                    UPDATE complaints SET resident_id=?, category=?, severity=?, hostel_block=?, room_no=?, description=?,
                    evidence_name=?, status=?, level=?, current_authority_role=?, acknowledged=?, acknowledged_at=?,
                    created_at=?, response_due=?, resolution_due=?, resolved_at=?, resolution_note=?, breach_flag=?,
                    version=?, idempotency_key=? WHERE complaint_id=?
                    """;

            try (PreparedStatement findPs = conn.prepareStatement(find);
                 PreparedStatement userPs = conn.prepareStatement(userLookup);
                 PreparedStatement insertPs = conn.prepareStatement(insert);
                 PreparedStatement updatePs = conn.prepareStatement(update)) {
                for (Object row : rows) {
                    Map<String, Object> m = asMap(row, COMPLAINTS);
                    String complaintId = requiredString(m, "complaint_id");
                    int residentDbId = lookupRequiredInt(userPs, requiredString(m, "resident_id"), "Unknown resident for complaint " + complaintId);
                    boolean exists;
                    findPs.setString(1, complaintId);
                    try (ResultSet rs = findPs.executeQuery()) { exists = rs.next(); }

                    PreparedStatement ps = exists ? updatePs : insertPs;
                    int i = 1;
                    if (!exists) ps.setString(i++, complaintId);
                    ps.setInt(i++, residentDbId);
                    ps.setString(i++, requiredString(m, "category"));
                    ps.setString(i++, requiredString(m, "severity"));
                    ps.setString(i++, requiredString(m, "hostel_block"));
                    ps.setString(i++, requiredString(m, "room_no"));
                    ps.setString(i++, requiredString(m, "description"));
                    setNullableString(ps, i++, m.get("evidence_name"));
                    ps.setString(i++, stringValue(m.get("status"), "Open"));
                    ps.setInt(i++, intValue(m.get("level"), 1));
                    ps.setString(i++, requiredString(m, "current_role"));
                    ps.setBoolean(i++, boolValue(m.get("acknowledged"), false));
                    setNullableTimestamp(ps, i++, m.get("acknowledged_at"));
                    setRequiredTimestamp(ps, i++, m.get("created_at"), "created_at");
                    setRequiredTimestamp(ps, i++, m.get("response_due"), "response_due");
                    setRequiredTimestamp(ps, i++, m.get("resolution_due"), "resolution_due");
                    setNullableTimestamp(ps, i++, m.get("resolved_at"));
                    setNullableString(ps, i++, m.get("resolution_note"));
                    ps.setBoolean(i++, boolValue(m.get("breach_flag"), false));
                    ps.setInt(i++, intValue(m.get("version"), 1));
                    ps.setString(i++, requiredString(m, "idempotency_key"));
                    if (exists) ps.setString(i, complaintId);
                    ps.executeUpdate();
                }
            }
        }

        private static List<Object> loadAssignments(Connection conn) throws SQLException {
            List<Object> out = new ArrayList<>();
            String sql = """
                    SELECT a.app_assignment_key, a.complaint_id, u.app_user_key AS staff_app_key,
                           a.assigned_at, a.status
                    FROM assignments a
                    JOIN users u ON u.user_id = a.staff_id
                    ORDER BY a.assigned_at ASC, a.assignment_id ASC
                    """;
            try (PreparedStatement ps = conn.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("assignment_id", rs.getString("app_assignment_key"));
                    m.put("complaint_id", rs.getString("complaint_id"));
                    m.put("staff_id", rs.getString("staff_app_key"));
                    m.put("assigned_at", isoString(rs.getTimestamp("assigned_at")));
                    m.put("status", rs.getString("status"));
                    out.add(m);
                }
            }
            return out;
        }

        private static void saveAssignments(Connection conn, List<Object> rows) throws SQLException {
            String find = "SELECT assignment_id FROM assignments WHERE app_assignment_key = ? LIMIT 1";
            String userLookup = "SELECT user_id FROM users WHERE app_user_key = ? LIMIT 1";
            String insert = "INSERT INTO assignments (app_assignment_key, complaint_id, staff_id, assigned_at, status) VALUES (?, ?, ?, ?, ?)";
            String update = "UPDATE assignments SET complaint_id=?, staff_id=?, assigned_at=?, status=? WHERE assignment_id=?";
            try (PreparedStatement findPs = conn.prepareStatement(find);
                 PreparedStatement userPs = conn.prepareStatement(userLookup);
                 PreparedStatement insertPs = conn.prepareStatement(insert);
                 PreparedStatement updatePs = conn.prepareStatement(update)) {
                for (Object row : rows) {
                    Map<String, Object> m = asMap(row, ASSIGNMENTS);
                    String appKey = requiredString(m, "assignment_id");
                    Integer id = findId(findPs, appKey);
                    int staffDbId = lookupRequiredInt(userPs, requiredString(m, "staff_id"), "Unknown maintenance staff for assignment " + appKey);
                    PreparedStatement ps = id == null ? insertPs : updatePs;
                    int i = 1;
                    if (id == null) ps.setString(i++, appKey);
                    ps.setString(i++, requiredString(m, "complaint_id"));
                    ps.setInt(i++, staffDbId);
                    setRequiredTimestamp(ps, i++, m.get("assigned_at"), "assigned_at");
                    ps.setString(i++, stringValue(m.get("status"), "active"));
                    if (id != null) ps.setInt(i, id);
                    ps.executeUpdate();
                }
            }
        }

        private static List<Object> loadEscalations(Connection conn) throws SQLException {
            List<Object> out = new ArrayList<>();
            String sql = "SELECT * FROM escalation_events ORDER BY triggered_at DESC, escalation_id DESC";
            try (PreparedStatement ps = conn.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("escalation_id", rs.getString("app_escalation_key"));
                    m.put("complaint_id", rs.getString("complaint_id"));
                    m.put("level", rs.getInt("level"));
                    m.put("escalated_to_role", rs.getString("escalated_to_role"));
                    m.put("reason", rs.getString("reason"));
                    m.put("triggered_at", isoString(rs.getTimestamp("triggered_at")));
                    m.put("manual", rs.getBoolean("is_manual"));
                    String actor = rs.getString("actor_username");
                    m.put("actor", actor == null ? "system" : actor);
                    m.put("acknowledged", rs.getBoolean("acknowledged"));
                    m.put("ack_by", rs.getString("ack_by"));
                    m.put("decision", rs.getString("decision"));
                    m.put("decision_reason", rs.getString("decision_reason"));
                    out.add(m);
                }
            }
            return out;
        }

        private static void saveEscalations(Connection conn, List<Object> rows) throws SQLException {
            String find = "SELECT escalation_id FROM escalation_events WHERE app_escalation_key = ? LIMIT 1";
            String insert = """
                    INSERT INTO escalation_events
                    (app_escalation_key, complaint_id, level, escalated_to_role, reason, triggered_at, is_manual,
                     actor_username, acknowledged, ack_by, decision, decision_reason)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """;
            String update = """
                    UPDATE escalation_events SET complaint_id=?, level=?, escalated_to_role=?, reason=?, triggered_at=?,
                    is_manual=?, actor_username=?, acknowledged=?, ack_by=?, decision=?, decision_reason=?
                    WHERE escalation_id=?
                    """;
            try (PreparedStatement findPs = conn.prepareStatement(find);
                 PreparedStatement insertPs = conn.prepareStatement(insert);
                 PreparedStatement updatePs = conn.prepareStatement(update)) {
                for (Object row : rows) {
                    Map<String, Object> m = asMap(row, ESCALATIONS);
                    String appKey = requiredString(m, "escalation_id");
                    Integer id = findId(findPs, appKey);
                    PreparedStatement ps = id == null ? insertPs : updatePs;
                    int i = 1;
                    if (id == null) ps.setString(i++, appKey);
                    ps.setString(i++, requiredString(m, "complaint_id"));
                    ps.setInt(i++, intValue(m.get("level"), 1));
                    ps.setString(i++, requiredString(m, "escalated_to_role"));
                    ps.setString(i++, requiredString(m, "reason"));
                    setRequiredTimestamp(ps, i++, m.get("triggered_at"), "triggered_at");
                    ps.setBoolean(i++, boolValue(m.get("manual"), false));
                    String actor = stringValue(m.get("actor"), null);
                    setNullableString(ps, i++, "system".equalsIgnoreCase(actor == null ? "" : actor) ? null : actor);
                    ps.setBoolean(i++, boolValue(m.get("acknowledged"), false));
                    setNullableString(ps, i++, m.get("ack_by"));
                    setNullableString(ps, i++, m.get("decision"));
                    setNullableString(ps, i++, m.get("decision_reason"));
                    if (id != null) ps.setInt(i, id);
                    ps.executeUpdate();
                }
            }
        }

        private static List<Object> loadFeedback(Connection conn) throws SQLException {
            List<Object> out = new ArrayList<>();
            String sql = """
                    SELECT f.app_feedback_key, f.complaint_id, u.app_user_key AS resident_app_key,
                           f.rating, f.reopened, f.submitted_at
                    FROM feedback f
                    JOIN users u ON u.user_id = f.resident_id
                    ORDER BY f.submitted_at DESC, f.feedback_id DESC
                    """;
            try (PreparedStatement ps = conn.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("feedback_id", rs.getString("app_feedback_key"));
                    m.put("complaint_id", rs.getString("complaint_id"));
                    m.put("resident_id", rs.getString("resident_app_key"));
                    int rating = rs.getInt("rating");
                    m.put("rating", rs.wasNull() ? null : rating);
                    m.put("reopened", rs.getBoolean("reopened"));
                    m.put("submitted_at", isoString(rs.getTimestamp("submitted_at")));
                    out.add(m);
                }
            }
            return out;
        }

        private static void saveFeedback(Connection conn, List<Object> rows) throws SQLException {
            String find = "SELECT feedback_id FROM feedback WHERE app_feedback_key = ? LIMIT 1";
            String userLookup = "SELECT user_id FROM users WHERE app_user_key = ? LIMIT 1";
            String insert = "INSERT INTO feedback (app_feedback_key, complaint_id, resident_id, rating, reopened, submitted_at) VALUES (?, ?, ?, ?, ?, ?)";
            String update = "UPDATE feedback SET complaint_id=?, resident_id=?, rating=?, reopened=?, submitted_at=? WHERE feedback_id=?";
            try (PreparedStatement findPs = conn.prepareStatement(find);
                 PreparedStatement userPs = conn.prepareStatement(userLookup);
                 PreparedStatement insertPs = conn.prepareStatement(insert);
                 PreparedStatement updatePs = conn.prepareStatement(update)) {
                for (Object row : rows) {
                    Map<String, Object> m = asMap(row, FEEDBACK);
                    String appKey = requiredString(m, "feedback_id");
                    Integer id = findId(findPs, appKey);
                    int residentDbId = lookupRequiredInt(userPs, requiredString(m, "resident_id"), "Unknown resident for feedback " + appKey);
                    PreparedStatement ps = id == null ? insertPs : updatePs;
                    int i = 1;
                    if (id == null) ps.setString(i++, appKey);
                    ps.setString(i++, requiredString(m, "complaint_id"));
                    ps.setInt(i++, residentDbId);
                    if (m.get("rating") == null) ps.setNull(i++, java.sql.Types.TINYINT); else ps.setInt(i++, intValue(m.get("rating"), 0));
                    ps.setBoolean(i++, boolValue(m.get("reopened"), false));
                    setRequiredTimestamp(ps, i++, m.get("submitted_at"), "submitted_at");
                    if (id != null) ps.setInt(i, id);
                    ps.executeUpdate();
                }
            }
        }

        private static List<Object> loadNotifications(Connection conn) throws SQLException {
            List<Object> out = new ArrayList<>();
            String sql = "SELECT * FROM notifications ORDER BY created_at DESC, notification_id DESC LIMIT 300";
            try (PreparedStatement ps = conn.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("notification_id", rs.getString("app_notification_key"));
                    m.put("recipient_role", rs.getString("recipient_role"));
                    m.put("recipient_block", rs.getString("recipient_block"));
                    m.put("type", rs.getString("type"));
                    String payload = rs.getString("payload");
                    m.put("payload", payload == null ? new LinkedHashMap<>() : MiniJson.parse(payload));
                    m.put("created_at", isoString(rs.getTimestamp("created_at")));
                    m.put("read", rs.getBoolean("is_read"));
                    out.add(m);
                }
            }
            return out;
        }

        private static void saveNotifications(Connection conn, List<Object> rows) throws SQLException {
            String find = "SELECT notification_id FROM notifications WHERE app_notification_key = ? LIMIT 1";
            String insert = "INSERT INTO notifications (app_notification_key, recipient_role, recipient_block, type, payload, created_at, is_read) VALUES (?, ?, ?, ?, ?, ?, ?)";
            String update = "UPDATE notifications SET recipient_role=?, recipient_block=?, type=?, payload=?, created_at=?, is_read=? WHERE notification_id=?";
            try (PreparedStatement findPs = conn.prepareStatement(find);
                 PreparedStatement insertPs = conn.prepareStatement(insert);
                 PreparedStatement updatePs = conn.prepareStatement(update)) {
                for (Object row : rows) {
                    Map<String, Object> m = asMap(row, NOTIFICATIONS);
                    String appKey = requiredString(m, "notification_id");
                    Integer id = findId(findPs, appKey);
                    PreparedStatement ps = id == null ? insertPs : updatePs;
                    int i = 1;
                    if (id == null) ps.setString(i++, appKey);
                    ps.setString(i++, requiredString(m, "recipient_role"));
                    setNullableString(ps, i++, m.get("recipient_block"));
                    ps.setString(i++, requiredString(m, "type"));
                    ps.setString(i++, MiniJson.stringify(m.get("payload") == null ? new LinkedHashMap<>() : m.get("payload")));
                    setRequiredTimestamp(ps, i++, m.get("created_at"), "created_at");
                    ps.setBoolean(i++, boolValue(m.get("read"), false));
                    if (id != null) ps.setInt(i, id);
                    ps.executeUpdate();
                }
            }
        }

        private static List<Object> loadAudit(Connection conn) throws SQLException {
            List<Object> out = new ArrayList<>();
            String sql = "SELECT correlation_id, actor, action, target, outcome, metadata, event_time FROM audit_events ORDER BY event_time DESC, audit_id DESC LIMIT 500";
            try (PreparedStatement ps = conn.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("correlation_id", rs.getString("correlation_id"));
                    m.put("actor", rs.getString("actor"));
                    m.put("action", rs.getString("action"));
                    m.put("target", rs.getString("target"));
                    m.put("outcome", rs.getString("outcome"));
                    String metadata = rs.getString("metadata");
                    m.put("timestamp", isoString(rs.getTimestamp("event_time")));
                    m.put("metadata", metadata == null ? new LinkedHashMap<>() : MiniJson.parse(metadata));
                    out.add(m);
                }
            }
            return out;
        }

        private static void saveAudit(Connection conn, List<Object> rows) throws SQLException {
            String exists = "SELECT audit_id FROM audit_events WHERE correlation_id = ? LIMIT 1";
            String insert = "INSERT INTO audit_events (correlation_id, actor, action, target, outcome, metadata, event_time) VALUES (?, ?, ?, ?, ?, ?, ?)";
            try (PreparedStatement existsPs = conn.prepareStatement(exists);
                 PreparedStatement insertPs = conn.prepareStatement(insert)) {
                for (Object row : rows) {
                    Map<String, Object> m = asMap(row, AUDIT);
                    String correlationId = requiredString(m, "correlation_id");
                    existsPs.setString(1, correlationId);
                    try (ResultSet rs = existsPs.executeQuery()) {
                        if (rs.next()) continue;
                    }
                    int i = 1;
                    insertPs.setString(i++, correlationId);
                    insertPs.setString(i++, stringValue(m.get("actor"), "system"));
                    insertPs.setString(i++, requiredString(m, "action"));
                    insertPs.setString(i++, requiredString(m, "target"));
                    insertPs.setString(i++, requiredString(m, "outcome"));
                    insertPs.setString(i++, MiniJson.stringify(m.get("metadata") == null ? new LinkedHashMap<>() : m.get("metadata")));
                    setRequiredTimestamp(insertPs, i, m.get("timestamp"), "timestamp");
                    insertPs.executeUpdate();
                }
            }
        }

        private static Integer findId(PreparedStatement ps, String appKey) throws SQLException {
            ps.setString(1, appKey);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : null;
            }
        }

        private static int lookupRequiredInt(PreparedStatement ps, String appKey, String error) throws SQLException {
            ps.setString(1, appKey);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new SQLException(error);
                return rs.getInt(1);
            }
        }

        private static List<Object> asList(Object value, String key) {
            if (value instanceof List<?> list) return new ArrayList<>(list);
            throw new IllegalArgumentException(key + " must be a JSON array.");
        }

        @SuppressWarnings("unchecked")
        private static Map<String, Object> asMap(Object value, String key) {
            if (value instanceof Map<?, ?> map) return (Map<String, Object>) map;
            throw new IllegalArgumentException(key + " contains a non-object row.");
        }

        private static String requiredString(Map<String, Object> m, String key) {
            String value = stringValue(m.get(key), null);
            if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing required field: " + key);
            return value;
        }

        private static String stringValue(Object value, String fallback) {
            if (value == null) return fallback;
            return String.valueOf(value);
        }

        private static int intValue(Object value, int fallback) {
            if (value == null) return fallback;
            if (value instanceof Number n) return n.intValue();
            try { return Integer.parseInt(String.valueOf(value)); }
            catch (NumberFormatException e) { return fallback; }
        }

        private static boolean boolValue(Object value, boolean fallback) {
            if (value == null) return fallback;
            if (value instanceof Boolean b) return b;
            if (value instanceof Number n) return n.intValue() != 0;
            return Boolean.parseBoolean(String.valueOf(value));
        }

        private static void setNullableString(PreparedStatement ps, int index, Object value) throws SQLException {
            String s = stringValue(value, null);
            if (s == null || s.isBlank()) ps.setNull(index, java.sql.Types.VARCHAR);
            else ps.setString(index, s);
        }

        private static Long epochMillis(Timestamp ts) {
            return ts == null ? null : ts.toInstant().toEpochMilli();
        }

        private static String isoString(Timestamp ts) {
            return ts == null ? null : ts.toInstant().toString();
        }

        private static Timestamp timestampValue(Object value) {
            if (value == null) return null;
            if (value instanceof Number n) return Timestamp.from(Instant.ofEpochMilli(n.longValue()));
            String s = String.valueOf(value).trim();
            if (s.isEmpty() || "null".equalsIgnoreCase(s)) return null;
            try { return Timestamp.from(Instant.parse(s)); }
            catch (DateTimeParseException ignored) { }
            try { return Timestamp.from(OffsetDateTime.parse(s).toInstant()); }
            catch (DateTimeParseException ignored) { }
            try { return Timestamp.valueOf(LocalDateTime.parse(s).atOffset(ZoneOffset.UTC).toLocalDateTime()); }
            catch (DateTimeParseException ignored) { }
            try { return Timestamp.valueOf(s); }
            catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("Invalid date/time value: " + s);
            }
        }

        private static void setRequiredTimestamp(PreparedStatement ps, int index, Object value, String field) throws SQLException {
            Timestamp ts = timestampValue(value);
            if (ts == null) throw new IllegalArgumentException("Missing required field: " + field);
            ps.setTimestamp(index, ts);
        }

        private static void setNullableTimestamp(PreparedStatement ps, int index, Object value) throws SQLException {
            Timestamp ts = timestampValue(value);
            if (ts == null) ps.setNull(index, java.sql.Types.TIMESTAMP);
            else ps.setTimestamp(index, ts);
        }
    }

    /** Minimal JSON parser/serializer to avoid adding another runtime jar. */
    private static final class MiniJson {
        static Object parse(String json) {
            if (json == null) throw new IllegalArgumentException("JSON body is null.");
            Parser p = new Parser(json);
            Object value = p.parseValue();
            p.skipWhitespace();
            if (!p.isEnd()) throw new IllegalArgumentException("Unexpected trailing JSON content at position " + p.pos);
            return value;
        }

        static String stringify(Object value) {
            StringBuilder sb = new StringBuilder();
            write(value, sb);
            return sb.toString();
        }

        private static void write(Object value, StringBuilder sb) {
            if (value == null) {
                sb.append("null");
            } else if (value instanceof String s) {
                writeString(s, sb);
            } else if (value instanceof Boolean || value instanceof Byte || value instanceof Short ||
                       value instanceof Integer || value instanceof Long) {
                sb.append(value);
            } else if (value instanceof Float f) {
                if (!Float.isFinite(f)) sb.append("null"); else sb.append(f);
            } else if (value instanceof Double d) {
                if (!Double.isFinite(d)) sb.append("null"); else sb.append(d);
            } else if (value instanceof Number n) {
                sb.append(n);
            } else if (value instanceof Map<?, ?> map) {
                sb.append('{');
                boolean first = true;
                for (Map.Entry<?, ?> e : map.entrySet()) {
                    if (!first) sb.append(',');
                    first = false;
                    writeString(String.valueOf(e.getKey()), sb);
                    sb.append(':');
                    write(e.getValue(), sb);
                }
                sb.append('}');
            } else if (value instanceof Iterable<?> iterable) {
                sb.append('[');
                boolean first = true;
                for (Object item : iterable) {
                    if (!first) sb.append(',');
                    first = false;
                    write(item, sb);
                }
                sb.append(']');
            } else {
                writeString(String.valueOf(value), sb);
            }
        }

        private static void writeString(String s, StringBuilder sb) {
            sb.append('"');
            for (int i = 0; i < s.length(); i++) {
                char c = s.charAt(i);
                switch (c) {
                    case '"' -> sb.append("\\\"");
                    case '\\' -> sb.append("\\\\");
                    case '\b' -> sb.append("\\b");
                    case '\f' -> sb.append("\\f");
                    case '\n' -> sb.append("\\n");
                    case '\r' -> sb.append("\\r");
                    case '\t' -> sb.append("\\t");
                    default -> {
                        if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                        else sb.append(c);
                    }
                }
            }
            sb.append('"');
        }

        private static final class Parser {
            private final String s;
            private int pos;

            Parser(String s) { this.s = s; }
            boolean isEnd() { return pos >= s.length(); }
            void skipWhitespace() { while (!isEnd() && Character.isWhitespace(s.charAt(pos))) pos++; }

            Object parseValue() {
                skipWhitespace();
                if (isEnd()) throw error("Unexpected end of JSON");
                char c = s.charAt(pos);
                return switch (c) {
                    case '{' -> parseObject();
                    case '[' -> parseArray();
                    case '"' -> parseString();
                    case 't' -> parseLiteral("true", Boolean.TRUE);
                    case 'f' -> parseLiteral("false", Boolean.FALSE);
                    case 'n' -> parseLiteral("null", null);
                    default -> {
                        if (c == '-' || Character.isDigit(c)) yield parseNumber();
                        throw error("Unexpected character '" + c + "'");
                    }
                };
            }

            private Map<String, Object> parseObject() {
                expect('{');
                Map<String, Object> map = new LinkedHashMap<>();
                skipWhitespace();
                if (peek('}')) { pos++; return map; }
                while (true) {
                    skipWhitespace();
                    if (!peek('"')) throw error("Expected object key");
                    String key = parseString();
                    skipWhitespace();
                    expect(':');
                    map.put(key, parseValue());
                    skipWhitespace();
                    if (peek('}')) { pos++; return map; }
                    expect(',');
                }
            }

            private List<Object> parseArray() {
                expect('[');
                List<Object> list = new ArrayList<>();
                skipWhitespace();
                if (peek(']')) { pos++; return list; }
                while (true) {
                    list.add(parseValue());
                    skipWhitespace();
                    if (peek(']')) { pos++; return list; }
                    expect(',');
                }
            }

            private String parseString() {
                expect('"');
                StringBuilder out = new StringBuilder();
                while (!isEnd()) {
                    char c = s.charAt(pos++);
                    if (c == '"') return out.toString();
                    if (c != '\\') { out.append(c); continue; }
                    if (isEnd()) throw error("Incomplete escape sequence");
                    char e = s.charAt(pos++);
                    switch (e) {
                        case '"' -> out.append('"');
                        case '\\' -> out.append('\\');
                        case '/' -> out.append('/');
                        case 'b' -> out.append('\b');
                        case 'f' -> out.append('\f');
                        case 'n' -> out.append('\n');
                        case 'r' -> out.append('\r');
                        case 't' -> out.append('\t');
                        case 'u' -> {
                            if (pos + 4 > s.length()) throw error("Incomplete unicode escape");
                            String hex = s.substring(pos, pos + 4);
                            try { out.append((char) Integer.parseInt(hex, 16)); }
                            catch (NumberFormatException ex) { throw error("Invalid unicode escape"); }
                            pos += 4;
                        }
                        default -> throw error("Invalid escape sequence \\" + e);
                    }
                }
                throw error("Unterminated string");
            }

            private Object parseNumber() {
                int start = pos;
                if (peek('-')) pos++;
                while (!isEnd() && Character.isDigit(s.charAt(pos))) pos++;
                boolean fractional = false;
                if (!isEnd() && s.charAt(pos) == '.') {
                    fractional = true;
                    pos++;
                    while (!isEnd() && Character.isDigit(s.charAt(pos))) pos++;
                }
                if (!isEnd() && (s.charAt(pos) == 'e' || s.charAt(pos) == 'E')) {
                    fractional = true;
                    pos++;
                    if (!isEnd() && (s.charAt(pos) == '+' || s.charAt(pos) == '-')) pos++;
                    while (!isEnd() && Character.isDigit(s.charAt(pos))) pos++;
                }
                String raw = s.substring(start, pos);
                try {
                    if (fractional) return Double.parseDouble(raw);
                    return Long.parseLong(raw);
                } catch (NumberFormatException e) {
                    throw error("Invalid number: " + raw);
                }
            }

            private Object parseLiteral(String literal, Object value) {
                if (!s.startsWith(literal, pos)) throw error("Expected " + literal);
                pos += literal.length();
                return value;
            }

            private boolean peek(char c) { return !isEnd() && s.charAt(pos) == c; }
            private void expect(char c) {
                skipWhitespace();
                if (isEnd() || s.charAt(pos) != c) throw error("Expected '" + c + "'");
                pos++;
            }
            private IllegalArgumentException error(String message) {
                return new IllegalArgumentException(message + " at position " + pos);
            }
        }
    }

    private static final class StaticFileHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod()) &&
                !"HEAD".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendText(exchange, 405, "Method Not Allowed", "text/plain; charset=utf-8");
                return;
            }

            String requestPath = URLDecoder.decode(exchange.getRequestURI().getPath(), StandardCharsets.UTF_8);
            if (requestPath.equals("/")) requestPath = "/index.html";

            Path file = ROOT.resolve(requestPath.substring(1)).normalize();
            if (!file.startsWith(ROOT) || !Files.isRegularFile(file)) {
                sendText(exchange, 404, "Not Found", "text/plain; charset=utf-8");
                return;
            }

            String contentType = contentType(file);
            long length = Files.size(file);
            Headers headers = exchange.getResponseHeaders();
            headers.set("Content-Type", contentType);
            headers.set("Cache-Control", "no-store");

            if ("HEAD".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(200, -1);
                exchange.close();
                return;
            }

            exchange.sendResponseHeaders(200, length);
            try (OutputStream out = exchange.getResponseBody()) {
                Files.copy(file, out);
            }
        }
    }

    private static byte[] readLimited(InputStream input, int maxBytes) throws IOException {
        byte[] buffer = new byte[8192];
        int total = 0;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int read;
        while ((read = input.read(buffer)) != -1) {
            total += read;
            if (total > maxBytes) throw new IOException("Request body is too large.");
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    private static void addCorsHeaders(Headers headers) {
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS");
        headers.set("Access-Control-Allow-Headers", "Content-Type");
    }

    private static void sendText(HttpExchange exchange, int status, String body, String contentType) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        Headers headers = exchange.getResponseHeaders();
        headers.set("Content-Type", contentType);
        headers.set("Cache-Control", "no-store");
        addCorsHeaders(headers);
        if (status == 204) {
            exchange.sendResponseHeaders(status, -1);
            exchange.close();
            return;
        }
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    private static String contentType(Path file) {
        String name = file.getFileName().toString().toLowerCase(Locale.ROOT);
        if (name.endsWith(".html")) return "text/html; charset=utf-8";
        if (name.endsWith(".css")) return "text/css; charset=utf-8";
        if (name.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (name.endsWith(".json")) return "application/json; charset=utf-8";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        if (name.endsWith(".svg")) return "image/svg+xml";
        if (name.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }
}
