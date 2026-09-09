import { expect, test } from "vitest";
import {
  emptyLayout,
  stampTile,
  type LayoutDocument,
} from "@sidereal/content/ship-layout";
import {
  buildLayoutPressure,
  describePressureLayout,
  type PressureGeometryProof,
  type PressureLayoutContracts,
  type PressureLayoutGeometry,
  type PressureApertureLink,
} from "./construction-pressure-layout";
import {
  remapCompartmentGas,
  stepCompartmentGas,
} from "./construction-topology";
const options = { floorTopUnitsByDeck: { deck: 6 } };
function layout(columns = 2, rows = 1) {
  const d = emptyLayout("layout", "deck");
  for (let x = 0; x < columns; x++)
    for (let y = 0; y < rows; y++)
      d.tiles.push(
        stampTile(`tile-${x}-${y}`, "deck", "rectangle", [x * 64, y * 64]),
      );
  return d;
}
function proof(g: PressureLayoutGeometry): PressureGeometryProof {
  return {
    id: "trusted-proof",
    geometryFingerprint: g.geometryFingerprint,
    sourceDefinitionId: "test-validated-native",
    sourceRevision: "test-r1",
    sourceSha256: "a".repeat(64),
    validated: true,
  };
}
function contracts(g: PressureLayoutGeometry): PressureLayoutContracts {
  const p = proof(g);
  return {
    freeVolumes: g.cells.map((c) => ({
      cellId: c.id,
      freeVolumeM3: c.nominalPrismVolumeM3 - 0.1,
      excludedSolidVolumeM3: 0.1,
      displacementAccounting: "validated-native-solid-exclusion",
      proof: p,
    })),
    surfaces: g.surfaces
      .filter((s) => s.kind !== "continuous" && s.kind !== "opening")
      .map((s) => ({
        surfaceId: s.id,
        kind: "sealed",
        coverageProof: p,
        seal: { interfaceId: "verified-test-seal", airtight: true, proof: p },
      })),
    openings: [
      ...new Set(
        g.surfaces.filter((s) => s.openingId).map((s) => s.openingId!),
      ),
    ].map((openingId) => ({
      openingId,
      coverageProof: p,
      flowProof: p,
      open: false,
      openConductance: 0.002,
      closedConductance: 0.00001,
      closure: "ungasketed",
    })),
  };
}
function build(d = layout(), instance = "instance-a", o = options) {
  const g = describePressureLayout(d, instance, o);
  return buildLayoutPressure(d, instance, o, contracts(g));
}
function door(rows = 1): LayoutDocument {
  const d = layout(2, rows);
  d.partitions.push({
    id: "wall",
    deckId: "deck",
    a: [64, 0],
    b: [64, 64 * rows],
    seal: "design-sealed",
  });
  d.openings.push({
    id: "door",
    deckId: "deck",
    partitionId: "wall",
    a: [64, 12],
    b: [64, 52],
    kind: "door",
    clearance: 16,
    sill: 0,
  });
  return d;
}
function decks() {
  const d = layout(1);
  d.decks.push({
    ...d.decks[0],
    id: "upper",
    name: "Upper",
    order: 1,
    elevation: 106,
  });
  d.tiles.push(stampTile("upper-tile", "upper", "rectangle", [0, 0]));
  return d;
}
const twoOptions = { floorTopUnitsByDeck: { deck: 6, upper: 6 } };
function link(g: PressureLayoutGeometry): PressureApertureLink {
  const lower = g.cells.find((c) => c.deckId === "deck")!,
    upper = g.cells.find((c) => c.deckId === "upper")!,
    p = proof(g);
  const seal = {
    proof: p,
    interfaceId: "test-aperture-edge-seal",
    airtight: true as const,
  };
  return {
    id: "riser",
    kind: "traversal",
    enclosureProof: p,
    flowProof: p,
    conductanceMolesPerSecondPa: 0.001,
    a: {
      id: "lower-aperture",
      surfaceId: g.surfaces.find((s) => s.a === lower.id && s.kind === "roof")!
        .id,
      aperturePolygonUnits: [
        [8, 8],
        [24, 8],
        [24, 24],
        [8, 24],
      ],
      aperturePlaneUnits: lower.topUnits,
      remainingSurfaceSeal: seal,
      coverageProof: p,
    },
    b: {
      id: "upper-aperture",
      surfaceId: g.surfaces.find((s) => s.a === upper.id && s.kind === "floor")!
        .id,
      aperturePolygonUnits: [
        [8, 8],
        [24, 8],
        [24, 24],
        [8, 24],
      ],
      aperturePlaneUnits: upper.bottomUnits,
      remainingSurfaceSeal: seal,
      coverageProof: p,
    },
  };
}
function linkedContracts(g: PressureLayoutGeometry) {
  const c = contracts(g),
    l = link(g);
  return {
    ...c,
    surfaces: c.surfaces.filter(
      (s) => s.surfaceId !== l.a.surfaceId && s.surfaceId !== l.b.surfaceId,
    ),
    apertureLinks: [l],
  };
}

