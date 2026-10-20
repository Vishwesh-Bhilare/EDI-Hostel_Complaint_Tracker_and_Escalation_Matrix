import java.util.List;

public class SqlMigrationTest {
    public static void main(String[] args) {
        check("-- header; comment\nUSE hostelcare; SELECT 1;", List.of("USE hostelcare", "SELECT 1"));
        check("SELECT 'hello;world'; SELECT '--not a comment';", List.of("SELECT 'hello;world'", "SELECT '--not a comment'"));
        check("SET @ddl='ENUM(''queued'',''sent'')'; PREPARE migration FROM @ddl;",
                List.of("SET @ddl='ENUM(''queued'',''sent'')'", "PREPARE migration FROM @ddl"));
        check("SELECT/* ; block comment */1; # trailing; comment\nSELECT 2;", List.of("SELECT 1", "SELECT 2"));
        check("SELECT `column;name`, \"quoted;value\";", List.of("SELECT `column;name`, \"quoted;value\""));
        boolean rejected = false;
        try { SqlMigration.splitStatements("SELECT 'unfinished"); }
        catch (IllegalArgumentException expected) { rejected = true; }
        if (!rejected) throw new AssertionError("Unterminated strings must be rejected");
        System.out.println("SQL migration parser tests passed.");
    }

    private static void check(String source, List<String> expected) {
        List<String> actual = SqlMigration.splitStatements(source);
        if (!actual.equals(expected)) throw new AssertionError("Unexpected statements: " + actual);
    }
}
