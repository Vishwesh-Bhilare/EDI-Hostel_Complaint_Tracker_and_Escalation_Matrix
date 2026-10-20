import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** No real SMTP: injected senders exercise queueing, workers and audit outcomes. */
public class NotificationDispatcherTest {
    public static void main(String[] args) throws Exception {
        CountDownLatch started = new CountDownLatch(2);
        CountDownLatch release = new CountDownLatch(1);
        Set<String> threads = ConcurrentHashMap.newKeySet();
        NotificationDispatcher slow = new NotificationDispatcher((to, subject, body) -> {
            threads.add(Thread.currentThread().getName());
            started.countDown();
            if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Synthetic sender timed out");
        }, 2, 2);
        try {
            long start = System.nanoTime();
            long first = slow.submit(1, "student", "test@example.invalid", "Slow test 1", "Test");
            long second = slow.submit(1, "student", "test@example.invalid", "Slow test 2", "Test");
            long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
            require(started.await(5, TimeUnit.SECONDS), "Both background workers should start");
            require(threads.size() == 2, "Two separate mail threads should be used");
            require("queued".equals(status(first)) && "queued".equals(status(second)),
                    "Queued acceptance must not be falsely recorded as sent");
            // This request has already returned even though delivery is still blocked.
            release.countDown();
            awaitStatus(first, "sent");
            awaitStatus(second, "sent");
            System.out.println("Background mail: two jobs accepted in " + elapsedMs + " ms while delivery workers were blocked.");
        } finally {
            release.countDown();
            slow.close();
        }

        try (NotificationDispatcher failing = new NotificationDispatcher((to, subject, body) -> {
            throw new IllegalStateException("Synthetic mail failure; no email was sent");
        }, 1, 1)) {
            long id = failing.submit(1, "student", "test@example.invalid", "Failure test", "Test");
            awaitStatus(id, "failed");
        }

        CountDownLatch occupied = new CountDownLatch(1);
        CountDownLatch unblock = new CountDownLatch(1);
        try (NotificationDispatcher bounded = new NotificationDispatcher((to, subject, body) -> {
            occupied.countDown();
            unblock.await(10, TimeUnit.SECONDS);
        }, 1, 1)) {
            long first = bounded.submit(1, "student", "test@example.invalid", "Bounded 1", "Test");
            require(occupied.await(5, TimeUnit.SECONDS), "Worker should be busy");
            long second = bounded.submit(1, "student", "test@example.invalid", "Bounded 2", "Test");
            boolean rejected = false;
            try { bounded.submit(1, "student", "test@example.invalid", "Bounded 3", "Test"); }
            catch (IllegalStateException expected) { rejected = true; }
            require(rejected, "A full queue should reject rather than block an HTTP worker");
            unblock.countDown();
            awaitStatus(first, "sent");
            awaitStatus(second, "sent");
        } finally { unblock.countDown(); }
        System.out.println("Background mail tests passed: concurrency, queued/sent/failed auditing and bounded queue.");
    }

    private static String status(long id) throws Exception {
        try (Connection conn = DBConnection.getConnection();
             PreparedStatement ps = conn.prepareStatement("SELECT status FROM notifications WHERE id = ?")) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? rs.getString(1) : null; }
        }
    }

    private static void awaitStatus(long id, String expected) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            if (expected.equals(status(id))) return;
            Thread.sleep(20);
        }
        throw new AssertionError("Notification " + id + " did not reach " + expected);
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
