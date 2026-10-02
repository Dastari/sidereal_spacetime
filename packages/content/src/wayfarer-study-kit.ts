/** Private captured study source. No catalog, fitting or pressure authority. */
import descriptor from "./wayfarer-study-kit.v1.json";
import { SHIP_KIT_SLOTS, type ShipKitSlot } from "./ship-kit";
import type { ShipVisualRole } from "./ship-visual";

export const WAYFARER_STUDY_KIT = descriptor;
export type StudyVector = [number, number, number];
export interface StudyPaletteEntry {
  slot: ShipKitSlot;
  sourceFamily:
    "plastic-light" | "plastic-dark" | "plastic-colour" | "emissive";
  /** Linear RGB; opaque alpha is one. */
  colour: StudyVector;
}
export interface StudyDuty {
  id: string;
  operation: string;
  stage: "backer" | "keel" | "main" | "upper" | "rim";
  role: ShipVisualRole;
  sourceMaterial: string;
  slot: ShipKitSlot;
  bounds: [number, number, number, number, number, number];
}
export interface StudySolid extends StudyDuty {
  vertices: StudyVector[];
  faces: number[][];
  loopNormals: StudyVector[];
  loopUVs: [number, number][];
  closed: true;
  oppositeDirectedEdges: true;
  signedVolumeMeters3: number;
}
export interface StudyTriangle {
  vertices: [StudyVector, StudyVector, StudyVector];
  normals: [StudyVector, StudyVector, StudyVector];
  uvs: [[number, number], [number, number], [number, number]];
  material: string;
}
interface StudyInputs {
  piece: string;
  snapshotManifestSha256: string;
  cellMeters: number;
  presentationOnly: true;
  inputFreeze: true;
  sourceInputs: Record<string, { bytes: number; sha256: string }>;
  palette: Record<string, StudyPaletteEntry>;
}
export interface WayfarerStudyCapture extends StudyInputs {
  schema: "sidereal.wayfarer-study-capture.v1";
  sourceCommit: string;
  adapterSha256: string;
  placement: StudyVector;
  groups: StudySolid[];
  sourceTriangles: StudyTriangle[];
  fallback: false;
}
export interface WayfarerStudySamples extends StudyInputs {
  schema: "sidereal.wayfarer-study-samples.v1";
  adapterSha256: string;
  captureFileSha256: string;
  samplingRule: "global-cell-centres/actual-triangle-halfspaces-or-closed-winding/closed-boundary";
  tolerances: {
    planeAndBoundaryMeters: number;
    boundaryBarycentric: number;
    winding: number;
  };
  boundaryPolicy: "numerically-qualified closed source boundary";
  duties: StudyDuty[];
  /** Exact union rows, exclusive X maximum, last ordered solid owns each cell. */
  runs: [number, number, number, number, number][];
  groups: {
    id: string;
    occupiedCentres: number;
    finalOwnedCentres: number;
    boundaryCentres: number;
    certifiedConvex: boolean;
    predicate: "actual-triangle-halfspaces" | "closed-triangle-winding";
    vanishedAtResolution: boolean;
    completelyOverwritten: boolean;
  }[];
  summary: {
    cells: number;
    runs: number;
    examined: number;
    vanishedGroups: number;
  };
}

const vector = (value: unknown, size: number): value is number[] =>
  Array.isArray(value) && value.length === size && value.every(Number.isFinite);
