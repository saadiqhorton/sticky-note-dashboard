/**
 * Ensure a strong Better Auth signing secret before migrate/start.
 * In Docker, missing secrets are auto-generated and persisted to the app volume.
 * Explicit weak/default values are always rejected.
 */
import { pathToFileURL } from "node:url";
import {
  DEFAULT_AUTH_SECRET_FILE,
  ensureBetterAuthSecret,
} from "./lib/auth-secret.mjs";

export function main(
  env = process.env,
  {
    required = env.NODE_ENV === "production",
    persistPath = env.AUTH_SECRET_FILE,
    allowGenerate = Boolean(
      typeof persistPath === "string" && persistPath.trim(),
    ),
  } = {},
) {
  const resolved = ensureBetterAuthSecret({
    secret: env.BETTER_AUTH_SECRET,
    persistPath,
    allowGenerate,
    required,
  });

  if (resolved.error) {
    throw new Error(resolved.error);
  }

  if (resolved.action === "skip") {
    console.log(
      "Skipping Better Auth secret check: BETTER_AUTH_SECRET not required outside production",
    );
    return resolved;
  }

  if (resolved.source === "generated") {
    console.log(
      "Generated a unique BETTER_AUTH_SECRET and saved it for this deployment",
    );
  } else if (resolved.source === "file") {
    console.log("Loaded BETTER_AUTH_SECRET from deployment volume");
  } else {
    console.log("Better Auth secret OK");
  }

  return resolved;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    // Docker runner always requires a strong secret; generate when unset.
    const resolved = main(process.env, {
      required: true,
      persistPath: process.env.AUTH_SECRET_FILE ?? DEFAULT_AUTH_SECRET_FILE,
      allowGenerate: true,
    });
    if (resolved.secret) {
      process.env.BETTER_AUTH_SECRET = resolved.secret;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
