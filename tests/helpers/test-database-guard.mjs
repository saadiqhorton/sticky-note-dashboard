/**
 * Guard helpers for destructive integration tests.
 *
 * A disposable test database is identified by name segments (split on
 * "_" and "-", lowercased): a segment exactly equal to "test" is required,
 * and any production-like segment (optionally numbered, e.g. "prod2") is
 * rejected.
 *
 * Name checks alone cannot prove disposability — callers must also refuse to
 * run when the target already holds company boards or company-board notes.
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

export function assertEmptyCompanyBoardFixture(
  companyBoardCount,
  companyBoardNoteCount,
  databaseName,
) {
  if (companyBoardCount > 0 || companyBoardNoteCount > 0) {
    throw new Error(
      `Refusing to run against database "${databaseName}": it already holds ${companyBoardCount} company board(s) and ${companyBoardNoteCount} company-board note(s). This test requires an empty disposable database (it never deletes Team boards).`,
    );
  }
}
