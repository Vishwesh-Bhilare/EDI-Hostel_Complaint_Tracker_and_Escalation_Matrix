import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

public class DBConnection {

    private static final String DEFAULT_URL =
            "jdbc:mysql://localhost:3306/hostelcare?useSSL=false&serverTimezone=UTC&allowPublicKeyRetrieval=true";

    private static String envOrDefault(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    private static final String URL = envOrDefault("HOSTELCARE_DB_URL", DEFAULT_URL);
    private static final String USER = envOrDefault("HOSTELCARE_DB_USER", "root");
    private static final String PASSWORD = envOrDefault("HOSTELCARE_DB_PASSWORD", "root123");

    public static Connection getConnection() throws SQLException {
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
        return DriverManager.getConnection(URL, USER, PASSWORD);
    }

    public static void main(String[] args) {
        try (Connection conn = getConnection()) {
            System.out.println("Connected to database successfully: " + conn.getCatalog());
        } catch (SQLException e) {
            System.err.println("Connection failed: " + e.getMessage());
        }
    }
}
