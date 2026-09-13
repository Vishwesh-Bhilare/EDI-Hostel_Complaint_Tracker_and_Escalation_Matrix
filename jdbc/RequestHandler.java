import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Handles exactly one client connection: reads the request straight off the
 * socket's InputStream and writes the response straight to its OutputStream.
 * No servlet container, no HTTP client/server library — just java.net + java.io.
 */
public class RequestHandler implements Runnable {

    private final Socket socket;

    public RequestHandler(Socket socket) {
        this.socket = socket;
    }

    @Override
    public void run() {
        try (Socket s = socket;
             InputStream in = s.getInputStream();
             OutputStream out = s.getOutputStream()) {

            // ---- Request line + headers ----
            Map<String, String> headers = new HashMap<>();
            String requestLine = readLine(in);
            if (requestLine == null || requestLine.isEmpty()) return;

            String line;
            while ((line = readLine(in)) != null && !line.isEmpty()) {
                int colon = line.indexOf(':');
                if (colon > 0) {
                    String name = line.substring(0, colon).trim().toLowerCase();
                    String value = line.substring(colon + 1).trim();
                    headers.put(name, value);
                }
            }

            // ---- Body (read exactly Content-Length bytes) ----
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

            // ---- JSON -> SQL -> JSON ----
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

            writeResponse(out, responseMap);

        } catch (IOException e) {
            System.err.println("Connection error: " + e.getMessage());
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

    private static void writeResponse(OutputStream out, Map<String, Object> responseMap) throws IOException {
        String body = SimpleJson.write(responseMap);
        byte[] bodyBytes = body.getBytes(StandardCharsets.UTF_8);
        boolean isError = "error".equals(responseMap.get("status"));

        StringBuilder header = new StringBuilder();
        header.append(isError ? "HTTP/1.1 400 Bad Request\r\n" : "HTTP/1.1 200 OK\r\n");
        header.append("Content-Type: application/json\r\n");
        header.append("Content-Length: ").append(bodyBytes.length).append("\r\n");
        header.append("Connection: close\r\n");
        header.append("\r\n");

        out.write(header.toString().getBytes(StandardCharsets.UTF_8));
        out.write(bodyBytes);
        out.flush();
    }
}
