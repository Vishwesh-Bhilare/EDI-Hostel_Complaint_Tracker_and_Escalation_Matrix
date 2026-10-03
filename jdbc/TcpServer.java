import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
/**
 * Entry point. Opens a plain TCP server socket and speaks HTTP over it by
 * hand (see RequestHandler).
 *
 * Uses a fixed-size thread pool to handle client connections instead of
 * creating a new thread for every connection.
 *
 * Run with: java TcpServer [port]   (defaults to 8080)
 */
public class TcpServer {

    private static final int DEFAULT_PORT = 8080;

    // Maximum number of requests that can be processed concurrently.
    private static final int THREAD_POOL_SIZE = 10;

    public static void main(String[] args) throws IOException {
        int port = DEFAULT_PORT;

        if (args.length > 0) {
            port = Integer.parseInt(args[0]);
        }

        // Create a fixed-size pool of reusable worker threads.
 ThreadFactory threadFactory = new ThreadFactory() {
    private int threadNumber = 1;

    @Override
    public Thread newThread(Runnable task) {
        return new Thread(task, "Request-Worker-" + threadNumber++);
    }
};

ExecutorService threadPool =
        Executors.newFixedThreadPool(THREAD_POOL_SIZE, threadFactory);

        try (ServerSocket serverSocket = new ServerSocket(port)) {

            System.out.println(
                    "HostelCare server listening on port " + port);
            System.out.println(
                    "Thread pool size: " + THREAD_POOL_SIZE);
            System.out.println(
                    "Open http://localhost:" + port + "/ in your browser.");

            while (true) {
                Socket clientSocket = serverSocket.accept();

                // Submit the request to the thread pool.
                threadPool.submit(new RequestHandler(clientSocket));
            }

        } finally {
            threadPool.shutdown();
        }
    }
}