test("room labels and visual names do not define pressure geometry or compartments", () => {
  const d = layout(),
    a = build(d);
  d.name = "Renamed";
  d.rooms.push({
    id: "label",
    deckId: "deck",
    name: "Medbay",
    type: "medbay",
    seed: [32, 32],
    boundaryIds: [],
    access: "crew",
    floorTheme: "different",
    wallTheme: "different",
  });
  d.tiles.reverse();
  const b = build(d);
  expect(a.geometry).toEqual(b.geometry);
  expect(a.topology.compartments).toHaveLength(1);
  expect(b.topology.compartments).toEqual(a.topology.compartments);
});
test("tile gas IDs persist for same geometry and are disjoint across instances", () => {
  const a = build(),
    b = build(layout(), "instance-b");
  expect(a.geometry.cells.map((c) => c.id)).toEqual(
    build().geometry.cells.map((c) => c.id),
  );
  expect(
    a.geometry.cells.some((c) => b.geometry.cells.some((x) => x.id === c.id)),
  ).toBe(false);
});
test("partition shared edge splits into jambs and finite door portal", () => {
  const p = build(door());
  const shared = p.geometry.surfaces.filter((s) => s.b);
  expect(shared.map((s) => s.kind).sort()).toEqual([
    "opening",
    "partition",
    "partition",
  ]);
  expect(p.topology.compartments).toHaveLength(2);
  expect(p.topology.flows).toHaveLength(1);
  expect(p.topology.flows[0].conductanceMolesPerSecondPa).toBe(0.00001);
});
test("door crossing a floor seam distributes its total conductance only once", () => {
  const d = door(2);
  d.openings[0].a = [64, 44];
  d.openings[0].b = [64, 84];
  const p = build(d);
  expect(p.geometry.surfaces.filter((s) => s.kind === "opening")).toHaveLength(
    2,
  );
  expect(
    p.topology.flows.reduce((s, f) => s + f.conductanceMolesPerSecondPa, 0),
  ).toBeCloseTo(0.00001);
  expect(p.topology.compartments).toHaveLength(2);
});
test("closed ungasketed door leaks and open door remains finite, never a merged volume", () => {
  const d = door(),
    g = describePressureLayout(d, "instance", options),
    c = contracts(g);
  let p = buildLayoutPressure(d, "instance", options, c);
  const gas = p.topology.compartments.map((x, i) => ({
    compartmentId: x.id,
    moles: i ? 0 : 100,
  }));
  const step = stepCompartmentGas(p.topology, gas, 1);
  expect(step.gas.every((x) => x.moles > 0)).toBe(true);
  expect(step.gas.reduce((s, x) => s + x.moles, 0)).toBeCloseTo(100);
  c.openings[0].open = true;
  p = buildLayoutPressure(d, "instance", options, c);
  expect(p.topology.compartments).toHaveLength(2);
  expect(p.topology.flows[0].conductanceMolesPerSecondPa).toBe(0.002);
});
test("explicit exterior leak loses only its accounted vented gas", () => {
  const d = layout(),
    g = describePressureLayout(d, "instance", options),
    c = contracts(g);
  const id = g.surfaces.find((s) => s.kind === "perimeter")!.id;
  c.surfaces = c.surfaces.map((s) =>
    s.surfaceId === id
      ? {
          surfaceId: id,
          coverageProof: proof(g),
          kind: "vacuum",
          flowProof: proof(g),
          conductanceMolesPerSecondPa: 0.002,
        }
      : s,
  );
  const p = buildLayoutPressure(d, "instance", options, c),
    out = stepCompartmentGas(
      p.topology,
      [{ compartmentId: p.topology.compartments[0].id, moles: 100 }],
      1,
    );
  expect(out.ventedMoles).toBeGreaterThan(0);
  expect(out.gas[0].moles + out.ventedMoles).toBeCloseTo(100);
});
test("matching XY on separate decks remains independent without an explicit link", () => {
  const p = build(decks(), "instance", twoOptions);
  expect(p.topology.compartments).toHaveLength(2);
  expect(p.topology.flows).toHaveLength(0);
});
test("explicit paired roof/floor aperture adds finite conserved cross-deck flow", () => {
  const d = decks(),
    g = describePressureLayout(d, "instance", twoOptions),
    p = buildLayoutPressure(d, "instance", twoOptions, linkedContracts(g));
  expect(p.topology.compartments).toHaveLength(2);
  expect(p.topology.flows).toHaveLength(1);
  const out = stepCompartmentGas(
    p.topology,
    p.topology.compartments.map((x, i) => ({
      compartmentId: x.id,
      moles: i ? 100 : 0,
    })),
    1,
  );
  expect(out.gas.every((x) => x.moles > 0)).toBe(true);
  expect(out.gas.reduce((s, x) => s + x.moles, 0)).toBeCloseTo(100);
});
test("aperture requires matched footprints, surface plane, enclosure and remaining seals", () => {
  const d = decks(),
    g = describePressureLayout(d, "instance", twoOptions);
  for (const change of [
    (l: PressureApertureLink) => {
      l.b.aperturePolygonUnits = [
        [9, 8],
        [25, 8],
        [25, 24],
        [9, 24],
      ];
    },
    (l: PressureApertureLink) => {
      l.b.aperturePlaneUnits = 0;
    },
    (l: PressureApertureLink) => {
      l.enclosureProof.validated = false as true;
    },
    (l: PressureApertureLink) => {
      l.a.remainingSurfaceSeal.airtight = false as true;
    },
  ]) {
    const c = linkedContracts(g);
    change(c.apertureLinks[0]);
    expect(() => buildLayoutPressure(d, "instance", twoOptions, c)).toThrow();
  }
});
test("missing/unvalidated coverage fails instead of sealing from roof visibility or art", () => {
  const d = layout(),
    g = describePressureLayout(d, "instance", options);
  let c = contracts(g);
  c.surfaces = c.surfaces.slice(1);
  expect(() => buildLayoutPressure(d, "instance", options, c)).toThrow(
    "missing explicit",
  );
  c = contracts(g);
  c.surfaces[0].coverageProof.validated = false as true;
  expect(() => buildLayoutPressure(d, "instance", options, c)).toThrow(
    "unvalidated",
  );
});
test("free volume requires current geometry provenance and explicit displacement accounting", () => {
  const d = layout(),
    g = describePressureLayout(d, "instance", options);
  let c = contracts(g);
  c.freeVolumes[0].proof.geometryFingerprint = "0".repeat(64);
  expect(() => buildLayoutPressure(d, "instance", options, c)).toThrow("stale");
  c = contracts(g);
  c.freeVolumes[0].excludedSolidVolumeM3 = 0;
  expect(() => buildLayoutPressure(d, "instance", options, c)).toThrow(
    "free volume",
  );
});
test("zero closed door flow requires independent verified seal, r001 itself cannot certify it", () => {
  const d = door(),
    g = describePressureLayout(d, "instance", options),
    c = contracts(g);
  c.openings[0].closedConductance = 0;
  expect(() => buildLayoutPressure(d, "instance", options, c)).toThrow(
    "ungasketed",
  );
  c.openings[0].closure = "verified-seal";
  expect(() => buildLayoutPressure(d, "instance", options, c)).toThrow(
    "airtight",
  );
  c.openings[0].seal = {
    interfaceId: "new-gasket-interface",
    airtight: true,
    proof: {
      ...proof(g),
      sourceSha256:
        "4c631ad5517bf6d6cc88af29aba4a6890808c33effeed4205acb26a022758426",
    },
  };
  expect(() => buildLayoutPressure(d, "instance", options, c)).toThrow("r001");
  c.openings[0].seal.proof.sourceSha256 = "b".repeat(64);
  expect(
    buildLayoutPressure(d, "instance", options, c).topology.flows,
  ).toHaveLength(0);
});
test("partition split/merge remaps gas by persistent tile IDs without creating gas", () => {
  const open = build(layout(), "instance"),
    closed = build(door(), "instance");
  const a = remapCompartmentGas(open.topology, closed.topology, [
    { compartmentId: open.topology.compartments[0].id, moles: 100 },
  ]);
  expect(a.removedMoles).toBe(0);
  expect(a.gas.map((x) => x.moles)).toEqual([50, 50]);
  const b = remapCompartmentGas(closed.topology, open.topology, a.gas);
  expect(b.gas[0].moles).toBe(100);
});
test("budgets reject before compiler work, tile-interior partitions remain unsupported", () => {
  const d = layout();
  d.tiles = Array.from({ length: 257 }, (_, i) =>
    stampTile("x" + i, "deck", "rectangle", [i * 64, 0]),
  );
  expect(() => describePressureLayout(d, "instance", options)).toThrow(
    "tile budget",
  );
  const cut = layout(1);
  cut.partitions.push({
    id: "cut",
    deckId: "deck",
    a: [32, 0],
    b: [32, 64],
    seal: "design-sealed",
  });
  expect(() => describePressureLayout(cut, "instance", options)).toThrow(
    "shared tile edges",
  );
});

