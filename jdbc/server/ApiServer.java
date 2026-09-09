package server;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Entry point for the HostelCare Phase 1 backend.
 *
 * Starts a plain java.net HTTP server on port 8080 (no framework),
 * registers the 5 Phase 1 routes, and wraps every request with a CORS
 * filter so the browser (running on http://127.0.0.1:5500 via Live
 * Server) is allowed to call it from a different origin.
 *
 * Run with (from the jdbc/ folder, after compiling):
 *   java -cp "out;mysql-connector-j-26.7.0.jar;lib\jbcrypt-0.4.jar" server.ApiServer
 */
public class ApiServer {

    // Change this if Live Server ever runs on a different port.
    private static final String ALLOWED_ORIGIN = "http://127.0.0.1:5500";

    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(8080), 0);

        server.createContext("/api/signup", withCors(new SignupHandler()));
        server.createContext("/api/login", withCors(new LoginHandler()));
        server.createContext("/api/complaints", withCors(new ComplaintsRouter()));

        server.setExecutor(null); // default executor is fine for this scale
        server.start();

        System.out.println("HostelCare API server running on http://localhost:8080");
        System.out.println("Allowing requests from: " + ALLOWED_ORIGIN);
    }

    /**
     * "/api/complaints" and "/api/complaints/{id}" both land here first.
     * We split by method + whether there's an id segment in the path,
     * then delegate to ComplaintCreateHandler, ComplaintListHandler, or
     * ComplaintGetHandler accordingly.
     */
    static class ComplaintsRouter implements HttpHandler {
        private final ComplaintCreateHandler createHandler = new ComplaintCreateHandler();
        private final ComplaintListHandler listHandler = new ComplaintListHandler();
        private final ComplaintGetHandler getHandler = new ComplaintGetHandler();

        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String method = exchange.getRequestMethod();
            String path = exchange.getRequestURI().getPath(); // e.g. /api/complaints or /api/complaints/HC-2026-000123

            String remainder = path.length() > "/api/complaints".length()
                    ? path.substring("/api/complaints".length())
                    : "";
            // remainder is "" or "/HC-2026-000123"
            while (remainder.startsWith("/")) remainder = remainder.substring(1);

            if (method.equals("POST") && remainder.isEmpty()) {
                createHandler.handle(exchange);
            } else if (method.equals("GET") && remainder.isEmpty()) {
                listHandler.handle(exchange);
            } else if (method.equals("GET") && !remainder.isEmpty()) {
                getHandler.handleWithId(exchange, remainder);
            } else {
                sendJson(exchange, 405, JsonUtil.obj("ok", false, "error", "METHOD_NOT_ALLOWED"));
            }
        }
    }

    /**
     * Wraps any handler with:
     *  - CORS headers on every response (including error responses)
     *  - automatic handling of the OPTIONS preflight request browsers
     *    send before a cross-origin POST with a JSON body
     */
    static HttpHandler withCors(HttpHandler inner) {
        return exchange -> {
            exchange.getResponseHeaders().add("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
            exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");

            if (exchange.getRequestMethod().equalsIgnoreCase("OPTIONS")) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }

            try {
                inner.handle(exchange);
            } catch (Exception e) {
                // Last-resort safety net so a bug in a handler never leaves the
                // browser hanging without a response (and never leaks a stack
                // trace to the client).
                e.printStackTrace();
                sendJson(exchange, 500, JsonUtil.obj("ok", false, "error", "INTERNAL_ERROR", "message", e.getMessage()));
            }
        };
    }

    /**
     * Shared helper every handler uses to write a JSON response.
     * Public + static so SignupHandler/LoginHandler/etc. can all call
     * ApiServer.sendJson(...) instead of duplicating this logic.
     */
    public static void sendJson(HttpExchange exchange, int statusCode, Map<String, Object> body) throws IOException {
        byte[] bytes = JsonUtil.toJson(body).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    /** Shared helper to read the raw request body as a UTF-8 string. */
    public static String readBody(HttpExchange exchange) throws IOException {
        return new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }
}