import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import {
  CREW_REFIT,
  CREW_STUDY,
  crewStudyUrl,
} from "@sidereal/content/crew-study";
import { partitionCrewTriangles } from "./voxel-crew-regions";
import "@babylonjs/loaders/glTF";

type Gltf = {
  accessors: {
    bufferView: number;
    byteOffset?: number;
    count: number;
    type: string;
    componentType: number;
  }[];
  bufferViews: {
    byteOffset?: number;
    byteLength: number;
    byteStride?: number;
  }[];
  nodes: { name: string }[];
  skins: { joints: number[] }[];
  meshes?: { primitives: { attributes: Record<string, number> }[] }[];
  materials?: unknown[];
  animations?: {
    name: string;
    samplers: { input: number; output: number }[];
    channels: { sampler: number; target: { node: number; path: string } }[];
  }[];
};
const bytes = (revision: string, file: string) =>
  readFileSync(
    new URL(
      `../../../../assets/runtime/crew/${revision}/${file.replaceAll("#", "%23")}`,
      import.meta.url,
    ),
  );
const digest = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex");
function glb(data: Buffer) {
  const length = data.readUInt32LE(12);
  return {
    doc: JSON.parse(data.subarray(20, 20 + length).toString()) as Gltf,
    binary: data.subarray(28 + length),
  };
}
function range(doc: Gltf, index: number) {
  const a = doc.accessors[index],
    view = doc.bufferViews[a.bufferView];
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type]!;
  const size = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType]!;
  return {
    start: (view.byteOffset ?? 0) + (a.byteOffset ?? 0),
    stride: view.byteStride ?? width * size,
    size: width * size,
    count: a.count,
  };
}

