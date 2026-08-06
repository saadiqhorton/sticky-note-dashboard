/** Minimum length for production admin bootstrap passwords. */
export const ADMIN_PASSWORD_MIN_LENGTH = 12;

/** Known insecure defaults / common passwords rejected in production. */
export const WEAK_ADMIN_PASSWORDS = new Set([
  "changeme123",
  "changeme",
  "password",
  "password123",
  "password12345",
  "admin",
  "admin123",
  "admin1234",
  "12345678",
  "123456789012",
  "stickyboard",
  "letmein",
  "qwerty",
  "qwerty123",
]);

/**
 * @param {string | undefined | null} password
 * @returns {{ weak: boolean, reason?: string }}
 */
export function assessAdminPassword(password) {
  if (password == null || password === "") {
    return { weak: true, reason: "ADMIN_PASSWORD is empty" };
  }

  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return {
      weak: true,
      reason: `ADMIN_PASSWORD must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters`,
    };
  }

  if (WEAK_ADMIN_PASSWORDS.has(password.toLowerCase())) {
    return {
      weak: true,
      reason: "ADMIN_PASSWORD is a known weak or default value",
    };
  }

  // Require mixed character classes so length alone is not enough.
  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigit = /\d/.test(password);
  if (!hasLetter || !hasDigit) {
    return {
      weak: true,
      reason: "ADMIN_PASSWORD must include at least one letter and one number",
    };
  }

  return { weak: false };
}

/**
 * Validate admin bootstrap credentials for the current environment.
 * Production requires email + a non-weak password. Non-production may skip
 * when unset (existing local-dev convenience).
 *
 * @param {{
 *   email?: string | null,
 *   password?: string | null,
 *   isProduction?: boolean,
 * }} options
 * @returns {{
 *   action: "skip" | "proceed",
 *   email?: string,
 *   password?: string,
 *   error?: string,
 * }}
 */
export function resolveAdminBootstrapCredentials({
  email,
  password,
  isProduction = process.env.NODE_ENV === "production",
} = {}) {
  const trimmedEmail = typeof email === "string" ? email.trim() : "";
  const trimmedPassword = typeof password === "string" ? password : "";

  if (!trimmedEmail || !trimmedPassword) {
    if (isProduction) {
      return {
        action: "skip",
        error:
          "Production bootstrap requires ADMIN_EMAIL and ADMIN_PASSWORD to be set",
      };
    }
    return { action: "skip" };
  }

  if (isProduction) {
    const assessment = assessAdminPassword(trimmedPassword);
    if (assessment.weak) {
      return {
        action: "skip",
        error: `Production bootstrap rejected weak admin credentials: ${assessment.reason}`,
      };
    }
  }

  return {
    action: "proceed",
    email: trimmedEmail.toLowerCase(),
    password: trimmedPassword,
  };
}
