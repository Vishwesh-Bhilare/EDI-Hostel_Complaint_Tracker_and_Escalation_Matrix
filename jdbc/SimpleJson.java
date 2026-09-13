import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A tiny hand-written JSON parser/writer.
 *
 * No external JSON library (Jackson/Gson/org.json) is used on purpose —
 * this keeps the whole request pipeline dependency-free, matching the
 * "no external API" requirement.
 *
 * Parses into plain Java types:
 *   object -> LinkedHashMap<String, Object>
 *   array  -> ArrayList<Object>
 *   string -> String
 *   number -> Long or Double
 *   true/false -> Boolean
 *   null   -> null
 */
public class SimpleJson {

    // ---------------- Parsing ----------------

    public static Object parse(String json) {
        Parser p = new Parser(json);
        Object result = p.parseValue();
        p.skipWhitespace();
        if (p.pos != p.text.length()) {
            throw new RuntimeException("Unexpected trailing characters in JSON at position " + p.pos);
        }
        return result;
    }

    private static class Parser {
        private final String text;
        private int pos = 0;

        Parser(String text) {
            this.text = text;
        }

        void skipWhitespace() {
            while (pos < text.length() && Character.isWhitespace(text.charAt(pos))) pos++;
        }

        Object parseValue() {
            skipWhitespace();
            if (pos >= text.length()) throw new RuntimeException("Unexpected end of JSON");
            char c = text.charAt(pos);
            switch (c) {
                case '{': return parseObject();
                case '[': return parseArray();
                case '"': return parseString();
                case 't': expect("true"); return Boolean.TRUE;
                case 'f': expect("false"); return Boolean.FALSE;
                case 'n': expect("null"); return null;
                default: return parseNumber();
            }
        }

        Map<String, Object> parseObject() {
            Map<String, Object> map = new LinkedHashMap<>();
            pos++; // consume '{'
            skipWhitespace();
            if (peek() == '}') { pos++; return map; }
            while (true) {
                skipWhitespace();
                String key = parseString();
                skipWhitespace();
                if (peek() != ':') throw new RuntimeException("Expected ':' at position " + pos);
                pos++; // consume ':'
                Object value = parseValue();
                map.put(key, value);
                skipWhitespace();
                char next = peek();
                if (next == ',') { pos++; continue; }
                if (next == '}') { pos++; break; }
                throw new RuntimeException("Expected ',' or '}' at position " + pos);
            }
            return map;
        }

        List<Object> parseArray() {
            List<Object> list = new ArrayList<>();
            pos++; // consume '['
            skipWhitespace();
            if (peek() == ']') { pos++; return list; }
            while (true) {
                Object value = parseValue();
                list.add(value);
                skipWhitespace();
                char next = peek();
                if (next == ',') { pos++; continue; }
                if (next == ']') { pos++; break; }
                throw new RuntimeException("Expected ',' or ']' at position " + pos);
            }
            return list;
        }

        String parseString() {
            skipWhitespace();
            if (peek() != '"') throw new RuntimeException("Expected '\"' at position " + pos);
            pos++; // consume opening quote
            StringBuilder sb = new StringBuilder();
            while (true) {
                if (pos >= text.length()) throw new RuntimeException("Unterminated string");
                char c = text.charAt(pos++);
                if (c == '"') break;
                if (c == '\\') {
                    char esc = text.charAt(pos++);
                    switch (esc) {
                        case '"': sb.append('"'); break;
                        case '\\': sb.append('\\'); break;
                        case '/': sb.append('/'); break;
                        case 'b': sb.append('\b'); break;
                        case 'f': sb.append('\f'); break;
                        case 'n': sb.append('\n'); break;
                        case 'r': sb.append('\r'); break;
                        case 't': sb.append('\t'); break;
                        case 'u':
                            String hex = text.substring(pos, pos + 4);
                            sb.append((char) Integer.parseInt(hex, 16));
                            pos += 4;
                            break;
                        default: throw new RuntimeException("Invalid escape sequence at position " + pos);
                    }
                } else {
                    sb.append(c);
                }
            }
            return sb.toString();
        }

        Object parseNumber() {
            int start = pos;
            if (peek() == '-') pos++;
            while (pos < text.length() && Character.isDigit(text.charAt(pos))) pos++;
            boolean isDouble = false;
            if (pos < text.length() && text.charAt(pos) == '.') {
                isDouble = true;
                pos++;
                while (pos < text.length() && Character.isDigit(text.charAt(pos))) pos++;
            }
            if (pos < text.length() && (text.charAt(pos) == 'e' || text.charAt(pos) == 'E')) {
                isDouble = true;
                pos++;
                if (pos < text.length() && (text.charAt(pos) == '+' || text.charAt(pos) == '-')) pos++;
                while (pos < text.length() && Character.isDigit(text.charAt(pos))) pos++;
            }
            String numStr = text.substring(start, pos);
            if (numStr.isEmpty() || numStr.equals("-")) {
                throw new RuntimeException("Invalid number at position " + start);
            }
            if (isDouble) return Double.parseDouble(numStr);
            try {
                return Long.parseLong(numStr);
            } catch (NumberFormatException e) {
                return Double.parseDouble(numStr);
            }
        }

        char peek() {
            if (pos >= text.length()) throw new RuntimeException("Unexpected end of JSON");
            return text.charAt(pos);
        }

        void expect(String literal) {
            if (pos + literal.length() > text.length()
                    || !text.substring(pos, pos + literal.length()).equals(literal)) {
                throw new RuntimeException("Expected '" + literal + "' at position " + pos);
            }
            pos += literal.length();
        }
    }

    // ---------------- Serialization ----------------

    public static String write(Object value) {
        StringBuilder sb = new StringBuilder();
        writeValue(value, sb);
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private static void writeValue(Object value, StringBuilder sb) {
        if (value == null) {
            sb.append("null");
        } else if (value instanceof String) {
            writeString((String) value, sb);
        } else if (value instanceof Map) {
            writeObject((Map<String, Object>) value, sb);
        } else if (value instanceof List) {
            writeArray((List<Object>) value, sb);
        } else if (value instanceof Boolean || value instanceof Number) {
            sb.append(value.toString());
        } else {
            // Fallback for any other type (e.g. java.sql.Timestamp from a ResultSet)
            writeString(value.toString(), sb);
        }
    }

    private static void writeObject(Map<String, Object> map, StringBuilder sb) {
        sb.append('{');
        boolean first = true;
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            if (!first) sb.append(',');
            first = false;
            writeString(entry.getKey(), sb);
            sb.append(':');
            writeValue(entry.getValue(), sb);
        }
        sb.append('}');
    }

    private static void writeArray(List<Object> list, StringBuilder sb) {
        sb.append('[');
        boolean first = true;
        for (Object item : list) {
            if (!first) sb.append(',');
            first = false;
            writeValue(item, sb);
        }
        sb.append(']');
    }

    private static void writeString(String s, StringBuilder sb) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append('"');
    }
}
