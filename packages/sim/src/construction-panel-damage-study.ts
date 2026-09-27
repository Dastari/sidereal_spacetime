/** Reproducible synthetic fixtures for the layered-panel study. These are explicit
 * test occupancy proxies, not qualified native assets or registered game content. */
import {
  analyzePanelDamage,
  damagedPanelBoundary,
  removePanelCells,
  type PanelCell,
  type PanelDamageProxy,
  type PanelDamageState,
} from "./construction-panel-damage";
import {
  compilePressureTopology,
  pressurePascals,
  stepCompartmentGas,
  type PressureBoundary,
  type PressureStructure,
} from "./construction-topology";
export const STUDY_FLOW_POLICY = {
  id: "synthetic-study-flow-not-production",
  conductanceMolesPerSecondPa: 0.001,
};
export function studyPanelProxy(
  kind: "hull" | "interior",
  widthM = 0.5,
  heightM = 0.75,
): PanelDamageProxy {
  const cellSizeM = 0.03125,
    width = widthM / cellSizeM,
    height = heightM / cellSizeM;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 4 ||
    height < 4 ||
    8 * width * height > 262144
  )
    throw Error("Study panel dimensions outside lattice budget");
  const occupied: PanelCell[] = [];
  for (let x = 0; x < 8; x++)
    for (let y = 0; y < width; y++)
      for (let z = 0; z < height; z++) {
        if (
          x === 0 ||
          x === 7 ||
          (kind === "hull" && x >= 4) ||
          y === 0 ||
          y === width - 1 ||
          z === 0 ||
          z === height - 1
        )
          occupied.push([x, y, z]);
      }
  return {
    id: `synthetic-${kind}-${widthM}-${heightM}`,
    cellSizeM,
    dimensions: [8, width, height],
    occupied,
  };
}
export function studyDamageStages(kind: "hull" | "interior") {
  const proxy = studyPanelProxy(kind),
    y = 6,
    z = 10;
  const crater: PanelCell[] =
    kind === "hull"
      ? [
          [7, y, z],
          [6, y, z],
        ]
      : [[7, y, z]];
  const outer: PanelCell[] =
    kind === "hull"
      ? [
          [5, y, z],
          [4, y, z],
        ]
      : [];
  // Deliberately offset: the air path turns through the cavity.
  const inner: PanelCell[] = [[0, y + 2, z]];
  let state: PanelDamageState = { removed: [] };
  return [
    { name: "intact", edits: [] },
    { name: "exterior-crater", edits: crater },
    { name: "cavity-exposed-inner-skin-intact", edits: outer },
    { name: "offset-inner-skin-breach", edits: inner },
  ].map(({ name, edits }) => {
    state = removePanelCells(proxy, state, edits).state;
    return { name, state, analysis: analyzePanelDamage(proxy, state) };
  });
}
export function studyPressureModel(
  kind: "hull" | "interior",
  state: PanelDamageState,
  proxy: PanelDamageProxy = studyPanelProxy(kind),
): PressureStructure {
  const seal: Extract<PressureBoundary, { kind: "sealed" }> = {
    id: "test-panel",
    a: { cellId: "a", faceId: "panel" },
    b: kind === "interior" ? { cellId: "b", faceId: "panel" } : null,
    kind: "sealed",
    pressureDefinitionId: "synthetic-test-pressure-binding",
  };
  return {
    cells: [
      { id: "a", deckId: "deck", volumeM3: 10, faces: ["panel"] },
      ...(kind === "interior"
        ? [{ id: "b", deckId: "deck", volumeM3: 10, faces: ["panel"] }]
        : []),
    ],
    boundaries: [damagedPanelBoundary(proxy, state, seal, STUDY_FLOW_POLICY)],
  };
}
/** Run the same illustrative gas solver against an exact supplied native proxy.
 * The caller records its source hash and maps signed local cells to nonnegative
 * coordinates. This does not certify native seals or install gameplay content. */
export function panelPressureStudyTrace(
  proxy: PanelDamageProxy,
  state: PanelDamageState,
  kind: "hull" | "interior",
) {
  const analysis = analyzePanelDamage(proxy, state);
  const structure = studyPressureModel(kind, state, proxy);
  const topology = compilePressureTopology(structure);
  let gas = topology.compartments.map((c) => ({
    compartmentId: c.id,
    moles: c.id === "volume:a" ? 100 : 0,
  }));
  let ventedMoles = 0;
  const samples = [];
  for (let second = 0; second <= 10; second++) {
    samples.push({
      second,
      ventedMoles,
      rooms: gas.map((g) => ({
        ...g,
        pressurePa: pressurePascals(g.moles, 10),
      })),
    });
    if (second < 10) {
      const step = stepCompartmentGas(topology, gas, 1);
      gas = step.gas;
      ventedMoles += step.ventedMoles;
    }
  }
  return {
    proxyId: proxy.id,
    kind,
    analysis,
    structure,
    policy: STUDY_FLOW_POLICY,
    samples,
  };
}
export function panelDamageStudyTraces() {
  return {
    status: "synthetic-proxy-only-not-live-authority",
    cellSizeM: 0.03125,
    policy: STUDY_FLOW_POLICY,
    note: "Equal fixed-temperature rooms; room a starts at 100 moles, b at zero. A supplied illustrative conductance controls time. No weapon or material ratings are implied.",
    cases: (["hull", "interior"] as const).map((kind) => ({
      kind,
      stages: studyDamageStages(kind).map((stage) => ({
        ...stage,
        samples: panelPressureStudyTrace(
          studyPanelProxy(kind),
          stage.state,
          kind,
        ).samples,
      })),
    })),
  };
}
