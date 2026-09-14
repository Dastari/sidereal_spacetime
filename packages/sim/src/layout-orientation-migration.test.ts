import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import type { PartCatalog } from "@sidereal/content/assembly";
import {
  importShipAssembly,
  layoutVisualParts,
} from "@sidereal/content/layout-assembly";
import { emptyLayout } from "@sidereal/content/ship-layout";
import { reviewLayoutOrientations } from "./layout-orientation-migration";

const catalog: PartCatalog = {
  schema: "sidereal.part-catalog.v1",
  assets: [
    {
      id: "asset",
      category: "equipment",
      label: "Asymmetric envelope",
      nodes: [],
      bounds: { min: [-0.13, -1, 0], max: [2, 3, 1] },
    },
  ],
};
function source(rotation = 0, x = 0) {
  return importShipAssembly(
    {
      schema: "sidereal.assembly-draft.v1",
      id: "source",
      name: "Legacy",
      parts: [
        {
          id: "placed",
          assetId: "asset",
          position: [x, -2, 0],
          rotation,
          flipped: true,
          removedCells: [],
        },
      ],
    },
    catalog,
    "copy",
    "deck",
  );
}

test("original bytes and source hash survive review, including formatting and unknown schemas", () => {
  const raw = ` \n${JSON.stringify(source(), null, 2)}\n`;
  const before = JSON.stringify(catalog);
  const result = reviewLayoutOrientations(raw, catalog);
  expect(result.sourceRaw).toBe(raw);
  expect(result.entries[0]).toMatchObject({
    status: "exact",
    qualification: "not-evaluated",
    proposal: { yawStep: 0, reflected: true, anchorUnits: [0, -64, 0] },
  });
  expect(result.sourceSha256).not.toBe(
    reviewLayoutOrientations(raw.trim(), catalog).sourceSha256,
  );
  expect(JSON.stringify(catalog)).toBe(before);
  const unsupported = raw.replace(
    "sidereal.layout-draft.v1",
    "sidereal.layout-draft.future",
  );
  expect(reviewLayoutOrientations(unsupported, catalog)).toMatchObject({
    sourceRaw: unsupported,
    status: "unsupported",
    entries: [],
  });
  expect(reviewLayoutOrientations("{", catalog)).toMatchObject({
    sourceRaw: "{",
    status: "unsupported",
  });
  expect(reviewLayoutOrientations(" ".repeat(1048577), catalog).reason).toMatch(
    /budget/,
  );
});

test("fine angles stay exact mathematically without claiming asset qualification", () => {
  for (let yaw = 0; yaw < 72; yaw++) {
    const result = reviewLayoutOrientations(
      JSON.stringify(source((yaw * Math.PI) / 36)),
      catalog,
    );
    expect(result.entries[0]).toMatchObject({
      status: "exact",
      qualification: "not-evaluated",
      proposal: { yawStep: yaw },
    });
    expect(result.entries[0].proposal!.envelopeDisplacementMeters).toBeLessThan(
      1e-12,
    );
  }
});

test("arbitrary legacy angle and off-lattice origin produce explicit displacement, never edited bytes", () => {
  const raw = JSON.stringify(source((7 * Math.PI) / 180, 0.01));
  const result = reviewLayoutOrientations(raw, catalog);
  const proposal = result.entries[0].proposal!;
  expect(result.entries[0].status).toBe("conversion-required");
  expect(result.sourceRaw).toBe(raw);
  expect(JSON.parse(result.sourceRaw).assembly.parts[0].position[0]).toBe(0.01);
  expect(proposal.yawStep).toBe(1);
  expect(proposal.originDeltaMeters).toEqual([-0.01, 0, 0]);
  expect(proposal.angularDeltaRadians).toBeCloseTo((-2 * Math.PI) / 180, 14);
  // Compare against all four asymmetric reflected corners, not a two-corner AABB.
  const distances = [-0.13, 2].flatMap((x) =>
    [-1, 3].map((y) => {
      const a = (7 * Math.PI) / 180,
        b = (5 * Math.PI) / 180;
      return Math.hypot(
        -x * Math.cos(b) -
          y * Math.sin(b) -
          (-x * Math.cos(a) - y * Math.sin(a) + 0.01),
        -x * Math.sin(b) +
          y * Math.cos(b) -
          (-x * Math.sin(a) + y * Math.cos(a)),
      );
    }),
  );
  expect(proposal.envelopeDisplacementMeters).toBeCloseTo(
    Math.max(...distances),
    14,
  );
});

test("semantic fitting anchors retain the existing model origin with non-lattice bounds", () => {
  const doc = emptyLayout("copy", "deck");
  doc.fittings.push({
    id: "fit",
    definitionId: "asset",
    revision: "retained-part-library-v1",
    deckId: "deck",
    position: [-64, 32],
    quarterTurns: 1,
    reflected: true,
    footprint: [32, 32],
    clearance: 0,
    kind: "equipment",
    container: null,
  });
  const raw = JSON.stringify(doc);
  const result = reviewLayoutOrientations(raw, catalog).entries[0];
  expect(result).toMatchObject({
    status: "exact",
    proposal: {
      frame: "legacy-fitting-min-bound",
      anchorUnits: [-64, 32, 0],
      modelOriginMeters: layoutVisualParts(doc, catalog)[0].position,
      originDeltaMeters: [0, 0, 0],
      yawStep: 18,
    },
  });
});

