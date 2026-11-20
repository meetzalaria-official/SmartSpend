package com.smartspend.json;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Minimal, dependency-free JSON reader/writer for the SmartSpend API.
 *
 * <p>Values map to {@link Map}&lt;String,Object&gt;, {@link List}&lt;Object&gt;,
 * {@link String}, {@link Long}, {@link Double}, {@link Boolean} and {@code null}.
 * The implementation is intentionally small: the project does not use Maven or
 * Gradle, so a single JSON helper keeps the build to plain {@code javac}.</p>
 */
public final class Json {

    private Json() {
    }

    public static final class ParseException extends RuntimeException {
        public ParseException(String message) {
            super(message);
        }
    }

    /* ---------------------------------------------------------------------
       Parsing
       --------------------------------------------------------------------- */

    public static Object parse(String text) {
        Parser parser = new Parser(text == null ? "" : text);
        parser.skipSpace();
        if (parser.atEnd()) {
            return null;
        }
        Object value = parser.value();
        parser.skipSpace();
        if (!parser.atEnd()) {
            throw new ParseException("Unexpected trailing content at position " + parser.index + ".");
        }
        return value;
    }

    private static final class Parser {
        private final String text;
        private int index;

        Parser(String text) {
            this.text = text;
        }

        boolean atEnd() {
            return index >= text.length();
        }

        void skipSpace() {
            while (index < text.length()) {
                char c = text.charAt(index);
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
                    index++;
                } else {
                    break;
                }
            }
        }

        Object value() {
            skipSpace();
            if (atEnd()) {
                throw new ParseException("Unexpected end of JSON input.");
            }
            char c = text.charAt(index);
            switch (c) {
                case '{':
                    return object();
                case '[':
                    return array();
                case '"':
                    return string();
                case 't':
                    expectWord("true");
                    return Boolean.TRUE;
                case 'f':
                    expectWord("false");
                    return Boolean.FALSE;
                case 'n':
                    expectWord("null");
                    return null;
                default:
                    if (c == '-' || (c >= '0' && c <= '9')) {
                        return number();
                    }
                    throw new ParseException("Unexpected character '" + c + "' at position " + index + ".");
            }
        }

        private Map<String, Object> object() {
            Map<String, Object> result = new LinkedHashMap<>();
            index++; // {
            skipSpace();
            if (peek() == '}') {
                index++;
                return result;
            }
            while (true) {
                skipSpace();
                if (peek() != '"') {
                    throw new ParseException("Expected a string key at position " + index + ".");
                }
                String key = string();
                skipSpace();
                if (peek() != ':') {
                    throw new ParseException("Expected ':' after key '" + key + "'.");
                }
                index++;
                result.put(key, value());
                skipSpace();
                char next = peek();
                if (next == ',') {
                    index++;
                    continue;
                }
                if (next == '}') {
                    index++;
                    return result;
                }
                throw new ParseException("Expected ',' or '}' at position " + index + ".");
            }
        }

        private List<Object> array() {
            List<Object> result = new ArrayList<>();
            index++; // [
            skipSpace();
            if (peek() == ']') {
                index++;
                return result;
            }
            while (true) {
                result.add(value());
                skipSpace();
                char next = peek();
                if (next == ',') {
                    index++;
                    continue;
                }
                if (next == ']') {
                    index++;
                    return result;
                }
                throw new ParseException("Expected ',' or ']' at position " + index + ".");
            }
        }

        private String string() {
            index++; // opening quote
            StringBuilder builder = new StringBuilder();
            while (index < text.length()) {
                char c = text.charAt(index++);
                if (c == '"') {
                    return builder.toString();
                }
                if (c == '\\') {
                    if (index >= text.length()) {
                        throw new ParseException("Unterminated escape sequence.");
                    }
                    char escape = text.charAt(index++);
                    switch (escape) {
                        case '"':
                            builder.append('"');
                            break;
                        case '\\':
                            builder.append('\\');
                            break;
                        case '/':
                            builder.append('/');
                            break;
                        case 'b':
                            builder.append('\b');
                            break;
                        case 'f':
                            builder.append('\f');
                            break;
                        case 'n':
                            builder.append('\n');
                            break;
                        case 'r':
                            builder.append('\r');
                            break;
                        case 't':
                            builder.append('\t');
                            break;
                        case 'u':
                            if (index + 4 > text.length()) {
                                throw new ParseException("Invalid unicode escape.");
                            }
                            String hex = text.substring(index, index + 4);
                            try {
                                builder.append((char) Integer.parseInt(hex, 16));
                            } catch (NumberFormatException error) {
                                throw new ParseException("Invalid unicode escape \\u" + hex + ".");
                            }
                            index += 4;
                            break;
                        default:
                            throw new ParseException("Unknown escape \\" + escape + ".");
                    }
                } else {
                    builder.append(c);
                }
            }
            throw new ParseException("Unterminated string.");
        }

        private Number number() {
            int start = index;
            if (peek() == '-') {
                index++;
            }
            while (index < text.length() && Character.isDigit(text.charAt(index))) {
                index++;
            }
            boolean fractional = false;
            if (index < text.length() && text.charAt(index) == '.') {
                fractional = true;
                index++;
                while (index < text.length() && Character.isDigit(text.charAt(index))) {
                    index++;
                }
            }
            if (index < text.length() && (text.charAt(index) == 'e' || text.charAt(index) == 'E')) {
                fractional = true;
                index++;
                if (index < text.length() && (text.charAt(index) == '+' || text.charAt(index) == '-')) {
                    index++;
                }
                while (index < text.length() && Character.isDigit(text.charAt(index))) {
                    index++;
                }
            }
            String raw = text.substring(start, index);
            try {
                if (!fractional) {
                    return Long.parseLong(raw);
                }
                return Double.parseDouble(raw);
            } catch (NumberFormatException error) {
                throw new ParseException("Invalid number '" + raw + "'.");
            }
        }

