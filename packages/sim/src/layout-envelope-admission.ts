import { BOUNDARY_TREATMENTS } from "@sidereal/content/layout-boundary-treatments";
import type { LayoutStructureV2 } from "@sidereal/content/layout-structure";

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 160) =>
  typeof v === "string" && v.length > 0 && v.length <= max;
const integer = (v: unknown, min = -8192, max = 8192) =>
  Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
const point = (v: unknown) =>
  Array.isArray(v) && v.length === 2 && v.every((n) => integer(n));
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));

/** Checks only v2 extension fields; the caller validates inherited v1 fields too. */
export function readEnvelopeFields(
  value: Record<string, unknown>,
): LayoutStructureV2 {
  const fail = (reason: string): never => {
    throw Error(`Invalid boundary-treatment contract: ${reason}`);
  };
  if (value.wallConvention !== "inset250-v1")
    fail("unsupported wall convention");
  if (
    !Array.isArray(value.boundaryTreatments) ||
    value.boundaryTreatments.length > 8192 ||
    !Array.isArray(value.navigationReservations) ||
    value.navigationReservations.length > 2048 ||
    !Array.isArray(value.deckProfiles) ||
    value.deckProfiles.length > 8
  )
    fail("extension budget exceeded");
  const ids = new Set<string>();
  for (const v of value.boundaryTreatments as unknown[]) {
    if (
      !object(v) ||
      !keys(v, [
        "id",
        "deckId",
        "source",
        "sourceAnchorId",
        "a",
        "b",
        "treatment",
        "reservationSide",
        "heightUnits",
        "native",
      ]) ||
      !text(v.id) ||
      !text(v.deckId) ||
      !text(v.sourceAnchorId, 512) ||
      typeof v.source !== "string" ||
      !["perimeter", "partition"].includes(v.source) ||
      !point(v.a) ||
      !point(v.b) ||
      JSON.stringify(v.a) === JSON.stringify(v.b) ||
      !BOUNDARY_TREATMENTS.some((t) => t === v.treatment)
    )
      fail("invalid treatment span");
    const row = v as Record<string, unknown>;
    if (
      row.reservationSide !== undefined &&
      (row.source !== "partition" ||
        !["left", "right", "center"].some(
          (side) => side === row.reservationSide,
        ))
    )
      fail("reservation side is only an explicit internal partition choice");
    if (row.heightUnits !== undefined && !integer(row.heightUnits, 1))
      fail("invalid treatment height");
    if (
      row.native !== undefined &&
      (!object(row.native) ||
        !keys(row.native, ["id", "revision", "sha256"]) ||
        !text(row.native.id) ||
        !text(row.native.revision) ||
        typeof row.native.sha256 !== "string" ||
        !/^[0-9a-f]{64}$/.test(row.native.sha256))
    )
      fail("invalid native pin");
    if (ids.has(String(row.id))) fail("duplicate treatment identity");
    ids.add(String(row.id));
  }
  ids.clear();
  for (const v of value.navigationReservations as unknown[]) {
    if (
      !object(v) ||
      !keys(v, ["id", "deckId", "vertices", "reason"]) ||
      !text(v.id) ||
      !text(v.deckId) ||
      !Array.isArray(v.vertices) ||
      v.vertices.length < 3 ||
      v.vertices.length > 16 ||
      !v.vertices.every(point) ||
      typeof v.reason !== "string" ||
      !["nonwalkable", "insufficient-headroom", "reserved-access"].includes(
        v.reason,
      )
    )
      fail("invalid navigation reservation");
    const row = v as { id: string };
    if (ids.has(row.id)) fail("duplicate navigation identity");
    ids.add(row.id);
  }
  ids.clear();
  for (const v of value.deckProfiles as unknown[]) {
    if (
      !object(v) ||
      !keys(v, [
        "deckId",
        "floorThickness",
        "clearHeight",
        "roofThickness",
        "serviceVoid",
        "pitch",
      ]) ||
      !text(v.deckId) ||
      ![v.floorThickness, v.clearHeight, v.roofThickness, v.pitch].every((n) =>
        integer(n, 1),
      ) ||
      !integer(v.serviceVoid, 0)
    )
      fail("invalid deck profile");
    const row = v as unknown as LayoutStructureV2["deckProfiles"][number];
    if (
      row.pitch !==
      row.floorThickness + row.clearHeight + row.roofThickness + row.serviceVoid
    )
      fail("deck pitch does not equal its component heights");
    if (ids.has(row.deckId)) fail("duplicate deck profile");
    ids.add(row.deckId);
  }
  return value as unknown as LayoutStructureV2;
}
