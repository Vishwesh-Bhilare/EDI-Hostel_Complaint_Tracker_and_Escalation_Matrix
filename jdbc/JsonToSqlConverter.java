import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Converts a generic JSON request into SQL and runs it against the
 * hostelcare database (see schema.sql).
 *
 * Expected request shape:
 * {
 *   "action": "select" | "insert" | "update" | "delete",
 *   "table":  "complaints",
 *   "columns": ["id", "title"],       // optional, select only
 *   "data":   { "title": "...", ... },// insert / update
 *   "where":  { "id": 3 }             // select / update / delete
 * }
 *
 * Table and column names are validated against a whitelist below.
 * They CANNOT be safely passed as PreparedStatement parameters (JDBC only
 * parameterizes values, not identifiers), so the whitelist is what stops
 * SQL injection through the "table"/"columns"/"data"/"where" keys.
 * Every value, on the other hand, is always bound with "?" — never
 * concatenated into the SQL string.
 */
public class JsonToSqlConverter {

    // Must match schema.sql
    private static final Map<String, Set<String>> TABLE_COLUMNS = new HashMap<>();
    static {
        TABLE_COLUMNS.put("users", new HashSet<>(Arrays.asList(
                "id", "name", "role", "prn", "email", "password", "block", "room")));
        TABLE_COLUMNS.put("pending_registrations", new HashSet<>(Arrays.asList(
                "id", "name", "prn", "email", "password", "block", "status", "rejection_reason", "requested_at")));
        TABLE_COLUMNS.put("complaints", new HashSet<>(Arrays.asList(
                "id", "title", "category", "severity", "description", "photo", "completion_photo",
                "status", "student_id", "hostel_block", "assigned_to", "escalation_level",
                "response_due_at", "resolution_due_at", "final_due_at", "created_at")));
        TABLE_COLUMNS.put("complaint_history", new HashSet<>(Arrays.asList(
                "id", "complaint_id", "note", "created_at")));
        TABLE_COLUMNS.put("escalations", new HashSet<>(Arrays.asList(
                "id", "complaint_id", "level", "escalated_to_role", "reason", "triggered_by", "triggered_at")));
        TABLE_COLUMNS.put("notifications", new HashSet<>(Arrays.asList(
                "id", "complaint_id", "role", "email", "subject", "status", "sent_at")));
    }

    public static Map<String, Object> handleRequest(Connection conn, Map<String, Object> request) {
        try {
            String action = requireString(request, "action");
            String table = requireString(request, "table");

            Set<String> allowedColumns = TABLE_COLUMNS.get(table);
            if (allowedColumns == null) {
                throw new IllegalArgumentException("Unknown table: " + table);
            }

            switch (action) {
                case "select": return handleSelect(conn, table, allowedColumns, request);
                case "insert": return handleInsert(conn, table, allowedColumns, request);
                case "update": return handleUpdate(conn, table, allowedColumns, request);
                case "delete": return handleDelete(conn, table, allowedColumns, request);
                default: throw new IllegalArgumentException("Unknown action: " + action);
            }
        } catch (Exception e) {
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("status", "error");
            response.put("message", e.getMessage());
            return response;
        }
    }

    // ---------------- SELECT ----------------
    @SuppressWarnings("unchecked")
    private static Map<String, Object> handleSelect(Connection conn, String table, Set<String> allowedColumns,
                                                      Map<String, Object> request) throws SQLException {
        List<Object> columnsReq = (List<Object>) request.get("columns");
        String columnList = "*";
        if (columnsReq != null && !columnsReq.isEmpty()) {
            List<String> cols = new ArrayList<>();
            for (Object c : columnsReq) {
                String col = c.toString();
                validateColumn(allowedColumns, col);
                cols.add(col);
            }
            columnList = String.join(", ", cols);
        }

        Map<String, Object> where = (Map<String, Object>) request.get("where");
        StringBuilder sql = new StringBuilder("SELECT ").append(columnList).append(" FROM ").append(table);
        List<Object> params = new ArrayList<>();
        appendWhere(sql, where, allowedColumns, params);

        Map<String, Object> response = new LinkedHashMap<>();
        try (PreparedStatement ps = conn.prepareStatement(sql.toString())) {
            bindParams(ps, params);
            try (ResultSet rs = ps.executeQuery()) {
                response.put("status", "ok");
                response.put("rows", resultSetToList(rs));
            }
        }
        return response;
    }

