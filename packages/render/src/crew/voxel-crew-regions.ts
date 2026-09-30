import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { Geometry } from "@babylonjs/core/Meshes/geometry";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { CrewArmorSlot } from "@sidereal/content/crew-armor";
import { setMeshRole } from "../mesh-roles";

export const CREW_CLOTH_REGIONS = [
  "neck",
  "torso",
  "hips",
  "upperArms",
  "forearms",
  "legs",
  "feet",
] as const;
export type CrewClothRegion = (typeof CREW_CLOTH_REGIONS)[number];
type Region = CrewClothRegion | "unclassified";

export function crewBoneRegion(bone: string): Region {
  if (bone === "neck") return "neck";
  if (/^(spine|chest)$/.test(bone)) return "torso";
  if (bone === "pelvis") return "hips";
  if (/^(shoulder|upper_arm)\./.test(bone)) return "upperArms";
  if (/^forearm\./.test(bone)) return "forearms";
  if (/^(thigh|shin)\./.test(bone)) return "legs";
  if (/^(foot|toe)\./.test(bone)) return "feet";
  return "unclassified";
}

/** Presentation coverage, never an inferred inventory item or protection grant. */
export function crewArmorClothRegions(
  slots: Iterable<CrewArmorSlot>,
): Set<CrewClothRegion> {
  const regions = new Set<CrewClothRegion>();
  for (const slot of slots) {
    const owned: Partial<Record<CrewArmorSlot, readonly CrewClothRegion[]>> = {
      chest: ["torso", "neck", "upperArms", "forearms"],
      shoulders: ["upperArms"],
      gloves: ["forearms"],
      belt: ["hips"],
      legs: ["hips", "legs"],
      boots: ["feet"],
    };
    for (const region of owned[slot] ?? []) regions.add(region);
  }
  return regions;
}

/** Rigid skins only: mixed/missing weights remain base geometry instead of becoming a hole. */
export function partitionCrewTriangles(mesh: Mesh): Map<Region, number[]> {
  const indices = mesh.getIndices() ?? [];
  const bones = mesh.skeleton?.bones ?? [];
  const joints = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind);
  const weights = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind);
  const regionOf = (vertex: number): Region => {
    if (!joints || !weights) return "unclassified";
    for (let component = 0; component < 4; component++)
      if (weights[vertex * 4 + component] > 0.999)
        return crewBoneRegion(
          bones[joints[vertex * 4 + component]]?.name ?? "",
        );
    return "unclassified";
  };
  const out = new Map<Region, number[]>();
  for (let i = 0; i < indices.length; i += 3) {
    const a = regionOf(indices[i]);
    const region =
      a === regionOf(indices[i + 1]) && a === regionOf(indices[i + 2])
        ? a
        : "unclassified";
    const bucket = out.get(region) ?? [];
    bucket.push(indices[i], indices[i + 1], indices[i + 2]);
    out.set(region, bucket);
  }
  return out;
}

type Pool = { buckets: Map<Region, number[]>; subsets: Map<number, Geometry> };
const pools = new WeakMap<Geometry, Pool>();
const ALL_REGIONS: readonly Region[] = [...CREW_CLOTH_REGIONS, "unclassified"];
function poolFor(source: Mesh): Pool {
  const geometry = source.geometry!;
  let pool = pools.get(geometry);
  if (!pool) {
    pool = { buckets: partitionCrewTriangles(source), subsets: new Map() };
    pools.set(geometry, pool);
  }
  return pool;
}

/** Index subsets share immutable native vertex buffers through independent ref-counted wrappers.
 * Up to 256 masks per original primitive; unused subset GPU buffers are released immediately. */
