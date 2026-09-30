import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { createVoxelCrewVisual } from "./voxel-crew";
import { createVoxelCrewOutfit } from "./voxel-crew-outfit";
import type { CrewArmorAttachment } from "./armor-attach";
import type { EquippedCharacterComponents } from "@sidereal/content/character-components";

const control = vi.hoisted(() => ({
  delayed: false,
  fail: false,
  requests: [] as { release: () => void; attachment: CrewArmorAttachment }[],
  headDelayed: false,
  face: "",
  heads: [] as {
    release: () => void;
    activate: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock("./voxel-crew-kit", () => ({
  attachVoxelCrewHead: async (
    _scene: unknown,
    _crew: unknown,
    _loadout: unknown,
    revision: string,
    options?: { deferActivation?: boolean },
  ) => {
    const activate = vi.fn(() => {
      control.face = revision;
    });
    const dispose = vi.fn();
    if (control.headDelayed)
      await new Promise<void>((release) =>
        control.heads.push({ release, activate, dispose }),
      );
    if (!options?.deferActivation) activate();
    return { activate, dispose };
  },
}));
vi.mock("./armor-attach", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./armor-attach")>();
  return {
    ...actual,
    attachCrewArmor: async (
      ...args: Parameters<typeof actual.attachCrewArmor>
    ) => {
      if (control.fail) throw new Error("test missing asset");
      const [scene, target, part, options] = args;
      const source = new Uint8Array(
        readFileSync(
          new URL(
            `../../../../assets/runtime/crew/armor-v1/${part.glb}`,
            import.meta.url,
          ),
        ),
      );
      const attachment = await actual.attachCrewArmor(scene, target, part, {
        ...options,
        source,
      });
      if (control.delayed)
        await new Promise<void>((release) =>
          control.requests.push({ release, attachment }),
        );
      return attachment;
    },
  };
});

const body = new Uint8Array(
  readFileSync(
    new URL(
      "../../../../assets/runtime/crew/voxel/r005/crew-body.glb",
      import.meta.url,
    ),
  ),
);
const tier = (t: string) =>
  Object.fromEntries(
    ["chest", "shoulders", "gloves", "belt", "legs", "boots", "back"].map(
      (s) => [s, `wardrobe-${t}-${s}`],
    ),
  ) as EquippedCharacterComponents;
async function setup(bodyType: "male" | "female") {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const crew = await createVoxelCrewVisual(
    scene,
    new TransformNode("frame", scene),
    body,
    { faceAtlas: false },
  );
  const outfit = createVoxelCrewOutfit(scene, crew);
  const apply = async (equippedComponents: EquippedCharacterComponents) => {
    const appearance = { bodyType, equippedComponents };
    crew.customize(appearance);
    outfit.apply(appearance);
    while (outfit.pending)
      await new Promise((resolve) => setTimeout(resolve, 0));
    for (const mesh of crew.root
      .getChildMeshes()
      .filter((m) => m.isEnabled() && m.name.endsWith("regional-union")))
      expect(
        mesh.subMeshes.reduce((n, part) => n + part.indexCount, 0),
        mesh.name,
      ).toBe(mesh.getTotalIndices());
  };
  const visible = () =>
    crew.root
      .getChildMeshes()
      .filter((m) => m.isEnabled() && m.getTotalVertices() > 0)
      .map(
        (m) =>
          m.name +
          (m.metadata?.crewClothRegions ?? [])
            .map((r: string) => " region-" + r)
            .join(""),
      );
  const dispose = () => {
    outfit.dispose();
    crew.dispose();
    scene.dispose();
    engine.dispose();
  };
  return { crew, outfit, apply, visible, dispose };
}

describe("shared regional outfit assembly with actual body and armor GLBs", () => {
  it("accepts the latest head revision before binding a face and never activates stale or disposed loads", async () => {
    const s = await setup("male");
    control.headDelayed = true;
    const apply = (headArtRevision: string) =>
      s.outfit.apply({ bodyType: "male", headArtRevision });
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    try {
      apply("refinement-r005");
      apply("legacy");
      while (control.heads.length < 2) await tick();
      const [stale, current] = control.heads;
      current.release();
      await tick();
      expect(control.face).toBe("legacy");
      expect(current.activate).toHaveBeenCalledTimes(1);
      stale.release();
      await tick();
      expect(stale.dispose).toHaveBeenCalledTimes(1);
      expect(stale.activate).not.toHaveBeenCalled();
      expect(control.face).toBe("legacy");
      expect(current.dispose).not.toHaveBeenCalled();
      apply("refinement-r005");
      while (control.heads.length < 3) await tick();
      s.outfit.dispose();
      control.heads[2].release();
      await tick();
      expect(control.heads[2].activate).not.toHaveBeenCalled();
      expect(control.heads[2].dispose).toHaveBeenCalledTimes(1);
    } finally {
      control.headDelayed = false;
      control.heads.length = 0;
      control.face = "";
      s.dispose();
    }
  });
  for (const variant of ["male", "female"] as const)
    it(`${variant}: bare, uniform, full, partial, mixed and EVA retain ownership`, async () => {
      const s = await setup(variant);
      try {
        await s.apply({});
        expect(
          s.visible().some((n) => n.startsWith(`GEO-crew-base-${variant}`)),
        ).toBe(true);
        for (const t of ["t1", "t2"]) {
          await s.apply(tier(t));
          expect(Object.keys(s.outfit.armour)).toHaveLength(7);
          expect(s.visible().some((n) => /suit.*region-torso/.test(n))).toBe(
            true,
          );
          expect(
            s
              .visible()
              .some((n) =>
                /base.*region-(torso|hips|legs|upperArms|forearms|feet)/.test(
                  n,
                ),
              ),
          ).toBe(false);
        }
        await s.apply(
          Object.fromEntries(
            [
              "chest",
              "shoulders",
              "gloves",
              "belt",
              "legs",
              "boots",
              "back",
            ].map((slot) => [slot, `marine-${slot}`]),
          ) as EquippedCharacterComponents,
        );
        expect(Object.keys(s.outfit.armour)).toHaveLength(7);
        expect(
          s
            .visible()
            .some((n) =>
              /base.*region-(torso|hips|legs|upperArms|forearms|feet)/.test(n),
            ),
        ).toBe(false);
        await s.apply({ uniform: "wardrobe-uniform-security" });
        expect(
          s.visible().some((n) => n.startsWith(`GEO-crew-suit-${variant}`)),
        ).toBe(true);
        await s.apply({ shoulders: "wardrobe-t1-shoulders" });
        expect(s.visible().some((n) => /base.*region-hips/.test(n))).toBe(true);
        expect(s.visible().some((n) => /suit.*region-legs/.test(n))).toBe(
          false,
        );
        await s.apply({
          ...tier("t2"),
          chest: "wardrobe-t1-chest",
          legs: "marine-legs",
        });
        expect(Object.keys(s.outfit.armour)).toHaveLength(7);
        await s.apply({
          uniform: "wardrobe-suit-body",
          helmet: "wardrobe-suit-helmet",
          back: "wardrobe-suit-pack",
          boots: "wardrobe-suit-boots",
        });
        expect(s.visible().some((n) => n.endsWith("-pressure"))).toBe(true);
        expect(
          s
            .visible()
            .some(
              (n) =>
                n.startsWith(`GEO-crew-hands-${variant}`) &&
                !n.endsWith("-pressure"),
            ),
        ).toBe(false);
        await s.apply({
          uniform: "missing",
          chest: "missing",
          gloves: "missing",
        });
        expect(
          s
            .visible()
            .some(
              (n) =>
                n.startsWith(`GEO-crew-base-${variant}`) &&
                !n.includes("-regional-union"),
            ),
        ).toBe(true);
        expect(
          s
            .visible()
            .some(
              (n) => n.includes("-pressure") || n.includes("-regional-union"),
            ),
        ).toBe(false);
      } finally {
        s.dispose();
      }
    });

  it("failed armor does not hide skin or enable requested cloth", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = await setup("male");
    control.fail = true;
    try {
      await s.apply(tier("t2"));
      expect(s.outfit.armour).toEqual({});
      expect(s.visible().some((n) => n.startsWith("GEO-crew-base-male"))).toBe(
        true,
      );
      expect(s.visible().some((n) => n.includes("-regional-union"))).toBe(
        false,
      );
    } finally {
      control.fail = false;
      warn.mockRestore();
      s.dispose();
    }
  });

  it("remove/re-add cannot accept an obsolete pending attachment, and disposal rejects pending loads", async () => {
    const s = await setup("male");
    control.delayed = true;
    const apply = (equippedComponents: EquippedCharacterComponents) => {
      const a = { bodyType: "male" as const, equippedComponents };
      s.crew.customize(a);
      s.outfit.apply(a);
    };
    const waitRequest = async (count: number) => {
      while (control.requests.length < count)
        await new Promise((resolve) => setTimeout(resolve, 0));
    };
    try {
      apply({ chest: "wardrobe-t1-chest" });
      await waitRequest(1);
      apply({});
      apply({ chest: "wardrobe-t2-chest" });
      await waitRequest(2);
      const stale = control.requests[0];
      stale.release();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(stale.attachment.meshes.every((m) => m.isDisposed())).toBe(true);
      expect(s.visible().some((n) => /suit.*region-torso/.test(n))).toBe(false);
      s.outfit.dispose();
      control.requests[1].release();
      while (s.outfit.pending)
        await new Promise((resolve) => setTimeout(resolve, 0));
      expect(
        control.requests[1].attachment.meshes.every((m) => m.isDisposed()),
      ).toBe(true);
    } finally {
      control.delayed = false;
      control.requests.length = 0;
      s.dispose();
    }
  });
});
