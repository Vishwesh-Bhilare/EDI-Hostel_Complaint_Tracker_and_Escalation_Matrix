import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

/** Environment variables override ignored, machine-local configuration. */
public final class LocalConfig {
    private static final Map<?, ?> SETTINGS = load();

    private static Map<?, ?> load() {
        Path file = Path.of(System.getProperty("user.dir"), ".local", "hostelcare.json");
        if (!Files.isRegularFile(file)) return Map.of();
        try {
            Object value = SimpleJson.parse(Files.readString(file, StandardCharsets.UTF_8));
            if (!(value instanceof Map)) throw new IllegalArgumentException("Local configuration must be a JSON object");
            return (Map<?, ?>) value;
        } catch (IOException e) {
            throw new IllegalStateException("Could not read local configuration", e);
        }
    }

    public static String get(String name, String fallback) {
        String environment = System.getenv(name);
        if (environment != null) return environment; // explicit blank can disable SMTP
        Object local = SETTINGS.get(name);
        return local == null ? fallback : local.toString();
    }
}
