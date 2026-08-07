/**
 * Guard helpers for destructive integration tests.
 *
 * A disposable test database is identified by name segments (split on
 * "_" and "-", lowercased): a segment exactly equal to "test" is required,
 * and any segment equal to "prod", "production", or "live" is rejected.
 */

const FORBIDDEN_SEGMENTS = new Set(["prod", "production", "live"]);

export function databaseNameFromUrl(url) {
  try {
    const pathname = new URL(url).pathname.replace(/^\//, "");
    return pathname.split("/")[0] ?? "";
  } catch {
    return "";
  }
}

export function isDisposableTestDatabaseName(name) {
  const segments = String(name)
    .toLowerCase()
    .split(/[_-]+/)
    .filter(Boolean);
  if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) {
    return false;
  }
  return segments.includes("test");
}
