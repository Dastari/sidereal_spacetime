import type { LayoutStructure } from "@sidereal/content/layout-structure";
import { readEnvelopeFields } from "./layout-envelope-admission";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 160) =>
  typeof v === "string" && v.length > 0 && v.length <= max;
const integer = (v: unknown, min = -8192, max = 8192) =>
  Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
/** Bounded admission before any geometry allocation. Unknown future semantics fail closed. */
export function readLayoutStructure(value: unknown): LayoutStructure {
  if (object(value) && value.schema === "sidereal.layout-structure.v2") {
    const {
      wallConvention: _wall,
      boundaryTreatments: _boundaries,
      navigationReservations: _navigation,
      deckProfiles: _profiles,
      ...base
    } = value;
    readLayoutStructure({ ...base, schema: "sidereal.layout-structure.v1" });
    return readEnvelopeFields(value);
  }
  const fail = (): never => {
    throw new Error(
      "Invalid structural authoring contract or unsupported revision",
    );
  };
  if (
    !object(value) ||
    value.schema !== "sidereal.layout-structure.v1" ||
    ![16, 32, 64].includes(value.grid as number) ||
    (object(value) &&
      Object.keys(value).some(
        (k) =>
          ![
            "schema",
            "hull",
            "grid",
            "wallFaces",
            "tileStyles",
            "armor",
          ].includes(k),
      ))
  )
    fail();
  const v = value as Record<string, unknown>,
    h = v.hull;
  if (
    !object(h) ||
    !text(h.id) ||
    !text(h.revision) ||
    !text(h.name) ||
    ![h.width, h.length, h.height].every((n) => integer(n, 1, 8192)) ||
    !Array.isArray(h.origin) ||
    h.origin.length !== 3 ||
    !h.origin.every((n) => integer(n))
  )
    fail();
  if (
    !object(v.wallFaces) ||
    Object.keys(v.wallFaces).length > 8192 ||
    !object(v.tileStyles) ||
    Object.keys(v.tileStyles).length > 2048
  )
    fail();
  for (const [id, f] of Object.entries(v.wallFaces as Record<string, unknown>))
    if (
      !text(id, 512) ||
      !object(f) ||
      Object.keys(f).some((k) => !["left", "right"].includes(k)) ||
      Object.values(f).some((x) => !text(x))
    )
      fail();
  for (const [id, f] of Object.entries(
    v.tileStyles as Record<string, unknown>,
  )) {
    if (
      !text(id) ||
      !object(f) ||
      Object.keys(f).some((k) => !["material", "model"].includes(k))
    )
      fail();
    const style = f as Record<string, unknown>;
    if (style.material !== undefined && !text(style.material)) fail();
    if (
      style.model !== undefined &&
      (!object(style.model) ||
        !text(style.model.assetId) ||
        !text(style.model.revision))
    )
      fail();
  }
  if (!Array.isArray(v.armor) || v.armor.length > 2000) fail();
  const ids = new Set<string>();
  for (const a of v.armor as unknown[]) {
    if (
      !object(a) ||
      !text(a.id) ||
      !text(a.deckId) ||
      !text(a.boundaryId, 512) ||
      !integer(a.bottom) ||
      !integer(a.top) ||
      Number(a.top) <= Number(a.bottom) ||
      !Array.isArray(a.footprint) ||
      a.footprint.length < 3 ||
      a.footprint.length > 8 ||
      a.footprint.some(
        (p) =>
          !Array.isArray(p) || p.length !== 2 || !p.every((n) => integer(n)),
      )
    )
      fail();
    const id = (a as { id: string }).id;
    if (ids.has(id)) fail();
    ids.add(id);
  }
  return value as LayoutStructure;
}
