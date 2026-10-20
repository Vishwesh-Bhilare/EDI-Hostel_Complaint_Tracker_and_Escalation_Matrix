import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/** SMTP runs on separate, bounded workers. A request only waits for the queued
 * audit row, so closing the browser after acceptance does not cancel delivery. */
public final class NotificationDispatcher implements AutoCloseable {
    @FunctionalInterface
    interface Sender {
        void send(String to, String subject, String body) throws Exception;
    }

    private static final NotificationDispatcher INSTANCE = new NotificationDispatcher(Mailer::send, 2, 128);
    private final ThreadPoolExecutor workers;
    private final Sender sender;

    NotificationDispatcher(Sender sender, int threadCount, int queueSize) {
        this.sender = sender;
        AtomicInteger sequence = new AtomicInteger();
        workers = new ThreadPoolExecutor(threadCount, threadCount, 0, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(queueSize), task -> {
                    Thread thread = new Thread(task, "hostelcare-mail-" + sequence.incrementAndGet());
                    thread.setDaemon(true);
                    return thread;
                });
    }

    public static long enqueue(int complaintId, String role, String to, String subject, String body) throws Exception {
        return INSTANCE.submit(complaintId, role, to, subject, body);
    }

    long submit(int complaintId, String role, String to, String subject, String body) throws Exception {
        long notificationId;
        try (Connection conn = DBConnection.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                     "INSERT INTO notifications (complaint_id, role, email, subject, status) VALUES (?, ?, ?, ?, 'queued')",
                     Statement.RETURN_GENERATED_KEYS)) {
            ps.setInt(1, complaintId);
            ps.setString(2, role);
            ps.setString(3, to);
            ps.setString(4, subject);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (!keys.next()) throw new IllegalStateException("Notification ID was not returned");
                notificationId = keys.getLong(1);
            }
        }
        try {
            workers.execute(() -> deliver(notificationId, to, subject, body));
        } catch (RejectedExecutionException e) {
            updateStatus(notificationId, "failed");
            throw new IllegalStateException("Email queue is full; complaint changes are already saved", e);
        }
        return notificationId;
    }

    private void deliver(long id, String to, String subject, String body) {
        String status = "sent";
        try {
            sender.send(to, subject, body);
        } catch (Exception e) {
            status = "failed";
            System.err.println("Notification " + id + " failed: " + e.getMessage());
        }
        updateStatus(id, status);
    }

    private void updateStatus(long id, String status) {
        try (Connection conn = DBConnection.getConnection();
             PreparedStatement ps = conn.prepareStatement("UPDATE notifications SET status = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?")) {
            ps.setString(1, status);
            ps.setLong(2, id);
            ps.executeUpdate();
        } catch (Exception e) {
            System.err.println("Could not update notification " + id + ": " + e.getMessage());
        }
    }

    @Override
    public void close() {
        workers.shutdown();
    }
}
