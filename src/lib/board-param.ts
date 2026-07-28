/** URL board param values shown to users. */
export type BoardUrlParam = "team" | "private";

/** Database BoardType for the shared board remains "company". */
export type BoardDbType = "company" | "private";

export function parseBoardParam(value: string | null | undefined): BoardUrlParam {
  if (value === "private") return "private";
  return "team";
}

export function boardParamToDbType(param: BoardUrlParam): BoardDbType {
  return param === "private" ? "private" : "company";
}

export function dbTypeToBoardParam(type: string): BoardUrlParam {
  return type === "private" ? "private" : "team";
}
