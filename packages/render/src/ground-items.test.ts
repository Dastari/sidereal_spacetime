import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { INVENTORY_DEFINITIONS } from "@sidereal/content/inventory";
import { groundItemMeshUrl } from "./ground-items";

const runtime = fileURLToPath(
  new URL("../../../assets/runtime/", import.meta.url),
);
const file = (url: string) =>
  runtime + url.replace(/^\/assets\//, "").replace(/\?.*$/, "");

describe("ground item meshes", () => {
  it("every dropped item resolves to a published runtime GLB or is label-only", () => {
    const missing = INVENTORY_DEFINITIONS.flatMap((d) => {
      const url = groundItemMeshUrl(d);
      return url && !existsSync(file(url)) ? [`${d.id} -> ${url}`] : [];
    });
    expect(missing).toEqual([]);
  });

  it("r001 handhelds and the legacy items upgraded to them show their in-hand art", () => {
    const byId = (id: string) =>
      groundItemMeshUrl(INVENTORY_DEFINITIONS.find((d) => d.id === id)!);
    expect(byId("carbine")).toBe(
      "/assets/crew/items/r001/compact-carbine.lod1.glb",
    );
    expect(byId("flashlight")).toBe(
      "/assets/crew/items/r001/flashlight.lod1.glb",
    );
    expect(byId("power-cell")).toBe("/assets/equipment/power-cell.glb");
  });
});
