import { describe, expect, it } from "vitest";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VOXEL_CREW_HEAD_SCALE, crewHeadSpaceMatrix } from "./voxel-crew-kit";

const VOX = 1 / 32;

describe("head kit scale", () => {
  it("is a modest reduction (owner: heads a little too big; 8-12 %)", () => {
    expect(VOXEL_CREW_HEAD_SCALE).toBeGreaterThanOrEqual(0.88);
    expect(VOXEL_CREW_HEAD_SCALE).toBeLessThanOrEqual(0.92);
  });

  it("scales about the chin: the neck joint stays on the collar, the crown drops", () => {
    // Rest head bone at z 39 vox (glTF y up); inverse bind brings body space into bone space.
    const inverseBind = Matrix.Translation(0, -39 * VOX, 0);
    const local = crewHeadSpaceMatrix(inverseBind);
    const bodyFromSpace = local.multiply(Matrix.Invert(inverseBind));
    const chin = Vector3.TransformCoordinates(Vector3.Zero(), bodyFromSpace);
    expect(chin.y).toBeCloseTo(39 * VOX, 6);
    // Head space is centred on the chin: skull top (16 vox) and hair top (19 vox) scale with it.
    const hairTop = Vector3.TransformCoordinates(
      new Vector3(0, 19 * VOX, 0),
      bodyFromSpace,
    );
    expect(hairTop.y).toBeCloseTo((39 + 19 * VOXEL_CREW_HEAD_SCALE) * VOX, 6);
    // Head + hair fraction of standing height drops from 0.328 to about 0.30.
    const fraction = (hairTop.y - 39 * VOX) / hairTop.y;
    expect(fraction).toBeGreaterThan(0.29);
    expect(fraction).toBeLessThan(0.32);
    // Unit scale reproduces the unscaled rest placement exactly.
    expect(
      crewHeadSpaceMatrix(inverseBind, 1).equalsWithEpsilon(
        Matrix.Translation(0, 39 * VOX, 0).multiply(inverseBind),
        1e-9,
      ),
    ).toBe(true);
  });
});
