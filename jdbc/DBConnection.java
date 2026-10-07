import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * DBConnection — Manages Database Connectivity, Load Handling & High Availability Failover.
 *
 * Core DBMS Concepts Implemented:
 * 1. Connection Pooling (Load Management):
 *    - Reduces server CPU/memory load by recycling existing connections.
 *    - Prevents "Too many connections" errors under peak concurrent user traffic.
 * 2. Primary-Backup Architecture (Fault Tolerance & High Availability):
 *    - Primary Database: hostelcare
 *    - Backup Database:  hostelcare_backup
 * 3. Automatic Failover:
 *    - If Primary DB is unreachable or crashes, requests automatically route
 *      to the Backup DB without service interruption.
 */
public class DBConnection {

    private static final String DEFAULT_PRIMARY_URL =
            "jdbc:mysql://localhost:3306/hostelcare?useSSL=false&serverTimezone=UTC&allowPublicKeyRetrieval=true";
    private static final String DEFAULT_BACKUP_URL =
            "jdbc:mysql://localhost:3306/hostelcare_backup?useSSL=false&serverTimezone=UTC&allowPublicKeyRetrieval=true";

    private static String envOrDefault(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    private static final String PRIMARY_URL = envOrDefault("HOSTELCARE_DB_URL", DEFAULT_PRIMARY_URL);
    private static final String BACKUP_URL = envOrDefault("HOSTELCARE_BACKUP_DB_URL", DEFAULT_BACKUP_URL);
    private static final String USER = envOrDefault("HOSTELCARE_DB_USER", "root");
    private static final String PASSWORD = envOrDefault("HOSTELCARE_DB_PASSWORD", "root123");

    // Pool configuration to optimize server load
    private static final int MAX_POOL_SIZE = 10;
    private static final BlockingQueue<Connection> primaryPool = new ArrayBlockingQueue<>(MAX_POOL_SIZE);
    private static final BlockingQueue<Connection> backupPool = new ArrayBlockingQueue<>(MAX_POOL_SIZE);

    private static final AtomicBoolean usingBackup = new AtomicBoolean(false);

    static {
        try {
            Class.forName("com.mysql.cj.jdbc.Driver");
        } catch (ClassNotFoundException e) {
            System.err.println("CRITICAL: MySQL JDBC Driver not found on classpath!");
        }
    }

    /**
     * Obtains an active connection from the pool.
     * Automatically handles failover to the backup database if the primary is down.
     */
    public static Connection getConnection() throws SQLException {
        if (!usingBackup.get()) {
            try {
                Connection conn = borrowFromPool(primaryPool, PRIMARY_URL, false);
                return wrapConnection(conn, primaryPool);
            } catch (SQLException e) {
                System.err.println("\n[!] WARNING: Primary DB (hostelcare) connection failed: " + e.getMessage());
                System.err.println("[*] ACTIVATING FAILOVER -> Switching traffic to Backup DB (hostelcare_backup)...\n");
                usingBackup.set(true);
            }
        }

        // Failover mode: use backup database
        Connection conn = borrowFromPool(backupPool, BACKUP_URL, true);
        return wrapConnection(conn, backupPool);
    }

    /**
     * Dedicated connection directly to the Backup Database (used for replication & syncing).
     */
    public static Connection getBackupConnection() throws SQLException {
        Connection conn = borrowFromPool(backupPool, BACKUP_URL, true);
        return wrapConnection(conn, backupPool);
    }

    public static boolean isUsingBackup() {
        return usingBackup.get();
    }

    public static String getActiveDatabaseName() {
        return usingBackup.get() ? "hostelcare_backup" : "hostelcare";
    }

    public static void setUsingBackup(boolean backup) {
        usingBackup.set(backup);
    }

    /**
     * Internal method to borrow or create a connection for a specific pool.
     */
    private static Connection borrowFromPool(BlockingQueue<Connection> pool, String url, boolean isBackup) throws SQLException {
        Connection conn = pool.poll();
        if (conn != null) {
            try {
                if (!conn.isClosed() && conn.isValid(1)) {
                    return conn;
                }
            } catch (SQLException ignored) {}
            try { conn.close(); } catch (Exception ignored) {}
        }

        // Create new physical connection to the designated database
        return DriverManager.getConnection(url, USER, PASSWORD);
    }

    /**
     * Wraps the Connection so that calling close() returns it to the pool instead
     * of closing the underlying physical TCP socket, keeping server load low.
     */
    private static Connection wrapConnection(Connection physicalConn, BlockingQueue<Connection> pool) {
        return (Connection) Proxy.newProxyInstance(
                DBConnection.class.getClassLoader(),
                new Class<?>[]{Connection.class},
                new InvocationHandler() {
                    private boolean closed = false;

                    @Override
                    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
                        if ("close".equals(method.getName())) {
                            if (!closed) {
                                closed = true;
                                if (!physicalConn.isClosed() && physicalConn.isValid(1)) {
                                    if (!pool.offer(physicalConn)) {
                                        physicalConn.close(); // Pool is full
                                    }
                                } else {
                                    try { physicalConn.close(); } catch (Exception ignored) {}
                                }
                            }
                            return null;
                        }
                        if ("isClosed".equals(method.getName())) {
                            return closed || physicalConn.isClosed();
                        }
                        return method.invoke(physicalConn, args);
                    }
                }
        );
    }

    public static void main(String[] args) {
        System.out.println("=== Testing DBConnection & Failover Mechanism ===");
        try (Connection conn = getConnection()) {
            System.out.println("[+] Active Database: " + conn.getCatalog());
            System.out.println("[+] Using Backup DB: " + isUsingBackup());
        } catch (SQLException e) {
            System.err.println("[-] Connection failed: " + e.getMessage());
        }

        try (Connection bConn = getBackupConnection()) {
            System.out.println("[+] Dedicated Backup DB Connection: " + bConn.getCatalog());
        } catch (SQLException e) {
            System.err.println("[-] Backup DB connection failed: " + e.getMessage());
        }
    }
}
