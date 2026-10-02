/** Private authored-surface trial; no authority, catalog or damage migration. */
export type AuthoredStudyFrame = "piece-local" | "ship-node-baked";
export type AuthoredStudyMatrix = readonly (readonly number[])[];

export interface AuthoredStudyPiece {
  readonly id: string;
  readonly file: string;
  readonly sha256: string;
  readonly triangles: number;
  readonly frame: AuthoredStudyFrame;
  readonly boundsMin: readonly [number, number, number];
  readonly boundsMax: readonly [number, number, number];
  readonly materials: readonly string[];
}

export interface AuthoredStudyInstance {
  readonly object: string;
  readonly piece: string;
  readonly role: string;
  readonly room: string | null;
  /** Author Z-up column-vector rows. Unique baked nodes use external identity. */
  readonly matrix: AuthoredStudyMatrix;
  readonly originalMatrix: AuthoredStudyMatrix;
  readonly frame: AuthoredStudyFrame;
  readonly trueScale: boolean;
  /** Provenance only: the signed matrix already carries its reflection. */
  readonly mirrored: boolean;
}

export interface AuthoredStudyPaletteEntry {
  readonly kind: string;
  readonly family: string;
  readonly colour: readonly [number, number, number];
  readonly strength: number;
}

export interface WayfarerAuthoredStudy {
  readonly pieces: readonly AuthoredStudyPiece[];
  readonly instances: readonly AuthoredStudyInstance[];
  readonly palette: Readonly<Record<string, AuthoredStudyPaletteEntry>>;
  readonly omittedFX: readonly {
    readonly object: string;
    readonly piece: string;
  }[];
  readonly sourcePins: Readonly<Record<string, string>>;
}

export const WAYFARER_AUTHORED_STUDY_PINS = {
  manifestSha256:
    "9afe368702b81891905165fe2adef6c860f23b0d3ce5672e5bf1b6ad93a4d855",
  layoutSha256:
    "c4cd70c8742943f625d068be45f19d72ee14596483410f1bc9e11f70bab9cb34",
  snapshotSha256:
    "bd85308e7280eb61438d442fe24ddb43f7d8d14d294dc26f3e1a0ac3a89b51f7",
} as const;

