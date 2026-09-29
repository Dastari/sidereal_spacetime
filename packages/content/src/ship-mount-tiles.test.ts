import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS, prefabById } from "./prefabs";
import {
  canonicalShipPrefabJson,
  placeMount,
  placeMountTile,
  prefabMountArcs,
  prefabStats,
  readShipPrefab,
  validateShipPrefab,
  volumeGeometry,
  type ShipPrefabDocumentV1,
} from "./ship-prefab";
import { defaultPrefabComponentCatalog } from "./ship-prefab-catalog";
import {
  arcAllows,
  mountTileAccepts,
  mountTileConfigs,
  mountTileSizes,
} from "./ship-mount-tiles";
import { buildShipComponentCatalog } from "./ship-components-source";

const catalog = defaultPrefabComponentCatalog();
const wren = prefabById("fed.s.wren")!;
const clone = (d: ShipPrefabDocumentV1): ShipPrefabDocumentV1 =>
  JSON.parse(JSON.stringify(d));
const codes = (d: ShipPrefabDocumentV1) =>
  validateShipPrefab(d, catalog)
    .filter((i) => i.severity === "error")
    .map((i) => i.code);

describe("roof mount tile size table (owner 2026-09-29)", () => {
  it("fixed mounts carry full size; turret mounts one size smaller", () => {
    const table = Object.fromEntries(
      (["fixed", "turret"] as const).flatMap((k) =>
        mountTileSizes(k).map((s) => [
          `${k}.${s}`,
          mountTileConfigs(k, s)
            .map((c) => `${c.count}x${c.maxItem}`)
            .join(" "),
        ]),
      ),
    );
    expect(table).toEqual({
      "fixed.SM": "1xSM",
      "fixed.MD": "1xMD 2xSM",
      "fixed.LG": "1xLG 2xSM 4xSM",
      "fixed.XL": "1xXL 2xMD 4xMD",
      "turret.MD": "1xSM",
      "turret.LG": "1xMD 2xSM",
      "turret.XL": "1xLG 2xMD 4xSM",
    });
    // The owner's example: a size-2 turret mount holds one size-1 item or two size-0 items.
    expect(mountTileAccepts("turret", "LG", 1, "MD")).toBe(true);
    expect(mountTileAccepts("turret", "LG", 1, "LG")).toBe(false);
    expect(mountTileAccepts("turret", "LG", 2, "SM")).toBe(true);
    expect(mountTileAccepts("turret", "LG", 2, "MD")).toBe(false);
    expect(mountTileAccepts("turret", "LG", 3, "SM")).toBe(false);
  });

  it("every linked configuration fits inside its tile footprint", () => {
    const cells = { SM: 1, MD: 2, LG: 3, XL: 4 } as const;
    for (const k of ["fixed", "turret"] as const)
      for (const s of mountTileSizes(k))
        for (const c of mountTileConfigs(k, s))
          expect(
            (c.count === 1 ? 1 : 2) * cells[c.maxItem],
            `${k}.${s} ${c.count}`,
          ).toBeLessThanOrEqual(cells[s]);
  });
});

