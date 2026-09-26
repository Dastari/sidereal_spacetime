import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  CREW_HEAD_CATALOG as C,
  CREW_HEAD_SLOTS,
  DEFAULT_HEAD_LOADOUT,
  crewHeadAssetUrl,
  expectedHeadNodes,
  expressionForAnimation,
  expressionNodes,
  hairModeFor,
  resolveHeadLoadout,
  validateHeadLoadout,
  type HeadLoadout,
} from "./crew-heads";

const manifestPath = fileURLToPath(
  new URL("../../../assets/runtime/crew/heads/v1/crew-heads.manifest.json", import.meta.url),
);
const look = (over: Partial<HeadLoadout> = {}): HeadLoadout => ({ ...DEFAULT_HEAD_LOADOUT, ...over });

describe("crew head catalog", () => {
  test("meets the requested coverage", () => {
    const hair = C.hairStyles;
    expect(C.baseFaces).toHaveLength(8);
    expect(new Set(C.baseFaces.map((b) => `${b.sex}.${b.age}`)).size).toBe(8);
    expect(hair.filter((h) => h.group === "short").length).toBeGreaterThanOrEqual(12);
    expect(hair.filter((h) => h.group !== "short").length).toBeGreaterThanOrEqual(12);
    expect(C.facialHair.length).toBeGreaterThanOrEqual(10);
    expect(C.details.length).toBeGreaterThanOrEqual(10);
    expect(C.accessories.length).toBeGreaterThanOrEqual(20);
    expect(C.helmets.length).toBeGreaterThanOrEqual(8);
    expect(C.visors.length).toBeGreaterThanOrEqual(5);
    expect(C.masks.length).toBeGreaterThanOrEqual(2);
    for (const e of ["neutral", "happy", "sad", "angry", "surprised", "determined", "wink", "grin"])
      expect(C.expressions.some((x) => x.id === e)).toBe(true);
    expect(C.slots).toEqual([...CREW_HEAD_SLOTS]);
  });

  test("ids are unique within every category and expressions use known feature states", () => {
    for (const list of [C.baseFaces, C.expressions, C.hairStyles, C.facialHair, C.details, C.accessories, C.helmets, C.visors, C.masks, C.presets])
      expect(new Set(list.map((i) => i.id)).size).toBe(list.length);
    for (const e of C.expressions) {
      expect(C.faceFeatures.eyes).toContain(e.eyes);
      expect(C.faceFeatures.brows).toContain(e.brows);
      expect(C.faceFeatures.mouth).toContain(e.mouth);
    }
    for (const h of C.helmets) for (const v of h.visors) expect(C.visors.some((x) => x.id === v)).toBe(true);
  });

  test("slot defaults only name the ten material slots", () => {
    for (const item of [...C.details, ...C.accessories, ...C.helmets, ...C.masks])
      for (const [slot, value] of Object.entries(item.slotDefaults)) {
        expect(CREW_HEAD_SLOTS).toContain(slot);
        expect(typeof value).toBe("string");
      }
  });

  test("every animation in the shared character spec maps to an expression", () => {
    const anims =
      "idle idle_armed walk run crouch_idle crouch_walk aim_rifle aim_pistol shoot_rifle shoot_pistol reload melee_swing throw pick_up carry_idle carry_walk use_interact repair_loop sit sit_idle wave point cheer thumbs_up emote_happy emote_sad emote_angry emote_confused celebrate hurt death knocked_out revive jetpack_hover climb_ladder".split(" ");
    for (const a of anims) {
      expect(C.animationExpressions[a], a).toBeDefined();
      expect(C.expressions.some((e) => e.id === expressionForAnimation(a))).toBe(true);
    }
    expect(expressionForAnimation("unknown_future_anim")).toBe("neutral");
  });

  test("every preset (specialty look) is a valid loadout", () => {
    for (const p of C.presets) {
      const l = look(p.look);
      expect(validateHeadLoadout(l).errors, p.id).toEqual([]);
    }
  });
});

