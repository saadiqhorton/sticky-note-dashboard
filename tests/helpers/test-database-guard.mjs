/**
 * Guard helpers for destructive integration tests.
 *
 * A disposable test database is identified by name segments (split on
 * "_" and "-", lowercased): a segment exactly equal to "test" is required,
 * and any production-like segment (optionally numbered, e.g. "prod2") is
 * rejected.
 */

const FORBIDDEN_SEGMENT =
  /^(prod|production|prd|live|staging|stage|preprod|uat|demo|sandbox)\d*$/;

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
  if (segments.some((segment) => FORBIDDEN_SEGMENT.test(segment))) {
    return false;
  }
  return segments.includes("test");
}

export function assertNoCompanyBoardNotes(noteCount, databaseName) {
  if (noteCount > 0) {
    throw new Error(
      `Refusing to run against database "${databaseName}": it already holds ${noteCount} note(s) on a company board. This test deletes every company board; point it at an empty disposable database.`,
    );
  }
}
