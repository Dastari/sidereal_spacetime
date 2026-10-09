import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  compileConstruction,
  readConstructionDraft,
  PINNED_FLOOR_KIT,
} from "./construction-transactions";
import { WAYFARER_ACCESS_SOURCE } from "@sidereal/content/wayfarer-access-profile";
import { inside, stableStringify } from "./layout-geometry";
import { transformInterfacePoint } from "./tileset-fit";
import { compileLayout } from "./layout-compiler";
import {
  PREFAB_DECK_ID,
  prefabConstructionDocument,
  prefabLayout,
} from "./prefab-construction";
import { planConstructionInstance } from "./construction-instance";
import {
  canOccupyDeck,
  compileDeckCollision,
  resolveDeckCollision,
  sweepDeckCircle,
} from "./construction-collision";
import { prefabWalkRoute } from "./prefab-construction";
import { prefabFlightModel } from "./prefab-flight";
import { prefabPilotPose } from "./construction-pilot";

const catalog = defaultPrefabComponentCatalog();

describe("prefab construction documents", () => {
  for (const prefab of PREFAB_SHIPS)
    it(`${prefab.id} publishes through the construction compiler`, () => {
      const doc = prefabConstructionDocument(prefab, catalog);
      const layout = compileLayout(doc.layout);
      const errors = layout.diagnostics.filter((d) => d.severity === "error");
      expect(
        errors.map((d) => `${d.code}:${d.ids?.join?.(",") ?? ""}`),
      ).toEqual([]);
      if (!prefab.authoredGameplay)
        expect(doc.layout.openings.length).toBeGreaterThan(0);
      // Authored source openings are exact convex prop/partition gaps, not grammar edges.
      const snapshot = compileConstruction(JSON.stringify(doc));
      expect(snapshot.readiness.geometry).toBe(true);
      // Deterministic derivation.
      expect(
        readConstructionDraft(
          JSON.stringify(prefabConstructionDocument(prefab, catalog)),
        ).sha256,
      ).toBe(snapshot.sha256);
    });

  it("rejects a layout that drifts from the grammar derivation", () => {
    const doc = prefabConstructionDocument(PREFAB_SHIPS[0], catalog);
    doc.layout.partitions.pop();
    expect(() => readConstructionDraft(JSON.stringify(doc))).toThrow(
      /derivation/,
    );
  });

  it("qualifies six exact source-backed half strips without changing the generic kit", () => {
    const kitBefore = stableStringify(PINNED_FLOOR_KIT);
    const doc = prefabConstructionDocument(WAYFARER_ACCESS_SOURCE, catalog);
    const clips = doc.floors.filter((floor) => floor.nativeSupportClip);
    expect(clips).toHaveLength(6);
    for (const floor of clips) {
      const backing = PINNED_FLOOR_KIT.parts.find(
        (part) => part.id === floor.partId,
      )!;
      const polygon = backing.footprint.map((p) =>
        transformInterfacePoint(p, floor),
      );
      const tile = doc.layout.tiles.find((tile) => tile.id === floor.id)!;
      expect(tile.vertices.every((p) => inside(p, polygon))).toBe(true);
      const xs = tile.vertices.map((p) => p[0]),
        ys = tile.vertices.map((p) => p[1]);
      expect(
        (Math.max(...xs) - Math.min(...xs)) *
          (Math.max(...ys) - Math.min(...ys)),
      ).toBe(32 * 16);
    }
    expect(
      compileConstruction(JSON.stringify(doc)).readiness.nativeFloors,
    ).toBe(true);
    expect(stableStringify(PINNED_FLOOR_KIT)).toBe(kitBefore);
    expect(
      PINNED_FLOOR_KIT.parts.some((part) => part.id.includes("support")),
    ).toBe(false);
  });

  it.each([
    "no-prefab",
    "profile1",
    "spoofed-source",
    "arbitrary-floor",
    "missing-fragment",
    "outside-backing",
    "moved-backing",
    "arbitrary-clip",
  ])("rejects native support clip forgery: %s", (kind) => {
    const doc = prefabConstructionDocument(WAYFARER_ACCESS_SOURCE, catalog);
    const clip = doc.floors.find((floor) => floor.nativeSupportClip)!;
    const tile = doc.layout.tiles.find((tile) => tile.id === clip.id)!;
    if (kind === "no-prefab") delete (doc as Partial<typeof doc>).prefab;
    else if (kind === "profile1")
      doc.prefab.document.authoredGameplay!.revision = 1;
    else if (kind === "spoofed-source")
      doc.prefab.document.description += " altered";
    else if (kind === "arbitrary-floor")
      doc.floors.find((floor) => !floor.nativeSupportClip)!.nativeSupportClip =
        { ...clip.nativeSupportClip! };
    else if (kind === "missing-fragment") delete clip.nativeSupportClip;
    else if (kind === "outside-backing")
      tile.vertices.forEach((p) => (p[0] += 64));
    else if (kind === "moved-backing") clip.origin[0] += 16;
    else Object.assign(clip.nativeSupportClip!, { width: 2 });
    // Internal derivation mode is not a bypass for untrusted support metadata.
    expect(() =>
      readConstructionDraft(JSON.stringify(doc), { prefabDerivation: true }),
    ).toThrow(/support clip|support fragment/i);
  });

  it("rejects an invalid prefab and an unknown catalog revision", () => {
    const doc = prefabConstructionDocument(PREFAB_SHIPS[0], catalog);
    const bad = structuredClone(doc);
    bad.prefab.catalog = "ship-components-v0@0";
    expect(() => readConstructionDraft(JSON.stringify(bad))).toThrow(/catalog/);
    const broken = structuredClone(doc);
    broken.prefab.document.rooms = [];
    expect(() => readConstructionDraft(JSON.stringify(broken))).toThrow();
  });

  it("maps the prefab frame onto the layout frame (bow toward +y, port toward -x)", () => {
    const prefab = PREFAB_SHIPS[0];
    const layout = prefabLayout(prefab, catalog);
    const ys = layout.tiles.flatMap((t) => t.vertices.map((v) => v[1]));
    const xs = layout.tiles.flatMap((t) => t.vertices.map((v) => v[0]));
    // The bridge (fore) is at larger layout y than the engine room (aft).
    const bridge = layout.rooms.find((r) => r.type === "bridge")!;
    const engine = layout.rooms.find((r) => r.type === "engineering")!;
    expect(bridge.seed[1]).toBeGreaterThan(engine.seed[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(
      Math.max(...xs) - Math.min(...xs),
    );
  });
});

describe("prefab instances", () => {
  const uuid = (n: number) =>
    `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
  for (const id of [
    "fed.s.wren",
    "rj.s.jackal",
    "au.s.lumen",
    "fed.m.meridian",
  ])
    it(`${id} spawns a walkable instance whose document still admits`, () => {
      const prefab = PREFAB_SHIPS.find((p) => p.id === id)!;
      const snapshot = compileConstruction(
        JSON.stringify(prefabConstructionDocument(prefab, catalog)),
      );
      let n = 0;
      const plan = planConstructionInstance(
        snapshot,
        {
          blueprintRevisionId: `trusted-prefab:${id}`,
          expectedBlueprintSha256: snapshot.sha256,
          sourceDeckId: PREFAB_DECK_ID,
          bodyRadiusM: 0.3,
          bodyHeightM: 1.8,
          perimeterHalfWidthM: 0,
          partitionHalfWidthM: 0,
          objectCollisionBindings: [],
        },
        () => uuid(++n),
      );
      const json = JSON.stringify(plan.document);
      // The spawned (UUID-remapped) instance still re-derives from its grammar data.
      expect(() => readConstructionDraft(json)).not.toThrow();
      expect(() => compileConstruction(json)).not.toThrow();
      const tampered = JSON.parse(json);
      tampered.layout.partitions.pop();
      expect(() => readConstructionDraft(JSON.stringify(tampered))).toThrow();
      const frame = resolveDeckCollision(
        compileDeckCollision(plan.document.layout, plan.spawn.deckId, {
          shipId: plan.instanceId,
          perimeterHalfWidthM: 0,
          partitionHalfWidthM: 0,
        }),
        [],
      );
      expect(
        canOccupyDeck(
          frame,
          {
            shipId: plan.instanceId,
            deckId: plan.spawn.deckId,
            position: plan.spawn.positionM,
          },
          0.3,
        ),
      ).toBe(true);
      // Walk from the spawn to the pilot approach through door passages and sit down.
      const model = prefabFlightModel(prefab, catalog);
      const pose = prefabPilotPose(model.station!);
      let at: [number, number] = [
        plan.spawn.positionM[0],
        plan.spawn.positionM[1],
      ];
      for (const target of [
        ...prefabWalkRoute(prefab, catalog, at, pose.approach),
        [pose.position[0], pose.position[1]] as [number, number],
      ]) {
        const swept = sweepDeckCircle(
          frame,
          { shipId: plan.instanceId, deckId: plan.spawn.deckId, position: at },
          [target[0] - at[0], target[1] - at[1]],
          0.3,
        );
        expect(
          Math.hypot(
            swept.position[0] - target[0],
            swept.position[1] - target[1],
          ),
        ).toBeLessThan(1e-5);
        at = target;
      }
    });
});
