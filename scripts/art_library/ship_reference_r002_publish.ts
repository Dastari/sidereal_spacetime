/** Immutable candidate metadata; explicitly does not publish an app or change live pins. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { format } from "prettier";
import { SHIP_VISUAL_FIXTURES } from "@sidereal/content/ship-visual-fixture";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import {
  REFERENCE_OPTICAL_INTERFACES_R002,
  REFERENCE_OPTICAL_MATING_PIGMENTS_R002,
  REFERENCE_OPTICAL_MATING_SOURCE_SHA256_R002,
  REFERENCE_STATIC_WALL_FITTINGS_R002,
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
  "packages/sim/src/ship-dresser.ts",
  "packages/content/src/ship-prefab.ts",
  "packages/content/src/ship-furniture.ts",
  "packages/sim/src/ship-visual-sampler.ts",
  "packages/sim/src/ship-visual-compiler.ts",
  "packages/render/src/prefab-ship/sampled-structure.ts",
  "packages/render/src/prefab-ship/sampled-facets.ts",
  "packages/render/src/prefab-ship/sampled-ao.ts",
  "packages/render/src/prefab-ship/normal-detail.ts",
  "packages/render/src/prefab-ship/ship-view.ts",
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
  "assets/runtime/ship-visual/r002/door-leaf-r019-source.json",
  "scripts/art_library/ship_reference_r018_equipment.py",
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
// Exactly three immutable, opt-in equipment replacements; never a broad
// object revision switch or a default content registry update.
const equipmentDir = "ship-visual/r002/equipment-r018";
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
        resolve(root, "scripts/art_library/ship_reference_r018_equipment.py"),
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
    "assets/source/ship-reference/r002/equipment-r018/equipment.blend" ||
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
    [...PREFAB_SHIPS, ...SHIP_VISUAL_FIXTURES].map((p) => [
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
    `/** Generated exact proposal pin; no default renderer or live asset selection. */\nexport const SHIP_REFERENCE_VISUAL_R002 = ${JSON.stringify({ url: "/assets/ship-visual/r002/manifest.json", sha256: hash(json), compilerSha256 }, null, 2)} as const;\n`,
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
