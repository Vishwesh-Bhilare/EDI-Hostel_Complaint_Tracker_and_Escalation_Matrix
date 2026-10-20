import java.sql.Connection;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.Future;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

public class JdbcPoolTest {

    private static final int THREADS = 10;

    public static void main(String[] args) throws Exception {

        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        CountDownLatch startSignal = new CountDownLatch(1);
        List<Future<?>> tasks = new ArrayList<>();
        Set<Long> physicalConnections = ConcurrentHashMap.newKeySet();
        AtomicInteger active = new AtomicInteger();
        AtomicInteger maximum = new AtomicInteger();

        long start = System.currentTimeMillis();

        for (int i = 1; i <= THREADS; i++) {

            final int taskNumber = i;

            tasks.add(pool.submit(() -> {

                startSignal.await();
                try (Connection conn = DBConnection.getConnection()) {
                    int current = active.incrementAndGet();
                    maximum.accumulateAndGet(current, Math::max);
                    try (java.sql.Statement statement = conn.createStatement();
                         java.sql.ResultSet rows = statement.executeQuery("SELECT CONNECTION_ID()")) {
                        rows.next();
                        physicalConnections.add(rows.getLong(1));
                    }

                    System.out.println(
                            "Task " + taskNumber
                                    + " borrowed DB connection."
                    );

                    // Hold the connection briefly so
                    // multiple connections are in use.
                    try { Thread.sleep(1000); }
                    finally { active.decrementAndGet(); }

                    System.out.println(
                            "Task " + taskNumber
                                    + " returning DB connection."
                    );

                }
                return null;
            }));
        }

        startSignal.countDown();
        pool.shutdown();
        try {
            if (!pool.awaitTermination(30, TimeUnit.SECONDS)) throw new AssertionError("JDBC concurrency test timed out");
            for (Future<?> task : tasks) task.get();
        } finally { pool.shutdownNow(); }

        long end = System.currentTimeMillis();

        System.out.println(
                "Total test time: " + (end - start) + " ms"
        );
        if (maximum.get() > DBConnection.getMaxPoolSize()) throw new AssertionError("Too many simultaneous DB connections");
        if (physicalConnections.size() > DBConnection.getMaxPoolSize()) throw new AssertionError("Physical connections were not reused");
        System.out.println("JDBC pool test passed: " + THREADS + " tasks, peak " + maximum.get() +
                ", " + physicalConnections.size() + " physical connections reused.");
    }
}