describe("loadout rules", () => {
  test("hair variant follows the most restrictive headwear", () => {
    expect(hairModeFor(look())).toBe("full");
    expect(hairModeFor(look({ accessories: ["glasses"] }))).toBe("full");
    expect(hairModeFor(look({ accessories: ["cap"] }))).toBe("cap");
    expect(hairModeFor(look({ accessories: ["hood"] }))).toBe("fringe");
    expect(hairModeFor(look({ helmet: "open" }))).toBe("fringe");
    expect(hairModeFor(look({ helmet: "closed", visor: "clear" }))).toBe("hidden");
    const r = resolveHeadLoadout(look({ hair: "afro", accessories: ["beanie"] }));
    expect(r.nodes.find((n) => n.role === "hair")?.node).toBe("hair.afro.cap");
    const closed = resolveHeadLoadout(look({ helmet: "pilot", visor: "mirrored", facialHair: "full_beard" }));
    expect(closed.nodes.some((n) => n.role === "hair" || n.role === "facialHair")).toBe(false);
    expect(closed.nodes.find((n) => n.role === "visor")).toMatchObject({ node: "visor.pilot.mirrored", slots: { glass: "mirrored" } });
  });

  test("layer conflicts are rejected", () => {
    expect(validateHeadLoadout(look({ accessories: ["cap", "beanie"] })).ok).toBe(false);
    expect(validateHeadLoadout(look({ accessories: ["glasses", "goggles_down"] })).ok).toBe(false);
    expect(validateHeadLoadout(look({ accessories: ["headset", "earring"] })).ok).toBe(false); // ears covers ear.L
    expect(validateHeadLoadout(look({ accessories: ["glasses"], details: ["eyepatch"] })).ok).toBe(false);
    expect(validateHeadLoadout(look({ accessories: ["cap"], helmet: "open" })).ok).toBe(false);
    expect(validateHeadLoadout(look({ accessories: ["mask"], mask: "oxygen_mask" })).ok).toBe(false);
    expect(validateHeadLoadout(look({ accessories: ["goggles_up", "glasses", "earring", "nose_ring", "scarf"] })).ok).toBe(true);
  });

  test("details: zone overlap and count limits", () => {
    expect(validateHeadLoadout(look({ details: ["freckles", "scars"] })).ok).toBe(false); // both on cheek.L
    expect(validateHeadLoadout(look({ details: ["scars", "tattoo"] })).ok).toBe(true);
    expect(validateHeadLoadout(look({ details: ["scars", "tattoo", "birthmark"] })).ok).toBe(false);
    // face-mounted details stay allowed under a closed helmet (they sit inside the cavity)
    expect(validateHeadLoadout(look({ details: ["eyepatch"], helmet: "closed", visor: "clear" })).ok).toBe(true);
  });

  test("visors and masks pair with compatible helmets only", () => {
    expect(validateHeadLoadout(look({ visor: "hud" })).ok).toBe(false);
    expect(validateHeadLoadout(look({ helmet: "open", visor: "hud" })).ok).toBe(false);
    expect(validateHeadLoadout(look({ helmet: "security", visor: "hud" })).ok).toBe(true);
    expect(validateHeadLoadout(look({ helmet: "open", mask: "rebreather" })).ok).toBe(true);
    expect(validateHeadLoadout(look({ helmet: "hazmat", visor: "clear", mask: "rebreather" })).ok).toBe(false);
  });

  test("colours accept palette ids or hex, and cyber eyes are emissive", () => {
    expect(validateHeadLoadout(look({ skin: "#123456", hairColor: "#abcdef" })).ok).toBe(true);
    expect(validateHeadLoadout(look({ skin: "blue-ish" })).ok).toBe(false);
    const r = resolveHeadLoadout(look({ eyes: "cyber", hairColor: "pink" }));
    const eyes = r.nodes.find((n) => n.role === "eyes")!;
    expect(eyes.emissiveSlots).toContain("eye");
    expect(r.nodes.find((n) => n.role === "hair")!.slots.hair).toBe("#f06dab");
  });

  test("masks hide the mouth and beard, and themes recolour worn items only", () => {
    const r = resolveHeadLoadout(look({ facialHair: "full_beard", accessories: ["respirator"] }), "happy", { suit_secondary: "#ff0000" });
    expect(r.hidden.sort()).toEqual(["facialHair", "mouth"]);
    expect(r.nodes.some((n) => n.role === "mouth" || n.role === "facialHair")).toBe(false);
    expect(r.nodes.find((n) => n.role === "accessory")!.slots.suit_secondary).toBe("#ff0000");
    expect(r.nodes.find((n) => n.role === "head")!.slots.suit_secondary).toBeUndefined();
  });

  test("expressions swap only the three face nodes", () => {
    const a = resolveHeadLoadout(look({ baseFace: "female_older" }), "neutral").nodes.map((n) => n.node);
    const b = resolveHeadLoadout(look({ baseFace: "female_older" }), "angry").nodes.map((n) => n.node);
    const changed = b.filter((n) => !a.includes(n));
    expect(changed).toEqual(Object.values(expressionNodes("female_older", "angry")).filter((n) => !a.includes(n)));
    expect(changed.every((n) => n.startsWith("face.female_older."))).toBe(true);
    expect(() => resolveHeadLoadout(look({ baseFace: "nope" }))).toThrow(/invalid head loadout/);
  });

  test("asset urls are revisioned", () => {
    expect(crewHeadAssetUrl("hair")).toBe("/assets/crew/heads/v1/hair.glb?revision=r001");
    expect(() => crewHeadAssetUrl("nope")).toThrow();
  });
});

describe("exported kit manifest", () => {
  const present = existsSync(manifestPath);
  test.runIf(present)("contains every catalogued node with bounded geometry in the allowed slots", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      catalogRevision: number;
      files: Record<string, string>;
      nodes: Record<string, { glb: string; slots: string[]; triangles: number; boundsM: number[][] }>;
    };
    expect(manifest.catalogRevision).toBe(C.revision);
    expect(manifest.files).toEqual(C.files);
    const expected = expectedHeadNodes();
    expect(Object.keys(manifest.nodes).sort()).toEqual([...expected].sort());
    for (const [name, n] of Object.entries(manifest.nodes)) {
      expect(C.files[n.glb], name).toBeDefined();
      for (const s of n.slots) expect(CREW_HEAD_SLOTS).toContain(s);
      expect(n.triangles, name).toBeGreaterThan(0);
      expect(n.triangles, name).toBeLessThan(24000);
      const [lo, hi] = n.boundsM;
      for (let i = 0; i < 3; i++) {
        expect(lo[i]).toBeGreaterThanOrEqual(-0.4);
        expect(hi[i]).toBeLessThanOrEqual(0.62);
      }
    }
    // every node a resolved loadout can ask for exists
    for (const p of C.presets)
      for (const e of C.expressions)
        for (const n of resolveHeadLoadout(look(p.look), e.id).nodes)
          expect(manifest.nodes[n.node], `${p.id}/${e.id}/${n.node}`).toBeDefined();
  });
});
