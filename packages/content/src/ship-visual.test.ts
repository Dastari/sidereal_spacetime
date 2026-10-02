import { describe, expect, it } from "vitest";
import {
  validateShipVisualLayers,
  readShipVisualManifest,
  SHIP_VISUAL_SCHEMA,
  SHIP_VISUAL_FRAME,
  SHIP_VISUAL_BOW_CASE_ENVELOPE_R026,
  SHIP_VISUAL_CANOPY_SOURCE_R026,
  type ShipVisualLayer,
} from "./ship-visual";
import { SHIP_KIT_SLOTS } from "./ship-kit";
import {
  REFERENCE_OPTICAL_INTERFACES_R002,
  SHIP_VISUAL_MACRO_PROFILES_R002,
} from "./ship-visual-r002";

describe("finite private R26 bow envelope", () => {
  const bow = SHIP_VISUAL_BOW_CASE_ENVELOPE_R026;
  const ordinary = {
    schema: SHIP_VISUAL_SCHEMA,
    revision: "r001",
    status: "proposal",
    frame: SHIP_VISUAL_FRAME,
    lattice: 16,
    compilerSha256: "a".repeat(64),
    profilesSha256: "b".repeat(64),
    slots: SHIP_KIT_SLOTS,
    prefabs: { [bow.prefab]: bow.prefabSha256 },
    assets: [
      {
        kind: "normal",
        id: "test",
        url: "/assets/test.png",
        bytes: 1,
        sha256: "c".repeat(64),
      },
    ],
    decorativeEnvelope: { outward: 0.1875, upward: 0.1875, inward: 0 },
  };
  const candidate = {
    ...ordinary,
    revision: "r002",
    decorativeEnvelope: { outward: 0.1875, upward: 0.375, inward: 0 },
    bowCaseEnvelopeR026: { ...bow, sourceSha256: "d".repeat(64) },
  };
  it("retains ordinary bounds and admits only the declared four-body proposal", () => {
    expect(readShipVisualManifest(ordinary).decorativeEnvelope.upward).toBe(
      0.1875,
    );
    expect(
      readShipVisualManifest(candidate).bowCaseEnvelopeR026?.bodies,
    ).toEqual(bow.bodies);
    for (const revision of ["r001", "r002"])
      expect(() =>
        readShipVisualManifest({
          ...ordinary,
          revision,
          decorativeEnvelope: { ...ordinary.decorativeEnvelope, upward: 0.375 },
        }),
      ).toThrow("decorative bounds");
  });
  it("rejects changed body/source/prefab identity and every undeclared envelope", () => {
    for (const patch of [
      { revision: "r001" },
      { prefabs: { [bow.prefab]: "e".repeat(64) } },
      { bowCaseEnvelopeR026: null },
      {
        bowCaseEnvelopeR026: {
          ...candidate.bowCaseEnvelopeR026,
          kind: "general",
        },
      },
      {
        bowCaseEnvelopeR026: {
          ...candidate.bowCaseEnvelopeR026,
          prefab: "fed.m.crest",
        },
      },
      {
        bowCaseEnvelopeR026: {
          ...candidate.bowCaseEnvelopeR026,
          sourceSha256: "",
        },
      },
      {
        bowCaseEnvelopeR026: {
          ...candidate.bowCaseEnvelopeR026,
          prefabSha256: "e".repeat(64),
        },
      },
      {
        bowCaseEnvelopeR026: {
          ...candidate.bowCaseEnvelopeR026,
          bodies: [...bow.bodies, bow.bodies[0]],
        },
      },
      {
        bowCaseEnvelopeR026: {
          ...candidate.bowCaseEnvelopeR026,
          bodies: [[143, 8, 40, 158, 28, 46], ...bow.bodies.slice(1)],
        },
      },
      { decorativeEnvelope: { outward: 0.25, upward: 0.375, inward: 0 } },
      { decorativeEnvelope: { outward: 0.1875, upward: 0.4375, inward: 0 } },
      { decorativeEnvelope: { outward: 0.1875, upward: 0.1875, inward: 0 } },
      {
        decorativeEnvelope: { outward: 0.1875, upward: 0.375, inward: 0.0625 },
      },
    ])
      expect(() => readShipVisualManifest({ ...candidate, ...patch })).toThrow(
        "finite R26 bow",
      );
  });
});

