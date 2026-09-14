import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Handles exactly one client connection: reads the request straight off the
 * socket's InputStream and writes the response straight to its OutputStream.
 * No servlet container, no HTTP client/server library, no framework —
 * just java.net + java.io, parsed by hand.
 *
 * This one handler now does two jobs, routed by method + path:
 *   - GET/HEAD anything except /api  -> serve a static file from PROJECT_ROOT
 *                                        (index.html, css/, js/...) so the
 *                                        frontend is served by this same
 *                                        process instead of a second server.
 *   - POST /api                     -> read the JSON body, run it through
 *                                        JsonToSqlConverter against MySQL,
 *                                        write the JSON result back.
 */
public class RequestHandler implements Runnable {

    /** Directory the static frontend files are served from. Run the server
     *  from the project root (same folder as index.html, css/, js/). */
    private static final Path PROJECT_ROOT = Paths.get(System.getProperty("user.dir")).normalize();

    private final Socket socket;

    public RequestHandler(Socket socket) {
        this.socket = socket;
    }

    @Override
    public void run() {
        try (Socket s = socket;
             InputStream in = s.getInputStream();
             OutputStream out = s.getOutputStream()) {

            // ---- Request line ----
            String requestLine = readLine(in);
            if (requestLine == null || requestLine.isEmpty()) return;

            String[] parts = requestLine.split(" ");
            if (parts.length < 2) {
                writeText(out, 400, "Bad Request", "text/plain; charset=utf-8");
                return;
            }
            String method = parts[0].toUpperCase();
            String rawPath = parts[1];
            String path = rawPath.split("\\?", 2)[0]; // drop query string
            path = URLDecoder.decode(path, StandardCharsets.UTF_8);

            // ---- Headers ----
            Map<String, String> headers = new HashMap<>();
            String line;
            while ((line = readLine(in)) != null && !line.isEmpty()) {
                int colon = line.indexOf(':');
                if (colon > 0) {
                    String name = line.substring(0, colon).trim().toLowerCase();
                    String value = line.substring(colon + 1).trim();
                    headers.put(name, value);
                }
            }

            // ---- Body (read exactly Content-Length bytes, if any) ----
            int contentLength = 0;
            if (headers.containsKey("content-length")) {
                contentLength = Integer.parseInt(headers.get("content-length"));
            }
            byte[] bodyBytes = new byte[contentLength];
            int totalRead = 0;
            while (totalRead < contentLength) {
                int read = in.read(bodyBytes, totalRead, contentLength - totalRead);
                if (read == -1) break;
                totalRead += read;
            }
            String body = new String(bodyBytes, 0, totalRead, StandardCharsets.UTF_8);

            // ---- Route ----
            if ("OPTIONS".equals(method)) {
                writeText(out, 204, "", "text/plain; charset=utf-8");
                return;
            }
            if ("POST".equals(method) && "/api".equals(path)) {
                handleApi(out, body);
            } else if ("GET".equals(method) || "HEAD".equals(method)) {
                handleStaticFile(out, path, "HEAD".equals(method));
            } else {
                writeText(out, 405, "Method Not Allowed", "text/plain; charset=utf-8");
            }

        } catch (IOException e) {
            System.err.println("Connection error: " + e.getMessage());
        }
    }

    // ---------------- /api (JSON -> SQL -> JSON) ----------------

    private static void handleApi(OutputStream out, String body) throws IOException {
        Map<String, Object> responseMap;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> requestMap = (Map<String, Object>) SimpleJson.parse(body);
            try (Connection conn = DBConnection.getConnection()) {
                responseMap = JsonToSqlConverter.handleRequest(conn, requestMap);
            }
        } catch (Exception e) {
            responseMap = new LinkedHashMap<>();
            responseMap.put("status", "error");
            responseMap.put("message", e.getMessage());
        }

        String responseBody = SimpleJson.write(responseMap);
        byte[] bodyBytes = responseBody.getBytes(StandardCharsets.UTF_8);
        boolean isError = "error".equals(responseMap.get("status"));
        writeResponse(out, isError ? 400 : 200, bodyBytes, "application/json; charset=utf-8");
    }

    // ---------------- Static file serving ----------------

    private static void handleStaticFile(OutputStream out, String path, boolean headOnly) throws IOException {
        if (path.equals("/")) path = "/index.html";

        // path.substring(1): drop the leading slash so resolve() treats it as relative to PROJECT_ROOT
        Path file = PROJECT_ROOT.resolve(path.substring(1)).normalize();

        // Refuse to serve anything outside PROJECT_ROOT (blocks "../../etc/passwd" style paths)
        if (!file.startsWith(PROJECT_ROOT) || !Files.isRegularFile(file)) {
            writeText(out, 404, "Not Found", "text/plain; charset=utf-8");
            return;
        }

        byte[] fileBytes = Files.readAllBytes(file);
        String contentType = contentTypeFor(file.toString());

        if (headOnly) {
            writeResponse(out, 200, new byte[0], contentType, fileBytes.length);
        } else {
            writeResponse(out, 200, fileBytes, contentType);
        }
    }

    private static String contentTypeFor(String fileName) {
        String lower = fileName.toLowerCase();
        if (lower.endsWith(".html")) return "text/html; charset=utf-8";
        if (lower.endsWith(".css")) return "text/css; charset=utf-8";
        if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (lower.endsWith(".json")) return "application/json; charset=utf-8";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }

    // ---------------- Low-level HTTP writing helpers ----------------

    private static void writeText(OutputStream out, int statusCode, String text, String contentType) throws IOException {
        writeResponse(out, statusCode, text.getBytes(StandardCharsets.UTF_8), contentType);
    }

    private static void writeResponse(OutputStream out, int statusCode, byte[] body, String contentType) throws IOException {
        writeResponse(out, statusCode, body, contentType, body.length);
    }

    /** declaredLength lets HEAD responses report the real file size while sending zero body bytes. */
    private static void writeResponse(OutputStream out, int statusCode, byte[] body, String contentType, int declaredLength) throws IOException {
        StringBuilder header = new StringBuilder();
        header.append("HTTP/1.1 ").append(statusCode).append(' ').append(statusText(statusCode)).append("\r\n");
        header.append("Content-Type: ").append(contentType).append("\r\n");
        header.append("Content-Length: ").append(declaredLength).append("\r\n");
        header.append("Cache-Control: no-store\r\n");
        header.append("Access-Control-Allow-Origin: *\r\n");
        header.append("Access-Control-Allow-Methods: GET, POST, HEAD, OPTIONS\r\n");
        header.append("Access-Control-Allow-Headers: Content-Type\r\n");
        header.append("Connection: close\r\n");
        header.append("\r\n");

        out.write(header.toString().getBytes(StandardCharsets.UTF_8));
        out.write(body);
        out.flush();
    }

    private static String statusText(int code) {
        switch (code) {
            case 200: return "OK";
            case 204: return "No Content";
            case 400: return "Bad Request";
            case 404: return "Not Found";
            case 405: return "Method Not Allowed";
            default: return "Error";
        }
    }

    /** Reads one CRLF-terminated line straight from the socket's InputStream. */
    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        int prev = -1, current;
        while ((current = in.read()) != -1) {
            if (prev == '\r' && current == '\n') {
                byte[] bytes = buffer.toByteArray();
                return new String(bytes, 0, bytes.length - 1, StandardCharsets.UTF_8);
            }
            buffer.write(current);
            prev = current;
        }
        if (buffer.size() == 0) return null;
        return buffer.toString(StandardCharsets.UTF_8);
    }
}
