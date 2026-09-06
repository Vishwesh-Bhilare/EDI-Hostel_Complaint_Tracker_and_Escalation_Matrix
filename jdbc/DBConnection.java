import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

/**
 * Central place that knows how to open a connection to the HostelCare
 * MySQL database (see sql/hostelcare_schema.sql for the schema this
 * connects to).
 *
 * Every other Java class that needs the database should call
 * DBConnection.getConnection() instead of writing its own connection
 * string — that way there's only one place to update credentials.
 */
public class DBConnection {

    // ---- EDIT THESE 3 VALUES to match your MySQL setup ----
    private static final String URL =
            "jdbc:mysql://localhost:3306/hostelcare_db?useSSL=false&serverTimezone=UTC";
    private static final String USER = "root";
    private static final String PASSWORD = "CHANGE ME";
    // ---------------------------------------------------------

    public static Connection getConnection() throws SQLException {
        try {
            // Not strictly required with modern drivers, but keeps this
            // working on older JDKs / driver versions too.
            Class.forName("com.mysql.cj.jdbc.Driver");
        } catch (ClassNotFoundException e) {
            throw new SQLException("MySQL JDBC driver not found on classpath. " +
                    "Did you add mysql-connector-j-*.jar with -cp?", e);
        }
        return DriverManager.getConnection(URL, USER, PASSWORD);
    }
}