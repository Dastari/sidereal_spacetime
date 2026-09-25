import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import type { LayoutDocument, Point } from "@sidereal/content/ship-layout";
import {
  area2,
  canonicalPolygon,
  cross,
  onSegment,
  properCross,
} from "@sidereal/sim/layout-geometry";
import { setMeshRole } from "./mesh-roles";

import {
  DEFAULT_FLOOR_FINISH,
  FLOOR_FINISHES,
  type FloorFinish,
} from "./floor-finishes";
export {
  DEFAULT_FLOOR_FINISH,
  FLOOR_FINISHES,
  type FloorFinish,
} from "./floor-finishes";
const standardFinishes = new Map(FLOOR_FINISHES.map((f) => [f.id, f]));
export interface FloorSlabInput {
  document: LayoutDocument;
  deckId: string;
  finishes?: ReadonlyMap<string, FloorFinish>;
}

/** Presentation geometry only. Closed slabs follow individually valid polygons;
 * connectivity, wall qualification and native asset bindings cannot erase them. */
export function floorSlabGeometry(
  vertices: Point[],
  elevationM = 0,
  repeatM = 2,
) {
  if (
    !Number.isFinite(elevationM) ||
    !Number.isFinite(repeatM) ||
    repeatM <= 0 ||
    vertices.length < 3 ||
    vertices.length > 256 ||
    vertices.some((p) =>
      p.some((n) => !Number.isInteger(n) || Math.abs(n) > 8192),
    )
  )
    throw Error("Invalid floor polygon");
  const p = canonicalPolygon(vertices);
  if (area2(p) <= 0) throw Error("Floor polygon has no area");
  for (let i = 0; i < p.length; i++) {
    const a = p[i],
      b = p[(i + 1) % p.length];
    if (a[0] === b[0] && a[1] === b[1]) throw Error("Repeated floor vertex");
    for (let j = i + 1; j < p.length; j++) {
      if (j === i + 1 || (i === 0 && j === p.length - 1)) continue;
      const c = p[j],
        d = p[(j + 1) % p.length];
      if (
        properCross(a, b, c, d) ||
        onSegment(a, c, d) ||
        onSegment(b, c, d) ||
        onSegment(c, a, b) ||
        onSegment(d, a, b)
      )
        throw Error("Self-intersecting floor polygon");
    }
  }
  // Remove redundant collinear points before ear clipping, preserving the exact outline.
  for (let i = p.length - 1; i >= 0; i--)
    if (
      cross(p[(i + p.length - 1) % p.length], p[i], p[(i + 1) % p.length]) === 0
    )
      p.splice(i, 1);
  const remaining = p.map((_, i) => i),
    triangles: number[] = [];
  while (remaining.length > 3) {
    let found = false;
    for (let i = 0; i < remaining.length; i++) {
      const a = remaining[(i + remaining.length - 1) % remaining.length],
        b = remaining[i],
        c = remaining[(i + 1) % remaining.length];
      if (
        cross(p[a], p[b], p[c]) <= 0 ||
        remaining.some(
          (v) =>
            v !== a &&
            v !== b &&
            v !== c &&
            cross(p[a], p[b], p[v]) >= 0 &&
            cross(p[b], p[c], p[v]) >= 0 &&
            cross(p[c], p[a], p[v]) >= 0,
        )
      )
        continue;
      triangles.push(a, b, c);
      remaining.splice(i, 1);
      found = true;
      break;
    }
    if (!found) throw Error("Cannot triangulate floor polygon");
  }
  triangles.push(...remaining);
  const positions: number[] = [],
    indices: number[] = [],
    normals: number[] = [],
    uvs: number[] = [];
  // Map world XY to renderer X/-Z: CCW polygon produces an upward top face.
  const face = (
    a: number[],
    b: number[],
    c: number[],
    sideUvs?: number[][],
  ) => {
    const start = positions.length / 3;
    for (const [i, v] of [a, b, c].entries()) {
      positions.push(...v);
      uvs.push(...(sideUvs?.[i] ?? [v[0] / repeatM, -v[2] / repeatM]));
    }
    indices.push(start, start + 1, start + 2);
  };
  const top = p.map(([x, y]) => [x / 32, elevationM + 0.1875, -y / 32]),
    bottom = p.map(([x, y]) => [x / 32, elevationM, -y / 32]);
  for (let i = 0; i < triangles.length; i += 3) {
    const [a, b, c] = triangles.slice(i, i + 3);
    face(top[a], top[b], top[c]);
    face(bottom[c], bottom[b], bottom[a]);
  }
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length;
    const length =
        Math.hypot(p[j][0] - p[i][0], p[j][1] - p[i][1]) / 32 / repeatM,
      height = 0.1875 / repeatM;
    face(bottom[i], bottom[j], top[j], [
      [0, 0],
      [length, 0],
      [length, height],
    ]);
    face(bottom[i], top[j], top[i], [
      [0, 0],
      [length, height],
      [0, height],
    ]);
  }
  // Babylon computes normals using its handedness flag; geometry winding is RH.
  VertexData.ComputeNormals(positions, indices, normals, {
    useRightHandedSystem: true,
  });
  const data = new VertexData();
  Object.assign(data, { positions, indices, normals, uvs });
  return data;
}

