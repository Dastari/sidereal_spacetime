import { CABIN_ROOMS } from "./interior";
import { VoxelVolume } from "../../sim/src/voxels";

/** Authored closed-solid samples; runtime collision and placed identity are separate. */
export interface SampledInteriorProp {
  cellMeters: number;
  palette: ({ voxelMaterialId: number } | null)[];
  cells: number[][];
  visualSurface?: { kind: "authored-botanical-surface"; vertices: number[][]; faces: number[][]; materials: number[] };
}
export interface WayfarerInteriorProps { hydroponics: SampledInteriorProp }
export const INTERIOR_PROP_PALETTE = ["#699a42", "#584332", "#a2b954", "#b87752"];
/** Sample intervals are translated on the ship matter grid, not turned into skins. */
export function stampInteriorProp(volume: VoxelVolume, source: SampledInteriorProp, origin: readonly number[], pitch: number) {
  if (source.cellMeters !== pitch) throw new Error("Interior prop sample pitch mismatch");
  const anchor = origin.map(n => Math.round(n / pitch));
  for (const [x,y,z,m] of source.cells) {
    const material = source.palette[m]?.voxelMaterialId;
    if (!material || !Number.isSafeInteger(material) || material > 255) throw new Error("Interior prop material is unavailable");
    volume.set(x + anchor[0],y + anchor[1],z + anchor[2],material);
  }
}

/** Manufactured solids retain sampled faces. Botanical detail is an explicitly
 * authored presentation surface over the unchanged sampled matter. */
export function refineBotanicalSurface(mesh: { vertices: number[][]; faces: number[][]; materials: number[] }, source: SampledInteriorProp, translation: readonly number[]) {
  const surface = source.visualSurface;
  if (!surface) return;
  const faces: number[][] = [], materials: number[] = [];
  mesh.faces.forEach((face, i) => {
    if (![17,18,36,38].includes(mesh.materials[i])) { faces.push(face); materials.push(mesh.materials[i]); }
  });
  // Compact surviving geometry so discarded matter faces do not create phantom
  // T-junction vertices when the exporter welds the manufactured surface.
  const used = [...new Set(faces.flat())], remap = new Map(used.map((id,i) => [id,i]));
  const vertices = used.map(i => mesh.vertices[i]);
  mesh.faces = faces.map(face => face.map(i => remap.get(i)!)); mesh.materials = materials;
  const offset = vertices.length;
  vertices.push(...surface.vertices.map(p => p.map((n,i) => n + translation[i])));
  mesh.vertices = vertices;
  mesh.faces.push(...surface.faces.map(face => face.map(i => i + offset)));
  mesh.materials.push(...surface.materials);
}

export function hydroponicSurfaceOrigin(name: string, pitch: number): number[] | undefined {
  const prefix = "room-hydroponics-tray-";
  if (!name.startsWith(prefix)) return;
  const y = Number(name.slice(prefix.length));
  if (!Number.isFinite(y)) throw new Error("Invalid hydroponic tray identity");
  const room = CABIN_ROOMS.find(room => room.id === "hydroponics")!;
  return [room.x + Math.sign(room.x) * .6,y,.25].map(n => Math.round(n / pitch) * pitch);
}

/** Close manufactured matter beneath botanical presentation, without mutating the
 * stored occupied volume. Simply dropping leaf faces would leave open pot wells. */
export function manufacturedPropVolume(source: VoxelVolume): VoxelVolume {
  const visual = new VoxelVolume();
  for (const [id,chunk] of source.chunks) {
    const cells = chunk.cells.slice();
    for (let i=0;i<cells.length;i++) if ([17,18,36,38].includes(cells[i])) cells[i]=0;
    visual.chunks.set(id,{origin:chunk.origin,cells});
  }
  return visual;
}
