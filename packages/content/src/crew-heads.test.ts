import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import {
  CREW_FACE_ATLAS as A,
  CREW_HEAD_CATALOG as C,
  CREW_HEAD_SLOTS,
  DEFAULT_HEAD_LOADOUT,
  FACE_LAYERS,
  composeFace,
  crewFaceAtlasUrl,
  crewHeadAssetUrl,
  expectedHeadNodes,
  expressionForAnimation,
  marksFrame,
  hairModeFor,
  nextBlinkDelay,
  resolveFaceFrames,
  resolveHeadLoadout,
  validateHeadLoadout,
  type HeadLoadout,
  type RGBAImage,
} from "./crew-heads";

const repo = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const manifestPath = repo("assets/runtime/crew/heads/v1/crew-heads.manifest.json");
const look = (over: Partial<HeadLoadout> = {}): HeadLoadout => ({ ...DEFAULT_HEAD_LOADOUT, ...over });

/** Minimal PNG decoder for the 8-bit RGBA, non-interlaced atlases the generator writes. */
function readPng(path: string): RGBAImage {
  const buf = readFileSync(path);
  let off = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      expect(body[8]).toBe(8);
      expect(body[9]).toBe(6);
    }
    if (type === "IDAT") idat.push(body);
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const cur = raw[y * (stride + 1) + 1 + x];
      const a = x >= 4 ? data[y * stride + x - 4] : 0;
      const b = y > 0 ? data[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? data[(y - 1) * stride + x - 4] : 0;
      const p = a + b - c;
      const pr = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      data[y * stride + x] = (cur + [0, a, b, (a + b) >> 1, pr][f]) & 255;
    }
  }
  return { width, height, data };
}

