/** Exact retained-kit glass retired by the candidate's sampled cockpit aperture. */
import type {
  ShipVisualManifest,
  ShipVisualProfileId,
} from "@sidereal/content/ship-visual";
import type { KitPlacement } from "@sidereal/sim/ship-dresser";
import type { GlbGeometry } from "./glb-library";
import { slotOfMaterialName } from "./materials";

const sourceUrl = "/assets/ship-kit/r002/bow-deck.glb";
const sourceSha256 =
  "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd";
const occurrences = [
  {
    piece: "bow.slope1.deck.s2.a1.edge1",
    x: 10,
    y: 1,
    z: 0,
    rotDeg: 270,
    view: "both",
    triangles: 10,
  },
  {
    piece: "bow.slope1.deck.s2.a0.edge1",
    x: 10,
    y: 6,
    z: 0,
    rotDeg: 0,
    view: "both",
    triangles: 12,
  },
] as const;

export function glazingOccurrenceKey(k: KitPlacement): string {
  return JSON.stringify([
    k.piece,
    k.x,
    k.y,
    k.z,
    k.rotDeg,
    k.mirror ?? false,
    k.view,
  ]);
}

/** Called only after the manifest bytes and every referenced geometry were verified. */
export function referenceGlazingReplacements(
  manifest: ShipVisualManifest,
  profile: ShipVisualProfileId,
  prefabId: string,
  placements: readonly KitPlacement[],
  geometry: ReadonlyMap<string, GlbGeometry>,
): ReadonlySet<string> {
  const result = new Set<string>();
  if (
    manifest.revision !== "r002" ||
    profile !== "federation" ||
    prefabId !== "fed.s.wren"
  )
    return result;
  for (const expected of occurrences) {
    const matching = placements.filter((k) => k.piece === expected.piece);
    const expectedKey = glazingOccurrenceKey(expected);
    if (
      matching.length !== 1 ||
      glazingOccurrenceKey(matching[0]) !== expectedKey
    )
      throw Error(
        `Candidate cockpit glass occurrence mismatch: ${expected.piece}`,
      );
    const assets = manifest.assets.filter(
      (a) => a.kind === "kit" && a.id === expected.piece,
    );
    const asset = assets[0];
    const geom = geometry.get(expected.piece);
    if (
      assets.length !== 1 ||
      asset.url !== sourceUrl ||
      asset.sha256 !== sourceSha256 ||
      asset.node !== expected.piece ||
      geom?.url !== sourceUrl
    )
      throw Error(`Candidate cockpit glass source mismatch: ${expected.piece}`);
    const glass = geom.primitives.filter(
      (p) => slotOfMaterialName(p.material) === "glass",
    );
    if (
      !glass.length ||
      glass.some((p) => p.indices.length !== p.triangles * 3) ||
      glass.reduce((n, p) => n + p.triangles, 0) !== expected.triangles
    )
      throw Error(
        `Candidate cockpit glass geometry mismatch: ${expected.piece}`,
      );
    result.add(expectedKey);
  }
  return result;
}
