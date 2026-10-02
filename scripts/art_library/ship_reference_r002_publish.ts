/** Immutable candidate metadata; explicitly does not publish an app or change live pins. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { format } from "prettier";
import { SHIP_VISUAL_FIXTURES } from "@sidereal/content/ship-visual-fixture";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import {
  referenceRoomLayoutR025,
  REFERENCE_ROOM_LAYOUT_R025,
} from "@sidereal/content/ship-reference-room-layout-r025";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { validateShipPrefab } from "@sidereal/content/ship-prefab";
import { REFERENCE_ROOM_FIXTURE_CATALOG_R025 } from "@sidereal/content/ship-room-fixtures-r025";
import {
  REFERENCE_OPTICAL_INTERFACES_R002,
  REFERENCE_OPTICAL_MATING_PIGMENTS_R002,
  REFERENCE_OPTICAL_MATING_SOURCE_SHA256_R002,
  REFERENCE_STATIC_WALL_FITTINGS_R002,
  REFERENCE_ROOF_FIXED_POSE_R002,
} from "@sidereal/content/ship-visual-r002";
import { interiorArtQuarterTurns } from "@sidereal/content/ship-furniture";
import { SHIP_KIT_SLOTS } from "@sidereal/content/ship-kit";
import {
  SHIP_VISUAL_FRAME,
  SHIP_VISUAL_SCHEMA,
  readShipVisualManifest,
  type ShipVisualAsset,
} from "@sidereal/content/ship-visual";
import {
  visualPrefabSha256,
  visualProfilesSha256,
} from "@sidereal/sim/ship-visual-compiler";

const root = resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
if (
  args.length &&
  (args.length !== 2 ||
    args[0] !== "--room-layout" ||
    args[1] !== REFERENCE_ROOM_LAYOUT_R025)
)
  throw Error("Unknown reference room layout selection");
const roomLayout = args.length ? REFERENCE_ROOM_LAYOUT_R025 : undefined;
const reviewPrefabs = PREFAB_SHIPS.map((p) =>
  roomLayout && p.id === "fed.m.crest" ? referenceRoomLayoutR025(p) : p,
);
const roomCandidate = roomLayout
  ? reviewPrefabs.find((p) => p.id === "fed.m.crest")
  : undefined;
if (
  roomCandidate &&
  validateShipPrefab(roomCandidate, defaultPrefabComponentCatalog()).some(
    (issue) => issue.severity === "error",
  )
)
  throw Error(
    "Reference room candidate fails normal prefab placement validation",
  );
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const equipmentHousingSource =
  "assets/source/ship-reference/r002/equipment-r018/ship_reference_r002_art.py";
const equipmentHousingSourceSha256 =
  "f05fd738d4bc91a7978d344f8c5015358433fc58cb6840742688a94d1744eaad";
const sources = [
  "packages/content/src/ship-visual-fixture.ts",
  "packages/content/src/ship-visual.ts",
  "packages/content/src/ship-visual-r002.ts",
  "packages/sim/src/ship-visual-layers-r002.ts",
  "packages/sim/src/ship-visual-r002-retained-wall-boundary.ts",
  "packages/sim/src/ship-visual-r002-bow-frame.ts",
  "packages/sim/src/ship-visual-r002-bow-transition.ts",
  "packages/sim/src/ship-dresser.ts",
  "packages/content/src/ship-prefab.ts",
  "packages/content/src/ship-furniture.ts",
  "packages/content/src/ship-room-fixtures-r025.ts",
  "packages/content/src/ship-prefab-catalog.ts",
  "packages/content/src/ship-reference-room-layout-r025.ts",
  "packages/content/src/prefabs/federation.ts",
  "packages/content/package.json",
  "scripts/prefab-render-harness/game.ts",
  "scripts/prefab-render-harness/main.ts",
  "packages/sim/src/ship-visual-sampler.ts",
  "packages/sim/src/ship-visual-compiler.ts",
  "packages/render/src/prefab-ship/sampled-structure.ts",
  "packages/render/src/prefab-ship/sampled-facets.ts",
  "packages/render/src/prefab-ship/sampled-ao.ts",
  "packages/render/src/prefab-ship/normal-detail.ts",
  "packages/render/src/prefab-ship/ship-view.ts",
  "packages/render/src/prefab-ship/frames.ts",
  "packages/render/package.json",
  "packages/render/src/prefab-ship/glazing-replacement.ts",
  "packages/render/src/prefab-ship/deck-cutaway.ts",
  "packages/render/src/prefab-ship/door-cutaway.ts",
  "packages/render/src/prefab-ship/batch.ts",
  "packages/render/src/prefab-ship/coplanar.ts",
  "packages/render/src/prefab-ship/surface-attributes.ts",
  "packages/render/src/prefab-ship/visual-variant.ts",
  "packages/render/src/prefab-ship/doors.ts",
  "packages/render/src/prefab-ship/shadows.ts",
  "packages/render/src/prefab-ship-presentation.ts",
  "packages/render/src/construction-instance.ts",
  "packages/render/src/index.ts",
  "packages/render/src/pbr-light-budget.ts",
  "packages/render/src/local-light-budget.ts",
  "scripts/art_library/ship_reference_r002_art.py",
  "scripts/art_library/ship_reference_r020_reactor.py",
  "assets/runtime/ship-visual/r002/equipment-r020/reactor.md-source.json",
  "assets/runtime/ship-visual/r002/equipment-r020/reactor.lg-source.json",
  "assets/source/ship-reference/r002/equipment-r020/reactor.md.blend",
  "assets/source/ship-reference/r002/equipment-r020/reactor.lg.blend",
  "scripts/art_library/ship_reference_r025_reactor.py",
  "scripts/art_library/ship_reference_r025_rooms.py",
  "scripts/art_library/ship_reference_r025_rooms_clean.py",
  "assets/runtime/ship-objects/reference-r025-clean/shipyard.equipment.workshop-bank-r025-source.json",
  "assets/runtime/ship-objects/reference-r025-clean/shipyard.equipment.medical-equipment-bank-r025-source.json",
  "assets/source/ship-reference/r002/rooms-r025-clean/shipyard.equipment.workshop-bank-r025.blend",
  "assets/source/ship-reference/r002/rooms-r025-clean/shipyard.equipment.medical-equipment-bank-r025.blend",
  "assets/runtime/ship-visual/r002/equipment-r025/reactor.md-source.json",
  "assets/runtime/ship-visual/r002/equipment-r025/reactor.lg-source.json",
  "assets/source/ship-reference/r002/equipment-r025/reactor.md.blend",
  "assets/source/ship-reference/r002/equipment-r025/reactor.lg.blend",
  "assets/runtime/ship-visual/r002/door-leaf-r019-source.json",
  "scripts/art_library/ship_reference_r018_equipment.py",
  "scripts/art_library/ship_reference_r021_equipment.py",
  "scripts/art_library/ship_reference_r022_equipment.py",
  "scripts/art_library/ship_reference_r023_architecture.py",
  "scripts/art_library/ship_reference_art.py",
  "scripts/art_library/ship_component_export.py",
  "scripts/art_library/ship_component_art.py",
  "scripts/art_library/ship_object_art.py",
  "scripts/art_library/ship_kit_prototype.py",
  "assets/runtime/ship-visual/r002/equipment-r021/manifest.json",
  "assets/source/ship-reference/r002/equipment-r021/equipment.blend",
  "assets/runtime/ship-visual/r002/equipment-r022/manifest.json",
  "assets/source/ship-reference/r002/equipment-r022/equipment.blend",
  "assets/runtime/ship-visual/r002/equipment-r023/manifest.json",
  "assets/source/ship-reference/r002/equipment-r023/equipment.blend",
  equipmentHousingSource,
  "scripts/art_library/ship_kit_modules.py",
  "scripts/art_library/bow_modules.py",
  "scripts/art_library/ship_reference_r002_maps.py",
  "packages/render/src/prefab-ship/reference-finish.ts",
  "packages/render/src/prefab-ship/reference-instruments.ts",
];
const compilerSha256 = hash(
  sources
    .map((path) => `${path}:${hash(readFileSync(resolve(root, path)))}`)
    .join("\n"),
);
const assets: ShipVisualAsset[] = [];
for (const [kind, dir] of [
  ["object", "ship-objects/r003"],
  ["component", "ship-components/r006"],
] as const) {
  const meta = JSON.parse(
    readFileSync(resolve(root, "assets/runtime", dir, "manifest.json"), "utf8"),
  );
  const rows = kind === "object" ? meta.objects : meta.components;
  for (const file of readdirSync(resolve(root, "assets/runtime", dir))
    .filter((f) => f.endsWith(".glb"))
    .sort()) {
    const bytes = readFileSync(resolve(root, "assets/runtime", dir, file));
    const row = rows.find(
      (r: any) => (r.id ?? r.designId) === file.slice(0, -4),
    );
    if (!row) throw Error(`Missing art metadata: ${file}`);
    const [lo, hi] = row.boundsM;
    const bounds: [number, number, number, number, number, number] = [
      lo[0],
      lo[2],
      -hi[1],
      hi[0],
      hi[2],
      -lo[1],
    ];
    assets.push({
      kind,
      id: file.slice(0, -4),
      frame: kind === "object" ? "interior" : row.frame,
      bounds,
      url: `/assets/${dir}/${file}`,
      sha256: hash(bytes),
      bytes: bytes.length,
    });
  }
}
// Exactly two independently reviewed mounted reactors. These rows replace
// only named candidate components; every published default URL remains intact.
const reactorBuilder = "scripts/art_library/ship_reference_r020_reactor.py";
if (
  hash(readFileSync(resolve(root, reactorBuilder))) !==
  "fa11e00e317f3af8bc1700fc2300239fbea2a2e88537366b7ac1f627a8919abc"
)
  throw Error("Mounted reactor builder differs from reviewed source");
const reactorPins = {
  "reactor.md": {
    sha256: "86707f363546a578323803ac4d0290f92ecab7988e93633f20da635c31c1c9fc",
    bytes: 84884,
    sourceSha256:
      "0906eb055515937005a09831a385866dfdde15afc6cc1af827b278091904cde8",
    metadataSha256:
      "2d7af07a41e67d739f0fb56b64908b3f5c405018b6817e259225a8440fb6805d",
  },
  "reactor.lg": {
    sha256: "a6c95612457ad95ad973ec4aafc6cb475776ade73a5c5968d4dbca1be65845c6",
    bytes: 84908,
    sourceSha256:
      "e1fa4011ff479498b52833600b40de9503bb90030bf0daa1aa40c19a865a8d7a",
    metadataSha256:
      "0e765452c2ada9e1714e9bff88e45ed0916900046940442041b3b39ec00cc71e",
  },
} as const;
for (const [id, pin] of Object.entries(reactorPins)) {
  const dir = "ship-visual/r002/equipment-r020",
    metadataPath = resolve(root, "assets/runtime", dir, `${id}-source.json`);
  const metadataBytes = readFileSync(metadataPath),
    meta = JSON.parse(metadataBytes.toString());
  const index = assets.findIndex((a) => a.kind === "component" && a.id === id);
  const bytes = readFileSync(resolve(root, "assets/runtime", dir, `${id}.glb`));
  if (
    index < 0 ||
    meta.id !== id ||
    meta.kind !== "component" ||
    meta.frame !== assets[index].frame ||
    meta.revision !== "r020" ||
    meta.source !==
      `assets/source/ship-reference/r002/equipment-r020/${id}.blend` ||
    meta.url !== `/assets/${dir}/${id}.glb` ||
    meta.oldAssetSha256 !== assets[index].sha256 ||
    JSON.stringify(meta.bounds) !== JSON.stringify(assets[index].bounds) ||
    hash(metadataBytes) !== pin.metadataSha256 ||
    hash(bytes) !== pin.sha256 ||
    bytes.length !== pin.bytes ||
    meta.sha256 !== pin.sha256 ||
    meta.bytes !== pin.bytes ||
    meta.triangles !== 1044 ||
    meta.emissiveAreaM2 !== 0 ||
    hash(readFileSync(resolve(root, meta.source))) !== pin.sourceSha256
  )
    throw Error(`Mounted reactor exact source/old envelope mismatch: ${id}`);
  assets[index] = {
    ...assets[index],
    url: meta.url,
    sha256: pin.sha256,
    bytes: pin.bytes,
  };
}
// Preserve the complete R020 verification above, then replace only the two
// reviewed R025 rows. Their original bounds, floor contact and placement remain.
const reactorR025Builder = "scripts/art_library/ship_reference_r025_reactor.py";
if (
  hash(readFileSync(resolve(root, reactorR025Builder))) !==
  "e74308bda96424f86956c5621aa2a49d77686b964e55e0aee47b255bb7e155b7"
)
  throw Error("R025 reactor builder differs from reviewed source");
const reactorR025Pins = {
  "reactor.md": {
    sha256: "88b6e9e0448247a343c919604639f924140b4aa7f50fc003d9986fe5965276ab",
    bytes: 93320,
    sourceSha256:
      "f4453f1a37ad71f0d7a501227c358fc836c0573e9a8169a32c9ba0bc71e515cf",
    metadataSha256:
      "06b549cf02083f11afd35a7164c6be11d701b9b2d34378da15caa2235ad2b017",
  },
  "reactor.lg": {
    sha256: "fbc03973b688c3d07fb58d2698c1f9f9ed5204154a59b06c08930d00d6a73b69",
    bytes: 93348,
    sourceSha256:
      "18521a6e285e1feba3a8b9af683296ec625f832cb68209c6f0e6b69373250340",
    metadataSha256:
      "b5791fd299e948813139a36da86b1a8cdc62e78749e9ac8bcd1522bbd1430fba",
  },
} as const;
for (const [id, pin] of Object.entries(reactorR025Pins)) {
  const dir = "ship-visual/r002/equipment-r025",
    metadataBytes = readFileSync(
      resolve(root, "assets/runtime", dir, `${id}-source.json`),
    ),
    meta = JSON.parse(metadataBytes.toString()),
    oldMeta = JSON.parse(
      readFileSync(
        resolve(
          root,
          "assets/runtime/ship-visual/r002/equipment-r020",
          `${id}-source.json`,
        ),
        "utf8",
      ),
    ),
    index = assets.findIndex((a) => a.kind === "component" && a.id === id),
    bytes = readFileSync(resolve(root, "assets/runtime", dir, `${id}.glb`));
  if (
    index < 0 ||
    meta.id !== id ||
    meta.kind !== "component" ||
    meta.frame !== assets[index].frame ||
    meta.revision !== "r025" ||
    meta.source !==
      `assets/source/ship-reference/r002/equipment-r025/${id}.blend` ||
    meta.url !== `/assets/${dir}/${id}.glb` ||
    meta.oldAssetSha256 !== oldMeta.oldAssetSha256 ||
    JSON.stringify(meta.bounds) !== JSON.stringify(assets[index].bounds) ||
    JSON.stringify(meta.baseContact) !== JSON.stringify(oldMeta.baseContact) ||
    JSON.stringify(meta.actualPlacement) !==
      JSON.stringify(oldMeta.actualPlacement) ||
    JSON.stringify(meta.semanticGroups) !==
      JSON.stringify(oldMeta.semanticGroups) ||
    meta.immutableR020SourceSha256 !==
      "fa11e00e317f3af8bc1700fc2300239fbea2a2e88537366b7ac1f627a8919abc" ||
    hash(metadataBytes) !== pin.metadataSha256 ||
    hash(bytes) !== pin.sha256 ||
    bytes.length !== pin.bytes ||
    meta.sha256 !== pin.sha256 ||
    meta.bytes !== pin.bytes ||
    meta.triangles !== 1168 ||
    meta.triangles > 1200 ||
    meta.emissiveAreaM2 !== 0 ||
    JSON.stringify(meta.serviceSides) !== JSON.stringify([-1, 1]) ||
    hash(readFileSync(resolve(root, meta.source))) !== pin.sourceSha256
  )
    throw Error(`R025 reactor exact source/retained envelope mismatch: ${id}`);
  assets[index] = {
    ...assets[index],
    url: meta.url,
    sha256: pin.sha256,
    bytes: pin.bytes,
  };
}
// Exactly three immutable, opt-in equipment replacements; never a broad
// object revision switch or a default content registry update.
const equipmentDir = "ship-visual/r002/equipment-r021";
const equipmentMeta = JSON.parse(
  readFileSync(
    resolve(root, "assets/runtime", equipmentDir, "manifest.json"),
    "utf8",
  ),
);
const equipmentIds = [
  "shipyard.equipment.wall-locker",
  "shipyard.equipment.bridge-bank",
  "pale-studless.console.standard",
].sort();
if (
  JSON.stringify([...equipmentMeta.requiredObjectIds].sort()) !==
    JSON.stringify(equipmentIds) ||
  equipmentMeta.objects.length !== equipmentIds.length ||
  equipmentMeta.generator.candidateBuilderSha256 !==
    hash(
      readFileSync(
        resolve(root, "scripts/art_library/ship_reference_r021_equipment.py"),
      ),
    ) ||
  equipmentMeta.generator.housingHelperSha256 !==
    equipmentHousingSourceSha256 ||
  hash(readFileSync(resolve(root, equipmentHousingSource))) !==
    equipmentHousingSourceSha256 ||
  equipmentMeta.generator.script !==
    "scripts/art_library/ship_component_export.py" ||
  equipmentMeta.generator.sha256 !==
    hash(readFileSync(resolve(root, equipmentMeta.generator.script))) ||
  equipmentMeta.generator.builders !==
    "scripts/art_library/ship_object_art.py" ||
  equipmentMeta.generator.buildersSha256 !==
    hash(readFileSync(resolve(root, equipmentMeta.generator.builders))) ||
  equipmentMeta.source.blend !==
    "assets/source/ship-reference/r002/equipment-r021/equipment.blend" ||
  equipmentMeta.source.sha256 !==
    hash(readFileSync(resolve(root, equipmentMeta.source.blend)))
)
  throw Error(
    "Equipment source/provenance does not match exact three-object proposal",
  );
for (const id of equipmentIds) {
  const row = equipmentMeta.objects.find((r: any) => r.designId === id);
  const index = assets.findIndex((a) => a.kind === "object" && a.id === id);
  if (!row || index < 0) throw Error(`Missing candidate equipment ${id}`);
  const bytes = readFileSync(
    resolve(root, "assets/runtime", equipmentDir, `${id}.glb`),
  );
  const [lo, hi] = row.boundsM;
  const bounds: [number, number, number, number, number, number] = [
    lo[0],
    lo[2],
    -hi[1],
    hi[0],
    hi[2],
    -lo[1],
  ];
  if (
    hash(bytes) !== row.sha256 ||
    bytes.length !== row.bytes ||
    !bounds.every(Number.isFinite) ||
    bounds.some((v, i) => i < 3 && v >= bounds[i + 3]) ||
    bounds.some((v, i) =>
      i < 3
        ? v < assets[index].bounds[i] - 1e-4
        : v > assets[index].bounds[i] + 1e-4,
    )
  )
    throw Error(`Candidate equipment violates pinned source/envelope: ${id}`);
  assets[index] = {
    ...assets[index],
    bounds,
    url: `/assets/${equipmentDir}/${id}.glb`,
    sha256: row.sha256,
    bytes: row.bytes,
  };
}
// One separately reviewed near-lip bank replaces its R21 row only. Keep the
// complete R21 gate above and every immutable earlier URL unchanged in place.
const bankDir = "ship-visual/r002/equipment-r022";
const bankManifestBytes = readFileSync(
  resolve(root, "assets/runtime", bankDir, "manifest.json"),
);
const bankMeta = JSON.parse(bankManifestBytes.toString());
const bankId = "shipyard.equipment.bridge-bank";
const bankRow = bankMeta.objects?.[0];
const bankIndex = assets.findIndex(
  (a) => a.kind === "object" && a.id === bankId,
);
const bankBytes = readFileSync(
  resolve(root, "assets/runtime", bankDir, `${bankId}.glb`),
);
if (
  hash(bankManifestBytes) !==
    "7a590c75d9bd7750e3f6dbfe7f7abd5d0be51352ab174a74455b167de5f16bc8" ||
  bankMeta.revision !== "equipment-r022" ||
  JSON.stringify(bankMeta.requiredObjectIds) !== JSON.stringify([bankId]) ||
  bankMeta.objects.length !== 1 ||
  bankRow?.designId !== bankId ||
  bankMeta.generator.candidateBuilder !==
    "scripts/art_library/ship_reference_r022_equipment.py" ||
  bankMeta.generator.candidateBuilderSha256 !==
    "6a081bb6e4011e5e656a906cc9069febfe719ca26553f90e14c06674f5955c50" ||
  hash(readFileSync(resolve(root, bankMeta.generator.candidateBuilder))) !==
    bankMeta.generator.candidateBuilderSha256 ||
  bankMeta.generator.equipmentHelper !==
    "scripts/art_library/ship_reference_r021_equipment.py" ||
  bankMeta.generator.equipmentHelperSha256 !==
    "8e007da11e4ed04263a304a23050997e9f27d8c0bee002439cd334e482b5f192" ||
  hash(readFileSync(resolve(root, bankMeta.generator.equipmentHelper))) !==
    bankMeta.generator.equipmentHelperSha256 ||
  bankMeta.generator.housingHelperSha256 !== equipmentHousingSourceSha256 ||
  bankMeta.generator.script !== equipmentMeta.generator.script ||
  bankMeta.generator.sha256 !== equipmentMeta.generator.sha256 ||
  bankMeta.generator.builders !== equipmentMeta.generator.builders ||
  bankMeta.generator.buildersSha256 !==
    equipmentMeta.generator.buildersSha256 ||
  bankMeta.source.blend !==
    "assets/source/ship-reference/r002/equipment-r022/equipment.blend" ||
  bankMeta.source.sha256 !==
    "2933dcbb09427b3dd44db33bed9ca599b013a2587dbb63bab15ad163f264fa87" ||
  hash(readFileSync(resolve(root, bankMeta.source.blend))) !==
    bankMeta.source.sha256 ||
  bankIndex < 0 ||
  assets[bankIndex].sha256 !==
    "911a09cb7d0fa51a5743ba1d1619db3bd08aba815453129fd94c0c9ee20ca8bf" ||
  bankRow.sha256 !==
    "3fe2c57755da1c0da24c7ab73972573988fc72c4038126d2da1f02ead63b8beb" ||
  hash(bankBytes) !== bankRow.sha256 ||
  bankRow.bytes !== 76456 ||
  bankBytes.length !== bankRow.bytes ||
  bankRow.triangles !== 790 ||
  JSON.stringify(bankRow.boundsM) !==
    JSON.stringify([
      [-1, -0.25, 0],
      [1, 0.25, 1.0625],
    ]) ||
  JSON.stringify(bankRow.sizeTexels) !== JSON.stringify([32, 8, 18])
)
  throw Error(
    "R22 bank does not match reviewed source, prior row or exact envelope",
  );
assets[bankIndex] = {
  ...assets[bankIndex],
  url: `/assets/${bankDir}/${bankId}.glb`,
  sha256: bankRow.sha256,
  bytes: bankRow.bytes,
};
// Two independently indexed R23 host derivatives preserve the actual R21
// envelopes/contact triangles. Retain the authentic earlier equipment gate and
// the separately qualified R22 bank; no old URL is overwritten.
const architectureDir = "ship-visual/r002/equipment-r023";
const architectureManifest = readFileSync(
  resolve(root, "assets/runtime", architectureDir, "manifest.json"),
);
const architectureMeta = JSON.parse(architectureManifest.toString());
const architectureIds = [
  "shipyard.equipment.wall-locker",
  "pale-studless.console.standard",
];
if (
  hash(architectureManifest) !==
    "3b9dc40141a61afb0b152f1bd5d2490cb0e76e9e33c84422fc8f33e70b192d60" ||
  architectureMeta.revision !== "equipment-r023" ||
  JSON.stringify(architectureMeta.requiredObjectIds) !==
    JSON.stringify(architectureIds) ||
  architectureMeta.objects.length !== 2 ||
  architectureMeta.generator.candidateBuilder !==
    "scripts/art_library/ship_reference_r023_architecture.py" ||
  architectureMeta.generator.candidateBuilderSha256 !==
    "a273f5cdd53e18f4b72730223e6df1e25c8ab0d57cce38f8f8702558371574ed" ||
  hash(
    readFileSync(resolve(root, architectureMeta.generator.candidateBuilder)),
  ) !== architectureMeta.generator.candidateBuilderSha256 ||
  architectureMeta.generator.equipmentHelper !==
    "scripts/art_library/ship_reference_r021_equipment.py" ||
  architectureMeta.generator.equipmentHelperSha256 !==
    equipmentMeta.generator.candidateBuilderSha256 ||
  hash(
    readFileSync(resolve(root, architectureMeta.generator.equipmentHelper)),
  ) !== architectureMeta.generator.equipmentHelperSha256 ||
  architectureMeta.generator.housingHelperSha256 !==
    equipmentHousingSourceSha256 ||
  architectureMeta.generator.script !== equipmentMeta.generator.script ||
  architectureMeta.generator.sha256 !== equipmentMeta.generator.sha256 ||
  architectureMeta.generator.builders !== equipmentMeta.generator.builders ||
  architectureMeta.generator.buildersSha256 !==
    equipmentMeta.generator.buildersSha256 ||
  architectureMeta.source.blend !==
    "assets/source/ship-reference/r002/equipment-r023/equipment.blend" ||
  architectureMeta.source.sha256 !==
    "eb31c053ea7d116d50d1bbb92f5f408d3a9511ce6e28708f2614e00b47c5a658" ||
  hash(readFileSync(resolve(root, architectureMeta.source.blend))) !==
    architectureMeta.source.sha256
)
  throw Error(
    "R23 host source/provenance differs from the indexed two-host proof",
  );
const architecturePins = {
  "shipyard.equipment.wall-locker": {
    previous:
      "ea6d67457207377ce4164f680c14970a5dc4f4f050fb2f8fc10e5beffe2d2d96",
    sha256: "bd538dbde6ab8a2c189607ce6009019aca02252ce86203488f85944610a0f1f4",
    bytes: 55388,
    triangles: 536,
  },
  "pale-studless.console.standard": {
    previous:
      "dd8257e2a7fb8f173bc3fd2962c025b6645eae59e818216f911682befacf0eed",
    sha256: "8d40cff92adc7cffe9307e87eeb7e88bfc72d799b3321de4ad141a46db1b9662",
    bytes: 76420,
    triangles: 762,
  },
};
for (const [id, pin] of Object.entries(architecturePins)) {
  const row = architectureMeta.objects.find((r: any) => r.designId === id);
  const prior = equipmentMeta.objects.find((r: any) => r.designId === id);
  const index = assets.findIndex((a) => a.kind === "object" && a.id === id);
  const bytes = readFileSync(
    resolve(root, "assets/runtime", architectureDir, `${id}.glb`),
  );
  if (
    !row ||
    !prior ||
    index < 0 ||
    assets[index].sha256 !== pin.previous ||
    row.sha256 !== pin.sha256 ||
    hash(bytes) !== pin.sha256 ||
    row.bytes !== pin.bytes ||
    bytes.length !== pin.bytes ||
    row.triangles !== pin.triangles ||
    JSON.stringify(row.boundsM) !== JSON.stringify(prior.boundsM) ||
    JSON.stringify(row.sizeTexels) !== JSON.stringify(prior.sizeTexels)
  )
    throw Error(
      `R23 host mismatches actual admitted row/contact envelope: ${id}`,
    );
  assets[index] = {
    ...assets[index],
    url: `/assets/${architectureDir}/${id}.glb`,
    sha256: row.sha256,
    bytes: row.bytes,
  };
}
// The two finite room fixtures are admitted only with the explicit private layout.
// Bind the corrected normal source, prior failed authoring source and actual output
// bytes independently; never select the failed reference-r025 directory.
const roomBuilder = "scripts/art_library/ship_reference_r025_rooms_clean.py";
const roomPreviousBuilder = "scripts/art_library/ship_reference_r025_rooms.py";
const roomBuilderSha256 =
  "a1ebc2ac2142fcad372caa9adfbf0be9a0b3006db34bcbb68384251a8f90d400";
const roomPreviousSha256 =
  "cadd4cffaa5cf8624bb814866c1e70bd4ee1f9283dff52e5c70eb78a9a206c71";
const roomPins = {
  "shipyard.equipment.workshop-bank-r025": {
    sha256: "65b2db98cff4bacf80e0632c0457b3abd80f997e69903462b711afc3ce4bf7b2",
    bytes: 124380,
    triangles: 1124,
    metadataSha256:
      "14fc0290e59154e314ef2f5dd94796f34f07e4a0a7cab9f3e16a9245cfe829a6",
    sourceSha256:
      "1d155d878f0ae01504a810aa6a849fd98ceee6bd0aa1438442aca3f116220981",
  },
  "shipyard.equipment.medical-equipment-bank-r025": {
    sha256: "c7eff904bf0c1ea1b7c0e24a3cd02f595710570adf10a592a31965dbfa0fe393",
    bytes: 97908,
    triangles: 866,
    metadataSha256:
      "38c1e3df72b27120f3b0e6b3510950eea345d0faf787284c1757bfc8647fc4eb",
    sourceSha256:
      "fe635cf1dcea58764168a25dc15dacc17154a7ec2091410b9b96d8326f131e6d",
  },
} as const;
if (roomCandidate) {
  if (
    hash(readFileSync(resolve(root, roomBuilder))) !== roomBuilderSha256 ||
    hash(readFileSync(resolve(root, roomPreviousBuilder))) !==
      roomPreviousSha256
  )
    throw Error(
      "Finite room source differs from qualified corrected and historical builders",
    );
  for (const entry of REFERENCE_ROOM_FIXTURE_CATALOG_R025.entries) {
    const id = entry.designId,
      pin = roomPins[id],
      dir = "ship-objects/reference-r025-clean";
    const metadataBytes = readFileSync(
      resolve(root, "assets/runtime", dir, `${id}-source.json`),
    );
    const meta = JSON.parse(metadataBytes.toString());
    const bytes = readFileSync(
      resolve(root, "assets/runtime", dir, `${id}.glb`),
    );
    const [w, d, h] = entry.texels,
      expectedBounds = [
        [-w / 32, -d / 32, 0],
        [w / 32, d / 32, h / 16],
      ];
    if (
      assets.some((a) => a.kind === "object" && a.id === id) ||
      hash(metadataBytes) !== pin.metadataSha256 ||
      meta.designId !== id ||
      meta.revision !== "r025" ||
      meta.generator !== roomBuilder ||
      meta.generatorSha256 !== roomBuilderSha256 ||
      meta.immutablePreviousSourceSha256 !== roomPreviousSha256 ||
      meta.helperSha256 !==
        hash(
          readFileSync(
            resolve(
              root,
              "scripts/art_library/ship_reference_r018_equipment.py",
            ),
          ),
        ) ||
      meta.semanticAuthoringSha256 !==
        hash(
          readFileSync(
            resolve(root, "scripts/art_library/ship_reference_r002_art.py"),
          ),
        ) ||
      meta.source !==
        `assets/source/ship-reference/r002/rooms-r025-clean/${id}.blend` ||
      hash(readFileSync(resolve(root, meta.source))) !== pin.sourceSha256 ||
      meta.sourceSha256 !== pin.sourceSha256 ||
      meta.url !== `/assets/${dir}/${id}.glb` ||
      meta.glb !== `assets/runtime/${dir}/${id}.glb` ||
      hash(bytes) !== pin.sha256 ||
      meta.sha256 !== pin.sha256 ||
      bytes.length !== pin.bytes ||
      meta.bytes !== pin.bytes ||
      meta.triangles !== pin.triangles ||
      JSON.stringify(meta.sizeTexels) !== JSON.stringify(entry.texels) ||
      JSON.stringify(meta.boundsM) !== JSON.stringify(expectedBounds) ||
      JSON.stringify(meta.capabilities) !==
        JSON.stringify({ seat: false, storage: false, control: false })
    )
      throw Error(`Finite room fixture source/catalog/output mismatch: ${id}`);
    const [lo, hi] = meta.boundsM;
    assets.push({
      kind: "object",
      id,
      frame: "interior",
      bounds: [lo[0], lo[2], -hi[1], hi[0], hi[2], -lo[1]],
      url: meta.url,
      sha256: pin.sha256,
      bytes: pin.bytes,
    });
  }
}

// The candidate overrides legacy r004 catalog URLs with these exact r006 assets.
// A fixed-pose roof certificate admits ONLY actual selected bytes/frame/bounds.
for (const [id, certificate] of Object.entries(
  REFERENCE_ROOF_FIXED_POSE_R002,
)) {
  const asset = assets.find((a) => a.kind === "component" && a.id === id);
  if (
    !asset ||
    asset.frame !== certificate.frame ||
    asset.sha256 !== certificate.assetSha256 ||
    asset.url !== `/assets/ship-components/r006/${id}.glb` ||
    JSON.stringify(asset.bounds) !== JSON.stringify(certificate.bounds) ||
    certificate.motion !== "fixed-pose" ||
    hash(
      readFileSync(
        resolve(root, "assets/runtime", asset.url.slice("/assets/".length)),
      ),
    ) !== certificate.assetSha256
  )
    throw Error(
      `R24 roof operating certificate mismatches selected component: ${id}`,
    );
}
// Measured static certificates cannot qualify space using unrelated old heights.
const objectMetadata = JSON.parse(
  readFileSync(
    resolve(root, "assets/runtime/ship-objects/r003/manifest.json"),
    "utf8",
  ),
);
for (const [id, certificate] of Object.entries(
  REFERENCE_STATIC_WALL_FITTINGS_R002,
)) {
  const row = objectMetadata.objects.find((r: any) => r.designId === id);
  const asset = assets.find((a) => a.kind === "object" && a.id === id);
  if (
    !row ||
    !asset ||
    asset.frame !== "interior" ||
    asset.sha256 !== certificate.assetSha256 ||
    certificate.artQuarterTurns !== interiorArtQuarterTurns(id) ||
    JSON.stringify([...row.boundsM[0], ...row.boundsM[1]]) !==
      JSON.stringify(certificate.bounds)
  )
    throw Error(
      `Static fitting wall certificate mismatches actual selected geometry: ${id}`,
    );
}
// Retained optical shell and mount art stays pinned to its published native source.
const kitBytes = readFileSync(
  resolve(root, "assets/runtime/ship-kit/r002/manifest.json"),
);
const kit = JSON.parse(kitBytes.toString("utf8"));
// A finite optical certificate is valid only for the retained bytes it actually
// measured. A native-kit revision must never silently reuse old 3D exclusions.
for (const [id, certificate] of Object.entries(
  REFERENCE_OPTICAL_INTERFACES_R002,
)) {
  const piece = kit.pieces[id];
  if (
    !piece ||
    hash(
      readFileSync(resolve(root, "assets/runtime/ship-kit/r002", piece.file)),
    ) !== certificate.assetSha256
  )
    throw Error(
      `Retained optical certificate does not match native bytes: ${id}`,
    );
  const parts =
    certificate.sourceFrameBounds.length +
    certificate.retainedGlassBounds.length;
  if (
    (certificate.kind === "optical" && parts === 0) ||
    (certificate.kind === "non-optical" && parts !== 0) ||
    !["optical", "non-optical"].includes(certificate.kind)
  )
    throw Error(`Ambiguous optical/non-optical classification: ${id}`);
  for (const bounds of [
    ...certificate.sourceFrameBounds,
    ...certificate.retainedGlassBounds,
  ])
    if (
      bounds.length !== 6 ||
      !bounds.every(Number.isFinite) ||
      bounds.some((v, i) => i < 3 && v > bounds[i + 3])
    )
      throw Error(`Invalid optical certificate bounds: ${id}`);
}
assets.push({
  kind: "kit-manifest",
  id: "native",
  url: "/assets/ship-kit/r002/manifest.json",
  sha256: hash(kitBytes),
  bytes: kitBytes.length,
});
for (const [path, sha] of Object.entries(
  REFERENCE_OPTICAL_MATING_SOURCE_SHA256_R002,
))
  if (hash(readFileSync(resolve(root, path))) !== sha)
    throw Error(`Mating pigment source attribution mismatch: ${path}`);
for (const [id, row] of Object.entries(REFERENCE_OPTICAL_MATING_PIGMENTS_R002))
  if (row.assetSha256 !== REFERENCE_OPTICAL_INTERFACES_R002[id]?.assetSha256)
    throw Error(`Mating pigment retained asset mismatch: ${id}`);
const kitFiles = new Map<string, { bytes: Uint8Array; sha256: string }>();
for (const [id, row] of Object.entries<any>(kit.pieces)) {
  if (!row.slots.includes("glass") && !id.startsWith("mount.")) continue;
  let data = kitFiles.get(row.file);
  if (!data) {
    const bytes = readFileSync(
      resolve(root, "assets/runtime/ship-kit/r002", row.file),
    );
    data = { bytes, sha256: hash(bytes) };
    kitFiles.set(row.file, data);
  }
  const [x0, y0, z0, x1, y1, z1] = row.bounds;
  assets.push({
    kind: "kit",
    id,
    frame: "interior",
    bounds: [x0 / 16, z0 / 16, -y1 / 16, x1 / 16, z1 / 16, -y0 / 16],
    url: `/assets/ship-kit/r002/${row.file}`,
    sha256: data.sha256,
    bytes: data.bytes.length,
    ...(row.node ? { node: row.node } : {}),
  });
}
const normal = readFileSync(
  resolve(root, "assets/runtime/ship-visual/r002/panel-normal.png"),
);
const leaf = readFileSync(
  resolve(root, "assets/runtime/ship-visual/r002/door-leaf-r019.glb"),
);
const leafSource = JSON.parse(
  readFileSync(
    resolve(root, "assets/runtime/ship-visual/r002/door-leaf-r019-source.json"),
    "utf8",
  ),
);
assets.push({
  kind: "kit",
  id: "door-leaf.reference",
  url: "/assets/ship-visual/r002/door-leaf-r019.glb",
  sha256: hash(leaf),
  bytes: leaf.length,
  frame: "interior",
  bounds: leafSource.bounds,
});
assets.push({
  kind: "normal",
  id: "panel",
  url: "/assets/ship-visual/r002/panel-normal.png",
  sha256: hash(normal),
  bytes: normal.length,
});
const albedo = readFileSync(
  resolve(root, "assets/runtime/ship-visual/r002/panel-albedo.png"),
);
assets.push({
  kind: "albedo",
  id: "panel",
  url: "/assets/ship-visual/r002/panel-albedo.png",
  sha256: hash(albedo),
  bytes: albedo.length,
});
if (roomCandidate)
  for (const fixture of roomCandidate.fixtures ?? [])
    if (
      !assets.some(
        (asset) => asset.kind === "object" && asset.id === fixture.design,
      )
    )
      throw Error(
        `Reference room fixture lacks exact asset admission: ${fixture.design}`,
      );
const manifest = readShipVisualManifest({
  schema: SHIP_VISUAL_SCHEMA,
  revision: "r002",
  status: "proposal",
  frame: SHIP_VISUAL_FRAME,
  lattice: 16,
  compilerSha256,
  profilesSha256: visualProfilesSha256("r002"),
  slots: [...SHIP_KIT_SLOTS],
  prefabs: Object.fromEntries(
    [...reviewPrefabs, ...SHIP_VISUAL_FIXTURES].map((p) => [
      p.id,
      visualPrefabSha256(p),
    ]),
  ),
  assets,
  decorativeEnvelope: { outward: 0.1875, upward: 0.1875, inward: 0 },
});
const json = JSON.stringify(manifest, null, 2) + "\n";
mkdirSync(resolve(root, "assets/runtime/ship-visual/r002"), {
  recursive: true,
});
writeFileSync(
  resolve(root, "assets/runtime/ship-visual/r002/manifest.json"),
  json,
);
writeFileSync(
  resolve(root, "scripts/art_library/ship_reference_r002_revision.ts"),
  await format(
    `/** Generated exact proposal pin; no default renderer or live asset selection. */\nexport const SHIP_REFERENCE_VISUAL_R002 = ${JSON.stringify({ url: "/assets/ship-visual/r002/manifest.json", sha256: hash(json), compilerSha256, ...(roomCandidate ? { roomLayout, roomPrefabSha256: visualPrefabSha256(roomCandidate) } : {}) }, null, 2)} as const;\n`,
    { parser: "typescript" },
  ),
);
writeFileSync(
  resolve(root, "assets/runtime/ship-visual/r002/source-manifest.json"),
  JSON.stringify(
    {
      status: "proposal",
      compilerSha256,
      sources: sources.map((path) => ({
        path,
        sha256: hash(readFileSync(resolve(root, path))),
      })),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    revision: manifest.revision,
    assets: assets.length,
    bytes: [...new Map(assets.map((a) => [a.url, a.bytes])).values()].reduce(
      (s, b) => s + b,
      0,
    ),
    compilerSha256,
    manifestSha256: hash(json),
  }),
);