function selectSubset(
  mesh: Mesh,
  source: Mesh,
  regions: ReadonlySet<Region>,
): boolean {
  const original = source.geometry!;
  const pool = poolFor(source);
  const selected = [...pool.buckets].filter(([region]) => regions.has(region));
  const names = selected.map(([region]) => region);
  mesh.metadata = { ...source.metadata, crewClothRegions: names };
  if (!selected.length) return false;
  let geometry = original;
  if (selected.length !== pool.buckets.size) {
    const mask = names.reduce(
      (value, region) => value | (1 << ALL_REGIONS.indexOf(region)),
      0,
    );
    const cached = pool.subsets.get(mask);
    if (cached && !cached.isDisposed()) geometry = cached;
    else {
      geometry = new Geometry(
        `${original.id}-coverage-${mask}`,
        source.getScene(),
      );
      for (const kind of original.getVerticesDataKinds()) {
        const buffer = original.getVertexBuffer(kind)!;
        geometry.setVerticesBuffer(
          new VertexBuffer(
            source.getScene().getEngine(),
            buffer.getWrapperBuffer(),
            kind,
            {
              takeBufferOwnership: true,
              useBytes: true,
              stride: buffer.byteStride,
              offset: buffer.byteOffset,
              size: buffer.getSize(),
              type: buffer.type,
              normalized: buffer.normalized,
              updatable: false,
            },
          ),
          source.getTotalVertices(),
        );
      }
      geometry.setIndices(selected.flatMap(([, indices]) => indices));
      pool.subsets.set(mask, geometry);
    }
  }
  const previous = mesh.geometry;
  geometry.applyToMesh(mesh);
  // Babylon keeps a still-valid shorter SubMesh when a subset grows. Draw the entire new union.
  const count = geometry.getTotalIndices();
  if (
    mesh.subMeshes.length !== 1 ||
    mesh.subMeshes[0].indexStart !== 0 ||
    mesh.subMeshes[0].indexCount !== count
  ) {
    mesh.releaseSubMeshes();
    new SubMesh(0, 0, source.getTotalVertices(), 0, count, mesh);
  }
  if (
    previous &&
    previous !== original &&
    previous !== geometry &&
    !previous.meshes.length
  )
    previous.dispose();
  return true;
}

/** Release an unused mask without altering the donor source or another wearer. */
function resetSubset(mesh: Mesh, source: Mesh) {
  const previous = mesh.geometry;
  source.geometry!.applyToMesh(mesh);
  if (previous && previous !== source.geometry && !previous.meshes.length)
    previous.dispose();
}

