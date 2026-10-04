import java.sql.Connection;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class JdbcPoolTest {

    private static final int THREADS = 10;

    public static void main(String[] args) throws Exception {

        ExecutorService pool = Executors.newFixedThreadPool(THREADS);

        long start = System.currentTimeMillis();

        for (int i = 1; i <= THREADS; i++) {

            final int taskNumber = i;

            pool.submit(() -> {

                try (Connection conn = DBConnection.getConnection()) {

                    System.out.println(
                            "Task " + taskNumber
                                    + " borrowed DB connection."
                    );

                    // Hold the connection briefly so
                    // multiple connections are in use.
                    Thread.sleep(1000);

                    System.out.println(
                            "Task " + taskNumber
                                    + " returning DB connection."
                    );

                } catch (Exception e) {

                    System.err.println(
                            "Task " + taskNumber
                                    + " failed: "
                                    + e.getMessage()
                    );
                }
            });
        }

        pool.shutdown();
        pool.awaitTermination(30, TimeUnit.SECONDS);

        long end = System.currentTimeMillis();

        System.out.println(
                "Total test time: " + (end - start) + " ms"
        );
    }
}