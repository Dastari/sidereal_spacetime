import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/loaders/glTF";
import { VOXEL_CREW_NOMINAL_SPEED } from "@sidereal/content/crew-voxel-bundle";
import { SPRINT_SPEED_MPS, WALK_SPEED_MPS } from "@sidereal/sim";
import { createVoxelCrewVisual } from "./voxel-crew";
import { voxelCrewSpeedRatio } from "./voxel-crew-clips";

const file = (path: string) =>
  new Uint8Array(
    readFileSync(
      new URL(`../../../../assets/runtime/crew/${path}`, import.meta.url),
    ),
  );

/** World position with every ancestor recomputed top-down (no render loop in NullEngine). */
function world(node: TransformNode) {
  const chain: TransformNode[] = [];
  for (
    let n: TransformNode | null = node;
    n;
    n = n.parent as TransformNode | null
  )
    chain.unshift(n);
  for (const n of chain) n.computeWorldMatrix(true);
  return node.getAbsolutePosition().clone();
}

/**
 * In-place locomotion: while a foot is planted it moves backwards in the body frame (the body
 * faces glTF -Z, so toward +Z) at the clip's authored ground speed. Per clip: the median of that
 * speed over frames where the lower foot is within 2 cm of its lowest height.
 */
async function measureStrideSpeeds() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const crew = await createVoxelCrewVisual(
    scene,
    new TransformNode("ship-frame", scene),
    file("voxel/r005/crew-body.glb"),
    { faceAtlas: false },
  );
  const armed = await SceneLoader.LoadAssetContainerAsync(
    "",
    file("items/r001/armed-actions.glb"),
    scene,
    undefined,
    ".glb",
  );
  crew.addClips(armed);
  const feet = ["foot.L", "foot.R"].map((n) => crew.joints.get(n)!);
  const out: Record<string, number> = {};
  for (const g of scene.animationGroups) {
    if (!/walk|run/i.test(g.name) || out[g.name] !== undefined) continue;
    for (const other of scene.animationGroups) other.stop();
    g.start(false, 1, g.from, g.to);
    g.pause();
    const samples: Vector3[][] = [];
    for (let f = 0; f <= Math.round(g.to - g.from); f++) {
      g.goToFrame(g.from + f);
      const inv = crew.model.computeWorldMatrix(true).clone().invert();
      samples.push(
        feet.map((foot) => Vector3.TransformCoordinates(world(foot), inv)),
      );
    }
    g.stop();
    const fps = g.targetedAnimations[0]?.animation.framePerSecond ?? 60;
    const lowest = Math.min(...samples.flatMap((s) => s.map((p) => p.y)));
    const speeds: number[] = [];
    for (let i = 1; i < samples.length; i++) {
      const k = samples[i][0].y <= samples[i][1].y ? 0 : 1;
      const [a, b] = [samples[i - 1][k], samples[i][k]];
      if (Math.max(a.y, b.y) > lowest + 0.02) continue;
      speeds.push((b.z - a.z) * fps);
    }
    speeds.sort((x, y) => x - y);
    out[g.name] = speeds[Math.floor(speeds.length / 2)] ?? 0;
  }
  crew.dispose();
  scene.dispose();
  engine.dispose();
  return out;
}

describe("locomotion stride matches ground speed (no foot sliding)", async () => {
  const measured = await measureStrideSpeeds();

  it("VOXEL_CREW_NOMINAL_SPEED is the measured planted-foot speed of each clip (±5 %)", () => {
    for (const [clip, nominal] of Object.entries(VOXEL_CREW_NOMINAL_SPEED)) {
      if (measured[clip] === undefined) continue;
      expect(
        Math.abs(measured[clip] - nominal!) / nominal!,
        `${clip}: measured ${measured[clip].toFixed(3)} m/s`,
      ).toBeLessThan(0.05);
    }
  });

  it("walk and run playback put the planted foot at gameplay ground speed", () => {
    const motion = { moving: true, seated: false };
    for (const [clip, ground] of [
      ["walk", WALK_SPEED_MPS],
      ["run", SPRINT_SPEED_MPS],
    ] as const) {
      const foot = measured[clip] * voxelCrewSpeedRatio(clip, motion);
      expect(Math.abs(foot - ground) / ground, clip).toBeLessThan(0.05);
    }
  });

  it("armed clips' own legs are far too slow for gameplay speed, so the base legs drive armed locomotion", () => {
    // At gameplay speed the armed walk/run legs would need ~3.1x / ~1.8x playback (walk clamped at
    // 2x slid ~0.9 m/s); voxel-crew layers the base walk/run below the armed upper body instead.
    expect(measured["rifle.walk_armed"] * 2).toBeLessThan(WALK_SPEED_MPS * 0.7);
    expect(measured["heavy.run_armed"]).toBeLessThan(SPRINT_SPEED_MPS * 0.6);
  });
});
