import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Entry point. Opens a plain TCP server socket and speaks HTTP over it by
 * hand (see RequestHandler) — no Spring, no servlet container, no REST
 * framework of any kind.
 *
 * Run with: java TcpServer [port]   (defaults to 8080)
 */
public class TcpServer {

    private static final int DEFAULT_PORT = 8080;
    private static final int HTTP_WORKERS = 16;
    private static final int HTTP_QUEUE_CAPACITY = 256;

    public static void main(String[] args) throws IOException {
        int port = DEFAULT_PORT;
        if (args.length > 0) {
            port = Integer.parseInt(args[0]);
        }

        AtomicInteger sequence = new AtomicInteger();
        ThreadPoolExecutor requestWorkers = new ThreadPoolExecutor(HTTP_WORKERS, HTTP_WORKERS, 0, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(HTTP_QUEUE_CAPACITY), task -> new Thread(task, "hostelcare-http-" + sequence.incrementAndGet()));
        try (ServerSocket serverSocket = new ServerSocket(port)) {
            System.out.println("HostelCare server listening on port " + port);
            System.out.println("HTTP workers: " + HTTP_WORKERS + "; mail workers: 2; JDBC connections: " + DBConnection.getMaxPoolSize());
            System.out.println("Open http://localhost:" + port + "/ in your browser.");
            System.out.println("(Frontend static files and the /api JSON endpoint are both served here.)");
            while (true) {
                Socket clientSocket = serverSocket.accept();
                clientSocket.setSoTimeout(15000);
                try {
                    requestWorkers.execute(new RequestHandler(clientSocket));
                } catch (RejectedExecutionException e) {
                    RequestHandler.rejectBusyClient(clientSocket);
                }
            }
        } finally {
            requestWorkers.shutdownNow();
        }
    }
}
