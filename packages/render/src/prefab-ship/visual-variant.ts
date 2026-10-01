/** All required candidate art is verified and imported before any structural view is replaced. */
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  readShipVisualManifest,
  type ShipVisualManifest,
  type ShipVisualProfileId,
} from "@sidereal/content/ship-visual";
import {
  visualPrefabSha256,
  visualProfilesSha256,
} from "@sidereal/sim/ship-visual-compiler";
import type { ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";
import {
  SHIP_KIT_SLOTS,
  type ShipKitManifest,
} from "@sidereal/content/ship-kit";
import type { DressedShip } from "@sidereal/sim/ship-dresser";
import { loadVerifiedGlbGeometry, type GlbGeometry } from "./glb-library";
import { slotOfMaterialName } from "./materials";
import type { NavigationOperatorRegistration } from "@sidereal/sim/navigation-operator-context";
import type { OperatorActivatedCapability } from "../crew/operator-readiness";
import { referenceGlazingReplacements } from "./glazing-replacement";

export interface VisualVariantSelection {
  url: string;
  sha256: string;
  compilerSha256: string;
}
export interface VerifiedVisualVariant {
  manifest: ShipVisualManifest;
  manifestSha256: string;
  profile: ShipVisualProfileId;
  components: Map<string, GlbGeometry>;
  objects: Map<string, GlbGeometry>;
  kit: Map<string, GlbGeometry>;
  /** Exact verified occurrences whose old glass is replaced by sampled CORE/glass. */
  glazingReplacements?: ReadonlySet<string>;
  normalUrl: string;
  normalSha256: string;
  release(): void;
}
interface ActivatedVariantIdentity {
  manifestSha256: string;
  compilerSha256: string;
  prefabId: string;
  prefabSha256: string;
  navigationSha256: string | null;
  navigationGeometry: GlbGeometry | null;
  sources: readonly {
    kind: string;
    id: string;
    sha256: string;
    node: string | null;
  }[];
}
const variantIdentities = new WeakMap<
  VerifiedVisualVariant,
  ActivatedVariantIdentity
>();

/** Actual resolver provenance; a structurally identical expected/fetched record cannot forge it. */
export function verifiedVariantIdentity(variant: VerifiedVisualVariant) {
  const identity = variantIdentities.get(variant);
  if (
    !identity ||
    (identity.navigationGeometry &&
      variant.components.get("console.navigation.sm") !==
        identity.navigationGeometry)
  )
    return null;
  return identity;
}
export interface RetainedGeometryRecord {
  semantic: string;
  positions: ArrayLike<number>;
  normals: ArrayLike<number>;
  indices: ArrayLike<number>;
  uvs?: ArrayLike<number>;
  uvs2?: ArrayLike<number>;
  colors?: ArrayLike<number>;
  matrices: ArrayLike<number>;
}
/** Versioned actual indexed geometry, independent of scene IDs and input record ordering. */
export function retainedShipGeometryHash(
  records: readonly RetainedGeometryRecord[],
  sourceIdentity: unknown,
): string | null {
  if (!records.length || records.length > 4096) return null;
  let values = 0;
  const fingerprints: string[] = [];
  for (const record of records) {
    const { positions, normals, indices, matrices } = record;
    if (
      !positions.length ||
      positions.length % 3 ||
      normals.length !== positions.length ||
      !indices.length ||
      indices.length % 3 ||
      !matrices.length ||
      matrices.length % 16 ||
      (record.uvs && record.uvs.length !== (positions.length / 3) * 2) ||
      (record.uvs2 && record.uvs2.length !== (positions.length / 3) * 2) ||
      (record.colors && record.colors.length !== (positions.length / 3) * 4)
    )
      return null;
    const arrays = [
      positions,
      normals,
      indices,
      record.uvs ?? [],
      record.uvs2 ?? [],
      record.colors ?? [],
      matrices,
    ];
    values += arrays.reduce((sum, array) => sum + array.length, 0);
    if (
      values > 20000000 ||
      arrays.some((array) =>
        Array.from(array).some((value) => !Number.isFinite(value)),
      ) ||
      Array.from(indices).some(
        (index) =>
          !Number.isInteger(index) ||
          index < 0 ||
          index >= positions.length / 3,
      )
    )
      return null;
    fingerprints.push(
      bytesSha(
        new TextEncoder().encode(
          JSON.stringify([
            record.semantic,
            ...arrays.map((array) => Array.from(array)),
          ]),
        ),
      ),
    );
  }
  return bytesSha(
    new TextEncoder().encode(
      JSON.stringify([
        "sidereal.navigation-retained-geometry.v1",
        sourceIdentity,
        fingerprints.sort(),
      ]),
    ),
  );
}

/** Used only by a successfully applied live handle; EMPTY returns before reading geometry. */
export function registeredActivatedNavigation(
  registrations: readonly NavigationOperatorRegistration[],
  variant: VerifiedVisualVariant | null,
  readActual: () => {
    prefabId: string;
    mountSourceId: string;
    internalQuarterTurns: number;
    artQuarterTurns: number;
    stationX: number;
    stationY: number;
    geometrySha256: string | null;
  } | null,
): OperatorActivatedCapability | null {
  if (!registrations.length || registrations.length > 16 || !variant)
    return null;
  const identity = verifiedVariantIdentity(variant);
  if (
    !identity ||
    variant.manifest.revision !== "r002" ||
    !identity.navigationSha256 ||
    !identity.navigationGeometry
  )
    return null;
  const actual = readActual();
  if (
    !actual ||
    !actual.geometrySha256 ||
    actual.internalQuarterTurns !== 0 ||
    actual.artQuarterTurns !== 2
  )
    return null;
  const matches = registrations.filter(
    (entry) =>
      entry.prefabId === actual.prefabId &&
      entry.prefabId === identity.prefabId &&
      entry.manifestSha256 === identity.manifestSha256 &&
      entry.compilerSha256 === identity.compilerSha256 &&
      entry.navigationSha256 === identity.navigationSha256 &&
      entry.geometrySha256 === actual.geometrySha256 &&
      entry.mountSourceId === actual.mountSourceId &&
      Number.isFinite(actual.stationX) &&
      Number.isFinite(actual.stationY) &&
      Math.abs(entry.stationX - actual.stationX) <= 1e-5 &&
      Math.abs(entry.stationY - actual.stationY) <= 1e-5 &&
      [entry.certificateSha256, entry.proofSha256, entry.geometrySha256].every(
        (value) => /^[a-f0-9]{64}$/.test(value),
      ),
  );
  if (matches.length !== 1) return null;
  const entry = matches[0];
  return Object.freeze({
    profileId: entry.profileId,
    certificateSha256: entry.certificateSha256,
    proofSha256: entry.proofSha256,
    manifestSha256: identity.manifestSha256,
    compilerSha256: identity.compilerSha256,
    geometrySha256: actual.geometrySha256,
    navigationSha256: identity.navigationSha256,
    mountSourceId: actual.mountSourceId,
  });
}
const bytesSha = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
const normalUrls = new WeakMap<Scene, Map<string, string>>();
async function verifiedBytes(
  url: string,
  expected: string,
  bytes?: number,
): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw Error(`Visual asset HTTP ${response.status}: ${url}`);
  const data = new Uint8Array(await response.arrayBuffer());
  if (
    (bytes !== undefined && data.length !== bytes) ||
    bytesSha(data) !== expected
  )
    throw Error(`Visual asset hash/size mismatch: ${url}`);
  return data;
}
function profileFor(doc: ShipPrefabDocumentV1): ShipVisualProfileId {
  return doc.theme === "riftjack" || doc.theme === "industrial"
    ? "riftjack"
    : doc.theme === "aurelian" || doc.theme === "crystalline"
      ? "aurelian"
      : "federation";
}
export async function resolveVisualVariant(
  scene: Scene,
  doc: ShipPrefabDocumentV1,
  dressed: DressedShip,
  selection: VisualVariantSelection,
): Promise<VerifiedVisualVariant> {
  selection = { ...selection };
  const expectedPrefabId = doc.id,
    expectedPrefabSha256 = visualPrefabSha256(doc);
  if (
    !/^\/assets\/ship-visual\/r\d{3}\/manifest.json$/.test(selection.url) ||
    !/^([a-f0-9]{64})$/.test(selection.sha256) ||
    !/^([a-f0-9]{64})$/.test(selection.compilerSha256)
  )
    throw Error("Unknown visual selection");
  const manifest = readShipVisualManifest(
    JSON.parse(
      new TextDecoder().decode(
        await verifiedBytes(selection.url, selection.sha256),
      ),
    ),
  );
  if (
    manifest.compilerSha256 !== selection.compilerSha256 ||
    manifest.profilesSha256 !== visualProfilesSha256() ||
    manifest.prefabs[expectedPrefabId] !== expectedPrefabSha256
  )
    throw Error("Visual revision does not match compiler/profile/prefab pins");
  const required = new Set([
    ...dressed.components.map((c) => `component:${c.component}`),
    ...dressed.objects.map((o) => `object:${o.designId}`),
    "normal:panel",
    "kit-manifest:native",
  ]);
  const available = new Set(manifest.assets.map((a) => `${a.kind}:${a.id}`));
  if ([...required].some((key) => !available.has(key)))
    throw Error("Visual revision lacks required fitting/object/map art");
  const native = manifest.assets.find(
    (a) => a.kind === "kit-manifest" && a.id === "native",
  )!;
  if (native.url !== "/assets/ship-kit/r002/manifest.json")
    throw Error("Visual revision lacks the published native kit identity");
  const nativeBytes = await verifiedBytes(
    native.url,
    native.sha256,
    native.bytes,
  );
  const nativeKit = JSON.parse(
    new TextDecoder().decode(nativeBytes),
  ) as ShipKitManifest;
  if (
    nativeKit.schema !== "sidereal.ship-kit-manifest.v1" ||
    nativeKit.revision !== "r002" ||
    nativeKit.frame !==
      "piece-local metres: prototype +X/+Y plan, +Z up; glTF Y-up (x, z, -y)" ||
    nativeKit.slots.join(",") !== SHIP_KIT_SLOTS.join(",") ||
    !nativeKit.pieces
  )
    throw Error("Incompatible published native kit frame/revision");
  for (const k of dressed.kit) {
    const piece = nativeKit.pieces[k.piece];
    if (!piece) throw Error(`Native kit lacks a used piece: ${k.piece}`);
    if (piece.slots.includes("glass") || k.piece.startsWith("mount."))
      required.add(`kit:${k.piece}`);
  }
  const assets = manifest.assets.filter((a) =>
    required.has(`${a.kind}:${a.id}`),
  );
  if (assets.length !== required.size)
    throw Error("Visual revision lacks required fitting/object/map art");
  const downloads = new Map<string, Promise<Uint8Array>>();
  downloads.set(
    `${native.url}:${native.sha256}:${native.bytes}`,
    Promise.resolve(nativeBytes),
  );
  const verified = await Promise.all(
    assets.map(async (a) => {
      const key = `${a.url}:${a.sha256}:${a.bytes}`;
      let bytes = downloads.get(key);
      if (!bytes) {
        bytes = verifiedBytes(a.url, a.sha256, a.bytes);
        downloads.set(key, bytes);
      }
      return { a, bytes: await bytes };
    }),
  );
  if (scene.isDisposed)
    throw Error("Scene disposed during visual verification");
  const components = new Map<string, GlbGeometry>(),
    objects = new Map<string, GlbGeometry>(),
    kit = new Map<string, GlbGeometry>();
  let normalUrl = "",
    normalSha256 = "";
  try {
    for (const { a, bytes } of verified) {
      if (scene.isDisposed) throw Error("Scene disposed during visual import");
      if (a.kind === "kit-manifest") continue;
      if (a.kind === "normal") {
        if (
          bytes.length < 24 ||
          bytes[0] !== 137 ||
          bytes[1] !== 80 ||
          bytes[2] !== 78 ||
          bytes[3] !== 71
        )
          throw Error("Candidate normal map is not PNG");
        const decoded = await createImageBitmap(
          new Blob([Uint8Array.from(bytes)], { type: "image/png" }),
        );
        if (decoded.width !== 256 || decoded.height !== 256) {
          decoded.close();
          throw Error("Candidate normal map dimensions mismatch");
        }
        decoded.close();
        if (scene.isDisposed)
          throw Error("Scene disposed during candidate map decode");
        let urls = normalUrls.get(scene);
        if (!urls) {
          urls = new Map();
          normalUrls.set(scene, urls);
          scene.onDisposeObservable.addOnce(() => {
            for (const url of urls!.values()) URL.revokeObjectURL(url);
            normalUrls.delete(scene);
          });
        }
        normalUrl = urls.get(a.sha256) ?? "";
        if (!normalUrl) {
          normalUrl = URL.createObjectURL(
            new Blob([Uint8Array.from(bytes)], { type: "image/png" }),
          );
          urls.set(a.sha256, normalUrl);
        }
        normalSha256 = a.sha256;
        continue;
      }
      const geom = await loadVerifiedGlbGeometry(
        scene,
        a.url,
        bytes,
        a.sha256,
        a.node,
      );
      if (
        geom.primitives.some(
          (p) =>
            !slotOfMaterialName(p.material) ||
            (a.kind !== "kit" &&
              (!p.uvs || p.uvs.length !== (p.positions.length / 3) * 2)),
        )
      )
        throw Error(`Candidate lacks validated slot/UV geometry: ${a.id}`);
      if (
        geom.bounds.some(
          (v, i) =>
            Math.abs(v - a.bounds![i]) > (a.kind === "kit" ? 0.02 : 0.002),
        )
      )
        throw Error(`Candidate measured bounds mismatch: ${a.id}`);
      if (a.kind === "object" && a.frame !== "interior")
        throw Error(`Candidate object frame mismatch: ${a.id}`);
      (a.kind === "kit"
        ? kit
        : a.kind === "component"
          ? components
          : objects
      ).set(a.id, geom);
    }
    // Scene pools borrow these immutable map URLs; view replacement must not revoke a shared texture.
    if (scene.isDisposed)
      throw Error("Scene disposed before candidate activation");
    const profile = profileFor(doc);
    const glazingReplacements = referenceGlazingReplacements(
      manifest,
      profile,
      doc.id,
      dressed.kit,
      kit,
    );
    const variant: VerifiedVisualVariant = {
      manifest,
      manifestSha256: selection.sha256,
      profile,
      components,
      objects,
      kit,
      glazingReplacements,
      normalUrl,
      normalSha256,
      release: () => {
        variantIdentities.delete(variant);
      },
    };
    const navigation = verified.find(
      ({ a }) => a.kind === "component" && a.id === "console.navigation.sm",
    );
    variantIdentities.set(
      variant,
      Object.freeze({
        manifestSha256: selection.sha256,
        compilerSha256: manifest.compilerSha256,
        prefabId: expectedPrefabId,
        prefabSha256: expectedPrefabSha256,
        navigationSha256: navigation?.a.sha256 ?? null,
        navigationGeometry: components.get("console.navigation.sm") ?? null,
        sources: Object.freeze(
          verified
            .map(({ a }) =>
              Object.freeze({
                kind: a.kind,
                id: a.id,
                sha256: a.sha256,
                node: a.node ?? null,
              }),
            )
            .sort((a, b) =>
              `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`),
            ),
        ),
      }),
    );
    return variant;
  } catch (error) {
    throw error;
  }
}