    // ---------------- INSERT ----------------
    @SuppressWarnings("unchecked")
    private static Map<String, Object> handleInsert(Connection conn, String table, Set<String> allowedColumns,
                                                      Map<String, Object> request) throws SQLException {
        Map<String, Object> data = (Map<String, Object>) request.get("data");
        if (data == null || data.isEmpty()) {
            throw new IllegalArgumentException("'data' is required for insert");
        }

        List<String> cols = new ArrayList<>();
        List<Object> params = new ArrayList<>();
        for (Map.Entry<String, Object> entry : data.entrySet()) {
            validateColumn(allowedColumns, entry.getKey());
            cols.add(entry.getKey());
            params.add(entry.getValue());
        }

        String placeholders = String.join(", ", Collections.nCopies(cols.size(), "?"));
        String sql = "INSERT INTO " + table + " (" + String.join(", ", cols) + ") VALUES (" + placeholders + ")";

        Map<String, Object> response = new LinkedHashMap<>();
        try (PreparedStatement ps = conn.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            bindParams(ps, params);
            int affected = ps.executeUpdate();
            response.put("status", "ok");
            response.put("affected", (long) affected);
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) {
                    response.put("insertedId", keys.getLong(1));
                }
            }
        }
        return response;
    }

    // ---------------- UPDATE ----------------
    @SuppressWarnings("unchecked")
    private static Map<String, Object> handleUpdate(Connection conn, String table, Set<String> allowedColumns,
                                                      Map<String, Object> request) throws SQLException {
        Map<String, Object> data = (Map<String, Object>) request.get("data");
        Map<String, Object> where = (Map<String, Object>) request.get("where");
        if (data == null || data.isEmpty()) {
            throw new IllegalArgumentException("'data' is required for update");
        }
        if (where == null || where.isEmpty()) {
            throw new IllegalArgumentException("'where' is required for update (refusing to update every row)");
        }

        List<String> setClauses = new ArrayList<>();
        List<Object> params = new ArrayList<>();
        for (Map.Entry<String, Object> entry : data.entrySet()) {
            validateColumn(allowedColumns, entry.getKey());
            setClauses.add(entry.getKey() + " = ?");
            params.add(entry.getValue());
        }

        StringBuilder sql = new StringBuilder("UPDATE ").append(table)
                .append(" SET ").append(String.join(", ", setClauses));
        appendWhere(sql, where, allowedColumns, params);

        Map<String, Object> response = new LinkedHashMap<>();
        try (PreparedStatement ps = conn.prepareStatement(sql.toString())) {
            bindParams(ps, params);
            int affected = ps.executeUpdate();
            response.put("status", "ok");
            response.put("affected", (long) affected);
        }
        return response;
    }

    // ---------------- DELETE ----------------
    @SuppressWarnings("unchecked")
    private static Map<String, Object> handleDelete(Connection conn, String table, Set<String> allowedColumns,
                                                      Map<String, Object> request) throws SQLException {
        Map<String, Object> where = (Map<String, Object>) request.get("where");
        if (where == null || where.isEmpty()) {
            throw new IllegalArgumentException("'where' is required for delete (refusing to delete every row)");
        }

        StringBuilder sql = new StringBuilder("DELETE FROM ").append(table);
        List<Object> params = new ArrayList<>();
        appendWhere(sql, where, allowedColumns, params);

        Map<String, Object> response = new LinkedHashMap<>();
        try (PreparedStatement ps = conn.prepareStatement(sql.toString())) {
            bindParams(ps, params);
            int affected = ps.executeUpdate();
            response.put("status", "ok");
            response.put("affected", (long) affected);
        }
        return response;
    }

    // ---------------- Shared helpers ----------------

    private static void appendWhere(StringBuilder sql, Map<String, Object> where, Set<String> allowedColumns,
                                     List<Object> params) {
        if (where == null || where.isEmpty()) return;
        sql.append(" WHERE ");
        List<String> clauses = new ArrayList<>();
        for (Map.Entry<String, Object> entry : where.entrySet()) {
            validateColumn(allowedColumns, entry.getKey());
            clauses.add(entry.getKey() + " = ?");
            params.add(entry.getValue());
        }
        sql.append(String.join(" AND ", clauses));
    }

    private static void bindParams(PreparedStatement ps, List<Object> params) throws SQLException {
        for (int i = 0; i < params.size(); i++) {
            ps.setObject(i + 1, params.get(i));
        }
    }

    private static List<Object> resultSetToList(ResultSet rs) throws SQLException {
        List<Object> rows = new ArrayList<>();
        ResultSetMetaData meta = rs.getMetaData();
        int columnCount = meta.getColumnCount();
        while (rs.next()) {
            Map<String, Object> row = new LinkedHashMap<>();
            for (int i = 1; i <= columnCount; i++) {
                row.put(meta.getColumnLabel(i), rs.getObject(i));
            }
            rows.add(row);
        }
        return rows;
    }

    private static void validateColumn(Set<String> allowedColumns, String column) {
        if (!allowedColumns.contains(column)) {
            throw new IllegalArgumentException("Unknown column: " + column);
        }
    }

    private static String requireString(Map<String, Object> request, String key) {
        Object value = request.get(key);
        if (value == null) throw new IllegalArgumentException("'" + key + "' is required");
        return value.toString();
    }
}
