import { describe, expect, it } from "vitest";
import { inventoryDefinition } from "@sidereal/content/inventory";
import { itemDetails } from "./item-details";
import { iconAngle } from "./inventory";

describe("item details from definition data", () => {
  it("takes the category and role from the item, not an id list", () => {
    expect(itemDetails(inventoryDefinition("shotgun"))).toMatchObject({
      category: "Weapons",
      label: "Weapon · Close range",
      usable: true,
    });
    expect(itemDetails(inventoryDefinition("plasma-cutter"))).toMatchObject({
      category: "Tools",
      label: "Tool · Melee · utility",
      usable: false,
    });
    expect(itemDetails(inventoryDefinition("medgun"))).toMatchObject({
      category: "Supplies",
      label: "Medical · Healing",
    });
    expect(itemDetails(inventoryDefinition("data-pad")).category).toBe("Tools");
    expect(itemDetails(inventoryDefinition("power-cell")).category).toBe(
      "Supplies",
    );
    expect(itemDetails(inventoryDefinition("field-pack")).category).toBe(
      "Storage",
    );
  });

  it("shows provisional server stats for weapons and 'not yet usable' for tools", () => {
    const shotgun = itemDetails(inventoryDefinition("shotgun")).stats;
    expect(shotgun.find((s) => s.label === "Damage")?.value).toBe("8 × 7");
    expect(shotgun.find((s) => s.label === "Range")?.value).toBe("18 m");
    expect(shotgun.find((s) => s.label === "Reload")?.value).toBe("2.4 s");
    const grenade = itemDetails(inventoryDefinition("grenade")).stats;
    expect(grenade.find((s) => s.label === "Blast radius")?.value).toBe(
      "3.5 m",
    );
    const welder = itemDetails(inventoryDefinition("welder")).stats;
    expect(welder[0]).toMatchObject({ label: "Use", value: "Not yet usable" });
  });

  it("turns grid icons a quarter only when the placement's long side is the other axis", () => {
    const rifle = inventoryDefinition("rifle"); // 4 x 2 footprint, landscape icon
    expect(iconAngle(rifle, { w: 160, h: 80 }, 384, 192)).toBe(0);
    expect(iconAngle(rifle, { w: 80, h: 160 }, 384, 192)).toBe(-Math.PI / 2);
    // legacy portrait footprints (2 x 4 carbine) show the r001 art muzzle-up
    const carbine = inventoryDefinition("carbine");
    expect(iconAngle(carbine, { w: 80, h: 160 }, 384, 192)).toBe(-Math.PI / 2);
    // square icons never turn
    expect(
      iconAngle(inventoryDefinition("medkit"), { w: 80, h: 160 }, 192, 192),
    ).toBe(0);
    // legacy catalogue icons without r001 art keep their diagonal rifle look
    expect(
      iconAngle({ pose: "rifle" }, { w: 80, h: 200 }, 256, 256),
    ).toBeCloseTo(-1.35);
  });
});