describe("finite reference manufacturing inputs", () => {
  it("keeps separate finite source/retained optical boxes and meaningful clipped room dimensions", () => {
    for (const [id, spec] of Object.entries(
      REFERENCE_OPTICAL_INTERFACES_R002,
    )) {
      expect(spec.assetSha256, id).toMatch(/^[0-9a-f]{64}$/);
      if (spec.kind === "optical")
        expect(
          spec.sourceFrameBounds.length + spec.retainedGlassBounds.length,
          id,
        ).toBeGreaterThan(0);
      else {
        expect(spec.kind).toBe("non-optical");
        expect(spec.sourceFrameBounds).toHaveLength(0);
        expect(spec.retainedGlassBounds).toHaveLength(0);
      }
      for (const bounds of [
        ...spec.sourceFrameBounds,
        ...spec.retainedGlassBounds,
      ]) {
        expect(bounds).toHaveLength(6);
        expect(bounds.every(Number.isFinite), id).toBe(true);
        for (let a = 0; a < 3; a++)
          expect(bounds[a], id).toBeLessThanOrEqual(bounds[a + 3]);
      }
      if (id.endsWith(".cut")) expect(spec.retainedGlassBounds).toHaveLength(0);
    }
    for (const profile of Object.values(SHIP_VISUAL_MACRO_PROFILES_R002)) {
      expect(profile.partitionCut).toBeGreaterThanOrEqual(20);
      expect(profile.partitionCut).toBeLessThanOrEqual(22);
      expect(profile.opticalInterfaces).toBe(REFERENCE_OPTICAL_INTERFACES_R002);
      for (const task of Object.values(profile.wallTasks)) {
        expect(task.width).toBeGreaterThanOrEqual(13);
        expect(task.height).toBeGreaterThanOrEqual(9);
        expect(task.bottom).toBeGreaterThanOrEqual(2);
      }
      expect(profile.wallTasks.medical.form).not.toBe(
        profile.wallTasks.workshop.form,
      );
      expect(profile.wallTasks.galley.form).not.toBe(
        profile.wallTasks.cargo.form,
      );
    }
  });
});

describe("candidate original side-plane ownership", () => {
  const layer: ShipVisualLayer = {
    id: "side",
    role: "core",
    slot: "secondary",
    bounds: [0, 0, 0, 1, 1, 2],
  };
  it("accepts independent unit XY ownership and leaves absent descriptors valid", () => {
    expect(() => validateShipVisualLayers([layer])).not.toThrow();
    expect(() =>
      validateShipVisualLayers([
        {
          ...layer,
          normalSide: { id: "edge:2", normal: [0.6, 0.8, 0], faces: 10 },
        },
      ]),
    ).not.toThrow();
  });
  it("rejects malformed planes and non-XY face masks", () => {
    for (const normalSide of [
      { id: "", normal: [1, 0, 0], faces: 1 },
      { id: "edge", normal: [NaN, 0, 0], faces: 1 },
      { id: "edge", normal: [2, 0, 0], faces: 1 },
      { id: "edge", normal: [0, 0, 1], faces: 1 },
      { id: "edge", normal: [1, 0, 0], faces: 0 },
      { id: "edge", normal: [1, 0, 0], faces: 16 },
      { id: "edge", normal: [1, 0, 0], faces: 4294967297 },
      { id: "edge", normal: [1, 0, 0], faces: 1.5 },
    ])
      expect(() =>
        validateShipVisualLayers([
          { ...layer, normalSide: normalSide as ShipVisualLayer["normalSide"] },
        ]),
      ).toThrow("side ownership");
  });
  it("accepts only bounded two-axis manufactured planes and rejects contact/optical ownership", () => {
    const good = {
      id: "case",
      a: [1, -1, 0] as [number, number, number],
      d: 1,
    };
    expect(() =>
      validateShipVisualLayers([{ ...layer, facet: good }]),
    ).not.toThrow();
    for (const facet of [
      { ...good, id: " " },
      { ...good, a: [1, 1, 1] },
      { ...good, a: [1, 0, 0] },
      { ...good, a: [1, NaN, 0] },
      { ...good, a: [2, 1, 0] },
      { ...good, d: 0.5 },
      { ...good, d: Infinity },
      { ...good, d: 1000001 },
    ])
      expect(() =>
        validateShipVisualLayers([
          { ...layer, facet: facet as ShipVisualLayer["facet"] },
        ]),
      ).toThrow(/facet/);
    for (const extra of [
      { role: "floor" },
      { role: "doorframe" },
      { role: "service" },
      { role: "void" },
      { surfaceRole: "floor" },
      { slot: "glass" },
      { slot: "emit_a" },
      { slot: "emit_b" },
    ])
      expect(() =>
        validateShipVisualLayers([
          { ...layer, ...extra, facet: good } as ShipVisualLayer,
        ]),
      ).toThrow(/facet/);
  });
});

