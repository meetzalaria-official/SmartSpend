/* ==========================================================================
   SmartSpend · Password hashing (offline adapter)
   PBKDF2-HMAC-SHA256 with a unique random salt per account. The Java backend
   owns authentication in the live app; this module only supports the offline adapter.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = (window.SS = window.SS || {});

  function getSubtle() {
    const webCrypto = window.crypto || window.msCrypto;
    if (!webCrypto || !webCrypto.subtle) {
      throw new Error(
        "Secure hashing is not available. Open SmartSpend through the local preview server " +
          "(double-click run.bat) instead of opening the HTML file directly."
      );
    }
    return webCrypto.subtle;
  }

  function requireCrypto() {
    const webCrypto = window.crypto || window.msCrypto;
    if (!webCrypto || typeof webCrypto.getRandomValues !== "function") {
      throw new Error(
        "This browser cannot generate secure random values. Please use a current version of Chrome, Edge or Firefox."
      );
    }
    return webCrypto;
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
    }
    return window.btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = window.atob(String(value || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function randomBytes(length) {
    const bytes = new Uint8Array(length);
    requireCrypto().getRandomValues(bytes);
    return bytes;
  }

  function createSalt() {
    return bytesToBase64(randomBytes(16));
  }

  async function deriveHash(password, saltBase64, iterations) {
    const subtle = getSubtle();
    const encoder = new TextEncoder();
    const key = await subtle.importKey(
      "raw",
      encoder.encode(String(password)),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const bits = await subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: base64ToBytes(saltBase64),
        iterations: Number(iterations) || SS.config.pbkdf2Iterations,
        hash: "SHA-256",
      },
      key,
      256
    );
    return bytesToBase64(new Uint8Array(bits));
  }

  async function createPasswordRecord(password) {
    const iterations = SS.config.pbkdf2Iterations;
    const salt = createSalt();
    const hash = await deriveHash(password, salt, iterations);
    return {
      algorithm: "PBKDF2-SHA256",
      iterations,
      salt,
      hash,
    };
  }

  async function verifyPassword(password, record) {
    if (!record || !record.salt || !record.hash) return false;
    const candidate = await deriveHash(password, record.salt, record.iterations);
    return constantTimeEqual(candidate, record.hash);
  }

  function constantTimeEqual(left, right) {
    const a = String(left || "");
    const b = String(right || "");
    const length = Math.max(a.length, b.length);
    let difference = a.length ^ b.length;
    for (let index = 0; index < length; index += 1) {
      difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
    }
    return difference === 0;
  }

  function randomId() {
    const webCrypto = requireCrypto();
    if (typeof webCrypto.randomUUID === "function") {
      return webCrypto.randomUUID();
    }
    const bytes = randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  SS.crypto = {
    getSubtle,
    bytesToBase64,
    base64ToBytes,
    randomBytes,
    createSalt,
    deriveHash,
    createPasswordRecord,
    verifyPassword,
    constantTimeEqual,
    randomId,
  };
})(window);
