import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;

/**
 * Entry point. Opens a plain TCP server socket and speaks HTTP over it by
 * hand (see RequestHandler) — no Spring, no servlet container, no REST
 * framework of any kind.
 *
 * Run with: java TcpServer [port]   (defaults to 8080)
 */
public class TcpServer {

    private static final int DEFAULT_PORT = 8080;

    public static void main(String[] args) throws IOException {
        int port = DEFAULT_PORT;
        if (args.length > 0) {
            port = Integer.parseInt(args[0]);
        }

        try (ServerSocket serverSocket = new ServerSocket(port)) {
            System.out.println("HostelCare server listening on port " + port);
            System.out.println("Open http://localhost:" + port + "/ in your browser.");
            System.out.println("(Frontend static files and the /api JSON endpoint are both served here.)");
            while (true) {
                Socket clientSocket = serverSocket.accept();
                new Thread(new RequestHandler(clientSocket)).start();
            }
        }
    }
}