describe("mount rules in prefab documents", () => {
  it("all 12 developer prefabs follow the roof rules and stay valid", () => {
    for (const p of PREFAB_SHIPS) {
      expect(p.mountTiles, p.id).toBeDefined();
      expect(codes(p), p.id).toEqual([]);
      for (const m of p.mounts) {
        const spec = catalog.get(m.component)!;
        if (spec.category === "weapon" || spec.category === "sensor")
          expect(m.tile, `${p.id}/${m.id}`).toBeDefined();
        if (m.attach === "face")
          expect(spec.category, `${p.id}/${m.id}`).toBe("propulsion");
      }
      // Strict parse (the construction admission path) round-trips.
      expect(canonicalShipPrefabJson(readShipPrefab(clone(p)))).toBe(
        canonicalShipPrefabJson(p),
      );
    }
  });

  it("Wren (r5+) carries its basic roof sensor and roof weapons on tiles", () => {
    expect(wren.revision).toBeGreaterThanOrEqual(5);
    const tiles = Object.fromEntries(
      wren.mountTiles!.map((t) => [t.id, `${t.kind}.${t.size}.${t.facing}`]),
    );
    expect(tiles).toEqual({
      turret: "turret.MD.fore",
      guns: "fixed.MD.fore",
      sensor: "fixed.SM.fore",
    });
    const on = (id: string) =>
      wren.mounts.filter((m) => m.tile === id).map((m) => m.component);
    expect(on("sensor")).toEqual(["sensor-dish.sm"]);
    expect(on("turret")).toEqual(["autocannon.sm"]);
    expect(on("guns")).toEqual(["autocannon.sm", "autocannon.sm"]);
  });

  it("rejects weapons and sensors off tiles and non-engines on faces", () => {
    const d = clone(wren);
    d.mounts.push({
      id: "bare",
      component: "autocannon.sm",
      attach: "top",
      at: [2, 5],
    });
    d.mounts.push({
      id: "side-dish",
      component: "radiator.sm",
      attach: "face",
      at: [5.5, 7],
      normal: "port",
    });
    expect(codes(d)).toEqual(
      expect.arrayContaining([
        "mount.tile-required",
        "mount.side-engines-only",
      ]),
    );
  });

  it("enforces the turret size penalty and linked-item rules", () => {
    const d = clone(wren);
    const turret = d.mounts.find((m) => m.id === "turret")!;
    turret.component = "autocannon.md";
    expect(codes(d)).toContain("tile.item-size");
    const msg = validateShipPrefab(d, catalog).find(
      (i) => i.code === "tile.item-size",
    )!.message;
    expect(msg).toContain("size-1 (MD) turret mount holds 1 x SM (size 0)");
    const e = clone(wren);
    e.mounts.find((m) => m.id === "guns-b")!.component = "laser-cannon.sm";
    expect(codes(e)).toContain("tile.mixed");
    const f = clone(wren);
    f.mounts.push({
      ...f.mounts.find((m) => m.id === "guns-a")!,
      id: "guns-c",
    });
    expect(codes(f)).toContain("tile.config");
  });

  it("rejects tiles off the roof, overlapping, or too big for the hull class", () => {
    const d = clone(wren);
    d.mountTiles!.find((t) => t.id === "sensor")!.at = [3, 9];
    expect(codes(d)).toContain("tile.off-hull");
    const o = clone(wren);
    o.mountTiles!.find((t) => t.id === "sensor")!.at = [4.5, 2.5];
    o.mounts.find((m) => m.id === "sensor")!.at = [4.5, 2.5];
    expect(codes(o)).toContain("tile.overlap");
    const big = clone(wren);
    big.mountTiles!.find((t) => t.id === "turret")!.size = "LG";
    expect(codes(big)).toContain("tile.size-class");
  });

  it("counts a tile as one hardpoint however many items it carries; hull doors are not hardpoints", () => {
    const hardpoints =
      wren.mounts.filter(
        (m) => m.attach !== "interior" && m.attach !== "edge" && !m.tile,
      ).length + wren.mountTiles!.length;
    expect(hardpoints).toBe(12);
    // One more face mount would exceed the size-S budget; an extra edge opening would not count.
    const over = clone(wren);
    over.mounts.push({
      id: "rcs-extra",
      component: "rcs.sm",
      attach: "face",
      at: [2.5, 7],
      normal: "port",
    });
    expect(codes(over)).toContain("size.mounts");
    expect(wren.mounts.filter((m) => m.tile).length).toBe(4);
  });

  it("legacy documents without mountTiles keep their pinned rules", () => {
    const legacy = clone(wren);
    delete legacy.mountTiles;
    legacy.mounts = legacy.mounts.filter((m) => !m.tile);
    legacy.mounts.push({
      id: "gun",
      component: "autocannon.sm",
      attach: "top",
      at: [5, 3],
    });
    expect(codes(legacy)).toEqual([]);
    expect(canonicalShipPrefabJson(legacy)).not.toContain("mountTiles");
    expect(() =>
      readShipPrefab({
        ...clone(legacy),
        mounts: [{ ...legacy.mounts.find((m) => m.id === "gun")!, tile: "x" }],
      }),
    ).toThrow(/mountTiles/);
  });
});

