import type {
  AuthoredStudyPaletteEntry,
  AuthoredStudyPiece,
} from "./wayfarer-authored-study";

/** Native source-derived surfaces. This manifest grants no physical authority. */
export const AUTHORED_TEMPLATE_KIT_BASE =
  "/assets/ship-study/template-authored-r001/";
export const AUTHORED_TEMPLATE_KIT_REVISION = "template-authored-r001";
export const AUTHORED_TEMPLATE_KIT_MANIFEST_SHA256 =
  "554c46e354d719460d0a730e06822f71fe5d23932fb779012344fa601df88cec";

export const AUTHORED_TEMPLATE_SHAPES = [
  "square",
  "slope1",
  "slope2",
  "slope3",
  "slope4",
  "arc1",
  "arc2",
  "arc3",
  "arc4",
  "arc1c",
  "arc2c",
  "arc3c",
  "arc4c",
] as const;

export type AuthoredTemplateShape = (typeof AUTHORED_TEMPLATE_SHAPES)[number];
export type AuthoredTemplateFamily =
  "floor" | "roof" | "hull" | "wall" | "post" | "beam" | "canopy";
export interface AuthoredTemplateSource {
  readonly collection: string;
  readonly id: string;
  readonly file: string;
  readonly sha256: string;
}
export interface AuthoredTemplatePiece extends AuthoredStudyPiece {
  readonly frame: "piece-local";
  readonly family: AuthoredTemplateFamily;
  readonly source: readonly AuthoredTemplateSource[];
  readonly shape?: AuthoredTemplateShape;
  readonly normalizedHeight?: boolean;
}
export interface AuthoredTemplateKit {
  readonly revision: typeof AUTHORED_TEMPLATE_KIT_REVISION;
  readonly pieces: readonly AuthoredTemplatePiece[];
  readonly palette: Readonly<
    Record<
      string,
      AuthoredStudyPaletteEntry & { readonly sourceSlotName?: string }
    >
  >;
  /** Decoded by the renderer's common authored-asset-lighting/v1 reader. */
  readonly lighting?: unknown;
}

const FAMILIES = new Set<AuthoredTemplateFamily>([
  "floor",
  "roof",
  "hull",
  "wall",
  "post",
  "beam",
  "canopy",
]);
const SURFACES = new Set([
  "emissive",
  "fabric",
  "glass",
  "metal",
  "plastic-colour",
  "plastic-dark",
  "plastic-deck",
  "plastic-light",
  "rubber",
]);
function requireValue(value: unknown, reason: string): asserts value {
  if (!value) throw Error(`Invalid authored template kit: ${reason}`);
}
function object(value: unknown): Record<string, unknown> {
  requireValue(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "object",
  );
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  requireValue(typeof value === "string" && value.length > 0, "text");
  return value;
}
function hash(value: unknown): string {
  const result = text(value);
  requireValue(/^[a-f0-9]{64}$/.test(result), "SHA-256 pin");
  return result;
}
function triple(value: unknown): [number, number, number] {
  requireValue(
    Array.isArray(value) &&
      value.length === 3 &&
      value.every((n) => typeof n === "number" && Number.isFinite(n)),
    "finite triple",
  );
  return value as [number, number, number];
}
function array(value: unknown): unknown[] {
  requireValue(Array.isArray(value), "array");
  return value;
}