describe("provisional game-owned crew refit", () => {
  it("roots finger and index knuckles in the palm with normalized weights on both bodies and every glove fit", () => {
    for (const file of Object.keys(CREW_REFIT.files).filter(
      (f) => f === "crew-body.glb" || f.includes("gloves."),
    )) {
      const { doc, binary } = glb(bytes(CREW_REFIT.revision, file));
      const names = doc.skins[0].joints.map((j) => doc.nodes[j].name);
      const roots = new Set<string>(),
        tips = new Set<string>();
      for (const mesh of doc.meshes!)
        for (const { attributes: a } of mesh.primitives) {
          const p = range(doc, a.POSITION),
            j = range(doc, a.JOINTS_0),
            w = range(doc, a.WEIGHTS_0);
          for (let v = 0; v < p.count; v++) {
            const weights = Array.from({ length: 4 }, (_, c) =>
              binary.readFloatLE(w.start + v * w.stride + c * 4),
            );
            expect(
              weights.reduce((total, weight) => total + weight, 0),
            ).toBeCloseTo(1, 5);
            const jointSize =
              doc.accessors[a.JOINTS_0].componentType === 5121 ? 1 : 2;
            const joint = (c: number) =>
              jointSize === 1
                ? binary.readUInt8(j.start + v * j.stride + c)
                : binary.readUInt16LE(j.start + v * j.stride + c * 2);
            const bone = names[joint(0)];
            if (!/^(fingers|index)\.[RL]$/.test(bone)) continue;
            const x = Math.abs(binary.readFloatLE(p.start + v * p.stride)) * 32;
            if (x >= 10.2 - 1e-4) {
              expect(names[joint(1)]).toBe(`hand.${bone.at(-1)}`);
              expect(weights[1]).toBeGreaterThan(0.99);
              roots.add(bone);
            }
            if (x <= 8.6 + 1e-4) {
              expect(weights[0]).toBeGreaterThan(0.99);
              tips.add(bone);
            }
          }
        }
      expect(roots.size, file).toBe(4);
      expect(tips.size, file).toBe(4);
    }
  });
  it("pins editable Blender and every derivative while preserving topology, rig, materials and all unedited channels", () => {
    const blend = readFileSync(
      new URL(`../../../../${CREW_REFIT.sourceBlend}`, import.meta.url),
    );
    expect(digest(blend)).toBe(CREW_REFIT.sourceBlendSha256);
    expect(CREW_REFIT.status).toBe("provisional, not owner-approved");
    expect(CREW_REFIT.sourceRevision).toBe(CREW_STUDY.revision);
    expect(Object.keys(CREW_REFIT.files)).toHaveLength(38);
    for (const [file, pin] of Object.entries(CREW_REFIT.files)) {
      const original = bytes(CREW_STUDY.revision, file),
        derived = bytes(CREW_REFIT.revision, file);
      expect(digest(original), file).toBe(pin.sourceSha256);
      expect(digest(derived), file).toBe(pin.sha256);
      expect(derived.length, file).toBe(pin.bytes);
      const a = glb(original),
        b = glb(derived);
      for (const key of [
        "nodes",
        "skins",
        "meshes",
        "materials",
        "animations",
      ] as const)
        expect(b.doc[key], `${file}: ${key}`).toEqual(a.doc[key]);
      expect(b.binary.length).toBe(a.binary.length);
      const before = Buffer.from(a.binary),
        after = Buffer.from(b.binary);
      for (const index of pin.changedAccessors) {
        const r = range(a.doc, index);
        for (let i = 0; i < r.count; i++) {
          before.fill(
            0,
            r.start + i * r.stride,
            r.start + i * r.stride + r.size,
          );
          after.fill(
            0,
            r.start + i * r.stride,
            r.start + i * r.stride + r.size,
          );
        }
      }
      expect(after.equals(before), `${file}: unedited bytes`).toBe(true);
      expect(crewStudyUrl(file)).toContain(`/${CREW_REFIT.revision}/`);
    }
    expect(crewStudyUrl("parts/groom/groom.twin_tails@all#full.glb")).toContain(
      `/${CREW_STUDY.revision}/`,
    );
  });

  it("authors a 27–33 degree breathing elbow bend on idle while all other clips remain byte-exact", () => {
    const asset = glb(bytes(CREW_REFIT.revision, CREW_STUDY.animation.file));
    const idle = asset.doc.animations!.find((a) => a.name === "idle")!;
    const channels = idle.channels.filter(
      (c) =>
        c.target.path === "rotation" &&
        /^forearm\.[RL]$/.test(asset.doc.nodes[c.target.node].name),
    );
    expect(channels).toHaveLength(2);
    for (const channel of channels) {
      const index = idle.samplers[channel.sampler].output,
        r = range(asset.doc, index);
      for (let i = 0; i < r.count; i++) {
        const x = asset.binary.readFloatLE(r.start + i * r.stride),
          w = asset.binary.readFloatLE(r.start + i * r.stride + 12);
        const bend = (2 * Math.atan2(x, w) * 180) / Math.PI;
        expect(bend).toBeGreaterThan(26.9);
        expect(bend).toBeLessThan(33.1);
      }
    }
    expect(
      CREW_REFIT.files["anim/crew-anims.glb"].changedAccessors,
    ).toHaveLength(2);
  });

  it("keeps blended coat panels in the hips layer for both fits without duplicating or dropping triangles", async () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    for (const id of ["captain", "scientist"])
      for (const fit of ["wide", "narrow"]) {
        const file = `parts/outfits/uniform.${id}@${fit}.glb`;
        const container = await SceneLoader.LoadAssetContainerAsync(
          "",
          new Uint8Array(bytes(CREW_REFIT.revision, file)),
          scene,
          undefined,
          ".glb",
        );
        let recovered = 0,
          hips = 0;
        for (const mesh of container.meshes) {
          if (!(mesh instanceof Mesh) || !mesh.getTotalVertices()) continue;
          const rigid = partitionCrewTriangles(mesh),
            cloth = partitionCrewTriangles(mesh, true);
          expect(
            [...cloth.values()].reduce((n, indices) => n + indices.length, 0),
          ).toBe(mesh.getTotalIndices());
          recovered +=
            (rigid.get("unclassified")?.length ?? 0) -
            (cloth.get("unclassified")?.length ?? 0);
          hips += cloth.get("hips")?.length ?? 0;
          expect(cloth.get("unclassified")?.length ?? 0).toBe(0);
        }
        expect(recovered).toBeGreaterThan(0);
        expect(hips).toBeGreaterThan(0);
        container.dispose();
      }
    scene.dispose();
    engine.dispose();
  });
});
