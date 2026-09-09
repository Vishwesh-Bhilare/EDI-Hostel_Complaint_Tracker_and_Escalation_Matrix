package server;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.mindrot.jbcrypt.BCrypt;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.Map;

/**
 * POST /api/signup
 *
 * Request body (JSON): { name, username, email, room_no, hostel_block, password }
 * On success:  { ok: true, user_id: <int> }
 * On failure:  { ok: false, error: "...", message: "..." }
 *
 * Mirrors HC.REGISTER(data) from the old localStorage api.js, but backed
 * by the users table instead of localStorage. New self-registered
 * accounts are always role='resident', status='active' — matching the
 * "Role assignment" notice on signup.html.
 */
public class SignupHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
            ApiServer.sendJson(exchange, 405, JsonUtil.obj("ok", false, "error", "METHOD_NOT_ALLOWED"));
            return;
        }

        Map<String, Object> body;
        try {
            body = JsonUtil.parseObject(ApiServer.readBody(exchange));
        } catch (Exception e) {
            ApiServer.sendJson(exchange, 400, JsonUtil.obj("ok", false, "error", "INVALID_JSON", "message", "Could not parse request body."));
            return;
        }

        String name = str(body, "name");
        String username = str(body, "username");
        String email = str(body, "email");
        String roomNo = str(body, "room_no");
        String hostelBlock = str(body, "hostel_block");
        String password = str(body, "password");

        if (isBlank(name) || isBlank(username) || isBlank(password)) {
            ApiServer.sendJson(exchange, 400, JsonUtil.obj(
                    "ok", false, "error", "INVALID_REQUEST",
                    "message", "Name, username and password are required."));
            return;
        }

        try (Connection conn = DBConnection.getConnection()) {

            // 1. Check the institutional ID isn't already registered (case-insensitive,
            //    matching the old localStorage check: u.username.toLowerCase() === ...)
            try (PreparedStatement check = conn.prepareStatement(
                    "SELECT user_id FROM users WHERE LOWER(username) = LOWER(?)")) {
                check.setString(1, username);
                try (ResultSet rs = check.executeQuery()) {
                    if (rs.next()) {
                        ApiServer.sendJson(exchange, 409, JsonUtil.obj(
                                "ok", false, "error", "CONFLICT",
                                "message", "That institutional ID is already registered."));
                        return;
                    }
                }
            }

            // 2. Hash the password — never store plaintext.
            String passwordHash = BCrypt.hashpw(password, BCrypt.gensalt());

            // 3. Insert the new resident.
            String insertSql = "INSERT INTO users " +
                    "(name, username, password_hash, email, role, room_no, hostel_block, status) " +
                    "VALUES (?, ?, ?, ?, 'resident', ?, ?, 'active')";
            try (PreparedStatement insert = conn.prepareStatement(insertSql, PreparedStatement.RETURN_GENERATED_KEYS)) {
                insert.setString(1, name);
                insert.setString(2, username);
                insert.setString(3, passwordHash);
                insert.setString(4, email);
                insert.setString(5, roomNo);
                insert.setString(6, hostelBlock);
                insert.executeUpdate();

                try (ResultSet keys = insert.getGeneratedKeys()) {
                    int userId = keys.next() ? keys.getInt(1) : -1;
                    ApiServer.sendJson(exchange, 200, JsonUtil.obj("ok", true, "user_id", userId));
                }
            }

        } catch (Exception e) {
            e.printStackTrace();
            ApiServer.sendJson(exchange, 500, JsonUtil.obj(
                    "ok", false, "error", "INTERNAL_ERROR",
                    "message", "Could not create account. Please try again."));
        }
    }

    private static String str(Map<String, Object> body, String key) {
        Object v = body.get(key);
        return v == null ? null : String.valueOf(v);
    }

    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }
}