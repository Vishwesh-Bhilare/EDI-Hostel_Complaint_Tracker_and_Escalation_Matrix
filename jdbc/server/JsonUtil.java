package server;

import java.util.*;

/**
 * Minimal hand-rolled JSON reader/writer. No external dependency —
 * just enough to (a) turn Java Maps/Lists/primitives into a JSON string
 * for HTTP responses, and (b) parse a JSON request body into a
 * Map<String,Object> / List<Object> for the signup/login/complaint
 * handlers.
 *
 * This is NOT a general-purpose JSON library — it only supports the
 * subset of JSON we actually send/receive in this project (objects,
 * arrays, strings, numbers, booleans, null). That's enough for
 * Phase 1.
 */
public class JsonUtil {

    // ---------------------------------------------------------------
    // WRITER: Java object -> JSON string
    // ---------------------------------------------------------------

    public static String toJson(Object value) {
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
        } else if (value instanceof Number || value instanceof Boolean) {
            sb.append(value.toString());
        } else if (value instanceof Map) {
            writeObject((Map<String, Object>) value, sb);
        } else if (value instanceof Iterable) {
            writeArray((Iterable<Object>) value, sb);
        } else if (value.getClass().isArray()) {
            writeArray(Arrays.asList((Object[]) value), sb);
        } else {
            // fallback: treat unknown types as strings (e.g. enums, dates already
            // converted to ISO strings before reaching here)
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

    private static void writeArray(Iterable<Object> list, StringBuilder sb) {
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
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n");  break;
                case '\r': sb.append("\\r");  break;
                case '\t': sb.append("\\t");  break;
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

    // Convenience builder for response objects, e.g.:
    //   JsonUtil.obj("ok", true, "message", "done")
    public static Map<String, Object> obj(Object... kvPairs) {
        LinkedHashMap<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < kvPairs.length; i += 2) {
            map.put((String) kvPairs[i], kvPairs[i + 1]);
        }
        return map;
    }

    // ---------------------------------------------------------------
    // PARSER: JSON string -> Java object (Map/List/String/Double/Boolean/null)
    // ---------------------------------------------------------------

    public static Object parse(String json) {
        Parser p = new Parser(json);
        p.skipWhitespace();
        Object result = p.parseValue();
        p.skipWhitespace();
        return result;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> parseObject(String json) {
        Object result = parse(json);
        if (result instanceof Map) return (Map<String, Object>) result;
        throw new IllegalArgumentException("Expected a JSON object at top level");
    }

    private static class Parser {
        private final String s;
        private int pos = 0;

        Parser(String s) { this.s = s == null ? "" : s; }

        void skipWhitespace() {
            while (pos < s.length() && Character.isWhitespace(s.charAt(pos))) pos++;
        }

        char peek() {
            if (pos >= s.length()) throw new IllegalArgumentException("Unexpected end of JSON input");
            return s.charAt(pos);
        }

        Object parseValue() {
            skipWhitespace();
            char c = peek();
            switch (c) {
                case '{': return parseObjectInternal();
                case '[': return parseArrayInternal();
                case '"': return parseStringInternal();
                case 't': expect("true"); return Boolean.TRUE;
                case 'f': expect("false"); return Boolean.FALSE;
                case 'n': expect("null"); return null;
                default:  return parseNumberInternal();
            }
        }

        Map<String, Object> parseObjectInternal() {
            LinkedHashMap<String, Object> map = new LinkedHashMap<>();
            pos++; // consume '{'
            skipWhitespace();
            if (peek() == '}') { pos++; return map; }
            while (true) {
                skipWhitespace();
                String key = parseStringInternal();
                skipWhitespace();
                if (peek() != ':') throw new IllegalArgumentException("Expected ':' in object at pos " + pos);
                pos++; // consume ':'
                Object value = parseValue();
                map.put(key, value);
                skipWhitespace();
                char next = peek();
                if (next == ',') { pos++; continue; }
                if (next == '}') { pos++; break; }
                throw new IllegalArgumentException("Expected ',' or '}' in object at pos " + pos);
            }
            return map;
        }

        List<Object> parseArrayInternal() {
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
                throw new IllegalArgumentException("Expected ',' or ']' in array at pos " + pos);
            }
            return list;
        }

        String parseStringInternal() {
            skipWhitespace();
            if (peek() != '"') throw new IllegalArgumentException("Expected string at pos " + pos);
            pos++; // consume opening quote
            StringBuilder sb = new StringBuilder();
            while (true) {
                if (pos >= s.length()) throw new IllegalArgumentException("Unterminated string");
                char c = s.charAt(pos++);
                if (c == '"') break;
                if (c == '\\') {
                    if (pos >= s.length()) throw new IllegalArgumentException("Unterminated escape sequence");
                    char esc = s.charAt(pos++);
                    switch (esc) {
                        case '"':  sb.append('"');  break;
                        case '\\': sb.append('\\'); break;
                        case '/':  sb.append('/');  break;
                        case 'n':  sb.append('\n'); break;
                        case 'r':  sb.append('\r'); break;
                        case 't':  sb.append('\t'); break;
                        case 'b':  sb.append('\b'); break;
                        case 'f':  sb.append('\f'); break;
                        case 'u':
                            String hex = s.substring(pos, pos + 4);
                            sb.append((char) Integer.parseInt(hex, 16));
                            pos += 4;
                            break;
                        default:
                            throw new IllegalArgumentException("Invalid escape sequence: \\" + esc);
                    }
                } else {
                    sb.append(c);
                }
            }
            return sb.toString();
        }

        Object parseNumberInternal() {
            int start = pos;
            if (peek() == '-') pos++;
            while (pos < s.length() && Character.isDigit(s.charAt(pos))) pos++;
            if (pos < s.length() && s.charAt(pos) == '.') {
                pos++;
                while (pos < s.length() && Character.isDigit(s.charAt(pos))) pos++;
            }
            if (pos < s.length() && (s.charAt(pos) == 'e' || s.charAt(pos) == 'E')) {
                pos++;
                if (pos < s.length() && (s.charAt(pos) == '+' || s.charAt(pos) == '-')) pos++;
                while (pos < s.length() && Character.isDigit(s.charAt(pos))) pos++;
            }
            String numStr = s.substring(start, pos);
            if (numStr.isEmpty() || numStr.equals("-")) {
                throw new IllegalArgumentException("Invalid number at pos " + start);
            }
            return Double.parseDouble(numStr);
        }

        void expect(String literal) {
            if (pos + literal.length() > s.length() || !s.substring(pos, pos + literal.length()).equals(literal)) {
                throw new IllegalArgumentException("Expected literal '" + literal + "' at pos " + pos);
            }
            pos += literal.length();
        }
    }
}