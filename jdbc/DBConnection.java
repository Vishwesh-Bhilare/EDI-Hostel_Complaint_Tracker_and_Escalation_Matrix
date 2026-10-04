import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;

public class DBConnection {

    private static final String DEFAULT_URL =
            "jdbc:mysql://localhost:3306/hostelcare?useSSL=false&serverTimezone=UTC&allowPublicKeyRetrieval=true";

    private static String envOrDefault(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    private static final String URL =
            envOrDefault("HOSTELCARE_DB_URL", DEFAULT_URL);

    private static final String USER =
            envOrDefault("HOSTELCARE_DB_USER", "root");

    /*
     * Your local XAMPP MariaDB uses an empty root password.
     * The environment variable can still override it when needed.
     */
    private static final String PASSWORD =
            envOrDefault("HOSTELCARE_DB_PASSWORD", "");

    // JDBC connection pool configuration.
    private static final int MAX_POOL_SIZE = 5;

    // Maximum time a request waits for a free DB connection.
    private static final long MAX_WAIT_TIMEOUT_MS = 3000;

    private static final BlockingQueue<Connection> pool =
            new ArrayBlockingQueue<>(MAX_POOL_SIZE);

    /*
     * Initialize the physical database connections once when
     * DBConnection is first loaded.
     */
    static {
        try {
            Class.forName("com.mysql.cj.jdbc.Driver");

            for (int i = 0; i < MAX_POOL_SIZE; i++) {
                pool.add(createRawConnection());
            }

            System.out.println(
                    "JDBC Connection Pool initialized with "
                            + MAX_POOL_SIZE + " connections."
            );

        } catch (Exception e) {
            throw new ExceptionInInitializerError(
                    "Failed to initialize JDBC Connection Pool: "
                            + e.getMessage()
            );
        }
    }

    private static Connection createRawConnection() throws SQLException {
        return DriverManager.getConnection(URL, USER, PASSWORD);
    }

    /**
     * Borrows a physical connection from the pool.
     *
     * The caller receives a proxy connection. When the caller invokes
     * close(), the physical connection is returned to the pool instead
     * of actually being closed.
     */
    public static Connection getConnection() throws SQLException {

        try {
            Connection rawConn =
                    pool.poll(MAX_WAIT_TIMEOUT_MS, TimeUnit.MILLISECONDS);

            if (rawConn == null) {
                throw new SQLException(
                        "Connection Pool Timeout: No database connection "
                                + "available within "
                                + MAX_WAIT_TIMEOUT_MS
                                + " ms."
                );
            }

            /*
             * Check whether the borrowed physical connection is still valid.
             * If not, replace it with a new physical connection.
             */
            if (rawConn.isClosed() || !rawConn.isValid(2)) {

                try {
                    rawConn.close();
                } catch (Exception ignored) {
                }

                rawConn = createRawConnection();
            }

            return createProxyConnection(rawConn);

        } catch (InterruptedException e) {

            Thread.currentThread().interrupt();

            throw new SQLException(
                    "Thread interrupted while waiting for database connection",
                    e
            );
        }
    }

    /**
     * Creates a proxy around the physical JDBC connection.
     *
     * close() is intercepted so the connection goes back into the pool.
     */
    private static Connection createProxyConnection(Connection rawConn) {

        return (Connection) Proxy.newProxyInstance(
                DBConnection.class.getClassLoader(),
                new Class<?>[]{Connection.class},

                new InvocationHandler() {

                    @Override
                    public Object invoke(
                            Object proxy,
                            Method method,
                            Object[] args) throws Throwable {

                        /*
                         * try-with-resources calls close().
                         * Instead of destroying the physical connection,
                         * return it to the pool.
                         */
                        if ("close".equals(method.getName())) {

                            if (!pool.offer(rawConn)) {
                                rawConn.close();
                            }

                            return null;
                        }

                        /*
                         * Forward all other Connection methods to
                         * the real physical connection.
                         */
                        return method.invoke(rawConn, args);
                    }
                }
        );
    }

    /*
     * Simple standalone test for the connection pool.
     */
    public static void main(String[] args) {

        try (Connection conn = getConnection()) {

            System.out.println(
                    "Successfully borrowed connection: "
                            + conn.getCatalog()
            );

            System.out.println(
                    "Available connections while borrowed: "
                            + pool.size()
            );

        } catch (SQLException e) {

            System.err.println(
                    "Connection pool error: " + e.getMessage()
            );
        }

        System.out.println(
                "Available connections after close(): "
                        + pool.size()
        );
    }
}
