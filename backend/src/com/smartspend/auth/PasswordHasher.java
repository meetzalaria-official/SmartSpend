package com.smartspend.auth;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.util.Base64;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/**
 * PBKDF2-HMAC-SHA256 password hashing, matching the scheme documented for the
 * browser demo (210,000 iterations, 16-byte salt, 256-bit derived key).
 *
 * <p>Stored format: {@code pbkdf2-sha256$210000$<salt-base64>$<hash-base64>}.
 * Plain passwords are never written to the database.</p>
 */
public final class PasswordHasher {

    public static final int ITERATIONS = 210_000;
    public static final int SALT_BYTES = 16;
    public static final int KEY_BITS = 256;

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String PREFIX = "pbkdf2-sha256";

    private PasswordHasher() {
    }

    public static String hash(String password) {
        byte[] salt = new byte[SALT_BYTES];
        RANDOM.nextBytes(salt);
        byte[] derived = derive(password, salt, ITERATIONS);
        return PREFIX + "$" + ITERATIONS + "$" + Base64.getEncoder().encodeToString(salt)
                + "$" + Base64.getEncoder().encodeToString(derived);
    }

    public static boolean verify(String password, String record) {
        if (password == null || record == null) {
            return false;
        }
        String[] parts = record.split("\\$");
        if (parts.length != 4 || !PREFIX.equals(parts[0])) {
            return false;
        }
        int iterations;
        try {
            iterations = Integer.parseInt(parts[1]);
        } catch (NumberFormatException error) {
            return false;
        }
        if (iterations < 10_000 || iterations > 5_000_000) {
            return false;
        }
        byte[] salt;
        byte[] expected;
        try {
            salt = Base64.getDecoder().decode(parts[2]);
            expected = Base64.getDecoder().decode(parts[3]);
        } catch (IllegalArgumentException error) {
            return false;
        }
        byte[] actual = derive(password, salt, iterations, expected.length * 8);
        return MessageDigest.isEqual(expected, actual);
    }

    private static byte[] derive(String password, byte[] salt, int iterations) {
        return derive(password, salt, iterations, KEY_BITS);
    }

    private static byte[] derive(String password, byte[] salt, int iterations, int keyBits) {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, keyBits);
        try {
            SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            return factory.generateSecret(spec).getEncoded();
        } catch (NoSuchAlgorithmException | InvalidKeySpecException error) {
            throw new IllegalStateException("PBKDF2 hashing is unavailable in this JVM.", error);
        } finally {
            spec.clearPassword();
        }
    }
}