test("open divider preserves continuous volume, without accepting a solid seal contract", () => {
  const d = layout();
  d.partitions.push({
    id: "divider",
    deckId: "deck",
    a: [64, 0],
    b: [64, 64],
    seal: "open-divider",
  });
  const p = build(d);
  expect(p.topology.compartments).toHaveLength(1);
  expect(p.geometry.surfaces.filter((s) => s.b).map((s) => s.kind)).toEqual([
    "continuous",
  ]);
});
test("changed roof coverage request invalidates old geometry proof, no automatic gas fill", () => {
  const d = layout(),
    g = describePressureLayout(d, "instance", options),
    c = contracts(g);
  d.decks[0].roof = !d.decks[0].roof;
  expect(() => buildLayoutPressure(d, "instance", options, c)).toThrow("stale");
  const result = build(d);
  expect("gas" in result).toBe(false);
});
test("unknown/duplicate coverage and double-consuming an aperture surface are rejected", () => {
  const d = layout(),
    g = describePressureLayout(d, "instance", options),
    c = contracts(g);
  c.surfaces = [...c.surfaces, c.surfaces[0]];
  expect(() => buildLayoutPressure(d, "instance", options, c)).toThrow(
    "duplicate",
  );
  const multi = decks(),
    mg = describePressureLayout(multi, "instance", twoOptions),
    mc = linkedContracts(mg);
  mc.apertureLinks.push({ ...mc.apertureLinks[0], id: "duplicate-link" });
  expect(() => buildLayoutPressure(multi, "instance", twoOptions, mc)).toThrow(
    "duplicate",
  );
});
test("deleted floor gas is accounted explicitly, not silently destroyed", () => {
  const a = build(layout(), "instance"),
    b = build(layout(1), "instance");
  const result = remapCompartmentGas(a.topology, b.topology, [
    { compartmentId: a.topology.compartments[0].id, moles: 100 },
  ]);
  expect(result.removedMoles).toBe(50);
  expect(result.gas[0].moles).toBe(50);
});