type Layer = {
  source: Mesh;
  union: Mesh;
  neck?: Mesh;
  variant: string;
  kind: "base" | "suit";
};
export function createCrewRegionalLayers(meshes: readonly AbstractMesh[]) {
  const layers: Layer[] = [];
  const builtVariants = new Set<string>();
  const hands: { source: Mesh; mesh: Mesh; variant: string }[] = [];
  let pressure: PBRMaterial | undefined;
  const cloth = () =>
    meshes.find(
      (m) =>
        m.material instanceof PBRMaterial &&
        /^crew\.suit_primary/.test(m.material.name),
    )?.material;
  const clone = (source: Mesh, suffix: string) => {
    const mesh = source.clone(`${source.name}-${suffix}`, source.parent, true);
    setMeshRole(mesh, "crew");
    mesh.setEnabled(false);
    return mesh;
  };
  const build = (variant: string) => {
    if (builtVariants.has(variant)) return;
    builtVariants.add(variant);
    const material = cloth();
    if (!pressure && material instanceof PBRMaterial)
      pressure = material.clone("crew.suit_primary.pressure");
    for (const source of meshes) {
      if (
        !(source instanceof Mesh) ||
        !source.geometry ||
        !source.getTotalVertices()
      )
        continue;
      const match = /^GEO-crew-(base|suit|hands)-(male|female|neutral)/.exec(
        source.name,
      );
      if (!match || match[2] !== variant) continue;
      if (match[1] === "hands") {
        if (pressure) {
          const mesh = clone(source, "pressure");
          mesh.material = pressure;
          hands.push({ source, mesh, variant });
        }
        continue;
      }
      const union = clone(source, "regional-union");
      const neck =
        match[1] === "base" && pressure && poolFor(source).buckets.has("neck")
          ? clone(source, "pressure-neck")
          : undefined;
      if (neck) neck.material = pressure!;
      layers.push({
        source,
        union,
        neck,
        variant,
        kind: match[1] as Layer["kind"],
      });
    }
  };
  return {
    refresh(
      variant: string,
      suit: boolean,
      regions: ReadonlySet<CrewClothRegion>,
      eva: boolean,
      hidden: ReadonlySet<string>,
    ) {
      if (!regions.size && !eva && !suit && !builtVariants.size) return;
      build(variant);
      const material = cloth();
      if (pressure && material instanceof PBRMaterial)
        pressure.albedoColor = material.albedoColor.clone();
      const available = new Set<CrewClothRegion>();
      const donors = layers.filter(
        (layer) => layer.variant === variant && layer.kind === "suit",
      );
      // r005's six material primitives together form the garment. A surviving accent alone
      // cannot replace all skin in its bone region if a donor is absent or malformed.
      const complete =
        [
          "suit_primary",
          "suit_secondary",
          "accent",
          "metal",
          "dark",
          "emit",
        ].every((slot) =>
          donors.some((layer) =>
            new RegExp(`^crew\\.${slot}(\\.\\d+)?$`).test(
              layer.source.material?.name ?? "",
            ),
          ),
        ) &&
        donors.every(
          (layer) => !poolFor(layer.source).buckets.has("unclassified"),
        );
      const wholeSuit = suit && complete;
      for (const layer of layers)
        if (complete && layer.variant === variant && layer.kind === "suit")
          for (const region of poolFor(layer.source).buckets.keys())
            if (region !== "unclassified") available.add(region);
      const covered = new Set<Region>(
        [...regions].filter(
          (region) =>
            available.has(region) || (region === "neck" && !!pressure),
        ),
      );
      if (wholeSuit) for (const region of available) covered.add(region);
      if (wholeSuit && pressure) covered.add("neck");
      if (eva && pressure) covered.add("neck");
      const regional = covered.size > 0 || wholeSuit;
      for (const layer of layers) {
        const active = layer.variant === variant;
        const showUnion =
          active &&
          !hidden.has(layer.kind) &&
          (layer.kind === "base" ? regional : !wholeSuit);
        const selected =
          layer.kind === "suit"
            ? new Set(
                [...covered].filter(
                  (r) => r !== "neck" && r !== "unclassified",
                ),
              )
            : new Set(ALL_REGIONS.filter((r) => !covered.has(r)));
        if (layer.kind === "base" && active && regional)
          layer.source.setEnabled(false);
        if (active && suit && !complete)
          layer.source.setEnabled(
            layer.kind === "base" && !hidden.has("base") && !regional,
          );
        const show =
          showUnion && selectSubset(layer.union, layer.source, selected);
        layer.union.setEnabled(show);
        if (!show) resetSubset(layer.union, layer.source);
        if (layer.neck) {
          const showNeck =
            active &&
            covered.has("neck") &&
            !hidden.has("base") &&
            selectSubset(layer.neck, layer.source, new Set<Region>(["neck"]));
          layer.neck.setEnabled(showNeck);
          if (!showNeck) resetSubset(layer.neck, layer.source);
        }
      }
      for (const hand of hands) {
        const show = hand.variant === variant && eva && !hidden.has("hands");
        hand.mesh.setEnabled(show);
        if (show) hand.source.setEnabled(false);
      }
    },
    get meshes() {
      return [
        ...layers.flatMap((l) => (l.neck ? [l.union, l.neck] : [l.union])),
        ...hands.map((h) => h.mesh),
      ];
    },
    dispose() {
      for (const layer of layers) {
        layer.union.dispose(false, false);
        layer.neck?.dispose(false, false);
      }
      for (const hand of hands) hand.mesh.dispose(false, false);
      pressure?.dispose(false, false);
    },
  };
}
