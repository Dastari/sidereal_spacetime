import { expect, it } from "vitest";
import { emptyLayout } from "@sidereal/content/ship-layout";
import { DEFAULT_VIEW, readCheckpoint, push, undo } from "./state";
import {
  DEFAULT_STRUCTURAL_TOOLS,
  readStructuralTools,
  structuralTools,
} from "./structural-tools";

it("keeps old recovery documents byte-equivalent and adds tool preferences without changing layout intent", () => {
  const document = emptyLayout("draft", "deck");
  const old = {
    schema: "sidereal.layout-recovery.v1",
    sequence: 1,
    writer: "editor",
    history: { past: [], present: document, future: [] },
    view: { ...DEFAULT_VIEW, deckId: "deck" },
  };
  const loaded = readCheckpoint(JSON.stringify(old));
  expect(loaded).toEqual(old);
  expect(structuralTools(loaded.view.structuralTools)).toEqual(
    DEFAULT_STRUCTURAL_TOOLS,
  );
  const tools = readStructuralTools({
    ...DEFAULT_STRUCTURAL_TOOLS,
    doorWidth: 64,
    wallFace: "right",
    wallFinish: "steel",
  });
  const changed = {
    ...loaded,
    view: { ...loaded.view, structuralTools: tools },
    history: push(loaded.history, { ...document, name: "Renamed" }),
  };
  const refreshed = readCheckpoint(JSON.stringify(changed));
  expect(refreshed.view.structuralTools).toEqual(tools);
  expect(undo(refreshed.history).present).toEqual(document);
});
it("rejects malformed saved tool values before replacing the existing draft", () => {
  for (const patch of [
    { doorWidth: NaN },
    { doorWidth: 0 },
    { doorWidth: 32.5 },
    { doorWidth: 300 },
    { doorKind: "teleport" },
    { wallFace: "unknown" },
    { wallFinish: "" },
  ])
    expect(() =>
      readStructuralTools({ ...DEFAULT_STRUCTURAL_TOOLS, ...patch }),
    ).toThrow("Unsupported structural");
  const tools = structuralTools();
  tools.doorWidth = 64;
  expect(DEFAULT_STRUCTURAL_TOOLS.doorWidth).toBe(40);
});
it("defaults the new exterior layer on for old checkpoints while rejecting malformed saved flags", () => {
  const document = emptyLayout("draft", "deck"),
    view = structuredClone(DEFAULT_VIEW);
  delete view.layers.exteriorHull;
  const checkpoint = {
    schema: "sidereal.layout-recovery.v1",
    sequence: 1,
    writer: "editor",
    history: { past: [], present: document, future: [] },
    view,
  };
  expect(
    readCheckpoint(JSON.stringify(checkpoint)).view.layers.exteriorHull,
  ).toBe(true);
  expect(() =>
    readCheckpoint(
      JSON.stringify({
        ...checkpoint,
        view: { ...view, layers: { ...view.layers, exteriorHull: "hidden" } },
      }),
    ),
  ).toThrow("Unsupported saved camera/layers");
});
