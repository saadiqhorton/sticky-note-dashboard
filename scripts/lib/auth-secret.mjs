import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

/** Minimum length for Compose / production Better Auth secrets. */
export const BETTER_AUTH_SECRET_MIN_LENGTH = 32;

/** Persisted secret path inside the Docker app volume. */
export const DEFAULT_AUTH_SECRET_FILE = "/data/uploads/.better-auth-secret";

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
 * @returns {string}
 */
export function generateBetterAuthSecret() {
  return randomBytes(32).toString("hex");
}

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
 * Validate an explicitly provided Better Auth secret (no generation).
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
          "BETTER_AUTH_SECRET must be set, or leave it unset in Docker to auto-generate one",
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

/**
 * Resolve a strong Better Auth secret for app start.
 * Prefer env, then a persisted file, then generate + persist when allowed.
 *
 * @param {{
 *   secret?: string | null,
 *   persistPath?: string | null,
 *   required?: boolean,
 *   allowGenerate?: boolean,
 * }} options
 * @returns {{
 *   action: "skip" | "proceed",
 *   secret?: string,
 *   source?: "env" | "file" | "generated",
 *   error?: string,
 * }}
 */
export function ensureBetterAuthSecret({
  secret,
  persistPath,
  required = true,
  allowGenerate = Boolean(persistPath),
} = {}) {
  const trimmed = typeof secret === "string" ? secret.trim() : "";

  if (trimmed) {
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
      source: "env",
    };
  }

  const filePath =
    typeof persistPath === "string" && persistPath.trim()
      ? persistPath.trim()
      : "";

  if (filePath && existsSync(filePath)) {
    try {
      const fromFile = readFileSync(filePath, "utf8").trim();
      const assessment = assessBetterAuthSecret(fromFile);
      if (!assessment.weak) {
        return {
          action: "proceed",
          secret: fromFile,
          source: "file",
        };
      }
    } catch (error) {
      return {
        action: "skip",
        error: `Could not read persisted BETTER_AUTH_SECRET file: ${
          error instanceof Error ? error.message : error
        }`,
      };
    }
  }

  if (allowGenerate && filePath) {
    const generated = generateBetterAuthSecret();
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, `${generated}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
    } catch (error) {
      return {
        action: "skip",
        error: `Could not persist generated BETTER_AUTH_SECRET: ${
          error instanceof Error ? error.message : error
        }`,
      };
    }
    return {
      action: "proceed",
      secret: generated,
      source: "generated",
    };
  }

  if (required) {
    return {
      action: "skip",
      error:
        "BETTER_AUTH_SECRET must be set, or leave it unset in Docker to auto-generate one",
    };
  }

  return { action: "skip" };
}