export function createLayoutFloorSlabs(
  scene: Scene,
  changed: () => void = () => {},
) {
  const materials = new Map<string, PBRMaterial>(),
    meshes = new Map<string, { key: string; mesh: Mesh }>();
  let disposed = false;
  function material(f: FloorFinish) {
    const key = JSON.stringify(f);
    let m = materials.get(key);
    if (m) return m;
    m = new PBRMaterial("floor-finish-" + f.id, scene);
    if (f.tint) m.albedoColor = Color3.FromHexString(f.tint);
    m.metallic = 1;
    m.roughness = 1;
    m.albedoTexture = new Texture(
      f.baseColor,
      scene,
      false,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      changed,
    );
    m.bumpTexture = new Texture(
      f.normal,
      scene,
      false,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      changed,
    );
    m.metallicTexture = new Texture(
      f.orm,
      scene,
      false,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      changed,
    );
    m.useRoughnessFromMetallicTextureGreen = true;
    m.useMetallnessFromMetallicTextureBlue = true;
    m.useAmbientOcclusionFromMetallicTextureRed = true;
    m.useRoughnessFromMetallicTextureAlpha = false;
    m.bumpTexture.gammaSpace = false;
    m.metallicTexture.gammaSpace = false;
    materials.set(key, m);
    return m;
  }
  return {
    get meshes() {
      return [...meshes.values()].map((e) => e.mesh);
    },
    update(
      input: FloorSlabInput | undefined,
      visible: boolean,
      origin: readonly number[] = [0, 0, 0],
    ) {
      if (disposed) return [];
      const notes: string[] = [],
        keep = new Set<string>(),
        deck = input?.document.decks.find((d) => d.id === input.deckId);
      for (const tile of input?.document.tiles ?? []) {
        if (!deck || tile.deckId !== deck.id) continue;
        const style = input!.document.structure?.tileStyles[tile.id]?.material;
        const finish =
          (style &&
            (input!.finishes?.get(style) ?? standardFinishes.get(style))) ||
          DEFAULT_FLOOR_FINISH;
        const key = JSON.stringify([tile.vertices, deck.elevation, finish]);
        let entry = meshes.get(tile.id);
        try {
          if (entry?.key !== key) {
            const data = floorSlabGeometry(
              tile.vertices,
              deck.elevation / 32,
              finish.repeatM,
            );
            entry?.mesh.dispose();
            const mesh = new Mesh("floor-slab-" + tile.id, scene);
            // These closed solids use outward CCW triangles. Babylon's raw
            // Mesh defaults to clockwise in a RH scene, unlike imported glTF
            // meshes: leaving that default culls the top and exposes the
            // underside, making a complete slab look like an open tray.
            mesh.sideOrientation = Material.CounterClockWiseSideOrientation;
            data.applyToMesh(mesh);
            mesh.material = material(finish);
            mesh.isPickable = false;
            setMeshRole(mesh, "floor");
            mesh.metadata = {
              ...mesh.metadata,
              partId: tile.id,
              floorTileId: tile.id,
            };
            entry = { key, mesh };
            meshes.set(tile.id, entry);
          }
          entry.mesh.position.set(-origin[0], -origin[1], -origin[2]);
          entry.mesh.setEnabled(visible);
          keep.add(tile.id);
        } catch (error) {
          notes.push(
            `Floor ${tile.id}: ${error instanceof Error ? error.message : "invalid polygon"}`,
          );
        }
      }
      for (const [id, e] of meshes)
        if (!keep.has(id)) {
          e.mesh.dispose();
          meshes.delete(id);
        }
      const used = new Set([...meshes.values()].map((e) => e.mesh.material));
      for (const [key, m] of materials)
        if (!used.has(m)) {
          m.dispose(false, true);
          materials.delete(key);
        }
      return notes;
    },
    dispose() {
      disposed = true;
      for (const e of meshes.values()) e.mesh.dispose();
      meshes.clear();
      for (const m of materials.values()) m.dispose(false, true);
      materials.clear();
    },
  };
}
