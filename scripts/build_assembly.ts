import {applyHullPublication} from './hull_publication';
const approvedEquipment = JSON.parse(readFileSync('assets/runtime/assembly/equipment-manifest.json','utf8')).entries as {asset:PartAsset}[];
import { refineBotanicalSurface, hydroponicSurfaceOrigin, manufacturedPropVolume } from "../packages/content/src/voxel-wayfarer-props";
import { writeAssemblyThumbnails } from "./assembly_thumbnails";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createVoxelWayfarer,
  VOXEL_METERS,
  VOXEL_PALETTE,
} from "../packages/content/src/voxel-wayfarer";
import {
  VoxelVolume,
  meshChunk,
  encodeVoxels,
  decodeVoxels,
} from "../packages/sim/src/voxels";
import type {
  PartCategory,
  PartAsset,
  PartPlacement,
} from "../packages/content/src/assembly";
const groups = new Map<
  string,
  { category: PartCategory; layers: Map<string, VoxelVolume> }
>();
function category(name: string): PartCategory {
  if (name === "deck") return "floor";
  if (name === "walls" || name.startsWith("cutaway") || name === "partitions")
    return "wall";
  if (name === "roof") return "roof";
  if (name === "armor") return "superstructure";
  if (name === "markings") return "decoration";
  if (name.startsWith("drives")) return "engine";
  if (name.startsWith("room-storage-container")) return "cargo";
  return "equipment";
}
const interiorProps = JSON.parse(readFileSync("assets/runtime/voxels/interior-props.voxels.json", "utf8"));
for (const [layer, volume] of createVoxelWayfarer(interiorProps)) {
  const kind = category(layer),
    segmented = [
      "floor",
      "wall",
      "roof",
      "superstructure",
      "decoration",
    ].includes(kind);
  for (const chunk of volume.chunks.values())
    for (let i = 0; i < chunk.cells.length; i++) {
      const m = chunk.cells[i];
      if (!m) continue;
      const x = chunk.origin[0] + (i % 32),
        y = chunk.origin[1] + (Math.floor(i / 32) % 32),
        z = chunk.origin[2] + Math.floor(i / 1024);
      // Structural source is cut on construction-cell boundaries. Furniture and
      // machinery use explicit object groups, never arbitrary spatial partitions.
      const name = segmented
        ? `${kind}-${Math.floor((x + 16) / 32)}-${Math.floor((y + 16) / 32)}`
        : layer;
      let group = groups.get(name);
      if (!group) {
        group = { category: kind, layers: new Map() };
        groups.set(name, group);
      }
      let v = group.layers.get(layer);
      if (!v) {
        v = new VoxelVolume();
        group.layers.set(layer, v);
      }
      v.set(x, y, z, m);
    }
}
const assets: PartAsset[] = [],
  placements: PartPlacement[] = [],
  meshes: {
    name: string;
    vertices: number[][];
    faces: number[][];
    materials: number[];
    cellMeters?: number;
  }[] = [],
  known = new Map<string, string>(),
  volumes: Record<string, unknown> = {};
