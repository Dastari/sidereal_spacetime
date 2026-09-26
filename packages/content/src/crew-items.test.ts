import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ANIMATION_SET_CLIPS,
  CREW_ITEM_CATALOG,
  CREW_ITEMS,
  CREW_ITEM_FX,
  crewItem,
  crewItemActionPlan,
  crewItemForLegacyAsset,
  crewArmedClip,
  crewArmedClipInfo,
  CREW_ARMED_CLIPS,
  crewItemFx,
  crewItemMaterials,
  sampleCrewItemFx,
  toEquipmentPoseItem,
  validateCrewItemCatalog,
  type CrewItemCatalog,
} from "./crew-items";
import holds from "./crew-items-r001-holds.json";
import { validatePoseItem } from "./equipment-poses";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(HERE, "../../..");
const ASSETS = join(ROOT, "assets/runtime/crew/items/r001");
const manifest = JSON.parse(readFileSync(join(ASSETS, "manifest.json"), "utf8"));

function glbJson(path: string) {
  const data = readFileSync(path);
  expect(data.readUInt32LE(0)).toBe(0x46546c67);
  const length = data.readUInt32LE(12);
  return JSON.parse(data.subarray(20, 20 + length).toString("utf8"));
}

// Owner reference sets (equipment sheet WEAPONS & TOOLS, crew roster LOADOUT EXAMPLES,
// character-animations TOOLS & HAND ITEMS). Shared canonical designs cover repeats.
const REQUIRED_ITEMS = [
  "utility-cutter", "pistol", "smg", "compact-carbine", "shotgun", "beam-rifle", "rail-rifle", "medgun",
  "repair-tool", "shield-emitter", "scanner", "baton", "rifle", "heavy-gun", "stun-gun", "wrench", "welder",
  "multi-tool", "medkit", "sample-scanner", "data-pad", "drone", "grapple", "flashlight", "shield-pack",
  "mining-drill", "cargo-box",
];
const REQUIRED_FX = [
  "muzzle-flash", "laser-bolt", "plasma-bolt", "healing-beam", "scan-pulse", "shield-bubble", "impact-spark",
  "smoke-puff", "thruster-glow", "pickup-glow", "repair-sparks", "teleport",
];

