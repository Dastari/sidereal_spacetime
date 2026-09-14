import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { PartCatalog } from "@sidereal/content/assembly";
import { HULL_SIZE_CATALOG } from "@sidereal/content/hull-size-catalog";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import template from "./templates/wayfarer-r001.json";
import {
  createBlankLayout,
  createWayfarerFloorplanDraft,
  floorplanOnlyCopy,
  clearLayoutProposal,
  detachLegacyStructureProposal,
} from "./redesign-document";
import {
  createWayfarerTemplateDraft,
  preserveBeforeTemplate,
} from "./wayfarer-template";
import {
  push,
  undo,
  redo,
  readCheckpoint,
  recoveryKey,
  DEFAULT_VIEW,
  type Checkpoint,
} from "./state";
const first = "682210ab-dae9-4f53-bb31-c8bb5617d4e1",
  second = "782210ab-dae9-4f53-bb31-c8bb5617d4e1",
  deck = "882210ab-dae9-4f53-bb31-c8bb5617d4e1";
const hull = HULL_SIZE_CATALOG[0];
const catalog = JSON.parse(
  readFileSync("assets/runtime/assembly/catalog.json", "utf8"),
) as PartCatalog;
const stored = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};
describe("clean redesign documents and recovery", () => {
  it("creates a genuinely empty design with the selected envelope active immediately", () => {
    const chosen = {
      ...hull,
      origin: [-128, -64, 128] as [number, number, number],
      height: 64,
    };
    const d = createBlankLayout(
      "station-module",
      "Station plan",
      chosen,
      first,
      deck,
    );
    expect(d).toMatchObject({
      id: first,
      kind: "station-module",
      name: "Station plan",
      source: null,
      legacy: null,
    });
    for (const key of [
      "tiles",
      "partitions",
      "openings",
      "rooms",
      "fittings",
      "nodes",
      "routes",
    ] as const)
      expect(d[key]).toEqual([]);
    expect(d.assembly).toBeUndefined();
    expect(d.structure?.hull).toEqual(chosen);
    expect(d.structure).toMatchObject({
      schema: "sidereal.layout-structure.v2",
      wallConvention: "inset250-v1",
      deckProfiles: [
        {
          deckId: deck,
          floorThickness: 6,
          clearHeight: 48,
          roofThickness: 4,
          serviceVoid: 6,
          pitch: 64,
        },
      ],
    });
    expect(d.decks[0]).toMatchObject({ elevation: 128, ceiling: 54 });
    expect(compileLayout(d).valid).toBe(true);
    d.structure!.hull.width = 12;
    expect(chosen.width).toBe(hull.width);
    expect(() =>
      createBlankLayout("ship", "Small", { ...hull, height: 16 }, first, deck),
    ).toThrow("minimum");
  });
  it("forks a pinned Wayfarer floorplan without any of the 211 retained visual objects", () => {
    const before = JSON.stringify(template),
      d = createWayfarerFloorplanDraft(template, first);
    expect(d.tiles).toEqual(template.layout.tiles);
    expect(d.decks).toEqual(template.layout.decks);
    expect(d.tiles).toHaveLength(51);
    expect(d.assembly).toBeUndefined();
    expect(d.partitions).toEqual([]);
    expect(d.rooms).toEqual([]);
    expect(d.fittings).toEqual([]);
    expect(d.routes).toEqual([]);
    expect(d.structure?.hull).toEqual(hull);
    expect(d.source).toBeNull();
    expect(compileLayout(d).valid).toBe(true);
    expect(JSON.stringify(template)).toBe(before);
    expect(
      createWayfarerTemplateDraft(template, second).assembly?.parts,
    ).toHaveLength(211);
  });
  it("forks the CURRENT modified floorplan rather than reloading the published template", () => {
    const source = createWayfarerTemplateDraft(template, first);
    source.name = "My edited ship";
    source.tiles[0].material = "my-floor";
    source.partitions = [];
    source.rooms = [];
    source.source = { liveId: "current-ship", expectedRevision: "17" };
    const before = JSON.stringify(source),
      d = floorplanOnlyCopy(source, second);
    expect(d.tiles).toEqual(source.tiles);
    expect(d.decks).toEqual(source.decks);
    expect(d.id).toBe(second);
    expect(d.source).toBeNull();
    expect(d.assembly).toBeUndefined();
    expect(JSON.stringify(source)).toBe(before);
    expect(() => floorplanOnlyCopy(source, first)).toThrow("fresh");
  });
  it("clears every dependent collection and remains undoable under the same local recovery identity", () => {
    const source = createWayfarerTemplateDraft(template, first),
      proposal = clearLayoutProposal(source),
      history = push(
        { past: [], present: source, future: [] },
        proposal.document,
      );
    expect(proposal.mode).toBe("edit");
    expect(proposal.removedIds).toHaveLength(262);
    expect(proposal.document.id).toBe(source.id);
    expect(proposal.document.source).toEqual(source.source);
    expect(proposal.document.tiles).toEqual([]);
    expect(proposal.document.assembly).toBeUndefined();
    expect(proposal.document.decks.every((d) => d.holes.length === 0)).toBe(
      true,
    );
    expect(undo(history).present).toEqual(source);
    expect(redo(undo(history)).present).toEqual(proposal.document);
    const checkpoint: Checkpoint = {
      schema: "sidereal.layout-recovery.v1",
      sequence: 1,
      writer: "test",
      history,
      view: { ...DEFAULT_VIEW, deckId: source.playableDeckId },
    };
    expect(readCheckpoint(JSON.stringify(checkpoint)).history.past[0]).toEqual(
      source,
    );
  });
  it("cleans holes, finish/model anchors, armor and wall/room/opening/service dependencies in one clear", () => {
    const d = createWayfarerFloorplanDraft(template, first),
      deckId = d.playableDeckId;
    d.decks[0].holes = [{ id: "old-hole", seed: [0, 0] }];
    d.partitions = [
      { id: "old-wall", deckId, a: [0, 0], b: [64, 0], seal: "design-sealed" },
    ];
    d.openings = [
      {
        id: "old-door",
        deckId,
        partitionId: "old-wall",
        a: [16, 0],
        b: [48, 0],
        kind: "door",
        clearance: 16,
        sill: 0,
      },
    ];
    d.rooms = [
      {
        id: "old-room",
        deckId,
        name: "Old room",
        type: "Room",
        seed: [16, 16],
        boundaryIds: ["old-wall"],
        access: "crew",
        floorTheme: "old",
        wallTheme: "old",
      },
    ];
    d.nodes = [
      {
        id: "port-a",
        deckId,
        point: [0, 0],
        channel: "power",
        kind: "endpoint",
        direction: "out",
        medium: "power",
      },
      {
        id: "port-b",
        deckId,
        point: [64, 0],
        channel: "power",
        kind: "endpoint",
        direction: "in",
        medium: "power",
      },
    ];
    d.routes = [
      {
        id: "old-wire",
        deckId,
        channel: "power",
        from: "port-a",
        to: "port-b",
        path: [
          [0, 0],
          [64, 0],
        ],
        capacity: null,
      },
    ];
    d.structure!.wallFaces = { "old-wall": { left: "old-panel" } };
    d.structure!.tileStyles = {
      "missing-tile": { model: { assetId: "unknown", revision: "future" } },
    };
    d.structure!.armor = [
      {
        id: "old-armor",
        deckId,
        boundaryId: "missing-edge",
        footprint: [
          [0, 0],
          [32, 0],
          [32, 32],
          [0, 32],
        ],
        bottom: 0,
        top: 32,
      },
    ];
    const original = JSON.stringify(d),
      p = clearLayoutProposal(d);
    expect(p.document.structure).toMatchObject({
      hull: d.structure!.hull,
      wallFaces: {},
      tileStyles: {},
      armor: [],
    });
    expect(p.removedIds).toEqual(
      expect.arrayContaining([
        "old-hole",
        "old-armor",
        "old-wall",
        "old-door",
        "old-room",
        "old-wire",
        "port-a",
        "port-b",
      ]),
    );
    expect(compileLayout(p.document).valid).toBe(true);
    expect(JSON.stringify(d)).toBe(original);
  });
  it("forces source-bound clearing into a separate local fork instead of breaking recovery or live-source identity", () => {
    const source = createWayfarerTemplateDraft(template, first);
    source.source = { liveId: "ship", expectedRevision: "22" };
    const before = JSON.stringify(source);
    expect(() => clearLayoutProposal(source)).toThrow("forked");
    const p = clearLayoutProposal(source, { forkId: second });
    expect(p.mode).toBe("fork");
    expect(p.document.id).toBe(second);
    expect(p.document.source).toBeNull();
    expect(JSON.stringify(source)).toBe(before);
  });
  it("detaches only classified native structure and retains independent equipment IDs/transforms and semantic floorplan", () => {
    const source = createWayfarerTemplateDraft(template, first),
      before = JSON.stringify(source);
    const expected = source.assembly!.parts.filter(
      (p) =>
        !["floor", "wall", "roof", "superstructure"].includes(
          catalog.assets.find((a) => a.id === p.assetId)!.category,
        ),
    );
    const p = detachLegacyStructureProposal(source, catalog);
    expect(p.mode).toBe("edit");
    expect(p.document.assembly!.parts).toEqual(expected);
    expect(p.removedIds.length).toBeGreaterThan(0);
    expect(p.document.tiles).toEqual(source.tiles);
    expect(p.document.rooms).toEqual(source.rooms);
    expect(
      undo(push({ past: [], present: source, future: [] }, p.document)).present,
    ).toEqual(source);
    expect(JSON.stringify(source)).toBe(before);
    expect(() =>
      detachLegacyStructureProposal(source, {
        schema: "sidereal.part-catalog.v1",
        assets: [],
      }),
    ).toThrow("missing");
    expect(JSON.stringify(source)).toBe(before);
  });
  it("saves the source proposal before a floorplan fork and refuses stale, blocked or quota-failed recovery writes", () => {
    const source = createWayfarerTemplateDraft(template, first),
      local = stored(),
      checkpoint: Checkpoint = {
        schema: "sidereal.layout-recovery.v1",
        sequence: 2,
        writer: "test",
        history: { past: [], present: source, future: [] },
        view: { ...DEFAULT_VIEW, deckId: source.playableDeckId },
      };
    const next = floorplanOnlyCopy(source, second),
      key = recoveryKey("account", source),
      forkKey = recoveryKey("account", next);
    local.setItem(key, "previous");
    const saved = preserveBeforeTemplate(
      local,
      "account",
      "previous",
      checkpoint,
      false,
    );
    expect(readCheckpoint(saved).history.present).toEqual(source);
    expect(local.getItem(forkKey)).toBeNull();
    expect(() =>
      preserveBeforeTemplate(local, "account", "previous", checkpoint, false),
    ).toThrow("Another editor");
    expect(() =>
      preserveBeforeTemplate(local, "account", saved, checkpoint, true),
    ).toThrow("recovery");
    expect(local.getItem(key)).toBe(saved);
    expect(() =>
      preserveBeforeTemplate(
        {
          getItem: () => saved,
          setItem: () => {
            throw Error("quota");
          },
        },
        "account",
        saved,
        checkpoint,
        false,
      ),
    ).toThrow("quota");
  });
});
