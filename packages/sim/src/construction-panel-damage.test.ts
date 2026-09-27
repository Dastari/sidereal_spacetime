import { expect, test } from "vitest";
import {
  analyzePanelDamage,
  damagedPanelBoundary,
  removePanelCells,
  type PanelCell,
  type PanelDamageProxy,
} from "./construction-panel-damage";
import {
  panelDamageStudyTraces,
  studyDamageStages,
  studyPanelProxy,
  STUDY_FLOW_POLICY,
} from "./construction-panel-damage-study";

test("layered hull crater and opened armor preserve pressure until offset inner skin perforates", () => {
  const stages = studyDamageStages("hull");
  expect(stages.map((s) => s.analysis.state)).toEqual([
    "intact",
    "cratered",
    "cratered",
    "breached",
  ]);
  expect(stages[3].analysis.connectedNegativeFaces).toBe(1);
  expect(stages[3].analysis.connectedPositiveFaces).toBe(1);
  expect(stages[3].analysis.removedCells).toBe(5);
  expect(stages[3].analysis.removedVolumeM3).toBe(5 * 0.03125 ** 3);
});
test("interior wall needs connected openings in both skins; cosmetic surface loss is not vacuum", () => {
  expect(studyDamageStages("interior").map((s) => s.analysis.state)).toEqual([
    "intact",
    "cratered",
    "cratered",
    "breached",
  ]);
});
test("cumulative repeated edits are immutable and conserve material", () => {
  const proxy = studyPanelProxy("hull"),
    state = { removed: [] },
    request: PanelCell[] = [
      [7, 6, 10],
      [7, 6, 10],
      [2, 6, 10],
    ];
  const first = removePanelCells(proxy, state, request);
  expect(first.newlyRemoved).toBe(1);
  expect(state.removed).toEqual([]);
  expect(proxy.occupied).toContainEqual([7, 6, 10]);
  const replay = removePanelCells(proxy, first.state, request);
  expect(replay.newlyRemoved).toBe(0);
  expect(replay.state).toEqual(first.state);
  const report = analyzePanelDamage(proxy, first.state);
  expect(report.remainingCells + report.removedCells).toBe(
    proxy.occupied.length,
  );
});
test("diagonal-only empty cell contacts do not connect gas", () => {
  const proxy: PanelDamageProxy = {
    id: "solid",
    cellSizeM: 0.03125,
    dimensions: [2, 2, 1],
    occupied: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 0, 0],
      [1, 1, 0],
    ],
  };
  expect(
    analyzePanelDamage(proxy, {
      removed: [
        [0, 0, 0],
        [1, 1, 0],
      ],
    }).state,
  ).toBe("cratered");
  expect(
    analyzePanelDamage(proxy, {
      removed: [
        [0, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ],
    }).state,
  ).toBe("breached");
});
test("all modular widths and standard/custom heights use exact unscaled cells", () => {
  for (const width of [0.5, 1, 2])
    for (const height of [0.75, 1.5, 1.84375, 2.25, 3]) {
      const proxy = studyPanelProxy("interior", width, height);
      expect(proxy.dimensions.map((n) => n * proxy.cellSizeM)).toEqual([
        0.25,
        width,
        height,
      ]);
      expect(analyzePanelDamage(proxy, { removed: [] }).state).toBe("intact");
    }
  expect(() => studyPanelProxy("hull", 1, 1.84)).toThrow("lattice");
});
test("invalid occupancy, edits and unsealed original proxy fail closed", () => {
  const proxy = studyPanelProxy("hull");
  expect(() => removePanelCells(proxy, { removed: [] }, [[8, 0, 0]])).toThrow(
    "outside",
  );
  expect(() =>
    removePanelCells(proxy, { removed: [] }, Array(4097).fill([0, 0, 0])),
  ).toThrow("budget");
  expect(() => analyzePanelDamage(proxy, { removed: [[2, 6, 10]] })).toThrow(
    "no original",
  );
  expect(() =>
    analyzePanelDamage(
      { ...proxy, occupied: [...proxy.occupied, proxy.occupied[0]] },
      { removed: [] },
    ),
  ).toThrow("duplicate");
  expect(() =>
    analyzePanelDamage(
      { ...proxy, dimensions: [1000, 1000, 1000] },
      { removed: [] },
    ),
  ).toThrow("bounded");
  const leaky = {
    ...proxy,
    occupied: proxy.occupied.filter((p) => !(p[1] === 6 && p[2] === 10)),
  };
  const seal = {
    id: "a",
    a: { cellId: "a", faceId: "panel" },
    b: null,
    kind: "sealed" as const,
    pressureDefinitionId: "test",
  };
  expect(() =>
    damagedPanelBoundary(leaky, { removed: [] }, seal, STUDY_FLOW_POLICY),
  ).toThrow("not sealed");
  expect(() =>
    damagedPanelBoundary(proxy, { removed: [] }, seal, {
      ...STUDY_FLOW_POLICY,
      conductanceMolesPerSecondPa: NaN,
    }),
  ).toThrow("flow policy");
});
test("interior breach equalizes finite pressure without venting; hull breach vents with accounting", () => {
  const traces = panelDamageStudyTraces();
  for (const scenario of traces.cases) {
    for (const stage of scenario.stages.slice(0, 3)) {
      expect(stage.samples[10].rooms[0].moles).toBe(100);
      expect(stage.samples[10].ventedMoles).toBe(0);
    }
    const breach = scenario.stages[3].samples;
    expect(breach[1].rooms[0].moles).toBeLessThan(100);
    expect(breach[1].rooms[0].moles).toBeGreaterThan(50);
    if (scenario.kind === "interior") {
      expect(breach[10].rooms[1].moles).toBeGreaterThan(
        breach[1].rooms[1].moles,
      );
      for (const sample of breach) {
        expect(sample.ventedMoles).toBe(0);
        expect(
          sample.rooms.reduce((sum, room) => sum + room.moles, 0),
        ).toBeCloseTo(100, 10);
      }
    } else
      for (const sample of breach)
        expect(sample.rooms[0].moles + sample.ventedMoles).toBeCloseTo(100, 10);
  }
});

test("an interior breach leaks to space only through a separately breached exterior boundary", async () => {
  const { compilePressureTopology, stepCompartmentGas } =
    await import("./construction-topology");
  const { studyPressureModel } =
    await import("./construction-panel-damage-study");
  const internal = studyPressureModel(
    "interior",
    studyDamageStages("interior")[3].state,
  );
  const run = (hullStage: number) => {
    const exterior = studyPressureModel(
      "hull",
      studyDamageStages("hull")[hullStage].state,
    ).boundaries[0];
    const topology = compilePressureTopology({
      cells: internal.cells.map((c) =>
        c.id === "b" ? { ...c, faces: [...c.faces, "outside"] } : c,
      ),
      boundaries: [
        ...internal.boundaries,
        { ...exterior, id: "exterior", a: { cellId: "b", faceId: "outside" } },
      ],
    });
    return stepCompartmentGas(
      topology,
      [
        { compartmentId: "volume:a", moles: 100 },
        { compartmentId: "volume:b", moles: 100 },
      ],
      1,
    );
  };
  expect(run(2).ventedMoles).toBe(0);
  expect(run(2).gas.map((g) => g.moles)).toEqual([100, 100]);
  const open = run(3);
  expect(open.gas.every((g) => g.moles < 100)).toBe(true);
  expect(open.ventedMoles).toBeGreaterThan(0);
  expect(
    open.gas.reduce((n, g) => n + g.moles, 0) + open.ventedMoles,
  ).toBeCloseTo(200, 10);
});