describe("crew voxel items r001", () => {
  it("covers every referenced weapon, tool, loadout item and FX", () => {
    const ids = new Set(CREW_ITEMS.map((i) => i.id));
    for (const id of REQUIRED_ITEMS) expect(ids.has(id), id).toBe(true);
    const fx = new Set(CREW_ITEM_FX.map((f) => f.id));
    for (const id of REQUIRED_FX) expect(fx.has(id), id).toBe(true);
  });

  it("uses ten material slots and complete variant themes", () => {
    expect(CREW_ITEM_CATALOG.slots).toHaveLength(10);
    expect(CREW_ITEM_CATALOG.variants.length).toBeGreaterThanOrEqual(6);
    for (const item of CREW_ITEMS) for (const theme of CREW_ITEM_CATALOG.variants) {
      const table = crewItemMaterials(item, theme);
      for (const slot of item.slots) expect(table[slot].color).toHaveLength(3);
    }
  });

  it("applies item slot overrides only on the item's default theme", () => {
    const stun = crewItem("stun-gun");
    expect(crewItemMaterials(stun).emit_a.color).toEqual(stun.slotOverrides.emit_a.color);
    expect(crewItemMaterials(stun, "security").emit_a.color).toEqual(CREW_ITEM_CATALOG.themes.security.emit_a.color);
  });

  it("keeps the grip at the origin on the 1/32 m grid", () => {
    for (const item of CREW_ITEMS) {
      expect(item.voxelSize).toBeCloseTo(1 / 32, 9);
      expect(item.sockets.grip?.position).toEqual([0, 0, 0]);
      for (const s of Object.values(item.sockets)) for (const v of s!.position) expect(Math.abs(v * 64 - Math.round(v * 64))).toBeLessThan(1e-6);
    }
  });

  it("drives the existing aim-space pose controller where a profile is declared", () => {
    for (const item of CREW_ITEMS.filter((i) => i.poseProfile)) {
      const pose = toEquipmentPoseItem(item);
      expect(() => validatePoseItem(pose)).not.toThrow();
      expect(pose.sockets["Grip.Primary"]).toEqual([0, 0, 0]);
    }
    const rifle = toEquipmentPoseItem(crewItem("rifle"));
    expect(rifle.sockets["Aim.Muzzle"]![2]).toBeLessThan(-0.5);          // glTF -Z forward
    expect(rifle.sockets["Contact.Shoulder"]![2]).toBeGreaterThan(0.2);   // stock behind the grip
  });

  it("maps actions to CHARACTER_SPEC clips, item clips and FX", () => {
    expect(crewItemActionPlan(crewItem("pistol"), "fire")).toEqual({ characterClip: "shoot_pistol", itemClip: "fire", fx: "muzzle-flash" });
    expect(crewItemActionPlan(crewItem("compact-carbine"), "reload")).toMatchObject({ characterClip: "reload", itemClip: "reload" });
    expect(crewItemActionPlan(crewItem("repair-tool"), "use")).toMatchObject({ characterClip: "repair_loop", itemClip: "use", fx: "repair-sparks" });
    expect(crewItemActionPlan(crewItem("cargo-box"), "walk").characterClip).toBe("carry_walk");
    expect(crewItemActionPlan(crewItem("baton"), "equip").itemClip).toBe("deploy");
    for (const set of Object.values(ANIMATION_SET_CLIPS)) for (const clip of Object.values(set)) expect(clip).toMatch(/^[a-z_]+$/);
  });

  it("maps items to baked armed clips present in armed-actions.glb", () => {
    const armed = JSON.parse(readFileSync(join(ASSETS, "armed-actions.json"), "utf8"));
    const names = new Set(glbJson(join(ASSETS, "armed-actions.glb")).animations.map((a: { name: string }) => a.name));
    for (const clip of armed.clips) expect(names.has(clip.action), clip.action).toBe(true);
    for (const item of CREW_ITEMS)
      for (const clip of ["idle_armed", "walk_armed", "run_armed", "aim", "shoot", "reload", "draw", "holster"] as const) {
        const name = crewArmedClip(item, clip);
        if (name) expect(names.has(name), `${item.id} ${name}`).toBe(true);
      }
    expect(crewArmedClip(crewItem("rifle"), "walk_armed")).toBe("rifle.walk_armed");
    expect(crewArmedClip(crewItem("baton"), "reload")).toBeNull();
    expect(crewArmedClip(crewItem("cargo-box"), "aim")).toBeNull();
    for (const c of CREW_ARMED_CLIPS.clips) expect(names.has(c.animation), c.animation).toBe(true);
    const draw = crewArmedClipInfo(crewItem("rifle"), "draw")!;
    expect(draw.grabFrame).toBeGreaterThan(0);
    expect(draw.holsterFrames.length).toBeGreaterThan(0);
    expect(crewArmedClipInfo(crewItem("pistol"), "shoot")).toMatchObject({ itemClip: "fire", fxFrames: [1] });
    // the support hand stays on the item in every clip where it is solved
    for (const c of CREW_ARMED_CLIPS.clips) if (c.supportErrorMaxM !== null) expect(c.supportErrorMaxM, c.animation).toBeLessThan(0.02);
  });

  it("maps legacy equipment assets to voxel replacements", () => {
    expect(crewItemForLegacyAsset("compact-pistol")?.id).toBe("pistol");
    expect(crewItemForLegacyAsset("carbine")?.id).toBe("compact-carbine");
    expect(crewItemForLegacyAsset("long-rifle")?.id).toBe("rail-rifle");
    expect(crewItemForLegacyAsset("supply-crate")).toBeUndefined();
  });

  it("samples FX keys (one-shots finish, loops wrap)", () => {
    const flash = crewItemFx("muzzle-flash");
    expect(sampleCrewItemFx(flash, 0).opacity).toBe(1);
    expect(sampleCrewItemFx(flash, flash.durationS * 2)).toMatchObject({ opacity: 0, finished: true });
    const beam = crewItemFx("beam-lance");
    expect(sampleCrewItemFx(beam, beam.durationS * 3.5).finished).toBe(false);
  });

  it("rejects inconsistent catalogs", () => {
    const bad = structuredClone(CREW_ITEM_CATALOG) as unknown as { items: { fx: Record<string, string> }[] };
    bad.items[0].fx = { fire: "no-such-fx" };
    expect(() => validateCrewItemCatalog(bad as unknown as CrewItemCatalog)).toThrow(/unknown/);
  });

  it("ships exported GLBs that match the manifest and the content data", () => {
    expect(manifest.contentSha256).toBe(createHash("sha256").update(readFileSync(join(HERE, "crew-items-r001.json"))).digest("hex"));
    for (const item of CREW_ITEMS) {
      const entry = manifest.items.find((e: { id: string }) => e.id === item.id);
      for (const lod of ["lod0", "lod1"] as const) {
        const path = join(ASSETS, item.files[lod]);
        expect(createHash("sha256").update(readFileSync(path)).digest("hex")).toBe(entry.files[lod].sha256);
        const g = glbJson(path);
        const names = new Set(g.nodes.map((n: { name: string }) => n.name));
        expect(names.has(`item.${item.id}`)).toBe(true);
        for (const socket of Object.keys(item.sockets)) expect(names.has(`socket.${socket}`), `${item.id} socket.${socket}`).toBe(true);
        for (const part of item.parts) expect(names.has(`part.${part}`)).toBe(true);
        expect((g.animations ?? []).map((a: { name: string }) => a.name).sort()).toEqual(item.itemAnimations.map((a) => a.name).sort());
        for (const m of g.materials) expect(m.name).toMatch(/^slot:[a-z_]+@/);
      }
      expect(entry.files.lod1.triangles).toBeLessThan(entry.files.lod0.triangles);
      expect(existsSync(join(ASSETS, item.files.icon))).toBe(true);
    }
    for (const fx of CREW_ITEM_FX) expect(existsSync(join(ASSETS, fx.file))).toBe(true);
  });

  it("publishes a measured default hold on the CHAR-BODY v2 rig for every held item", () => {
    expect(holds.revision).toMatch(/^r\d{3}$/);
    type Hold = { characterClip: string; handErrorM: Record<string, number | number[]>; rotationWXYZ: number[] };
    for (const item of CREW_ITEMS.filter((i) => i.animationSet !== "worn")) {
      const hold = (holds.items as Record<string, Hold>)[item.id];
      expect(hold, item.id).toBeDefined();
      expect(Object.values(ANIMATION_SET_CLIPS).some((set) => Object.values(set).includes(hold.characterClip))).toBe(true);
      // Primary grip sits on socket.hand.R (carried boxes are centred between both hands).
      expect(hold.handErrorM.R as number).toBeLessThan(item.supportMode === "carry" ? 0.08 : 1e-3);
      expect(Math.hypot(...hold.rotationWXYZ)).toBeCloseTo(1, 4);
    }
  });

});