for (const [name, group] of groups) {
  const points: [number, number, number, number, string][] = [];
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const [layer, v] of group.layers)
    for (const c of v.chunks.values())
      for (let i = 0; i < c.cells.length; i++)
        if (c.cells[i]) {
          const x = c.origin[0] + (i % 32),
            y = c.origin[1] + (Math.floor(i / 32) % 32),
            z = c.origin[2] + Math.floor(i / 1024);
          points.push([x, y, z, c.cells[i], layer]);
          [x, y, z].forEach((n, a) => {
            min[a] = Math.min(min[a], n);
            max[a] = Math.max(max[a], n + 1);
          });
        }
  const anchor = [
    Math.floor((min[0] + max[0]) / 2),
    Math.floor((min[1] + max[1]) / 2),
    min[2],
  ];
  const local = new Map<string, VoxelVolume>();
  for (const [x, y, z, m, layer] of points) {
    let v = local.get(layer);
    if (!v) {
      v = new VoxelVolume();
      local.set(layer, v);
    }
    v.set(x - anchor[0], y - anchor[1], z - anchor[2], m);
  }
  const signature = JSON.stringify(
    [...local].map(([layer, v]) => [
      group.category === "wall"
        ? layer.replace(/cutaway-.*/, "upper")
        : group.category,
      [...v.chunks].map(([id, c]) => [id, encodeVoxels(c.cells)]),
    ]),
  );
  const digest = createHash("sha256")
      .update(signature)
      .digest("hex")
      .slice(0, 20),
    assetId = "part-" + digest;
  placements.push({
    id: name,
    assetId,
    position: anchor.map((n) => n * VOXEL_METERS) as [number, number, number],
    rotation: 0,
    flipped: false,
    removedCells: [],
  });
  if (known.has(assetId)) continue;
  known.set(assetId, name);
  volumes[assetId] = {
    cellMeters: VOXEL_METERS,
    layers: [...local].map(([layer, v]) => ({
      layer,
      chunks: [...v.chunks].map(([id, c]) => ({
        id,
        origin: c.origin,
        runs: encodeVoxels(c.cells),
      })),
    })),
  };
  const nodes: string[] = [];
  for (const [layer, v] of local) {
    if (approvedEquipment.some(e => e.asset.id === assetId)) continue;
    const meshingVolume = hydroponicSurfaceOrigin(layer, VOXEL_METERS) ? manufacturedPropVolume(v) : v;
    const vertices: number[][] = [],
      faces: number[][] = [],
      materials: number[] = [];
    for (const chunk of meshingVolume.chunks.values())
      for (const q of meshChunk(meshingVolume, chunk)) {
        const i = vertices.length;
        vertices.push(...q.corners.map((p) => p.map((n) => n * VOXEL_METERS)));
        faces.push([i, i + 1, i + 2, i + 3]);
        materials.push(q.material);
      }
    const node = assetId + "--" + layer;
    nodes.push("GEO-" + node);
    const visualMesh = { name: node, vertices, faces, materials };
    const botanicalOrigin = hydroponicSurfaceOrigin(layer, VOXEL_METERS);
    if (botanicalOrigin) refineBotanicalSurface(visualMesh, interiorProps.hydroponics, botanicalOrigin.map((n,i) => n - anchor[i] * VOXEL_METERS));
    meshes.push(visualMesh);
  }
  assets.push({
    id: assetId,
    label: name.replace(/^-|-/g, " "),
    category: group.category,
    nodes,
    bounds: {
      min: min.map((n, a) => (n - anchor[a]) * VOXEL_METERS),
      max: max.map((n, a) => (n - anchor[a]) * VOXEL_METERS),
    },
  });
}
// Reference kit is authored as good-quality Blender solids, then voxelized.
// Keep its finer pitch and material identities; no raster-to-geometry imitation.
for (const slug of ["bulkhead", "airlock"]) {
  const sampled = JSON.parse(
    readFileSync(`.runtime/art/${slug}-samples.json`, "utf8"),
  );
  const volume = new VoxelVolume();
  for (const [x, y, z, m] of sampled.cells) {
    const id = sampled.palette[m].voxelMaterialId;
    if (!id) throw new Error("Missing kit material mapping");
    volume.set(x, y, z, id);
  }
  const id =
    "part-" +
    createHash("sha256")
      .update(JSON.stringify(sampled.cells))
      .digest("hex")
      .slice(0, 20);
  const vertices: number[][] = [],
    faces: number[][] = [],
    materials: number[] = [];
  for (const chunk of volume.chunks.values())
    for (const face of meshChunk(volume, chunk)) {
      const i = vertices.length;
      vertices.push(
        ...face.corners.map((p) => p.map((n) => n * sampled.cellMeters)),
      );
      faces.push([i, i + 1, i + 2, i + 3]);
      materials.push(face.material);
    }
  const name = id + "--" + slug;
  meshes.push({
    name,
    vertices,
    faces,
    materials,
    cellMeters: sampled.cellMeters,
  });
  assets.push({
    id,
    label:
      slug === "bulkhead"
        ? "Orion pressure bulkhead"
        : "Orion pressure airlock",
    category: "wall",
    nodes: ["GEO-" + name],
    bounds: { min: [-1, -0.5, 0], max: [1, 0.5, 2.5] },
  });
  volumes[id] = {
    cellMeters: sampled.cellMeters,
    layers: [
      {
        layer: slug,
        chunks: [...volume.chunks].map(([id, c]) => ({
          id,
          origin: c.origin,
          runs: encodeVoxels(c.cells),
        })),
      },
    ],
  };
}
for (const {asset} of approvedEquipment) {
  const index=assets.findIndex(a=>a.id===asset.id);
  if(index<0)throw new Error('Approved equipment identity changed: '+asset.id);
  assets[index]={...assets[index],...asset};
}
applyHullPublication(assets,placements,volumes);
// Retained legacy catalog entries may no longer occur in today's default ship.
// Recreate their existing surfaces from preserved data so older drafts still load.
const exportedNodes = new Set(meshes.map(mesh => 'GEO-' + mesh.name));
for (const asset of assets) {
  if (asset.visual) continue;
  const stored = volumes[asset.id] as {cellMeters:number;layers:{layer:string;chunks:{id:string;origin:[number,number,number];runs:number[]}[]}[]};
  for (const layer of stored.layers) {
    const name = asset.id + '--' + layer.layer;
    if (!asset.nodes.includes('GEO-' + name) || exportedNodes.has('GEO-' + name)) continue;
    const volume = new VoxelVolume();
    for (const chunk of layer.chunks) volume.chunks.set(chunk.id, {origin:chunk.origin,cells:decodeVoxels(chunk.runs)});
    const mesh = {name,vertices:[] as number[][],faces:[] as number[][],materials:[] as number[]};
    for (const chunk of volume.chunks.values()) for (const face of meshChunk(volume,chunk)) {
      const start=mesh.vertices.length;
      mesh.vertices.push(...face.corners.map(p=>p.map(n=>n*stored.cellMeters)));
      mesh.faces.push([start,start+1,start+2,start+3]);mesh.materials.push(face.material);
    }
    meshes.push(mesh);exportedNodes.add('GEO-' + name);
  }
}
mkdirSync("assets/runtime/assembly", { recursive: true });
writeFileSync(
  ".runtime/art/assembly-meshes.json",
  JSON.stringify({ palette: VOXEL_PALETTE, meshes }),
);
writeFileSync(
  "assets/runtime/assembly/catalog.json",
  JSON.stringify({ schema: "sidereal.part-catalog.v1", assets }, null, 2) +
    "\n",
);
writeFileSync(
  "assets/runtime/assembly/catalog.voxels.json",
  JSON.stringify({
    schema: "sidereal.part-volumes.v1",
    cellMeters: VOXEL_METERS,
    palette: VOXEL_PALETTE,
    volumes,
  }),
);
writeFileSync(
  "assets/runtime/assembly/wayfarer.json",
  JSON.stringify(
    {
      schema: "sidereal.assembly-draft.v1",
      id: "wayfarer-study",
      name: "Wayfarer",
      parts: placements,
    },
    null,
    2,
  ) + "\n",
);
console.log({
  assemblyPlacements: placements.length,
  uniqueAssets: assets.length,
  meshLayers: meshes.length,
});

writeAssemblyThumbnails(meshes, VOXEL_PALETTE);
