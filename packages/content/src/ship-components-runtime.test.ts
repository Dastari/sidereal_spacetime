import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "./prefabs/index";
import { SHIP_COMPONENT_ART_REVISION } from "./ship-components-source";
import { componentVisualUrl } from "./ship-prefab-catalog";

const repo = resolve(import.meta.dirname, "../../..");
const runtime = resolve(repo, "assets/runtime/ship-components", SHIP_COMPONENT_ART_REVISION);

describe("published ship component GLBs", () => {
  it("are published for the current art revision and listed for delivery", () => {
    expect(existsSync(resolve(runtime, "manifest.json"))).toBe(true);
    const prepare = readFileSync(resolve(repo, "scripts/prepare_app.py"), "utf8");
    expect(prepare).toContain(`"ship-components/${SHIP_COMPONENT_ART_REVISION}"`);
  });

  it("cover every component a prefab ship mounts (no procedural stand-ins in game)", () => {
    const manifest = JSON.parse(readFileSync(resolve(runtime, "manifest.json"), "utf8")) as {
      components: { id: string }[];
      requiredComponentIds: string[];
    };
    const published = new Set(manifest.components.map((c) => c.id));
    const used = [...new Set(PREFAB_SHIPS.flatMap((p) => p.mounts.map((m) => m.component)))].sort();
    expect(used.filter((id) => !published.has(id))).toEqual([]);
    for (const id of used) {
      expect(existsSync(resolve(runtime, `${id}.glb`)), id).toBe(true);
      expect(componentVisualUrl(id)).toBe(`/assets/ship-components/${SHIP_COMPONENT_ART_REVISION}/${id}.glb`);
    }
    expect(manifest.requiredComponentIds).toEqual(expect.arrayContaining(used));
  });
});