describe("crew head catalog", () => {
  test("meets the requested coverage", () => {
    const hair = C.hairStyles;
    expect(C.heads.map((h) => h.id)).toEqual(["male", "female"]);
    expect(C.faceVariants.filter((v) => v.sex === "male").length).toBeGreaterThanOrEqual(3);
    expect(C.faceVariants.filter((v) => v.sex === "female").length).toBeGreaterThanOrEqual(3);
    expect(C.ages.map((a) => a.id)).toEqual(["young", "adult", "middle", "older"]);
    expect(hair.filter((h) => h.group === "short").length).toBeGreaterThanOrEqual(12);
    expect(hair.filter((h) => h.group !== "short").length).toBeGreaterThanOrEqual(12);
    expect(C.facialHair.length).toBeGreaterThanOrEqual(10);
    expect(C.details.length).toBeGreaterThanOrEqual(10);
    expect(C.accessories.length).toBeGreaterThanOrEqual(20);
    expect(C.helmets.length).toBeGreaterThanOrEqual(8);
    expect(C.visors.length).toBeGreaterThanOrEqual(5);
    expect(C.masks.length).toBeGreaterThanOrEqual(2);
    const required = "neutral happy sad angry surprised confused hurt determined scared smug sleepy knocked_out".split(" ");
    for (const e of required) expect(C.expressions.map((x) => x.id)).toContain(e);
    expect(C.visemes).toEqual(["closed", "A", "E", "O", "MB"]);
    expect(C.slots).toEqual([...CREW_HEAD_SLOTS]);
    expect(C.blink.intervalSeconds).toEqual([2, 6]);
    expect(A.schema).toBe("sidereal.crew.face-atlas/1");
    expect(A.looks).toEqual({ "-1": "r", "0": "c", "1": "l" });
  });

  test("catalog and face atlas agree on every frame an expression, viseme, blink, age or marking can ask for", () => {
    expect(A.layers).toEqual([...FACE_LAYERS]);
    expect(Object.keys(A.variants).sort()).toEqual(C.faceVariants.map((v) => v.id).sort());
    const wanted = new Set<string>();
    for (const e of C.expressions)
      for (const viseme of [null, ...C.visemes])
        for (const blink of [null, ...C.blink.frames.map((f) => f.eyes)])
          for (const lk of [-1, 0, 1] as const)
            for (const age of C.ages) {
              const frames = resolveFaceFrames({ age: age.id }, { expression: e.id, viseme, blink, look: lk });
              for (const layer of FACE_LAYERS) wanted.add(`${layer}/${frames[layer]}`);
            }
    for (const [vid, v] of Object.entries(A.variants)) {
      const have = new Set(FACE_LAYERS.flatMap((layer) => v.frames[layer].map((f) => `${layer}/${f}`)));
      expect([...wanted].filter((w) => !have.has(w)), vid).toEqual([]);
      for (const d of C.details.filter((x) => x.kind === "marking"))
        for (const age of C.ages) expect(v.frames.marks).toContain(marksFrame(age.ageMark, d.atlasMark!));
      expect(v.frames.mouth).toContain("none");
    }
  });

  test("ids are unique and slot defaults only name the character slots", () => {
    for (const list of [C.heads, C.faceVariants, C.ages, C.expressions, C.hairStyles, C.facialHair, C.details, C.accessories, C.helmets, C.visors, C.masks, C.presets])
      expect(new Set(list.map((i) => i.id)).size).toBe(list.length);
    for (const h of C.helmets) for (const v of h.visors) expect(C.visors.some((x) => x.id === v)).toBe(true);
    for (const item of [...C.details, ...C.accessories, ...C.helmets, ...C.masks])
      for (const [slot, value] of Object.entries(item.slotDefaults)) {
        expect(CREW_HEAD_SLOTS).toContain(slot);
        expect(typeof value).toBe("string");
      }
  });

  test("every animation in the shared character spec maps to an expression", () => {
    const anims =
      "idle idle_armed walk run crouch_idle crouch_walk aim_rifle aim_pistol shoot_rifle shoot_pistol reload melee_swing throw pick_up carry_idle carry_walk use_interact repair_loop sit sit_idle wave point cheer thumbs_up emote_happy emote_sad emote_angry emote_confused celebrate hurt death knocked_out revive jetpack_hover climb_ladder".split(" ");
    for (const a of anims) expect(A.expressions[expressionForAnimation(a)], a).toBeDefined();
    expect(expressionForAnimation("hurt")).toBe("hurt");
    expect(expressionForAnimation("death")).toBe("knocked_out");
    expect(expressionForAnimation("emote_confused")).toBe("confused");
    expect(expressionForAnimation("unknown_future_anim")).toBe("neutral");
  });

  test("every preset (specialty look) is a valid loadout", () => {
    for (const p of C.presets) expect(validateHeadLoadout(look(p.look)).errors, p.id).toEqual([]);
  });
});