type RecordValue = Record<string, unknown>;
const ROLES = new Set([
  "bulkhead",
  "canopy",
  "door-light",
  "door-post",
  "engine-pod",
  "floor",
  "header-light",
  "hull-bay",
  "hull-corner",
  "livery",
  "nose",
  "partition",
  "room-content",
  "structure",
  "threshold",
  "wall-dressing",
]);
const FAMILIES = new Set([
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
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid authored study: ${message}`);
}
function record(value: unknown): RecordValue {
  requireValue(
    value && typeof value === "object" && !Array.isArray(value),
    "object",
  );
  return value as RecordValue;
}
function array(value: unknown): unknown[] {
  requireValue(Array.isArray(value), "array");
  return value;
}
function text(value: unknown): string {
  requireValue(typeof value === "string" && value.length > 0, "text");
  return value;
}
function hash(value: unknown): string {
  const result = text(value);
  requireValue(/^[a-f0-9]{64}$/.test(result), "SHA-256");
  return result;
}
function triple(value: unknown): [number, number, number] {
  const values = array(value);
  requireValue(
    values.length === 3 &&
      values.every((v) => typeof v === "number" && Number.isFinite(v)),
    "finite triple",
  );
  return [values[0] as number, values[1] as number, values[2] as number];
}
function matrix(value: unknown): number[][] {
  const rows = array(value).map((row) => array(row).slice());
  requireValue(
    rows.length === 4 &&
      rows.every(
        (row) =>
          row.length === 4 &&
          row.every((v) => typeof v === "number" && Number.isFinite(v)),
      ),
    "finite matrix",
  );
  const m = rows as number[][];
  requireValue(
    m[3][0] === 0 && m[3][1] === 0 && m[3][2] === 0 && m[3][3] === 1,
    "affine matrix",
  );
  const determinant =
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  requireValue(
    Number.isFinite(determinant) && Math.abs(determinant) > 1e-12,
    "nonsingular matrix",
  );
  return m;
}
function identity(): number[][] {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

/** Caller verifies exact manifest/layout bytes against these pins BEFORE parsing. */
export function readWayfarerAuthoredStudy(
  manifestValue: unknown,
  layoutValue: unknown,
  descriptorValue: unknown,
): WayfarerAuthoredStudy {
  const manifest = record(manifestValue),
    layout = record(layoutValue),
    descriptor = record(descriptorValue);
  requireValue(
    descriptor.schema === "sidereal.wayfarer-authored-study.r001",
    "descriptor schema",
  );
  for (const key of Object.keys(
    WAYFARER_AUTHORED_STUDY_PINS,
  ) as (keyof typeof WAYFARER_AUTHORED_STUDY_PINS)[]) {
    requireValue(descriptor[key] === WAYFARER_AUTHORED_STUDY_PINS[key], key);
  }
  requireValue(manifest.theme === "federation", "theme");
  requireValue(
    layout.frame ===
      "ship: +X bow, +Y port (near side), +Z up, metres; deck top z = 0",
    "authoring frame",
  );
  const reusable = array(manifest.pieces),
    unique = array(manifest.unique);
  requireValue(
    reusable.length === 177 && unique.length === 11,
    "complete piece cohort",
  );
  const ids = new Set<string>(),
    files = new Set<string>();
  const placementsExpected = new Map<string, number>();
  const pieces: AuthoredStudyPiece[] = [...reusable, ...unique].map(
    (value, index) => {
      const row = record(value),
        id = text(row.id),
        file = text(row.file);
      const baked = index >= reusable.length;
      requireValue(!ids.has(id) && !files.has(file), "duplicate piece/file");
      requireValue(
        /^glb\/[a-zA-Z0-9_+./@-]+\.glb$/.test(file) &&
          !file.split("/").includes(".."),
        "local GLB path",
      );
      requireValue(baked === id.startsWith("unique."), "unique piece ID");
      if (baked)
        requireValue(
          row.frame === "ship (object transform kept in the GLB node)",
          "baked node frame",
        );
      requireValue(
        Number.isSafeInteger(row.triangles) && (row.triangles as number) > 0,
        "triangle count",
      );
      const boundsMin = triple(row.bounds_min),
        boundsMax = triple(row.bounds_max);
      requireValue(
        boundsMin.every((v, axis) => v <= boundsMax[axis]),
        "ordered bounds",
      );
      const materials = array(row.materials).map(text);
      requireValue(
        materials.length > 0 && new Set(materials).size === materials.length,
        "material names",
      );
      const count = baked ? 1 : row.placements;
      requireValue(
        Number.isSafeInteger(count) && (count as number) > 0,
        "piece placement count",
      );
      placementsExpected.set(id, count as number);
      ids.add(id);
      files.add(file);
      return {
        id,
        file,
        sha256: hash(row.sha256),
        triangles: row.triangles as number,
        frame: baked ? "ship-node-baked" : "piece-local",
        boundsMin,
        boundsMax,
        materials,
      };
    },
  );
  const byId = new Map(pieces.map((piece) => [piece.id, piece]));
  const objects = new Set<string>(),
    seen = new Map<string, number>();
  const instances: AuthoredStudyInstance[] = [],
    omittedFX: { object: string; piece: string }[] = [];
  const rows = array(layout.placements);
  requireValue(rows.length === 465, "complete layout cohort");
  for (const value of rows) {
    const row = record(value),
      object = text(row.object),
      pieceId = text(row.piece);
    requireValue(!objects.has(object), "duplicate placement object");
    objects.add(object);
    const originalMatrix = matrix(row.matrix);
    if (pieceId === "fx.engine_glow" || pieceId === "fx.engine_plume") {
      requireValue(
        row.role === "fx" &&
          row.matrix_true_scale === undefined &&
          row.mirrored === undefined,
        "declared FX row",
      );
      omittedFX.push({ object, piece: pieceId });
      continue;
    }
    const piece = byId.get(pieceId);
    requireValue(piece, `unknown piece ${pieceId}`);
    const role =
      row.role === null && pieceId === "unique.DECK_floor_base"
        ? "floor"
        : text(row.role);
    requireValue(ROLES.has(role), "known role");
    requireValue(
      row.room === null || typeof row.room === "string",
      "room label",
    );
    requireValue(
      row.mirrored === undefined || typeof row.mirrored === "boolean",
      "mirror provenance",
    );
    const trueScale = row.matrix_true_scale !== undefined;
    requireValue(!trueScale || role === "room-content", "true-scale prop role");
    requireValue(
      piece.frame !== "ship-node-baked" || !trueScale,
      "baked unique cannot get prop scale",
    );
    const selected = trueScale
      ? matrix(row.matrix_true_scale)
      : originalMatrix.map((r) => r.slice());
    instances.push({
      object,
      piece: pieceId,
      role,
      room: row.room as string | null,
      matrix: piece.frame === "ship-node-baked" ? identity() : selected,
      originalMatrix,
      frame: piece.frame,
      trueScale,
      mirrored: row.mirrored === true,
    });
    seen.set(pieceId, (seen.get(pieceId) ?? 0) + 1);
  }
  requireValue(
    instances.length === 459 && omittedFX.length === 6,
    "complete mesh/FX cohort",
  );
  for (const [id, count] of placementsExpected)
    requireValue(seen.get(id) === count, `placement count ${id}`);
  requireValue(
    omittedFX.filter((row) => row.piece === "fx.engine_glow").length === 3 &&
      omittedFX.filter((row) => row.piece === "fx.engine_plume").length === 3,
    "FX counts",
  );
  requireValue(
    instances.filter((row) => row.trueScale).length === 72 &&
      instances.filter((row) => row.mirrored).length === 14,
    "scale/mirror cohort",
  );
  const palette: Record<string, AuthoredStudyPaletteEntry> = {};
  for (const [name, value] of Object.entries(record(manifest.palette))) {
    const row = record(value),
      family = text(row.family),
      colour = triple(row.colour);
    requireValue(
      FAMILIES.has(family) && colour.every((v) => v >= 0 && v <= 1),
      "known palette colour/family",
    );
    requireValue(
      typeof row.strength === "number" &&
        Number.isFinite(row.strength) &&
        row.strength >= 0,
      "emission strength",
    );
    palette[name] = {
      kind: text(row.kind),
      family,
      colour,
      strength: row.strength,
    };
  }
  requireValue(Object.keys(palette).length === 77, "complete palette");
  const sourcePins: Record<string, string> = {};
  for (const [path, value] of Object.entries(record(descriptor.sourcePins)))
    sourcePins[path] = hash(value);
  requireValue(
    sourcePins["export/manifest.json"] ===
      WAYFARER_AUTHORED_STUDY_PINS.manifestSha256 &&
      sourcePins["export/layout.json"] ===
        WAYFARER_AUTHORED_STUDY_PINS.layoutSha256,
    "metadata provenance pins",
  );
  return { pieces, instances, palette, omittedFX, sourcePins };
}
