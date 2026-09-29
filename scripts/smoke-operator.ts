import { execFileSync } from "node:child_process";

/** Call an operator-only reducer on the isolated smoke database with the
 * deployment identity from the linked CLI config. Never used against live. */
export function operatorCall(
  host: string,
  database: string,
  reducer: string,
  ...args: string[]
) {
  if (!database.endsWith("-smoke") || new URL(host).port === "3100")
    throw Error("Operator smoke calls require an isolated -smoke database");
  execFileSync(
    ".tools/spacetime/spacetime",
    [
      "--root-dir=.tools/spacetime",
      "call",
      "--server",
      host,
      "--yes",
      "--no-config",
      database,
      reducer,
      ...args,
    ],
    { stdio: "inherit" },
  );
}
