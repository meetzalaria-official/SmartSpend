package com.smartspend.server;

/**
 * An API error that maps directly to the JSON error envelope the frontend
 * expects: {@code {"message": "...", "field": "...", "code": "..."}}.
 */
public final class ApiException extends RuntimeException {

    private final int status;
    private final String field;
    private final String code;

    public ApiException(int status, String message) {
        this(status, message, null, "API_ERROR");
    }

    public ApiException(int status, String message, String field, String code) {
        super(message);
        this.status = status;
        this.field = field;
        this.code = code == null ? "API_ERROR" : code;
    }

    public int status() {
        return status;
    }

    public String field() {
        return field;
    }

    public String code() {
        return code;
    }

    public static ApiException badRequest(String message, String field, String code) {
        return new ApiException(400, message, field, code);
    }

    public static ApiException unauthorised() {
        return new ApiException(401, "Your session has ended. Please sign in again.", null, "UNAUTHENTICATED");
    }

    public static ApiException forbidden(String message) {
        return new ApiException(403, message, null, "FORBIDDEN");
    }

    public static ApiException notFound(String message) {
        return new ApiException(404, message, null, "NOT_FOUND");
    }

    public static ApiException conflict(String message, String field, String code) {
        return new ApiException(409, message, field, code);
    }
}