// The console owns its decorative botanical insert; this finite tint is never inventory or fitting data.
const floraMaterials = new WeakMap<Scene, Map<PBRMaterial, PBRMaterial>>();
export function referenceFloraMaterial(
  scene: Scene,
  base: PBRMaterial,
): PBRMaterial {
  let pool = floraMaterials.get(scene);
  if (!pool) {
    pool = new Map();
    floraMaterials.set(scene, pool);
    scene.onDisposeObservable.addOnce(() => {
      for (const m of pool!.values()) m.dispose(false, false);
      floraMaterials.delete(scene);
    });
  }
  let material = pool.get(base);
  if (!material) {
    material = base.clone(`${base.name}:reference-flora`)!;
    const clonedReflection = material.reflectionTexture;
    material.reflectionTexture = base.reflectionTexture;
    if (clonedReflection && clonedReflection !== base.reflectionTexture)
      clonedReflection.dispose();
    material.albedoColor = new Color3(0.12, 0.38, 0.065);
    material.roughness = 0.7;
    material.metadata = { ...material.metadata, shipAuthoredPalette: "flora" };
    pool.set(base, material);
  }
  return material;
}

/** Required maps must finish decode/upload and every hidden candidate material must compile before swap. */
export async function prepareCandidateMaterials(
  scene: Scene,
  meshes: readonly Mesh[],
): Promise<void> {
  const maps = new Set<Texture>();
  for (const mesh of meshes) {
    const material = mesh.material as PBRMaterial | null;
    if (material?.bumpTexture) maps.add(material.bumpTexture as Texture);
  }
  await Promise.all(
    [...maps].map((texture) => {
      if (texture.isReady()) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const internal = texture.getInternalTexture();
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          texture.onLoadObservable.remove(loaded);
          internal?.onErrorObservable.remove(failed ?? null);
          scene.onDisposeObservable.remove(disposed);
          error ? reject(error) : resolve();
        };
        const loaded = texture.onLoadObservable.addOnce(() => finish());
        const failed = internal?.onErrorObservable.addOnce(() =>
          finish(Error("Candidate map upload failed")),
        );
        const disposed = scene.onDisposeObservable.addOnce(() =>
          finish(Error("Scene disposed during candidate map upload")),
        );
        const timer = setTimeout(
          () => finish(Error("Candidate map upload timed out")),
          10000,
        );
        if (texture.isReady()) finish();
      });
    }),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all(
        meshes.map((mesh) =>
          mesh.material?.forceCompilationAsync(mesh, {
            useInstances: !!mesh.hasThinInstances,
          }),
        ),
      ),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Candidate material compilation timed out")),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  if (scene.isDisposed)
    throw Error("Scene disposed before candidate activation");
}