        private char peek() {
            return index < text.length() ? text.charAt(index) : '\0';
        }

        private void expectWord(String word) {
            if (!text.startsWith(word, index)) {
                throw new ParseException("Invalid literal at position " + index + ".");
            }
            index += word.length();
        }
    }

    /* ---------------------------------------------------------------------
       Writing
       --------------------------------------------------------------------- */

    public static String stringify(Object value) {
        StringBuilder builder = new StringBuilder();
        write(value, builder);
        return builder.toString();
    }

    private static void write(Object value, StringBuilder builder) {
        if (value == null) {
            builder.append("null");
            return;
        }
        if (value instanceof String text) {
            writeString(text, builder);
            return;
        }
        if (value instanceof Boolean bool) {
            builder.append(bool ? "true" : "false");
            return;
        }
        if (value instanceof Number number) {
            writeNumber(number, builder);
            return;
        }
        if (value instanceof Map<?, ?> map) {
            builder.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (!first) {
                    builder.append(',');
                }
                first = false;
                writeString(String.valueOf(entry.getKey()), builder);
                builder.append(':');
                write(entry.getValue(), builder);
            }
            builder.append('}');
            return;
        }
        if (value instanceof Iterable<?> iterable) {
            builder.append('[');
            boolean first = true;
            for (Object item : iterable) {
                if (!first) {
                    builder.append(',');
                }
                first = false;
                write(item, builder);
            }
            builder.append(']');
            return;
        }
        if (value instanceof Object[] array) {
            builder.append('[');
            for (int index = 0; index < array.length; index++) {
                if (index > 0) {
                    builder.append(',');
                }
                write(array[index], builder);
            }
            builder.append(']');
            return;
        }
        writeString(String.valueOf(value), builder);
    }

    private static void writeNumber(Number number, StringBuilder builder) {
        if (number instanceof Double || number instanceof Float) {
            double value = number.doubleValue();
            if (Double.isNaN(value) || Double.isInfinite(value)) {
                builder.append("null");
                return;
            }
            if (value == Math.rint(value) && Math.abs(value) < 1e15) {
                builder.append((long) value);
                return;
            }
            builder.append(Double.toString(value));
            return;
        }
        builder.append(number.toString());
    }

    private static void writeString(String text, StringBuilder builder) {
        builder.append('"');
        for (int index = 0; index < text.length(); index++) {
            char c = text.charAt(index);
            switch (c) {
                case '"':
                    builder.append("\\\"");
                    break;
                case '\\':
                    builder.append("\\\\");
                    break;
                case '\b':
                    builder.append("\\b");
                    break;
                case '\f':
                    builder.append("\\f");
                    break;
                case '\n':
                    builder.append("\\n");
                    break;
                case '\r':
                    builder.append("\\r");
                    break;
                case '\t':
                    builder.append("\\t");
                    break;
                case '\u2028':
                    builder.append("\\u2028");
                    break;
                case '\u2029':
                    builder.append("\\u2029");
                    break;
                default:
                    if (c < 0x20) {
                        builder.append(String.format("\\u%04x", (int) c));
                    } else {
                        builder.append(c);
                    }
            }
        }
        builder.append('"');
    }

    /* ---------------------------------------------------------------------
       Typed helpers used by the API handlers
       --------------------------------------------------------------------- */

    public static Map<String, Object> object() {
        return new LinkedHashMap<>();
    }

    public static List<Object> array() {
        return new ArrayList<>();
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> requireObject(Object value) {
        if (value instanceof Map<?, ?> map) {
            return (Map<String, Object>) map;
        }
        throw new ParseException("Expected a JSON object.");
    }

    @SuppressWarnings("unchecked")
    public static List<Object> requireArray(Object value) {
        if (value instanceof List<?> list) {
            return (List<Object>) list;
        }
        throw new ParseException("Expected a JSON array.");
    }

    public static String text(Map<String, Object> map, String key) {
        Object value = map.get(key);
        return value == null ? "" : String.valueOf(value);
    }

    public static String text(Map<String, Object> map, String key, String fallback) {
        Object value = map.get(key);
        if (value == null) {
            return fallback;
        }
        String text = String.valueOf(value);
        return text.isEmpty() ? fallback : text;
    }

    public static double number(Map<String, Object> map, String key, double fallback) {
        Object value = map.get(key);
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value instanceof String text) {
            try {
                return Double.parseDouble(text.trim());
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    public static long integer(Map<String, Object> map, String key, long fallback) {
        double value = number(map, key, fallback);
        return Math.round(value);
    }

    public static boolean bool(Map<String, Object> map, String key, boolean fallback) {
        Object value = map.get(key);
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value instanceof Number number) {
            return number.doubleValue() != 0;
        }
        if (value instanceof String text) {
            String normalised = text.trim().toLowerCase();
            if ("true".equals(normalised) || "1".equals(normalised) || "yes".equals(normalised)) {
                return true;
            }
            if ("false".equals(normalised) || "0".equals(normalised) || "no".equals(normalised)) {
                return false;
            }
        }
        return fallback;
    }
}