describe("animated face", () => {
  test("blink only replaces open-type eyes, visemes replace the mouth, look moves the iris", () => {
    const base = { age: "adult" };
    expect(resolveFaceFrames(base, { expression: "neutral", blink: "closed" }).eyes).toBe("closed");
    expect(resolveFaceFrames(base, { expression: "knocked_out", blink: "closed" }).eyes).toBe("ko");
    expect(resolveFaceFrames(base, { expression: "happy", viseme: "O" }).mouth).toBe("viseme_O");
    expect(resolveFaceFrames(base, { expression: "happy", look: -1 }).iris).toBe("open@r");
    expect(resolveFaceFrames(base, { expression: "grin" }).iris).toBe("none");
    expect(resolveFaceFrames(base, { expression: "neutral", blink: "closed" }).iris).toBe("closed@c");
    expect(resolveFaceFrames({ age: "older", details: ["tattoo"] }, { expression: "neutral" }).marks).toBe("older+tattoo");
    expect(resolveFaceFrames({ age: "young" }, { expression: "neutral" }).marks).toBe("none");
    expect(resolveFaceFrames(base, { expression: "neutral" }, true).mouth).toBe("none");
    expect(nextBlinkDelay(0)).toBe(2);
    expect(nextBlinkDelay(0.5)).toBe(4);
  });

  const atlasPath = repo(`assets/runtime/crew/heads/v1/face/${A.variants.m_classic.file}`);
  test.runIf(existsSync(atlasPath))("composeFace tints the iris and brows and leaves the skin elsewhere", () => {
    const atlas = readPng(atlasPath);
    expect([atlas.width, atlas.height]).toEqual(A.variants.m_classic.size);
    const tints = { skin: "#c08968", eye: "#00ff00", hair: "#ff0000" };
    const neutral = composeFace(atlas, "m_classic", resolveFaceFrames({ age: "adult" }, { expression: "neutral" }), tints);
    const blink = composeFace(atlas, "m_classic", resolveFaceFrames({ age: "adult" }, { expression: "neutral", blink: "closed" }), tints);
    const px = (img: Uint8ClampedArray) => Array.from({ length: 256 }, (_, i) => [...img.slice(i * 4, i * 4 + 3)]);
    const n = px(neutral);
    expect(n[0]).toEqual([0xc0, 0x89, 0x68]);                                   // corner: skin
    expect(n.some(([r, g, b]) => g > 200 && r < 40 && b < 40)).toBe(true);        // iris takes the eye tint
    expect(n.some(([r, g, b]) => r === Math.round(255 * A.browShade) && g === 0 && b === 0)).toBe(true); // brows: hair x shade
    expect(px(blink).some(([r, g, b]) => g > 200 && r < 40 && b < 40)).toBe(false); // closed eyes hide the iris
    expect(neutral.every((v, i) => i % 4 !== 3 || v === 255)).toBe(true);
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
    expect(resolveHeadLoadout(look({ hair: "afro", accessories: ["beanie"] })).nodes.find((n) => n.role === "hair")?.node).toBe("hair.afro.cap");
    const closed = resolveHeadLoadout(look({ helmet: "pilot", visor: "mirrored", facialHair: "full_beard" }));
    expect(closed.nodes.some((n) => n.role === "hair" || n.role === "facialHair")).toBe(false);
    expect(closed.nodes.find((n) => n.role === "visor")).toMatchObject({ node: "visor.pilot.mirrored", slots: { glass: "mirrored" } });
  });

  test("layer conflicts are rejected", () => {
    expect(validateHeadLoadout(look({ accessories: ["cap", "beanie"] })).ok).toBe(false);
    expect(validateHeadLoadout(look({ accessories: ["glasses", "goggles_down"] })).ok).toBe(false);
    expect(validateHeadLoadout(look({ accessories: ["headset", "earring"] })).ok).toBe(false);
    expect(validateHeadLoadout(look({ accessories: ["glasses"], details: ["eyepatch"] })).ok).toBe(false);
    expect(validateHeadLoadout(look({ accessories: ["cap"], helmet: "open" })).ok).toBe(false);
    expect(validateHeadLoadout(look({ accessories: ["mask"], mask: "oxygen_mask" })).ok).toBe(false);
    expect(validateHeadLoadout(look({ accessories: ["goggles_up", "glasses", "earring", "nose_ring", "scarf"] })).ok).toBe(true);
  });

  test("details: one atlas marking, zone overlap and count limits; overlays stay geometry", () => {
    expect(validateHeadLoadout(look({ details: ["scars", "tattoo"] })).ok).toBe(false); // one marks layer
    expect(validateHeadLoadout(look({ details: ["tattoo", "eyepatch"] })).ok).toBe(true);
    expect(validateHeadLoadout(look({ details: ["freckles", "bandage"] })).ok).toBe(false); // cheek.R overlap
    expect(validateHeadLoadout(look({ details: ["eyepatch"], helmet: "closed", visor: "clear" })).ok).toBe(true);
    const r = resolveHeadLoadout(look({ details: ["tattoo", "eyepatch"] }));
    expect(r.nodes.filter((n) => n.role === "detail").map((n) => n.node)).toEqual(["detail.eyepatch"]);
  });

  test("visors and masks pair with compatible helmets only", () => {
    expect(validateHeadLoadout(look({ visor: "hud" })).ok).toBe(false);
    expect(validateHeadLoadout(look({ helmet: "open", visor: "hud" })).ok).toBe(false);
    expect(validateHeadLoadout(look({ helmet: "security", visor: "hud" })).ok).toBe(true);
    expect(validateHeadLoadout(look({ helmet: "open", mask: "rebreather" })).ok).toBe(true);
    expect(validateHeadLoadout(look({ helmet: "hazmat", visor: "clear", mask: "rebreather" })).ok).toBe(false);
  });

  test("colours accept palette ids or hex; face tints and mask-hidden mouth reach the face canvas", () => {
    expect(validateHeadLoadout(look({ skin: "#123456", hairColor: "#abcdef" })).ok).toBe(true);
    expect(validateHeadLoadout(look({ skin: "blue-ish" })).ok).toBe(false);
    const r = resolveHeadLoadout(look({ eyes: "cyber", hairColor: "pink", accessories: ["respirator"], facialHair: "full_beard" }), { suit_secondary: "#ff0000" });
    expect(r.face).toMatchObject({ variant: "m_classic", eyeEmissive: true, mouthHidden: true, tints: { hair: "#f06dab" } });
    expect(r.hidden.sort()).toEqual(["facialHair", "mouth"]);
    expect(r.nodes.find((n) => n.role === "accessory")!.slots.suit_secondary).toBe("#ff0000");
    expect(r.nodes.find((n) => n.role === "head")!.slots.suit_secondary).toBeUndefined();
    expect(() => resolveHeadLoadout(look({ head: "nope" }))).toThrow(/invalid head loadout/);
  });

  test("asset urls are revisioned", () => {
    expect(crewHeadAssetUrl("hair/afro")).toBe(`/assets/crew/heads/v1/hair/afro.glb?revision=r00${C.revision}`);
    expect(crewHeadAssetUrl("heads")).toBe(`/assets/crew/heads/v1/heads.glb?revision=r00${C.revision}`);
    expect(() => crewHeadAssetUrl("hair/nope")).toThrow();
    expect(crewFaceAtlasUrl("f_bright")).toBe(`/assets/crew/heads/v1/face/face-f_bright.png?revision=r00${C.revision}`);
    expect(() => crewHeadAssetUrl("nope")).toThrow();
  });
});

