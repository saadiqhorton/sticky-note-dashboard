/** Minimum length for Compose / production Better Auth secrets. */
export const BETTER_AUTH_SECRET_MIN_LENGTH = 32;

/** Known insecure defaults rejected for Better Auth signing. */
export const WEAK_BETTER_AUTH_SECRETS = new Set([
  "change-me-to-a-long-random-string",
  "replace-with-a-long-random-string",
  "secret",
  "changeme",
  "password",
  "password123",
  "password12345",
  "stickyboard",
  "better-auth-secret",
  "your-secret-here",
  "dev-secret",
  "test-secret",
  "12345678901234567890123456789012",
]);

/**
 * @param {string | undefined | null} secret
 * @returns {{ weak: boolean, reason?: string }}
 */
export function assessBetterAuthSecret(secret) {
  if (secret == null || secret === "") {
    return { weak: true, reason: "BETTER_AUTH_SECRET is empty" };
  }

  if (secret.length < BETTER_AUTH_SECRET_MIN_LENGTH) {
    return {
      weak: true,
      reason: `BETTER_AUTH_SECRET must be at least ${BETTER_AUTH_SECRET_MIN_LENGTH} characters`,
    };
  }

  if (WEAK_BETTER_AUTH_SECRETS.has(secret.toLowerCase())) {
    return {
      weak: true,
      reason: "BETTER_AUTH_SECRET is a known weak or default value",
    };
  }

  // Prefer generated secrets: require mixed classes so length alone is not enough.
  const hasLetter = /[A-Za-z]/.test(secret);
  const hasDigit = /\d/.test(secret);
  if (!hasLetter || !hasDigit) {
    return {
      weak: true,
      reason: "BETTER_AUTH_SECRET must include at least one letter and one number",
    };
  }

  return { weak: false };
}

/**
 * Resolve and validate the Better Auth signing secret used by Docker Compose.
 * Production / Compose always require a non-weak high-entropy secret.
 *
 * @param {{
 *   secret?: string | null,
 *   required?: boolean,
 * }} options
 * @returns {{
 *   action: "skip" | "proceed",
 *   secret?: string,
 *   error?: string,
 * }}
 */
export function resolveBetterAuthSecret({
  secret,
  required = true,
} = {}) {
  const trimmed = typeof secret === "string" ? secret.trim() : "";

  if (!trimmed) {
    if (required) {
      return {
        action: "skip",
        error:
          "BETTER_AUTH_SECRET must be set to a strong generated secret (e.g. openssl rand -hex 32)",
      };
    }
    return { action: "skip" };
  }

  const assessment = assessBetterAuthSecret(trimmed);
  if (assessment.weak) {
    return {
      action: "skip",
      error: `Rejected weak Better Auth secret: ${assessment.reason}`,
    };
  }

  return {
    action: "proceed",
    secret: trimmed,
  };
}