/** Rejects incomplete or repathed packs before requesting any mesh bytes. */
export function readAuthoredTemplateKit(input: unknown): AuthoredTemplateKit {
  const doc = object(input);
  requireValue(doc.schema === "sidereal.authored-template-kit/v1", "schema");
  requireValue(doc.revision === AUTHORED_TEMPLATE_KIT_REVISION, "revision");
  const palette: Record<
    string,
    AuthoredStudyPaletteEntry & { readonly sourceSlotName?: string }
  > = {};
  for (const [name, entry] of Object.entries(object(doc.palette))) {
    const value = object(entry);
    const family = text(value.family);
    const colour = triple(value.colour);
    requireValue(SURFACES.has(family), "surface family");
    requireValue(
      colour.every((c) => c >= 0 && c <= 1),
      "palette colour",
    );
    requireValue(
      typeof value.strength === "number" &&
        Number.isFinite(value.strength) &&
        value.strength >= 0,
      "emission strength",
    );
    palette[name] = {
      kind: text(value.kind),
      family,
      colour,
      strength: value.strength,
      ...(value.sourceSlotName !== undefined
        ? { sourceSlotName: text(value.sourceSlotName) }
        : {}),
    };
  }
  const ids = new Set<string>();
  const pieces = array(doc.pieces).map((entry): AuthoredTemplatePiece => {
    const p = object(entry);
    const id = text(p.id);
    const file = text(p.file);
    requireValue(/^[a-z0-9.]+$/.test(id) && !ids.has(id), "piece identity");
    requireValue(file === `${id}.glb`, "piece-local file");
    requireValue(p.frame === "piece-local", "piece-local frame");
    const family = text(p.family) as AuthoredTemplateFamily;
    requireValue(FAMILIES.has(family), "piece family");
    requireValue(
      Number.isInteger(p.triangles) && (p.triangles as number) > 0,
      "triangle count",
    );
    const boundsMin = triple(p.boundsMin);
    const boundsMax = triple(p.boundsMax);
    requireValue(
      boundsMin.every((v, i) => v < boundsMax[i]),
      "piece bounds",
    );
    const materials = array(p.materials).map(text);
    requireValue(materials.length > 0, "native materials");
    const source = array(p.source).map((entry): AuthoredTemplateSource => {
      const s = object(entry);
      const file = text(s.file);
      requireValue(
        !file.startsWith("/") && !file.split("/").includes(".."),
        "source path",
      );
      return {
        collection: text(s.collection),
        id: text(s.id),
        file,
        sha256: hash(s.sha256),
      };
    });
    requireValue(source.length > 0, "source provenance");
    if (p.shape !== undefined)
      requireValue(
        AUTHORED_TEMPLATE_SHAPES.includes(p.shape as AuthoredTemplateShape),
        "shape family",
      );
    ids.add(id);
    return {
      id,
      file,
      sha256: hash(p.sha256),
      triangles: p.triangles as number,
      frame: "piece-local",
      boundsMin,
      boundsMax,
      materials,
      source,
      family,
      ...(p.shape !== undefined
        ? { shape: p.shape as AuthoredTemplateShape }
        : {}),
      ...(p.normalizedHeight === true ? { normalizedHeight: true } : {}),
    };
  });
  for (const shape of AUTHORED_TEMPLATE_SHAPES)
    for (const id of [
      `floor.${shape}.plate`,
      `floor.${shape}.grate`,
      `roof.${shape}.plate`,
      `roof.${shape}.grate`,
      `roof.${shape}.light`,
      `roof.${shape}.accent`,
    ])
      requireValue(ids.has(id), `missing ${id}`);
  for (const variant of ["a", "b", "c"]) {
    requireValue(ids.has(`hull.straight.${variant}`), "straight facade");
    requireValue(ids.has(`wall.straight.${variant}`), "partition facade");
    for (const radius of [1, 2, 3, 4])
      for (const concave of ["", "c"])
        requireValue(
          ids.has(`hull.arc${radius}${concave}.${variant}`),
          "curved facade",
        );
  }
  for (const id of ["post.normal", "beam.normal", "canopy.straight"])
    requireValue(ids.has(id), `missing ${id}`);
  for (const module of ["vent", "hatch", "fan", "box"])
    requireValue(ids.has(`roof.square.${module}`), "native dorsal module");
  return {
    revision: AUTHORED_TEMPLATE_KIT_REVISION,
    pieces,
    palette,
    ...(doc.lighting !== undefined ? { lighting: doc.lighting } : {}),
  };
}
