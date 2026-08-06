/** Minimum length for Compose / production Postgres passwords. */
export const POSTGRES_PASSWORD_MIN_LENGTH = 16;

/** Known insecure defaults rejected for Compose Postgres. */
export const WEAK_POSTGRES_PASSWORDS = new Set([
  "stickyboard",
  "postgres",
  "password",
  "password123",
  "password12345",
  "changeme",
  "changeme123",
  "admin",
  "admin123",
  "12345678",
  "123456789012",
  "letmein",
  "qwerty",
  "qwerty123",
]);

/**
 * @param {string | undefined | null} password
 * @returns {{ weak: boolean, reason?: string }}
 */
export function assessPostgresPassword(password) {
  if (password == null || password === "") {
    return { weak: true, reason: "POSTGRES_PASSWORD is empty" };
  }

  if (password.length < POSTGRES_PASSWORD_MIN_LENGTH) {
    return {
      weak: true,
      reason: `POSTGRES_PASSWORD must be at least ${POSTGRES_PASSWORD_MIN_LENGTH} characters`,
    };
  }

  if (WEAK_POSTGRES_PASSWORDS.has(password.toLowerCase())) {
    return {
      weak: true,
      reason: "POSTGRES_PASSWORD is a known weak or default value",
    };
  }

  // Prefer generated secrets: require mixed classes so length alone is not enough.
  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigit = /\d/.test(password);
  if (!hasLetter || !hasDigit) {
    return {
      weak: true,
      reason: "POSTGRES_PASSWORD must include at least one letter and one number",
    };
  }

  // Reject characters that break unencoded DATABASE_URL embedding in Compose.
  if (!/^[A-Za-z0-9._~-]+$/.test(password)) {
    return {
      weak: true,
      reason:
        "POSTGRES_PASSWORD must be URL-safe (use letters, numbers, and . _ ~ -; e.g. openssl rand -hex 32)",
    };
  }

  return { weak: false };
}

/**
 * Resolve and validate the Postgres password used by Docker Compose.
 * Production / Compose always require a non-weak password.
 *
 * @param {{
 *   password?: string | null,
 *   required?: boolean,
 * }} options
 * @returns {{
 *   action: "skip" | "proceed",
 *   password?: string,
 *   error?: string,
 * }}
 */
export function resolvePostgresCredentials({
  password,
  required = true,
} = {}) {
  const trimmed =
    typeof password === "string" ? password.trim() : "";

  if (!trimmed) {
    if (required) {
      return {
        action: "skip",
        error:
          "POSTGRES_PASSWORD must be set to a strong generated secret (e.g. openssl rand -hex 32)",
      };
    }
    return { action: "skip" };
  }

  const assessment = assessPostgresPassword(trimmed);
  if (assessment.weak) {
    return {
      action: "skip",
      error: `Rejected weak Postgres credentials: ${assessment.reason}`,
    };
  }

  return {
    action: "proceed",
    password: trimmed,
  };
}