describe("finite private original-source Crest projection", () => {
  const certificate = SHIP_VISUAL_CANOPY_SOURCE_R026;
  const candidate = {
    schema: SHIP_VISUAL_SCHEMA,
    revision: "r002",
    status: "proposal",
    frame: SHIP_VISUAL_FRAME,
    lattice: 16,
    compilerSha256: "a".repeat(64),
    profilesSha256: "b".repeat(64),
    slots: SHIP_KIT_SLOTS,
    prefabs: { [certificate.prefab]: certificate.prefabSha256 },
    assets: Object.entries(certificate.originalAssets)
      .filter(([id]) => id !== "canopy.nav.deck")
      .map(([id, sha256]) => ({
        kind: "kit",
        id,
        sha256,
        url: `/assets/ship-kit/r002/${id}.glb`,
        bytes: 1,
        frame: "interior",
        bounds: [0, 0, 0, 1, 1, 1],
      })),
    decorativeEnvelope: { outward: 0.1875, upward: 0.1875, inward: 0 },
    canopySourceR026: { ...certificate, sourceSha256: "c".repeat(64) },
  };
  it("keeps ordinary decoration limits while binding source membership and retained glass", () => {
    expect(readShipVisualManifest(candidate).canopySourceR026?.addedCells).toBe(
      83056,
    );
    for (const patch of [
      { revision: "r001" },
      { prefabs: { [certificate.prefab]: "d".repeat(64) } },
      { assets: candidate.assets.slice(1) },
      {
        assets: candidate.assets.map((a, i) =>
          i ? a : { ...a, sha256: "d".repeat(64) },
        ),
      },
    ])
      expect(() => readShipVisualManifest({ ...candidate, ...patch })).toThrow(
        "original canopy",
      );
    for (const patch of [
      { sourceSha256: "" },
      { kind: "general" },
      { tableSha256: "d".repeat(64) },
      { generatorSha256: "d".repeat(64) },
      { opticalGuardSha256: "d".repeat(64) },
      { sourceMemberCells: 83697 },
      { addedCells: 83098 },
      { omittedInwardEmptyCells: 0 },
      { wholeCellBounds: [318, -18, 0, 410, 178, 43] },
      { placements: certificate.placements.slice(1) },
      { navCompanions: [] },
      {
        originalAssets: {
          ...certificate.originalAssets,
          "canopy.nav.deck": "d".repeat(64),
        },
      },
    ])
      expect(() =>
        readShipVisualManifest({
          ...candidate,
          canopySourceR026: { ...candidate.canopySourceR026, ...patch },
        }),
      ).toThrow("original canopy");
    for (const decorativeEnvelope of [
      { outward: 1.625, upward: 0.1875, inward: 0 },
      { outward: 0.1875, upward: 0.375, inward: 0 },
      { outward: 0.1875, upward: 0.1875, inward: 0.0625 },
    ])
      expect(() =>
        readShipVisualManifest({ ...candidate, decorativeEnvelope }),
      ).toThrow("decorative bounds");
  });
});
