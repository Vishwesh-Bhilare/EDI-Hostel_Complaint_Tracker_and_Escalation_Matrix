import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URI;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class ConcurrencyTest {

    private static final int REQUEST_COUNT = 30;

    public static void main(String[] args) throws Exception {

        String endpoint = args.length > 0 ? args[0] : "http://localhost:8080/";
        int requestCount = args.length > 1 ? Integer.parseInt(args[1]) : REQUEST_COUNT;
        if (requestCount < 1 || requestCount > 1000) throw new IllegalArgumentException("Request count must be between 1 and 1000");
        boolean snapshot = args.length > 2 && "snapshot".equalsIgnoreCase(args[2]);
        AtomicInteger failures = new AtomicInteger();

        CountDownLatch startSignal = new CountDownLatch(1);
        CountDownLatch doneSignal = new CountDownLatch(requestCount);

        long startTime = System.currentTimeMillis();

        for (int i = 1; i <= requestCount; i++) {

            Thread client = new Thread(() -> {

                try {
                    // Wait until all client threads are ready.
                    startSignal.await();

                    URL url = URI.create(endpoint).toURL();
                    HttpURLConnection connection =
                            (HttpURLConnection) url.openConnection();

                    connection.setRequestMethod(snapshot ? "POST" : "GET");
                    connection.setConnectTimeout(5000);
                    connection.setReadTimeout(5000);

                    try {
                        if (snapshot) {
                            connection.setDoOutput(true);
                            connection.setRequestProperty("Content-Type", "application/json");
                            try (java.io.OutputStream out = connection.getOutputStream()) {
                                out.write("{\"action\":\"snapshot\"}".getBytes(java.nio.charset.StandardCharsets.UTF_8));
                            }
                        }
                        int status = connection.getResponseCode();
                        if (status != 200) throw new IllegalStateException("HTTP status " + status);
                        try (java.io.InputStream in = connection.getInputStream()) {
                            String response = new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
                            if (snapshot && !response.contains("\"status\":\"ok\"")) throw new IllegalStateException("Snapshot failed");
                        }
                    } finally { connection.disconnect(); }

                } catch (Exception e) {
                    failures.incrementAndGet();
                    System.out.println("Request failed: " + e.getMessage());

                } finally {
                    doneSignal.countDown();
                }
            });

            client.start();
        }

        // Release all client threads at approximately the same time.
        startSignal.countDown();

        // Wait for all requests to finish.
        if (!doneSignal.await(30, TimeUnit.SECONDS)) throw new AssertionError("Concurrent requests timed out");

        long endTime = System.currentTimeMillis();

        System.out.println();
        System.out.println("=================================");
        System.out.println("Concurrency Test Complete");
        System.out.println("Requests: " + requestCount + "; failures: " + failures.get());
        System.out.println("Total time: " + (endTime - startTime) + " ms");
        System.out.println("=================================");
        if (failures.get() != 0) throw new AssertionError(failures.get() + " requests failed");
    }
}
