import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.SQLTransientConnectionException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/** Run only against browser-smoke's disposable test database. */
public class JdbcPoolRegressionTest {
    public static void main(String[] args) throws Exception {
        List<Connection> leases = new ArrayList<>();
        try {
            for (int i = 0; i < DBConnection.getMaxPoolSize(); i++) leases.add(DBConnection.getConnection());
            require(leases.size() == 5, "Integration must preserve five JDBC slots");
            String catalog = leases.get(0).getCatalog();
            require(catalog.startsWith("hostelcare_codex_ui_test_"), "Use an isolated test database");
            Set<Long> ids = new HashSet<>();
            for (Connection lease : leases) ids.add(connectionId(lease));
            require(ids.size() == 5, "Simultaneous leases must own distinct physical connections");

            Connection first = leases.get(0);
            long originalId = connectionId(first);
            first.close();
            first.close();
            require(first.isClosed(), "Returned logical connection must be closed");
            boolean rejected = false;
            try { first.createStatement(); } catch (SQLException expected) { rejected = true; }
            require(rejected, "A returned lease must not execute more work");
            Connection reused = DBConnection.getConnection();
            leases.set(0, reused);
            require(connectionId(reused) == originalId, "Physical connection must be reused");
            require(reused.unwrap(Connection.class) == reused, "Unwrapping Connection must preserve the lease");

            // Double close must not free an extra permit or duplicate an idle entry.
            rejected = false;
            try (Connection extra = DBConnection.getConnection()) {
                throw new AssertionError("A sixth simultaneous lease was granted");
            } catch (SQLTransientConnectionException expected) { rejected = true; }
            require(rejected, "Pool saturation should produce a bounded SQLException timeout");

            // An interrupted waiter must keep its interruption status and free no slots.
            AtomicReference<Throwable> waitFailure = new AtomicReference<>();
            AtomicBoolean interruptionPreserved = new AtomicBoolean();
            CountDownLatch waiting = new CountDownLatch(1);
            Thread waiter = new Thread(() -> {
                waiting.countDown();
                try (Connection extra = DBConnection.getConnection()) {
                    waitFailure.set(new AssertionError("Interrupted waiter unexpectedly borrowed a connection"));
                } catch (SQLException expected) {
                    waitFailure.set(expected);
                    interruptionPreserved.set(Thread.currentThread().isInterrupted());
                }
            });
            waiter.start();
            waiting.await();
            waiter.interrupt();
            waiter.join(2000);
            require(!waiter.isAlive() && waitFailure.get() instanceof SQLException && interruptionPreserved.get(),
                    "Interrupted pool borrow must return SQLException and preserve interrupt status");

            int isolation = reused.getTransactionIsolation();
            execute(reused, "CREATE TABLE pool_transaction_probe (id INT PRIMARY KEY) ENGINE=InnoDB");
            reused.setTransactionIsolation(Connection.TRANSACTION_SERIALIZABLE);
            reused.setAutoCommit(false);
            execute(reused, "INSERT INTO pool_transaction_probe VALUES (1)");
            reused.close();
            Connection clean = DBConnection.getConnection();
            leases.set(0, clean);
            require(clean.getAutoCommit(), "Auto-commit must be restored");
            require(clean.getTransactionIsolation() == isolation, "Transaction isolation must be restored");
            require(number(clean, "SELECT COUNT(*) FROM pool_transaction_probe") == 0, "Uncommitted data must be rolled back");
            clean.setReadOnly(true);
            clean.setCatalog("information_schema");
            clean.close();
            clean = DBConnection.getConnection();
            leases.set(0, clean);
            require(!clean.isReadOnly(), "Read-only state must be reset");
            require(catalog.equals(clean.getCatalog()), "Database selection must be reset");

            // Reflection must propagate SQLExceptions as SQLExceptions.
            rejected = false;
            try { clean.setCatalog("hostelcare_missing_" + System.nanoTime()); }
            catch (SQLException expected) { rejected = true; }
            require(rejected, "Invalid database must throw SQLException directly");

            long brokenId = connectionId(clean);
            clean.abort(Runnable::run);
            clean.close();
            Connection replacement = DBConnection.getConnection();
            leases.set(0, replacement);
            require(connectionId(replacement) != brokenId, "An aborted physical connection must be replaced");
            System.out.println("JDBC regression tests passed: reuse, five-slot limit, timeout, double close, closed leases, interrupt, rollback, session reset and broken-connection replacement.");
        } finally {
            for (Connection lease : leases) {
                try { lease.close(); } catch (SQLException ignored) { }
            }
            DBConnection.closePool();
        }
    }

    private static void execute(Connection connection, String sql) throws SQLException {
        try (Statement statement = connection.createStatement()) { statement.execute(sql); }
    }

    private static long connectionId(Connection connection) throws SQLException {
        return number(connection, "SELECT CONNECTION_ID()");
    }

    private static long number(Connection connection, String sql) throws SQLException {
        try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
            rows.next();
            return rows.getLong(1);
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
