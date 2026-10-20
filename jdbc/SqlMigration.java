import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/** Run migration files through the same JDBC settings as the application. */
public final class SqlMigration {
    public static void main(String[] args) {
        if (args.length == 0) {
            System.err.println("Usage: java SqlMigration <migration.sql> ...");
            System.exit(1);
        }
        String currentFile = "database connection";
        try (Connection conn = DBConnection.getConnection(); Statement statement = conn.createStatement()) {
            if (conn.getCatalog() == null) throw new IllegalArgumentException("Select a database in HOSTELCARE_DB_URL");
            for (String file : args) {
                currentFile = Path.of(file).getFileName().toString();
                String source = Files.readString(Path.of(file), StandardCharsets.UTF_8);
                for (String sql : splitStatements(source)) {
                    // These scripts default to hostelcare for manual CLI use.
                    // JDBC already selected the configured database, which may
                    // be an isolated test database or a user-provided URL.
                    if (sql.matches("(?is)USE\\s+hostelcare")) continue;
                    statement.execute(sql);
                }
                System.out.println("Applied " + currentFile);
            }
        } catch (Exception e) {
            System.err.println("Migration failed (" + currentFile + "): " + e.getMessage());
            System.exit(1);
        }
    }

    // Preserve semicolons and comment markers inside quoted SQL strings, including
    // the doubled quotes used by our PREPARE/EXECUTE migration statements.
    static List<String> splitStatements(String source) {
        List<String> statements = new ArrayList<>();
        StringBuilder sql = new StringBuilder();
        char quote = 0;
        boolean lineComment = false, blockComment = false;
        for (int i = 0; i < source.length(); i++) {
            char c = source.charAt(i);
            char next = i + 1 < source.length() ? source.charAt(i + 1) : '\0';
            if (lineComment) {
                if (c == '\n') { lineComment = false; sql.append('\n'); }
                continue;
            }
            if (blockComment) {
                if (c == '*' && next == '/') { blockComment = false; i++; sql.append(' '); }
                continue;
            }
            if (quote != 0) {
                sql.append(c);
                if (c == '\\' && next != '\0') { sql.append(next); i++; }
                else if (c == quote) {
                    if (next == quote) { sql.append(next); i++; }
                    else quote = 0;
                }
                continue;
            }
            if (c == '#' || (c == '-' && next == '-' &&
                    (i + 2 == source.length() || Character.isWhitespace(source.charAt(i + 2))))) {
                lineComment = true;
                sql.append(' ');
            } else if (c == '/' && next == '*') {
                blockComment = true;
                i++;
            } else if (c == '\'' || c == '"' || c == '`') {
                quote = c;
                sql.append(c);
            } else if (c == ';') {
                if (!sql.toString().trim().isEmpty()) statements.add(sql.toString().trim());
                sql.setLength(0);
            } else {
                sql.append(c);
            }
        }
        if (quote != 0 || blockComment) throw new IllegalArgumentException("Unterminated SQL quote or comment");
        if (!sql.toString().trim().isEmpty()) statements.add(sql.toString().trim());
        return statements;
    }
}
