import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { crewArmorPart, crewArmorPreset } from "@sidereal/content/crew-armor";
import { createVoxelCrewVisual } from "./voxel-crew";
import { attachCrewArmor } from "./armor-attach";
import { attachVoxelCrewHead, voxelHeadLoadoutFor } from "./voxel-crew-kit";

// Replace transport/face pixels only. Every head/helmet node and authored transform is real.
vi.mock("./head-art-revision", async () => {
  const { crewHeadAssetUrl } = await import("@sidereal/content/crew-heads");
  return {
    headArtSources: async (keys: string[]) => ({
      sources: new Map(
        keys.map((key) => [
          key,
          bytes(
            "crew/heads/v1/" +
              crewHeadAssetUrl(key).split("/v1/")[1].split("?")[0],
          ),
        ]),
      ),
    }),
  };
});
vi.mock("./voxel-face", async (original) => ({
  ...(await original<object>()),
  loadRgbaImage: async () => undefined,
}));
function bytes(path: string) {
  return new Uint8Array(
    readFileSync(
      new URL("../../../../assets/runtime/" + path, import.meta.url),
    ),
  );
}
type P = number[];
const sub = (a: P, b: P) => a.map((v, i) => v - b[i]);
const cross = (a: P, b: P) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: P, b: P) => a.reduce((s, v, i) => s + v * b[i], 0);
function triangle(v: P[], name: string) {
  return {
    v,
    name,
    lo: [0, 1, 2].map((k) => Math.min(...v.map((p) => p[k]))),
    hi: [0, 1, 2].map((k) => Math.max(...v.map((p) => p[k]))),
  };
}
function intersects(a: P[], b: P[]) {
  const ea = a.map((p, i) => sub(a[(i + 1) % 3], p)),
    eb = b.map((p, i) => sub(b[(i + 1) % 3], p));
  const na = cross(ea[0], ea[1]),
    nb = cross(eb[0], eb[1]);
  for (const axis of [
    na,
    nb,
    ...ea.flatMap((x) => eb.map((y) => cross(x, y))),
    ...ea.map((x) => cross(na, x)),
    ...eb.map((x) => cross(nb, x)),
  ]) {
    const length = Math.sqrt(dot(axis, axis));
    if (length < 1e-10) continue;
    const pa = a.map((p) => dot(axis, p) / length),
      pb = b.map((p) => dot(axis, p) / length);
    if (
      Math.max(...pa) < Math.min(...pb) - 1e-5 ||
      Math.max(...pb) < Math.min(...pa) - 1e-5
    )
      return false;
  }
  return true;
}
function triangles(meshes: AbstractMesh[], skin: boolean) {
  return meshes.flatMap((m) => {
    if (!m.isEnabled()) return [];
    m.skeleton?.prepare();
    const positions = skin
        ? m.getPositionData(true, true)
        : m.getVerticesData("position"),
      indices = m.getIndices(),
      world = m.computeWorldMatrix(true);
    if (!positions || !indices) return [];
    const out = [];
    for (let i = 0; i < indices.length; i += 3)
      out.push(
        triangle(
          Array.from(indices.slice(i, i + 3)).map((k) =>
            Vector3.TransformCoordinates(
              Vector3.FromArray(positions, k * 3),
              world,
            ).asArray(),
          ),
          m.name,
        ),
      );
    return out;
  });
}
for (const bodyType of ["male", "female"] as const)
  for (const role of ["role.jet-trooper", "role.marine"])
    for (const medical of [false, true])
      test(`${bodyType} ${role} with back/belt stowed clears actual ${medical ? "medical bed" : "lower bunk"} over 25 sit phases`, async () => {
        const engine = new NullEngine();
        engine.getDeltaTime = () => 16;
        const scene = new Scene(engine);
        scene.useConstantAnimationDeltaTime = true;
        new FreeCamera("review", new Vector3(0, 1, -4), scene);
        const crew = await createVoxelCrewVisual(
          scene,
          new TransformNode("frame", scene),
          bytes("crew/voxel/r005/crew-body.glb"),
          { faceAtlas: false },
        );
        crew.customize({ bodyType, backpack: false });
        const preset = crewArmorPreset(role)!;
        const parts = [];
        for (const [slot, id] of Object.entries(preset.parts)) {
          if (slot === "back" || slot === "belt") continue;
          parts.push(
            await attachCrewArmor(scene, crew, crewArmorPart(id!)!, {
              variant: bodyType,
              colourway: preset.colourway,
              source: bytes("crew/armor-v1/parts/" + id + ".glb"),
            }),
          );
        }
        crew.setArmorCloth(["chest", "shoulders", "gloves", "legs", "boots"]);
        crew.setHiddenRegions(
          new Set(parts.flatMap((p) => p.hidesBodyRegions)),
        );
        const helmet = role === "role.marine" ? "tactical" : "closed";
        await attachVoxelCrewHead(scene, crew, {
          ...voxelHeadLoadoutFor(bodyType),
          helmet,
          visor: helmet === "closed" ? "hud" : "tinted",
        });
        const gear = [
          ...parts.flatMap((p) => p.meshes),
          ...scene.meshes.filter(
            (m) =>
              m.name.includes(`helmet.${helmet}`) ||
              m.name.includes(`visor.${helmet}`),
          ),
        ];
        expect(parts).toHaveLength(5);
        expect(
          gear.some(
            (m) =>
              m.isEnabled() &&
              m.name.includes(`helmet.${helmet}`) &&
              m.getTotalVertices() > 0,
          ),
        ).toBe(true);
        expect(
          gear.some(
            (m) =>
              m.isEnabled() &&
              m.name.includes("chest.") &&
              m.getTotalVertices() > 0,
          ),
        ).toBe(true);
        const bed = await SceneLoader.LoadAssetContainerAsync(
          "",
          bytes(
            medical
              ? "ship-objects/r002/shipyard.equipment.medical-bed.glb"
              : "ship-components/r004/crew-bunk.sm.glb",
          ),
          scene,
          undefined,
          ".glb",
        );
        bed.addAllToScene();
        for (const n of bed.rootNodes)
          if (n instanceof TransformNode) n.position.z += 0.6875;
        const obstacles = triangles(bed.meshes, false);
        expect(obstacles.length).toBeGreaterThan(100);
        const lift = medical ? 0.2 : 0.075;
        crew.root.position.y = lift;
        crew.setSeatContact({
          lift,
          lean: medical ? 0 : (-35 * Math.PI) / 180,
          footSupport: 0,
        });
        crew.update({ moving: false, seated: true, reducedMotion: true });
        let bootSole = Infinity;
        const hits: string[] = [];
        let samples = 0,
          checked = 0;
        for (let frame = 0; frame < 180; frame++) {
          scene.render();
          if (frame < 30 || frame % 6) continue;
          samples++;
          for (const n of scene.transformNodes) n.computeWorldMatrix(true);
          const posed = triangles(gear, true);
          checked += posed.length;
          for (const t of posed)
            if (t.name.includes("armor.boots."))
              bootSole = Math.min(bootSole, t.lo[1]);
          for (const a of posed)
            for (const b of obstacles) {
              if (
                a.lo.some(
                  (v, k) => v > b.hi[k] + 1e-5 || b.lo[k] > a.hi[k] + 1e-5,
                )
              )
                continue;
              if (intersects(a.v, b.v))
                hits.push(
                  `${a.name} / ${b.name}: ${JSON.stringify({ gear: [a.lo, a.hi], bed: [b.lo, b.hi] })}`,
                );
            }
        }
        expect(Math.abs(bootSole)).toBeLessThan(0.006);
        expect(samples).toBe(25);
        expect(checked).toBeGreaterThan(10000);
        expect(hits.slice(0, 5)).toEqual([]);
        crew.dispose();
        bed.dispose();
        scene.dispose();
        engine.dispose();
      }, 30000);
