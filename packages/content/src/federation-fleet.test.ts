import { describe, expect, it } from "vitest";
import {
  FEDERATION_FLEET,
  FEDERATION_FLEET_ACCESS,
} from "./prefabs/federation-fleet";
import { prefabById } from "./prefabs";
import { defaultPrefabComponentCatalog } from "./ship-prefab-catalog";
import {
  deriveInterior,
  logicWallPlacement,
  readShipPrefab,
  validateShipPrefab,
  volumeGeometry,
} from "./ship-prefab";

const catalog = defaultPrefabComponentCatalog();
describe("six additive Federation fleet designs", () => {
  it("registers six new identities without replacing the current Wren or Wayfarer", () => {
    expect(FEDERATION_FLEET.map((d) => d.name)).toEqual([
      "Wren",
      "Petrel",
      "Wayfarer",
      "Heron",
      "Kestrel",
      "Albatross",
    ]);
    expect(new Set(FEDERATION_FLEET.map((d) => d.id)).size).toBe(6);
    expect(prefabById("fed.s.wren")!.revision).toBe(9);
    expect(prefabById("fed.m.wayfarer")!.authoredGameplay).toBeDefined();
    for (const d of FEDERATION_FLEET) expect(prefabById(d.id)).toBe(d);
  });

  for (const doc of FEDERATION_FLEET) {
    it(`${doc.name} admits its real floor, machinery, fixtures and pressure controls`, () => {
      expect(readShipPrefab(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
      expect(validateShipPrefab(doc, catalog)).toEqual([]);
      const interior = deriveInterior(doc, 0, catalog);
      const ports = FEDERATION_FLEET_ACCESS[doc.id];
      expect(ports.filter((p) => p.id === "cargo").length).toBe(
        doc.sizeClass === "S" ? 0 : 1,
      );
      for (const port of ports) {
        const inner = interior.doors.find((d) => d.id === `${port.id}-inner`)!;
        const outer = interior.doors.find((d) => d.id === `${port.id}-outer`)!;
        expect(inner.exterior).toBe(false);
        expect(outer.exterior).toBe(true);
        expect(inner.rooms).toContain(port.chamber);
        expect(outer.rooms).toContain(port.chamber);
        expect(inner.rooms.some((r) => r && r !== port.chamber)).toBe(true);
        const component = catalog.get(
          doc.mounts.find((m) => m.id === outer.id)!.component,
        )!;
        expect(component.dataPort).toBe(true);
        expect(
          Math.hypot(outer.b[0] - outer.a[0], outer.b[1] - outer.a[1]),
        ).toBe(port.id === "cargo" ? 4 : 2);
        const controller = doc.logic!.devices.find(
          (d) => d.id === `${port.id}-controller`,
        )!;
        expect(controller.kind).toBe("airlock-controller");
        const links = doc.logic!.links.filter(
          (l) => l.from.device === controller.id,
        );
        expect(
          links.some((l) => l.to.device === `${port.id}-inner-actuator`),
        ).toBe(true);
        expect(
          links.some((l) => l.to.device === `${port.id}-outer-actuator`),
        ).toBe(true);
        const outside = doc.logic!.devices.find(
          (d) => d.id === `${port.id}-outside`,
        )!;
        expect(logicWallPlacement(doc, outside, catalog)).toMatchObject({
          side: "exterior",
        });
        const inside = doc.logic!.devices.find(
          (d) => d.id === `${port.id}-inside`,
        )!;
        expect(logicWallPlacement(doc, inside, catalog)).toMatchObject({
          side: "interior",
          room: port.chamber,
        });
      }
      expect(
        interior.sockets.find((s) => s.fixture === "suit-locker")!.room,
      ).toBe("lock");
    });
  }

  it("uses genuinely different silhouettes and the latest slope and arc families", () => {
    const shapes = new Set<string>(
      FEDERATION_FLEET.flatMap((d) =>
        d.volumes.flatMap((v) => v.tiles.map((t) => t.shape)),
      ),
    );
    for (const shape of [
      "slope1",
      "slope2",
      "slope3",
      "slope4",
      "arc2c",
      "arc3",
      "arc4",
    ])
      expect(shapes.has(shape)).toBe(true);
    const outlines = FEDERATION_FLEET.map((d) =>
      JSON.stringify(volumeGeometry(d.volumes[0]).outline),
    );
    expect(new Set(outlines).size).toBe(6);
    expect(FEDERATION_FLEET[0].volumes[0].tiles.length).toBeLessThan(
      FEDERATION_FLEET[2].volumes[0].tiles.length / 2,
    );
    expect(
      FEDERATION_FLEET[3].rooms.filter((r) => r.type === "medbay"),
    ).toHaveLength(2);
    expect(
      FEDERATION_FLEET[5].rooms.find((r) => r.id === "cargo")!.rect,
    ).toEqual([8, 0, 28, 11]);
  });
});
