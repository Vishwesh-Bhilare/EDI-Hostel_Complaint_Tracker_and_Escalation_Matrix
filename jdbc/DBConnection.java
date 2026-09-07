import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

/**
 * Central place for opening connections to HostelCare's MySQL database.
 *
 * Configuration can be supplied with environment variables so database
 * credentials do not need to be committed to the repository:
 *   HOSTELCARE_DB_URL
 *   HOSTELCARE_DB_USER
 *   HOSTELCARE_DB_PASSWORD
 *
 * The defaults target a common local-development MySQL installation.
 */
public class DBConnection {

    private static final String DEFAULT_URL =
            "jdbc:mysql://localhost:3306/hostelcare_db?useSSL=false&serverTimezone=UTC&allowPublicKeyRetrieval=true";

    private static String envOrDefault(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    private static final String URL = envOrDefault("HOSTELCARE_DB_URL", DEFAULT_URL);
    private static final String USER = envOrDefault("HOSTELCARE_DB_USER", "root");
    private static final String PASSWORD = envOrDefault("HOSTELCARE_DB_PASSWORD", "");

    public static Connection getConnection() throws SQLException {
        try {
            Class.forName("com.mysql.cj.jdbc.Driver");
        } catch (ClassNotFoundException e) {
            throw new SQLException(
                    "MySQL JDBC driver not found on classpath. " +
                    "Make sure jdbc/mysql-connector-j-26.7.0.jar is present.",
                    e
            );
        }
        return DriverManager.getConnection(URL, USER, PASSWORD);
    }
}
