/** Exact authored dorsal exterior; deck content and authoritative mounts remain unchanged. */
import type {
  AuthoredStudyInstance,
  AuthoredStudyPaletteEntry,
  AuthoredStudyPiece,
} from "./wayfarer-authored-study";

export const WAYFARER_AUTHORED_FLIGHT_PINS = {
  descriptorSha256:
    "647010bf154d377ba782748c796afb8839ece1b5fc31fa78e8f92d0b59fc593c",
  sourceManifestSha256:
    "03bede58180b1b24a0643dbab44bcff0ce882ab299c9d48bb5a39d39c637466d",
  sourceLayoutSha256:
    "3c0175cd220661ab6b0a281dab5e0ce219922d997ff0d1eaff0623e6f838a48c",
} as const;

const ROLES = new Set([
  "canopy",
  "engine-pod",
  "hull-bay",
  "hull-corner",
  "livery",
  "nose",
  "structure",
  "hull-upper",
  "roof-skin",
  "roof-shoulder",
  "roof-module",
  "roof-plinth",
  "roof-joint",
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
  if (!condition) throw Error(`Invalid authored flight exterior: ${message}`);
}
function record(value: unknown): Record<string, unknown> {
  requireValue(
    value && typeof value === "object" && !Array.isArray(value),
    "object",
  );
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  requireValue(Array.isArray(value), "array");
  return value;
}
function text(value: unknown): string {
  requireValue(typeof value === "string" && value.length > 0, "text");
  return value;
}
function triple(value: unknown): [number, number, number] {
  const row = array(value);
  requireValue(
    row.length === 3 &&
      row.every((v) => typeof v === "number" && Number.isFinite(v)),
    "finite triple",
  );
  return row as [number, number, number];
}
function matrix(value: unknown): number[][] {
  const rows = array(value).map(array);
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
  const d =
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  requireValue(Number.isFinite(d) && Math.abs(d) > 1e-12, "nonsingular matrix");
  return m.map((row) => row.slice());
}

/** Caller verifies the exact descriptor bytes against descriptorSha256 before parsing. */
export function readWayfarerAuthoredFlight(value: unknown) {
  const descriptor = record(value);
  requireValue(
    descriptor.schema === "sidereal.wayfarer-authored-flight.r001",
    "schema",
  );
  for (const key of ["sourceManifestSha256", "sourceLayoutSha256"] as const)
    requireValue(descriptor[key] === WAYFARER_AUTHORED_FLIGHT_PINS[key], key);
  const pieceIds = new Set<string>(),
    files = new Set<string>();
  const pieces: AuthoredStudyPiece[] = array(descriptor.pieces).map((value) => {
    const row = record(value),
      id = text(row.id),
      file = text(row.file),
      sha256 = text(row.sha256);
    requireValue(!pieceIds.has(id) && !files.has(file), "duplicate piece/file");
    requireValue(
      /^glb\/[a-zA-Z0-9_+./@-]+\.glb$/.test(file) &&
        !file.split("/").includes(".."),
      "local GLB path",
    );
    requireValue(/^[a-f0-9]{64}$/.test(sha256), "GLB hash");
    requireValue(
      row.frame ===
        (id.startsWith("unique.") ? "ship-node-baked" : "piece-local"),
      "piece frame",
    );
    requireValue(
      Number.isSafeInteger(row.triangles) && (row.triangles as number) > 0,
      "triangle count",
    );
    const boundsMin = triple(row.boundsMin),
      boundsMax = triple(row.boundsMax),
      materials = array(row.materials).map(text);
    requireValue(
      boundsMin.every((v, axis) => v <= boundsMax[axis]) &&
        materials.length > 0 &&
        new Set(materials).size === materials.length,
      "bounds/materials",
    );
    pieceIds.add(id);
    files.add(file);
    return {
      id,
      file,
      sha256,
      triangles: row.triangles as number,
      frame: row.frame as AuthoredStudyPiece["frame"],
      boundsMin,
      boundsMax,
      materials,
    };
  });
  requireValue(pieces.length === 98, "complete exterior pieces");
  const byId = new Map(pieces.map((piece) => [piece.id, piece])),
    objects = new Set<string>(),
    used = new Set<string>();
  const instances: AuthoredStudyInstance[] = array(descriptor.instances).map(
    (value) => {
      const row = record(value),
        object = text(row.object),
        piece = text(row.piece),
        role = text(row.role),
        source = byId.get(piece);
      requireValue(
        source && !objects.has(object) && ROLES.has(role) && row.room === null,
        "exterior placement",
      );
      requireValue(
        row.frame === source.frame &&
          row.trueScale === false &&
          typeof row.mirrored === "boolean",
        "placement frame",
      );
      const selected = matrix(row.matrix),
        originalMatrix = matrix(row.originalMatrix);
      if (source.frame === "ship-node-baked")
        requireValue(
          selected.every((r, i) => r.every((v, j) => v === Number(i === j))),
          "baked node identity",
        );
      else
        requireValue(
          selected.every((r, i) =>
            r.every((v, j) => v === originalMatrix[i][j]),
          ),
          "unaltered source placement",
        );
      objects.add(object);
      used.add(piece);
      return {
        object,
        piece,
        role,
        room: null,
        matrix: selected,
        originalMatrix,
        frame: source.frame,
        trueScale: false,
        mirrored: row.mirrored,
      };
    },
  );
  requireValue(
    instances.length === 533 &&
      used.size === pieces.length &&
      instances.reduce(
        (sum, row) => sum + byId.get(row.piece)!.triangles,
        0,
      ) === 503388,
    "complete exterior placements",
  );
  const palette: Record<string, AuthoredStudyPaletteEntry> = {};
  for (const [name, value] of Object.entries(record(descriptor.palette))) {
    const row = record(value),
      family = text(row.family),
      colour = triple(row.colour);
    requireValue(
      FAMILIES.has(family) &&
        colour.every((v) => v >= 0 && v <= 1) &&
        typeof row.strength === "number" &&
        Number.isFinite(row.strength) &&
        row.strength >= 0,
      "palette",
    );
    palette[name] = {
      kind: text(row.kind),
      family,
      colour,
      strength: row.strength,
    };
  }
  requireValue(Object.keys(palette).length === 77, "complete source palette");
  return { pieces, instances, palette };
}
