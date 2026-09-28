import { describe, expect, it } from "vitest";
import {
  selectVoxelCrewLayers,
  voxelCrewBlendDuration,
  voxelCrewEvaClip,
  type VoxelCrewEva,
} from "../crew/voxel-crew-clips";
import {
  VOXEL_CREW_CLIP_FALLBACK,
  VOXEL_CREW_EVA_ACTIONS,
  VOXEL_CREW_LOOPING,
} from "@sidereal/content/crew-voxel-bundle";
import {
  EVA_ZEROG_HIP_LIFT_M,
  evaHipLiftCorrection,
  evaNeedsPronePitch,
  evaThrustLevel,
  evaTransition,
} from "./eva-body";

const free = (over: Partial<VoxelCrewEva> = {}): VoxelCrewEva => ({
  phase: "free",
  forward: 0,
  strafe: 0,
  turn: 0,
  walking: false,
  cycling: false,
  ...over,
});

describe("EVA animation states (owner names)", () => {
  it("selects ZeroG and Maglock clips from the accepted state", () => {
    expect(voxelCrewEvaClip(free())).toBe("ZeroG_Prone");
    expect(voxelCrewEvaClip(free({ forward: 1 }))).toBe("ZeroG_Flight");
    expect(voxelCrewEvaClip(free({ strafe: -1 }))).toBe(
      "ZeroG_Locomotion_Prone",
    );
    expect(voxelCrewEvaClip(free({ forward: -1 }))).toBe(
      "ZeroG_Locomotion_Prone",
    );
    expect(voxelCrewEvaClip(free({ turn: 1 }))).toBe("ZeroG_Swim");
    expect(voxelCrewEvaClip(free({ phase: "maglocked" }))).toBe("Maglock_Idle");
    expect(voxelCrewEvaClip(free({ phase: "maglocked", walking: true }))).toBe(
      "Maglock_Walk",
    );
    expect(voxelCrewEvaClip(free({ cycling: true, forward: 1 }))).toBe(
      "Maglock_Idle",
    );
  });

  it("plays EVA clips over everything but death, and blends them over 0.25 s", () => {
    const eva = free({ forward: 1 });
    expect(
      selectVoxelCrewLayers({ moving: false, seated: false, eva }, "rifle"),
    ).toMatchObject({ full: "ZeroG_Flight" });
    expect(
      selectVoxelCrewLayers(
        { moving: false, seated: false, eva, dead: true },
        "none",
      ),
    ).toMatchObject({ full: "death" });
    expect(voxelCrewBlendDuration("ZeroG_Prone", "ZeroG_Flight")).toBe(0.25);
  });

  it("names every contract clip, loops the loops and falls back to existing clips", () => {
    expect([...VOXEL_CREW_EVA_ACTIONS]).toEqual([
      "ZeroG_Prone",
      "ZeroG_Flight",
      "ZeroG_Swim",
      "ZeroG_Locomotion_Prone",
      "ZeroG_Enter",
      "ZeroG_Exit",
      "Maglock_Idle",
      "Maglock_Walk",
    ]);
    for (const loop of ["ZeroG_Prone", "ZeroG_Flight", "Maglock_Walk"] as const)
      expect(VOXEL_CREW_LOOPING.has(loop)).toBe(true);
    expect(VOXEL_CREW_LOOPING.has("ZeroG_Enter")).toBe(false);
    expect(VOXEL_CREW_CLIP_FALLBACK.ZeroG_Prone).toBe("idle");
    expect(VOXEL_CREW_CLIP_FALLBACK.ZeroG_Flight).toBe("jetpack_hover");
    expect(VOXEL_CREW_CLIP_FALLBACK.Maglock_Walk).toBe("walk");
  });
});

describe("EVA body presentation rules", () => {
  it("pitches the model prone only while the prone clip is missing", () => {
    expect(evaNeedsPronePitch(free(), () => false)).toBe(true);
    expect(evaNeedsPronePitch(free(), (c) => c === "ZeroG_Prone")).toBe(false);
    expect(evaNeedsPronePitch(free({ phase: "maglocked" }), () => false)).toBe(
      false,
    );
    expect(evaNeedsPronePitch(free({ cycling: true }), () => false)).toBe(
      false,
    );
    expect(evaNeedsPronePitch(undefined, () => false)).toBe(false);
  });

  it("lowers the body by the authored hip lift only while a prone clip plays", () => {
    expect(evaHipLiftCorrection(free(), () => true)).toBe(EVA_ZEROG_HIP_LIFT_M);
    expect(evaHipLiftCorrection(free(), () => false)).toBe(0);
    expect(evaHipLiftCorrection(free({ phase: "maglocked" }), () => true)).toBe(
      0,
    );
  });

  it("scales the jetpack plume with thrust in free flight only", () => {
    expect(evaThrustLevel(free())).toBe(0);
    expect(evaThrustLevel(free({ forward: 1 }))).toBe(1);
    expect(evaThrustLevel(free({ turn: 1 }))).toBeCloseTo(0.4, 9);
    expect(evaThrustLevel(free({ phase: "maglocked", forward: 1 }))).toBe(0);
  });

  it("plays upright-to-prone and prone-to-upright transitions on phase changes", () => {
    expect(evaTransition(undefined, "free")).toBe("ZeroG_Enter");
    expect(evaTransition("maglocked", "free")).toBe("ZeroG_Enter");
    expect(evaTransition("free", "maglocked")).toBe("ZeroG_Exit");
    expect(evaTransition("free", undefined)).toBe("ZeroG_Exit");
    expect(evaTransition("free", "free")).toBeUndefined();
    expect(evaTransition(undefined, "maglocked")).toBeUndefined();
  });
});
