import { SenderError } from "spacetimedb/server";
import { WAYFARER_REPLACEMENT_OPERATOR } from "./wayfarer-replacement-operator";

/** The deployment identity that already owns the database and is the only
 * principal allowed to run ship maintenance (same identity as the existing
 * legacy Wayfarer replacement). Game accounts, including construction admins,
 * can never invoke these reducers. */
export const SHIP_OPERATOR = WAYFARER_REPLACEMENT_OPERATOR;

export function requireShipOperator(ctx: {
  sender: { toHexString(): string };
}) {
  if (ctx.sender.toHexString() !== SHIP_OPERATOR)
    throw new SenderError("Deployment operator required for ship maintenance");
}

const OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
export function requireOperationId(operationId: string) {
  if (!OPERATION_ID.test(operationId))
    throw new SenderError(
      "Operation ID must be 8-128 characters of letters, digits, '.', '_', ':' or '-'",
    );
}

/** Deterministic JSON for archive rows: bigint and identities become tagged
 * strings so the offline restore tooling can round-trip them exactly. */
export function archiveJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (typeof v === "bigint") return { $bigint: v.toString() };
    if (
      v &&
      typeof v === "object" &&
      typeof (v as { toHexString?: unknown }).toHexString === "function"
    )
      return { $identity: (v as { toHexString(): string }).toHexString() };
    if (v instanceof Uint8Array)
      return {
        $bytes: [...v].map((b) => b.toString(16).padStart(2, "0")).join(""),
      };
    return v;
  });
}

export type OperationLedger = {
  shipOperatorOperation: {
    operationId: {
      find(id: string):
        | {
            operationId: string;
            principal: { toHexString(): string };
            kind: string;
            request: string;
            summaryJson: string;
            createdMicros: bigint;
          }
        | null
        | undefined;
    };
    insert(row: {
      operationId: string;
      principal: unknown;
      kind: string;
      request: string;
      summaryJson: string;
      createdMicros: bigint;
    }): unknown;
  };
};

/** Returns true when this exact operation already committed (replay no-op).
 * Throws when the operation ID was used for a different request. */
export function priorOperation(
  db: OperationLedger,
  sender: { toHexString(): string },
  operationId: string,
  kind: string,
  request: string,
) {
  requireOperationId(operationId);
  const prior = db.shipOperatorOperation.operationId.find(operationId);
  if (!prior) return false;
  if (
    prior.principal.toHexString() !== sender.toHexString() ||
    prior.kind !== kind ||
    prior.request !== request
  )
    throw new SenderError(
      "Operation ID already used for a different ship maintenance request",
    );
  return true;
}

type ArchiveDb = {
  shipWipeArchive: {
    insert(row: {
      id: string;
      operationId: string;
      tableName: string;
      action: string;
      rowJson: string;
    }): unknown;
  };
};

/** Records a before-image in the private archive under a per-operation sequence. */
export function archiveRow(
  db: ArchiveDb,
  operationId: string,
  sequence: { next: number },
  table: string,
  action: "deleted" | "updated",
  row: unknown,
) {
  db.shipWipeArchive.insert({
    id: `${operationId}:${String(sequence.next++).padStart(7, "0")}`,
    operationId,
    tableName: table,
    action,
    rowJson: archiveJson(row),
  });
}

/** Map/system/Genesis state. Never written by ship maintenance; counted before
 * and after every mutating operation so evidence shows it unchanged. */
export const PRESERVED_MAP_TABLES = [
  "worldSystem",
  "systemBody",
  "bodyWorldMotion",
  "celestialMigrationReceipt",
  "systemZone",
  "systemMapDefinition",
  "fieldAsteroid",
  "systemMapEdit",
] as const;

export function countRows(db: unknown, table: string) {
  let count = 0;
  for (const _ of (
    (db as Record<string, { iter(): Iterable<unknown> }>)[table] as {
      iter(): Iterable<unknown>;
    }
  ).iter())
    count++;
  return count;
}

export function mapRowCounts(db: unknown) {
  const counts: Record<string, number> = {};
  for (const table of PRESERVED_MAP_TABLES) counts[table] = countRows(db, table);
  return counts;
}
