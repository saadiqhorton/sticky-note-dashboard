/**
 * Docker app entrypoint: ensure secrets, migrate, bootstrap, then start.
 * Sets BETTER_AUTH_SECRET in the child env when auto-generated or loaded.
 */
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_AUTH_SECRET_FILE,
  ensureBetterAuthSecret,
} from "./lib/auth-secret.mjs";
import { main as checkDbCredentials } from "./check-db-credentials.mjs";

function run(command, args, env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

export function main(env = process.env) {
  checkDbCredentials(env, { required: true });

  const ensured = ensureBetterAuthSecret({
    secret: env.BETTER_AUTH_SECRET,
    persistPath: env.AUTH_SECRET_FILE ?? DEFAULT_AUTH_SECRET_FILE,
    allowGenerate: true,
    required: true,
  });

  if (ensured.error || !ensured.secret) {
    throw new Error(
      ensured.error ??
        "BETTER_AUTH_SECRET must be set, or leave it unset in Docker to auto-generate one",
    );
  }

  if (ensured.source === "generated") {
    console.log(
      "Generated a unique BETTER_AUTH_SECRET and saved it for this deployment",
    );
  } else if (ensured.source === "file") {
    console.log("Loaded BETTER_AUTH_SECRET from deployment volume");
  } else {
    console.log("Better Auth secret OK");
  }

  const childEnv = {
    ...env,
    BETTER_AUTH_SECRET: ensured.secret,
  };

  run("npx", ["prisma", "migrate", "deploy"], childEnv);
  run(process.execPath, ["scripts/bootstrap.mjs"], childEnv);
  run("npm", ["run", "start"], childEnv);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    main(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