function inputs(value: unknown): asserts value is StudyInputs {
  if (!value || typeof value !== "object")
    throw Error("Missing captured study");
  const v = value as StudyInputs;
  if (
    v.piece !== descriptor.piece ||
    v.snapshotManifestSha256 !== descriptor.snapshotManifestSha256 ||
    v.cellMeters !== 1 / 16 ||
    v.presentationOnly !== true ||
    v.inputFreeze !== true
  )
    throw Error("Unadmitted study source/lattice");
  if (
    !v.sourceInputs ||
    Object.keys(v.sourceInputs).length !==
      Object.keys(descriptor.sourceInputs).length
  )
    throw Error("Incomplete study source pins");
  for (const [path, pin] of Object.entries(descriptor.sourceInputs))
    if (
      v.sourceInputs[path]?.sha256 !== pin.sha256 ||
      v.sourceInputs[path]?.bytes !== pin.bytes
    )
      throw Error("Changed study source: " + path);
  if (
    !v.palette ||
    Object.keys(v.palette).length !== Object.keys(descriptor.palette).length
  )
    throw Error("Incomplete study palette");
  for (const [name, expected] of Object.entries(descriptor.palette)) {
    const p = v.palette[name];
    if (
      !p ||
      p.slot !== expected.slot ||
      p.sourceFamily !== expected.sourceFamily ||
      !vector(p.colour, 3) ||
      p.colour.some((c, i) => c !== expected.colour[i])
    )
      throw Error("Changed study palette: " + name);
  }
}
function duty(v: StudyDuty, index: number, palette: StudyInputs["palette"]) {
  if (
    !v ||
    v.id !== `${descriptor.piece}:solid:${index}` ||
    !["box", "_sharp_box", "prism", "cyl", "prism_x"].includes(v.operation) ||
    !["backer", "keel", "main", "upper", "rim"].includes(v.stage) ||
    !["core", "frame", "plate", "service"].includes(v.role) ||
    !SHIP_KIT_SLOTS.includes(v.slot) ||
    !palette[v.sourceMaterial] ||
    palette[v.sourceMaterial].slot !== v.slot ||
    !vector(v.bounds, 6) ||
    v.bounds.some((c, i) => i < 3 && c >= v.bounds[i + 3])
  )
    throw Error("Unclassified study solid: " + index);
}
export function readWayfarerStudyCapture(value: unknown): WayfarerStudyCapture {
  inputs(value);
  const v = value as WayfarerStudyCapture;
  if (
    v.schema !== "sidereal.wayfarer-study-capture.v1" ||
    v.sourceCommit !== descriptor.sourceCommit ||
    v.adapterSha256 !== descriptor.captureAdapterSha256 ||
    v.fallback !== false ||
    !vector(v.placement, 3) ||
    v.placement.some((c, i) => c !== descriptor.placement[i]) ||
    !Array.isArray(v.groups) ||
    v.groups.length !== 317 ||
    !Array.isArray(v.sourceTriangles) ||
    v.sourceTriangles.length !== 12044
  )
    throw Error("Unadmitted complete study capture");
  for (const [index, g] of v.groups.entries()) {
    duty(g, index, v.palette);
    if (
      g.closed !== true ||
      g.oppositeDirectedEdges !== true ||
      !Number.isFinite(g.signedVolumeMeters3) ||
      g.signedVolumeMeters3 <= 0 ||
      !Array.isArray(g.vertices) ||
      !g.vertices.length ||
      g.vertices.some((p) => !vector(p, 3)) ||
      !Array.isArray(g.faces) ||
      !g.faces.length ||
      g.faces.some(
        (f) =>
          !Array.isArray(f) ||
          f.length < 3 ||
          f.some(
            (i) => !Number.isSafeInteger(i) || i < 0 || i >= g.vertices.length,
          ),
      )
    )
      throw Error("Incomplete closed study solid: " + index);
    const loops = g.faces.reduce((n, f) => n + f.length, 0);
    if (
      !Array.isArray(g.loopNormals) ||
      g.loopNormals.length !== loops ||
      g.loopNormals.some((p) => !vector(p, 3)) ||
      !Array.isArray(g.loopUVs) ||
      g.loopUVs.length !== loops ||
      g.loopUVs.some((p) => !vector(p, 2))
    )
      throw Error("Incomplete study corner data: " + index);
  }
  for (const t of v.sourceTriangles)
    if (
      !t ||
      !v.palette[t.material] ||
      !Array.isArray(t.vertices) ||
      t.vertices.length !== 3 ||
      t.vertices.some((p) => !vector(p, 3)) ||
      !Array.isArray(t.normals) ||
      t.normals.length !== 3 ||
      t.normals.some((p) => !vector(p, 3)) ||
      !Array.isArray(t.uvs) ||
      t.uvs.length !== 3 ||
      t.uvs.some((p) => !vector(p, 2))
    )
      throw Error("Incomplete authored study triangle");
  return v;
}
export function readWayfarerStudySamples(value: unknown): WayfarerStudySamples {
  inputs(value);
  const v = value as WayfarerStudySamples;
  if (
    v.schema !== "sidereal.wayfarer-study-samples.v1" ||
    v.captureFileSha256 !== descriptor.captureFileSha256 ||
    v.adapterSha256 !== descriptor.samplesAdapterSha256 ||
    v.samplingRule !==
      "global-cell-centres/actual-triangle-halfspaces-or-closed-winding/closed-boundary" ||
    v.tolerances?.planeAndBoundaryMeters !== 1e-10 ||
    v.tolerances.boundaryBarycentric !== 1e-10 ||
    v.tolerances.winding !== 1e-7 ||
    v.boundaryPolicy !== "numerically-qualified closed source boundary" ||
    !Array.isArray(v.duties) ||
    v.duties.length !== 317 ||
    !Array.isArray(v.runs) ||
    v.runs.length > 100000 ||
    !v.summary ||
    v.summary.runs !== v.runs.length ||
    !Number.isSafeInteger(v.summary.cells) ||
    v.summary.cells <= 0 ||
    v.summary.cells > 4000000
  )
    throw Error("Unadmitted sampled study");
  v.duties.forEach((d, i) => duty(d, i, v.palette));
  let total = 0,
    previous: WayfarerStudySamples["runs"][number] | undefined;
  for (const r of v.runs) {
    if (
      !Array.isArray(r) ||
      r.length !== 5 ||
      !r.every(Number.isSafeInteger) ||
      r[0] >= r[3] ||
      r.slice(0, 4).some((c) => Math.abs(c) > 8192) ||
      r[4] < 0 ||
      r[4] >= v.duties.length ||
      (previous &&
        (r[2] < previous[2] ||
          (r[2] === previous[2] &&
            (r[1] < previous[1] ||
              (r[1] === previous[1] && r[0] < previous[3])))))
    )
      throw Error("Invalid/overlapping global study run");
    total += r[3] - r[0];
    previous = r;
  }
  if (
    total !== v.summary.cells ||
    !Array.isArray(v.groups) ||
    v.groups.length !== v.duties.length ||
    v.groups.some(
      (g, i) =>
        g.id !== v.duties[i].id ||
        !Number.isSafeInteger(g.occupiedCentres) ||
        g.occupiedCentres < 0 ||
        !Number.isSafeInteger(g.finalOwnedCentres) ||
        g.finalOwnedCentres < 0 ||
        g.finalOwnedCentres > g.occupiedCentres ||
        !Number.isSafeInteger(g.boundaryCentres) ||
        g.boundaryCentres < 0 ||
        g.boundaryCentres > g.occupiedCentres ||
        typeof g.certifiedConvex !== "boolean" ||
        g.predicate !==
          (g.certifiedConvex
            ? "actual-triangle-halfspaces"
            : "closed-triangle-winding") ||
        g.vanishedAtResolution !== (g.occupiedCentres === 0) ||
        g.completelyOverwritten !==
          (g.occupiedCentres > 0 && g.finalOwnedCentres === 0),
    ) ||
    v.groups.reduce((n, g) => n + g.finalOwnedCentres, 0) !== total
  )
    throw Error("Incomplete sampled study census");
  return v;
}
