import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CREW_JOINT_LIMITS,
  jointAngles,
  summarizeViolations,
  validateCrewJointLimits,
  type Quat,
} from "./crew-joint-limits";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const GLBS = {
  body: "assets/runtime/crew/voxel/r005/crew-body.glb",
  armed: "assets/runtime/crew/items/r001/armed-actions.glb",
};
const load = (path: string) =>
  validateCrewJointLimits(new Uint8Array(readFileSync(join(ROOT, path))), path);
const rows = (path: string) =>
  summarizeViolations(load(path).violations).map(
    (v) =>
      `${v.clip} ${v.bone} ${v.kind} f${v.frame} ${v.value} (limit ${v.limit})`,
  );

const axis = (x: number, y: number, z: number, deg: number): Quat => {
  const h = (deg * Math.PI) / 360;
  return [x * Math.sin(h), y * Math.sin(h), z * Math.sin(h), Math.cos(h)];
};

describe("crew_rig joint angle convention", () => {
  const rest: Quat = [0, 0, 0, 1];
  it("reads knee flexion as the shin folding back (-X) and hyperextension as negative", () => {
    // +X rotation swings a bone's +Y toward +Z (forward): for the shin that is hyperextension
    expect(jointAngles("shin.R", rest, axis(1, 0, 0, -40)).flex).toBeCloseTo(
      40,
    );
    expect(jointAngles("shin.L", rest, axis(1, 0, 0, 20)).flex).toBeCloseTo(
      -20,
    );
    expect(CREW_JOINT_LIMITS.shin.flex[0]).toBeGreaterThanOrEqual(-5);
  });
  it("reads elbow flexion as the forearm folding toward the front of the arm", () => {
    expect(jointAngles("forearm.R", rest, axis(1, 0, 0, 90)).flex).toBeCloseTo(
      90,
    );
    expect(jointAngles("forearm.L", rest, axis(1, 0, 0, -30)).flex).toBeCloseTo(
      -30,
    );
  });
  it("mirrors side bend and twist on the left so + is always away from the midline", () => {
    const r = jointAngles("thigh.R", rest, axis(0, 0, 1, -20));
    const l = jointAngles("thigh.L", rest, axis(0, 0, 1, 20));
    expect(r.side).toBeCloseTo(l.side);
    expect(jointAngles("thigh.R", rest, axis(0, 1, 0, 30)).twist).toBeCloseTo(
      -jointAngles("thigh.L", rest, axis(0, 1, 0, 30)).twist,
    );
  });
});

describe("crew animation joint limits (every frame of every clip)", () => {
  it("samples all 48 body clips (including EVA) and 78 armed clips", () => {
    expect(load(GLBS.body).clips).toHaveLength(48);
    expect(load(GLBS.armed).clips).toHaveLength(78);
  });
  it("body r005 clips: knees/elbows in range, no flips, feet on the floor, stance legs straight", () => {
    expect(rows(GLBS.body)).toEqual([]);
  });
  it("CHAR-WEAPONS armed clips: same limits on the fixed rig", () => {
    expect(rows(GLBS.armed)).toEqual([]);
  });
});
