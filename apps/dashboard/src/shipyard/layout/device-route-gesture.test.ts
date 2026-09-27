import { describe, expect, it } from "vitest";
import {
  emptyLayout,
  type LayoutDocument,
} from "@sidereal/content/ship-layout";
import {
  WAYFARER_REACTOR_ASSET_ID,
  withDefaultDevicePower,
} from "@sidereal/content/device-services";
import { applyLayoutGesture } from "./layout-gestures";
import type { LayoutPanelContext } from "./panel-context";
import { DEFAULT_VIEW } from "./state";

function fixture() {
  const doc = emptyLayout("ship", "deck");
  doc.assembly = {
    schema: "sidereal.layout-assembly.v1",
    source: null,
    revisions: {},
    parts: [
      {
        id: "reactor",
        assetId: WAYFARER_REACTOR_ASSET_ID,
        position: [0, 0, 0],
        rotation: 0,
        flipped: false,
        removedCells: [],
      },
      {
        id: "engine",
        assetId: "part-e8b51ac6443c73becfcb",
        position: [3.5, 0, 0],
        rotation: 0,
        flipped: false,
        removedCells: [],
      },
    ],
  };
  return doc;
}

function gesture(doc: LayoutDocument, backwards = false) {
  let next = doc;
  let error = "";
  const context = {
    doc,
    view: { ...DEFAULT_VIEW, mode: "Systems", deckId: "deck" },
    commit: (change: (doc: LayoutDocument) => LayoutDocument) => {
      next = change(structuredClone(doc));
    },
    editor: {
      setError: (value: string) => {
        error = value;
      },
    },
    channel: "power",
    reuseNodes: true,
  } as unknown as LayoutPanelContext;
  applyLayoutGesture(
    {
      tool: "route",
      start: backwards ? [112, 0] : [0, 0],
      end: backwards ? [0, 0] : [112, 0],
      ids: [],
      copy: false,
    },
    context,
  );
  return { next, error };
}

describe("routing between actual device ports", () => {
  it("connects declared device ports without creating unqualified physical routes", () => {
    const doc = fixture();
    const { next, error } = gesture(doc);
    expect(error).toBe("");
    expect(next.serviceConnections?.[0]).toMatchObject({
      fromDeviceId: "reactor",
      fromPortId: "power-out",
      toDeviceId: "engine",
      toPortId: "power-in",
      channel: "power",
    });
    expect(next.nodes).toEqual([]);
    expect(next.routes).toEqual([]);
    expect(doc.routes).toEqual([]);
  });
  it("preserves declared input/output directions when endpoints are reused and rejects an input-to-output connection", () => {
    const doc = withDefaultDevicePower(fixture());
    const before = structuredClone(doc.nodes);
    expect(gesture(doc).next.nodes).toEqual(before);
    expect(gesture(doc).next.serviceConnections).toEqual(
      doc.serviceConnections,
    );
    const invalid = gesture(doc, true);
    expect(invalid.error).toContain("emits power");
    expect(invalid.next).toBe(doc);
  });
});
