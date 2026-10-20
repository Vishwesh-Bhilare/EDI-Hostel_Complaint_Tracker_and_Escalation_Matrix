import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.SQLTransientConnectionException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public class DBConnection {

    private static final String DEFAULT_URL =
            "jdbc:mysql://localhost:3306/hostelcare?useSSL=false&serverTimezone=UTC&allowPublicKeyRetrieval=true";

    private static String envOrDefault(String name, String fallback) {
        return LocalConfig.get(name, fallback);
    }

    private static final String URL = envOrDefault("HOSTELCARE_DB_URL", DEFAULT_URL);
    private static final String USER = envOrDefault("HOSTELCARE_DB_USER", "root");
    private static final String PASSWORD = envOrDefault("HOSTELCARE_DB_PASSWORD", "");

    // distributed-system's JDBC pool is independent of the 16 HTTP workers
    // and the 2 mail workers. Build physical connections lazily, up to five.
    private static final int MAX_POOL_SIZE = 5;
    private static final long MAX_WAIT_TIMEOUT_MS = 3000;
    private static final BlockingQueue<PooledConnection> pool = new ArrayBlockingQueue<>(MAX_POOL_SIZE);
    private static final Semaphore permits = new Semaphore(MAX_POOL_SIZE, true);

    private static final class PooledConnection {
        final Connection connection;
        final String catalog;
        final int isolation;

        PooledConnection(Connection connection) throws SQLException {
            this.connection = connection;
            this.catalog = connection.getCatalog();
            this.isolation = connection.getTransactionIsolation();
        }
    }

    private static PooledConnection createRawConnection() throws SQLException {
        try {
            Class.forName("com.mysql.cj.jdbc.Driver");
        } catch (ClassNotFoundException e) {
            throw new SQLException(
                    "MySQL JDBC driver not found on classpath. " +
                    "Make sure the MySQL Connector/J jar (mysql-connector-j-x.x.x.jar) " +
                    "is added to your project's dependencies.",
                    e
            );
        }
        Connection raw = DriverManager.getConnection(URL, USER, PASSWORD);
        try {
            return new PooledConnection(raw);
        } catch (SQLException e) {
            closePhysical(raw);
            throw e;
        }
    }

    public static Connection getConnection() throws SQLException {
        try {
            if (!permits.tryAcquire(MAX_WAIT_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
                throw new SQLTransientConnectionException("Connection Pool Timeout: no database connection available within " + MAX_WAIT_TIMEOUT_MS + " ms");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new SQLException("Thread interrupted while waiting for a database connection", e);
        }

        PooledConnection entry = pool.poll();
        try {
            if (entry != null && !isUsable(entry.connection)) {
                closePhysical(entry.connection);
                entry = null;
            }
            if (entry == null) entry = createRawConnection();
            return createProxyConnection(entry);
        } catch (SQLException | RuntimeException e) {
            if (entry != null) closePhysical(entry.connection);
            // Failed replacement must not permanently shrink the pool.
            permits.release();
            throw e;
        }
    }

    private static boolean isUsable(Connection raw) {
        try { return !raw.isClosed() && raw.isValid(2); }
        catch (SQLException e) { return false; }
    }

    private static Connection createProxyConnection(PooledConnection entry) {
        AtomicBoolean closed = new AtomicBoolean();
        return (Connection) Proxy.newProxyInstance(DBConnection.class.getClassLoader(),
                new Class<?>[]{Connection.class}, (proxy, method, args) -> {
                    String name = method.getName();
                    if (method.getDeclaringClass() == Object.class) {
                        if ("equals".equals(name)) return proxy == args[0];
                        if ("hashCode".equals(name)) return System.identityHashCode(proxy);
                        if ("toString".equals(name)) return "PooledConnection[closed=" + closed.get() + "]";
                    }
                    if ("close".equals(name)) {
                        // try-with-resources and repeated close() return this lease once.
                        if (closed.compareAndSet(false, true)) returnToPool(entry);
                        return null;
                    }
                    if ("isClosed".equals(name)) return closed.get() || entry.connection.isClosed();
                    if (closed.get()) throw new SQLException("Connection is closed");
                    if ("isWrapperFor".equals(name) && ((Class<?>) args[0]).isInstance(proxy)) return true;
                    if ("unwrap".equals(name) && ((Class<?>) args[0]).isInstance(proxy)) return proxy;
                    try {
                        return method.invoke(entry.connection, args);
                    } catch (InvocationTargetException e) {
                        // Preserve SQLException instead of wrapping it in a proxy exception.
                        throw e.getCause();
                    }
                });
    }

    private static void returnToPool(PooledConnection entry) {
        Connection raw = entry.connection;
        try {
            if (raw.isClosed()) return;
            // A borrower's uncommitted work/settings must not leak to the next request.
            if (!raw.getAutoCommit()) {
                raw.rollback();
                raw.setAutoCommit(true);
            }
            if (raw.isReadOnly()) raw.setReadOnly(false);
            if (!java.util.Objects.equals(raw.getCatalog(), entry.catalog)) raw.setCatalog(entry.catalog);
            if (raw.getTransactionIsolation() != entry.isolation) raw.setTransactionIsolation(entry.isolation);
            raw.clearWarnings();
            if (!pool.offer(entry)) closePhysical(raw);
        } catch (SQLException e) {
            closePhysical(raw);
        } finally {
            permits.release();
        }
    }

    private static void closePhysical(Connection raw) {
        try { raw.close(); } catch (SQLException ignored) { }
    }

    public static int getMaxPoolSize() { return MAX_POOL_SIZE; }
    public static int getIdleConnectionCount() { return pool.size(); }

    // Close idle physical connections if the application is stopped normally.
    public static void closePool() {
        PooledConnection entry;
        while ((entry = pool.poll()) != null) closePhysical(entry.connection);
    }

    public static void main(String[] args) {
        try (Connection conn = getConnection()) {
            System.out.println("Connected to database successfully: " + conn.getCatalog());
        } catch (SQLException e) {
            System.err.println("Connection failed: " + e.getMessage());
        }
    }
}
