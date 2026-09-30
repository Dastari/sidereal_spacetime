import { describe, expect, it } from "vitest";
import { voxelHeadLoadoutFromAppearance } from "./crew-voxel-appearance";
import { voxelCrewOutfitFor } from "./crew-voxel-bundle";

describe("pressure outfit presentation", () => {
  it("supplies the EVA window without inventing an equipped visor, and accepts optical overrides", () => {
    const equipped = { helmet: "wardrobe-suit-helmet" };
    expect(
      voxelHeadLoadoutFromAppearance({ equippedComponents: equipped }),
    ).toMatchObject({ helmet: "explorer", visor: "clear" });
    expect(equipped).toEqual({ helmet: "wardrobe-suit-helmet" });
    expect(
      voxelHeadLoadoutFromAppearance({
        equippedComponents: { ...equipped, visor: "crew-marine-visor" },
      }),
    ).toMatchObject({ helmet: "explorer", visor: "tinted" });
    expect(
      voxelHeadLoadoutFromAppearance({
        equippedComponents: { ...equipped, visor: "missing" },
      }).visor,
    ).toBe("clear");
    expect(
      voxelHeadLoadoutFromAppearance({
        equippedComponents: { helmet: "missing" },
      }).helmet,
    ).toBeUndefined();
  });
  it("unknown and wrong-slot uniform IDs leave privacy body visible", () => {
    expect(voxelCrewOutfitFor({ uniform: "missing" }).suit).toBe(false);
    expect(voxelCrewOutfitFor({ uniform: "wardrobe-suit-helmet" }).suit).toBe(
      false,
    );
    expect(voxelCrewOutfitFor({ uniform: "wardrobe-suit-body" }).suit).toBe(
      true,
    );
  });
});
