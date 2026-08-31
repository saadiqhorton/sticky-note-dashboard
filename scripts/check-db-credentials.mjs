/**
 * Fail closed before migrate/start when Compose Postgres password is missing
 * or weak. Intended for the Docker app entrypoint.
 */
import { pathToFileURL } from "node:url";
import { resolvePostgresCredentials } from "./lib/postgres-credentials.mjs";

export function main(
  env = process.env,
  { required = env.NODE_ENV === "production" } = {},
) {
  const resolved = resolvePostgresCredentials({
    password: env.POSTGRES_PASSWORD,
    required,
  });

  if (resolved.error) {
    throw new Error(resolved.error);
  }

  if (resolved.action === "skip") {
    console.log(
      "Skipping Postgres credential check: POSTGRES_PASSWORD not required outside production",
    );
    return resolved;
  }

  console.log("Postgres credentials OK");
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
