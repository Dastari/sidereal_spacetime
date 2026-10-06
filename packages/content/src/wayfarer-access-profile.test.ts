import { describe, expect, it } from "vitest";
import { FED_WAYFARER } from "./prefabs/wayfarer";
import {
  readShipPrefab,
  validateShipPrefab,
  validatePrefabLogic,
  placeMount,
  volumeGeometry,
} from "./ship-prefab";
import { defaultPrefabComponentCatalog } from "./ship-prefab-catalog";
import {
  SHIP_ACCESS_DOOR_PACK,
  snapshotShipAccessDoorPack,
} from "./ship-access-doors";
import {
  WAYFARER_ACCESS_SOURCE,
  WAYFARER_ACCESS_REVIEW_ENABLED,
} from "./wayfarer-access-profile";

describe("proposed private Wayfarer access profile", () => {
  it("captures private pack metadata immutably and rejects malformed dimensions and pins", () => {
    const input = structuredClone(SHIP_ACCESS_DOOR_PACK);
    const snapshot = snapshotShipAccessDoorPack(input);
    const originalHash = snapshot.pieces[0].sha256;
    input.pieces[0].sha256 = "0".repeat(64);
    input.pieces[0].boundsMin[0] -= 1;
    input.variants[0].parts.frame = "changed";
    expect(snapshot.pieces[0].sha256).toBe(originalHash);
    expect(snapshot.pieces[0].boundsMin).toEqual(
      SHIP_ACCESS_DOOR_PACK.pieces[0].boundsMin,
    );
    expect(Object.isFrozen(snapshot.pieces[0].boundsMin)).toBe(true);
    expect(Object.isFrozen(snapshot.variants[0].parts)).toBe(true);
    for (const mutate of [
      (p: typeof input) => {
        p.schema = "unknown";
      },
      (p: typeof input) => {
        p.revision = "../mutable";
      },
      (p: typeof input) => {
        p.variants[0].strokeM = 0;
      },
      (p: typeof input) => {
        p.variants[0].clearHeightM = Infinity;
      },
      (p: typeof input) => {
        p.pieces[0].boundsMin = [0];
      },
      (p: typeof input) => {
        p.pieces[0].sha256 = "unpinned";
      },
      (p: typeof input) => {
        p.variants[0].parts.frame = "missing";
      },
    ]) {
      const invalid = structuredClone(SHIP_ACCESS_DOOR_PACK);
      mutate(invalid);
      expect(() => snapshotShipAccessDoorPack(invalid)).toThrow(
        /Invalid authored access/,
      );
    }
  });
  it("admits only the exact access profile and preserves legacy profile1 admission", () => {
    expect(WAYFARER_ACCESS_REVIEW_ENABLED).toBe(true);
    expect(readShipPrefab(WAYFARER_ACCESS_SOURCE)).toEqual(
      WAYFARER_ACCESS_SOURCE,
    );
    const crafted = structuredClone(WAYFARER_ACCESS_SOURCE);
    crafted.mounts[0].at[0] += 1;
    expect(() => readShipPrefab(crafted)).toThrow(/exact registered prefab/);
    expect(
      validateShipPrefab(
        WAYFARER_ACCESS_SOURCE,
        defaultPrefabComponentCatalog(),
      ),
    ).toEqual([]);
    expect(readShipPrefab(FED_WAYFARER)).toEqual(FED_WAYFARER);
  });
  it("retains mount identities with one coherent proposed RCS relocation and valid controller wiring", () => {
    for (const mount of FED_WAYFARER.mounts)
      expect(
        WAYFARER_ACCESS_SOURCE.mounts.find((m) => m.id === mount.id),
      ).toEqual(
        mount.id === "rcs-stern-p" ? { ...mount, at: [-2, 6.5] } : mount,
      );
    expect(
      WAYFARER_ACCESS_SOURCE.mounts.every((m) =>
        m.at.every((v) => Number.isInteger(v * 2)),
      ),
    ).toBe(true);
    const catalogue = defaultPrefabComponentCatalog();
    const oldMount = FED_WAYFARER.mounts.find((m) => m.id === "rcs-stern-p")!;
    const newMount = WAYFARER_ACCESS_SOURCE.mounts.find(
      (m) => m.id === oldMount.id,
    )!;
    const oldPose = placeMount(
      oldMount,
      catalogue.get(oldMount.component),
      FED_WAYFARER.volumes.map(volumeGeometry),
      FED_WAYFARER,
    );
    const newPose = placeMount(
      newMount,
      catalogue.get(newMount.component),
      WAYFARER_ACCESS_SOURCE.volumes.map(volumeGeometry),
      WAYFARER_ACCESS_SOURCE,
    );
    expect(oldPose.anchor).toEqual([-9.5, 6.5]);
    expect(newPose.anchor).toEqual([-2, 6.5]);
    expect(newPose.anchorZ).toBe(oldPose.anchorZ);
    expect(newPose.quarterTurns).toBe(oldPose.quarterTurns);
    expect(
      validatePrefabLogic(
        WAYFARER_ACCESS_SOURCE,
        defaultPrefabComponentCatalog(),
      ),
    ).toEqual([]);
    expect(
      WAYFARER_ACCESS_SOURCE.logic?.devices.filter(
        (d) => d.kind === "airlock-controller",
      ),
    ).toEqual([
      expect.objectContaining({ id: "personnel-controller", cycleS: 3 }),
      expect.objectContaining({ id: "cargo-controller", cycleS: 3 }),
    ]);
  });
});
