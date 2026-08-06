/**
 * Fail closed before migrate/start when Better Auth signing secret is missing
 * or weak. Intended for the Docker app entrypoint.
 */
import { pathToFileURL } from "node:url";
import { resolveBetterAuthSecret } from "./lib/auth-secret.mjs";

export function main(
  env = process.env,
  { required = env.NODE_ENV === "production" } = {},
) {
  const resolved = resolveBetterAuthSecret({
    secret: env.BETTER_AUTH_SECRET,
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

  console.log("Better Auth secret OK");
  return resolved;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    // Docker runner sets NODE_ENV=production; always require there.
    main(process.env, { required: true });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
