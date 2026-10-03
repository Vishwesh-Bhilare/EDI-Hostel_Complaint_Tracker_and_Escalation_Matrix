import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;

public class ConcurrencyTest {

    private static final int REQUEST_COUNT = 30;

    public static void main(String[] args) throws Exception {

        CountDownLatch startSignal = new CountDownLatch(1);
        CountDownLatch doneSignal = new CountDownLatch(REQUEST_COUNT);

        List<Thread> clients = new ArrayList<>();

        long startTime = System.currentTimeMillis();

        for (int i = 1; i <= REQUEST_COUNT; i++) {

            Thread client = new Thread(() -> {

                try {
                    // Wait until all client threads are ready.
                    startSignal.await();

                    URL url = new URL("http://localhost:8080/");
                    HttpURLConnection connection =
                            (HttpURLConnection) url.openConnection();

                    connection.setRequestMethod("GET");
                    connection.setConnectTimeout(5000);
                    connection.setReadTimeout(5000);

                    connection.getResponseCode();

                    connection.disconnect();

                } catch (Exception e) {
                    System.out.println("Request failed: " + e.getMessage());

                } finally {
                    doneSignal.countDown();
                }
            });

            clients.add(client);
            client.start();
        }

        // Release all 30 client threads at approximately the same time.
        startSignal.countDown();

        // Wait for all requests to finish.
        doneSignal.await();

        long endTime = System.currentTimeMillis();

        System.out.println();
        System.out.println("=================================");
        System.out.println("Concurrency Test Complete");
        System.out.println("Requests: " + REQUEST_COUNT);
        System.out.println("Total time: " + (endTime - startTime) + " ms");
        System.out.println("=================================");
    }
}