describe("exported kit manifest", () => {
  test.runIf(existsSync(manifestPath))("contains every catalogued node with bounded geometry in the allowed slots", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      catalogRevision: number;
      files: Record<string, string>;
      nodes: Record<string, { glb: string; slots: string[]; triangles: number; boundsM: number[][] }>;
    };
    expect(manifest.catalogRevision).toBe(C.revision);
    for (const [key, file] of Object.entries(manifest.files)) expect(crewHeadAssetUrl(key)).toContain(`/${file}?`);
    expect(Object.keys(manifest.nodes).sort()).toEqual([...expectedHeadNodes()].sort());
    for (const [name, n] of Object.entries(manifest.nodes)) {
      expect(manifest.files[n.glb], name).toBeDefined();
      for (const s of n.slots) expect(CREW_HEAD_SLOTS).toContain(s);
      expect(n.triangles, name).toBeGreaterThan(0);
      expect(n.triangles, name).toBeLessThan(30000);
      const [lo, hi] = n.boundsM;
      for (let i = 0; i < 3; i++) {
        expect(lo[i], name).toBeGreaterThanOrEqual(-0.55);
        expect(hi[i], name).toBeLessThanOrEqual(0.9);
      }
    }
    expect(manifest.nodes["head.male"].slots).toContain("face");
    for (const p of C.presets)
      for (const n of resolveHeadLoadout(look(p.look)).nodes) {
        expect(manifest.nodes[n.node], `${p.id}/${n.node}`).toBeDefined();
        expect(manifest.nodes[n.node].glb).toBe(n.file);
      }
    for (const h of C.hairStyles) {
      const full = manifest.nodes[`hair.${h.id}.full`].triangles;
      expect(manifest.nodes[`hair.${h.id}.full.lod1`].triangles, h.id).toBeLessThan(full);
    }
  });
});
