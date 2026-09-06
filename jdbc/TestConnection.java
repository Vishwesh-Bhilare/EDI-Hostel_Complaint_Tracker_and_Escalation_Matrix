import java.sql.Connection;
import java.sql.SQLException;

/**
 * Run this file directly to check the database connection is working.
 * It does nothing except open a connection, print success/failure, and
 * close it again. No table reads, no dependencies on the rest of the app.
 */
public class TestConnection {
    public static void main(String[] args) {
        System.out.println("Trying to connect to hostelcare_db ...");
        try (Connection conn = DBConnection.getConnection()) {
            if (conn != null && !conn.isClosed()) {
                System.out.println("SUCCESS: Connection established!");
                System.out.println("Connected to: " + conn.getMetaData().getURL());
                System.out.println("As user     : " + conn.getMetaData().getUserName());
            }
        } catch (SQLException e) {
            System.out.println("FAILED: Connection could not be established.");
            System.out.println("Reason: " + e.getMessage());
        }
    }
}