describe("tile placement, stats and arcs", () => {
  const geoms = wren.volumes.map(volumeGeometry);

  it("stands items on the tile top plane, side by side across the boresight", () => {
    const tile = placeMountTile(
      wren.mountTiles!.find((t) => t.id === "guns")!,
      geoms,
    );
    expect(tile.rect).toEqual([7, 2.5, 9, 4.5]);
    expect(tile.z[1] - tile.z[0]).toBe(4);
    expect(tile.rotDeg).toBe(270);
    const [a, b] = ["guns-a", "guns-b"].map((id) =>
      placeMount(
        wren.mounts.find((m) => m.id === id)!,
        catalog.get("autocannon.sm"),
        geoms,
        wren,
      ),
    );
    expect(a.anchorZ).toBe(tile.z[1]);
    expect(a.anchor[0]).toBe(8);
    expect(b.anchor[0]).toBe(8);
    expect(Math.abs(a.anchor[1] - b.anchor[1])).toBe(1);
    expect(a.quarterTurns).toBe(0);
  });

  it("adds tile mass, turret traverse power and heat to the ship budget", () => {
    const stats = prefabStats(wren, catalog);
    expect(stats.mountTiles).toEqual({
      fixed: 2,
      turret: 1,
      massKg: 60 + 140 + 220,
    });
    expect(stats.powerBalanceW).toBeGreaterThan(0);
    expect(stats.heatBalanceW).toBeLessThanOrEqual(0);
  });

  it("records fixed and turret arcs for every tile-mounted item", () => {
    const arcs = new Map(
      prefabMountArcs(wren, catalog).map((a) => [a.mount, a]),
    );
    const turret = arcs.get("turret")!;
    // Traverse is the slower of the MD ring (90 deg/s) and the autocannon tracking (60 deg/s).
    expect(turret).toMatchObject({
      kind: "turret",
      arcDeg: 270,
      traverseDegPerS: 60,
      linked: 1,
    });
    expect(arcAllows(turret, Math.PI / 2)).toBe(true);
    expect(arcAllows(turret, Math.PI)).toBe(false);
    const guns = arcs.get("guns-a")!;
    expect(guns).toMatchObject({ kind: "fixed", arcDeg: 24, linked: 2 });
    expect(arcAllows(guns, 0.2)).toBe(true);
    expect(arcAllows(guns, 0.3)).toBe(false);
    const dish = arcs.get("sensor")!;
    expect(dish).toMatchObject({
      category: "sensor",
      arcDeg: 90,
      rangeM: 3000,
    });
  });
});

describe("component catalog revision 3 sockets", () => {
  it("weapons and sensors are roof-only; face-only weapons are retired", () => {
    const c = buildShipComponentCatalog(3).components;
    for (const x of c.filter(
      (x) => x.family === "weapon" || x.family === "sensor",
    ))
      if (x.status !== "future") expect(x.mount.sockets, x.id).toEqual(["top"]);
    expect(c.find((x) => x.id === "side-cannon.sm")!.status).toBe("future");
    // Revision 2 is unchanged (legacy instances keep their catalog).
    const r2 = buildShipComponentCatalog(2).components;
    expect(r2.find((x) => x.id === "side-cannon.sm")!.status).toBe("proposed");
    expect(
      r2.find((x) => x.id === "thrust-block.sm")!.propulsion,
    ).not.toHaveProperty("reverseThrustKn");
  });
});