test("missing assets, changed revision pins, malformed envelopes and ambiguous catalogs stay unresolved", () => {
  const doc = source();
  expect(
    reviewLayoutOrientations(JSON.stringify(doc), { ...catalog, assets: [] })
      .entries[0].status,
  ).toBe("unresolved");
  doc.assembly!.revisions.asset = "other-revision";
  expect(
    reviewLayoutOrientations(JSON.stringify(doc), catalog).entries[0].proposal,
  ).toBeNull();
  const badBounds = structuredClone(catalog);
  badBounds.assets[0].bounds.min[0] = NaN;
  expect(
    reviewLayoutOrientations(JSON.stringify(source()), badBounds).entries[0]
      .reason,
  ).toMatch(/envelope/);
  expect(
    reviewLayoutOrientations(JSON.stringify(source()), {
      ...catalog,
      assets: [...catalog.assets, ...catalog.assets],
    }).status,
  ).toBe("unsupported");
  expect(
    reviewLayoutOrientations(JSON.stringify(source(1e12)), catalog).entries[0]
      .proposal,
  ).toBeNull();
});

test("current native Wayfarer review preserves every source placement and installed pin", () => {
  const nativeCatalog = JSON.parse(
    readFileSync("assets/runtime/assembly/catalog.json", "utf8"),
  ) as PartCatalog;
  const assembly = JSON.parse(
    readFileSync("assets/runtime/assembly/wayfarer.json", "utf8"),
  );
  const doc = importShipAssembly(assembly, nativeCatalog, "review", "deck");
  const raw = JSON.stringify(doc);
  const result = reviewLayoutOrientations(raw, nativeCatalog);
  expect(result.status).toBe("reviewable");
  expect(result.entries).toHaveLength(262);
  expect(result.entries.map((e) => e.id)).toEqual(
    assembly.parts.map((p: { id: string }) => p.id),
  );
  expect(JSON.parse(result.sourceRaw).assembly.parts).toEqual(assembly.parts);
  expect(result.entries.every((e) => e.qualification === "not-evaluated")).toBe(
    true,
  );
  expect(doc.assembly!.parts).toEqual(assembly.parts);
});

test("fitting proxy dependencies must retain their own catalog revision", () => {
  const proxyCatalog: PartCatalog = {
    ...catalog,
    assets: [
      ...catalog.assets,
      { ...structuredClone(catalog.assets[0]), id: "proxy" },
    ],
  };
  const doc = source();
  doc.assembly!.parts[0].fittingProxy = { assetId: "proxy", offset: [0, 0, 0] };
  doc.assembly!.revisions.proxy = "retained-part-library-v1";
  expect(
    reviewLayoutOrientations(JSON.stringify(doc), proxyCatalog).entries[0]
      .status,
  ).toBe("exact");
  for (const proxyRevision of ["mismatched", undefined]) {
    if (proxyRevision) doc.assembly!.revisions.proxy = proxyRevision;
    else delete doc.assembly!.revisions.proxy;
    const raw = JSON.stringify(doc);
    const result = reviewLayoutOrientations(raw, proxyCatalog);
    expect(result.sourceRaw).toBe(raw);
    if (!proxyRevision) {
      // Existing v1 admission already rejects absent dependency pins.
      expect(result.status).toBe("unsupported");
      expect(result.entries).toEqual([]);
      continue;
    }
    expect(result.entries[0]).toMatchObject({
      status: "unresolved",
      proposal: null,
    });
    expect(result.entries[0].reason).toMatch(/proxy/);
  }
  doc.assembly!.revisions.proxy = "retained-part-library-v1";
  expect(
    reviewLayoutOrientations(JSON.stringify(doc), catalog).entries[0].reason,
  ).toMatch(/proxy/);
});

test("malformed fitting envelopes remain recoverable before visual origin conversion", () => {
  const doc = emptyLayout("copy", "deck");
  doc.fittings.push({
    id: "fit",
    definitionId: "asset",
    revision: "retained-part-library-v1",
    deckId: "deck",
    position: [0, 0],
    quarterTurns: 0,
    reflected: false,
    footprint: [32, 32],
    clearance: 0,
    kind: "equipment",
    container: null,
  });
  const raw = JSON.stringify(doc);
  for (const bounds of [
    undefined,
    { min: null, max: [1, 1, 1] },
    { min: [], max: [1, 1, 1] },
  ]) {
    const bad = structuredClone(catalog);
    bad.assets[0].bounds = bounds as never;
    const result = reviewLayoutOrientations(raw, bad);
    expect(result.sourceRaw).toBe(raw);
    expect(result.entries[0]).toMatchObject({
      status: "unresolved",
      proposal: null,
    });
    expect(result.entries[0].reason).toMatch(/envelope/);
  }
});
