import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Sends a single plain-text email over SMTPS (implicit TLS, e.g. Gmail's
 * smtp.gmail.com:465). No external mail library — this project has no
 * Maven/Gradle build, only javac against the mysql-connector jar (see
 * run_all.py), so this talks raw SMTP over an SSLSocket instead of adding
 * a new dependency to fetch and keep on the classpath.
 *
 * Configuration comes from environment variables, so credentials never
 * live in source control or get shipped to the browser:
 *
 *   HOSTELCARE_SMTP_HOST   default "smtp.gmail.com"
 *   HOSTELCARE_SMTP_PORT   default "465"
 *   HOSTELCARE_SMTP_USER   the sending account (e.g. a Gmail address)
 *   HOSTELCARE_SMTP_PASS   an app password for that account — NOT its
 *                          normal login password
 *   HOSTELCARE_SMTP_FROM   optional "From" address, defaults to SMTP_USER
 *
 * If USER/PASS aren't set, send() throws — RequestHandler turns that into
 * an error response for just that one "notify" call. It never touches the
 * database, so a misconfigured or unreachable SMTP server can't affect
 * anything that already got recorded there.
 */
public class Mailer {

    public static void send(String to, String subject, String body) throws IOException {
        String host = env("HOSTELCARE_SMTP_HOST", "smtp.gmail.com");
        int port = Integer.parseInt(env("HOSTELCARE_SMTP_PORT", "465"));
        String user = System.getenv("HOSTELCARE_SMTP_USER");
        String pass = System.getenv("HOSTELCARE_SMTP_PASS");
        String from = env("HOSTELCARE_SMTP_FROM", user);

        if (isBlank(user) || isBlank(pass)) {
            throw new IOException("SMTP not configured on the server " +
                    "(set HOSTELCARE_SMTP_USER / HOSTELCARE_SMTP_PASS)");
        }
        if (isBlank(to)) {
            throw new IOException("No recipient email given");
        }

        SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
        try (SSLSocket socket = (SSLSocket) factory.createSocket(host, port)) {
            socket.setSoTimeout(15000);
            BufferedReader in = new BufferedReader(
                    new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
            OutputStream out = socket.getOutputStream();

            expect(in, "220");                                 // server greeting
            command(out, in, "EHLO localhost", "250");
            command(out, in, "AUTH LOGIN", "334");
            command(out, in, base64(user), "334");
            command(out, in, base64(pass), "235");
            command(out, in, "MAIL FROM:<" + from + ">", "250");
            command(out, in, "RCPT TO:<" + to + ">", "250");
            command(out, in, "DATA", "354");

            String message =
                    "From: " + from + "\r\n" +
                    "To: " + to + "\r\n" +
                    "Subject: " + subject + "\r\n" +
                    "MIME-Version: 1.0\r\n" +
                    "Content-Type: text/plain; charset=UTF-8\r\n" +
                    "\r\n" +
                    dotStuff(body) + "\r\n" +
                    ".";
            command(out, in, message, "250");
            command(out, in, "QUIT", "221");
        }
    }

    // SMTP ends a message on a line containing just ".", so any line in the
    // body that itself starts with "." must be escaped by doubling it.
    private static String dotStuff(String body) {
        String[] lines = body.replace("\r\n", "\n").split("\n", -1);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < lines.length; i++) {
            if (lines[i].startsWith(".")) sb.append('.');
            sb.append(lines[i]);
            if (i < lines.length - 1) sb.append("\r\n");
        }
        return sb.toString();
    }

    private static String base64(String s) {
        return Base64.getEncoder().encodeToString(s.getBytes(StandardCharsets.UTF_8));
    }

    private static void command(OutputStream out, BufferedReader in, String line, String expectedCode)
            throws IOException {
        out.write((line + "\r\n").getBytes(StandardCharsets.UTF_8));
        out.flush();
        expect(in, expectedCode);
    }

    /** Reads one SMTP reply (possibly multi-line, e.g. "250-..." / "250 ...") and checks its code. */
    private static void expect(BufferedReader in, String expectedCode) throws IOException {
        String line;
        String last;
        do {
            line = in.readLine();
            if (line == null) throw new IOException("SMTP server closed the connection unexpectedly");
            last = line;
        } while (line.length() >= 4 && line.charAt(3) == '-');
        if (!last.startsWith(expectedCode)) {
            throw new IOException("Unexpected SMTP response (wanted " + expectedCode + "): " + last);
        }
    }

    private static String env(String key, String fallback) {
        String v = System.getenv(key);
        return isBlank(v) ? fallback : v;
    }

    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }
}
