import { expect, test } from "vitest";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import {
  compileConstruction,
  constructionHash,
} from "./construction-transactions";
import {
  createTemplateQualificationResolver,
  templateQualificationHash,
  type TemplateCapability,
  type TemplateQualificationManifest,
  type TrustedTemplateQualification,
} from "./template-qualification";

const baseline = compileConstruction(WAYFARER_STARTER.documentJson);
const kinds: TemplateCapability[] = [
  "walking",
  "cargo",
  "seat",
  "pilot",
  "refit",
];
const placements: Record<TemplateCapability, string[]> = {
  walking: ["pilot-r004-airlock-frame-22"],
  cargo: ["room-storage-container-2.15-0.25"],
  seat: ["room-lounge"],
  pilot: ["equipment-control-seat", "equipment-control-console"],
  refit: ["wall--2--3"],
};
/** Synthetic admission certificates test registry mechanics against the actual
 * canonical source. They do not approve future art, collision or gameplay stats.
 */
function admitted(
  snapshot = baseline,
  suffix = "old",
): TrustedTemplateQualification {
  const manifest: TemplateQualificationManifest = {
    schema: "sidereal.template-qualification.v1",
    sourceSha256: snapshot.sha256,
    capabilities: Object.fromEntries(
      kinds.map((kind) => [
        kind,
        {
          sourceSha256: snapshot.sha256,
          definitionId: "test-only-" + kind + "-" + suffix,
          definitionSha256: constructionHash(
            "test-definition-" + kind + "-" + suffix,
          ),
          geometrySha256: constructionHash(
            "test-geometry-" + kind + "-" + suffix,
          ),
          sourceDeckId: WAYFARER_STARTER.sourceDeckId,
          sourceObjectIds: placements[kind],
        },
      ]),
    ),
  };
  return {
    canonical: snapshot.canonical,
    manifest,
    qualificationSha256: templateQualificationHash(manifest),
  };
}
function future() {
  const document = JSON.parse(baseline.canonical);
  document.layout.name = "TEST ONLY second admitted revision";
  return compileConstruction(JSON.stringify(document));
}

test("adding an explicitly admitted future source preserves every old362f capability", () => {
  const old = admitted(),
    nextSnapshot = future(),
    next = admitted(nextSnapshot, "future");
  const resolver = createTemplateQualificationResolver([old, next]);
  expect(resolver.admittedSourceSha256s).toEqual(
    [baseline.sha256, nextSnapshot.sha256].sort(),
  );
  for (const [snapshot, record] of [
    [baseline, old],
    [nextSnapshot, next],
  ] as const) {
    expect(resolver.resolveSource(snapshot).sourceSha256).toBe(snapshot.sha256);
    for (const kind of kinds)
      expect(
        resolver.resolveBinding(
          snapshot.sha256,
          kind,
          record.manifest.capabilities[kind]!,
        ),
      ).toEqual(record.manifest.capabilities[kind]);
  }
  expect(baseline.sha256).toBe(WAYFARER_STARTER.sha256);
});

test("unknown drafts, copied source hashes and cross-revision capability pins are rejected", () => {
  const old = admitted(),
    nextSnapshot = future(),
    next = admitted(nextSnapshot, "future");
  const one = createTemplateQualificationResolver([old]);
  expect(() => one.resolveSource(nextSnapshot)).toThrow("unregistered source");
  expect(() =>
    one.resolveSource({ ...nextSnapshot, sha256: baseline.sha256 }),
  ).toThrow("document differs");
  const two = createTemplateQualificationResolver([old, next]);
  for (const kind of kinds) {
    expect(() =>
      two.resolveBinding(
        nextSnapshot.sha256,
        kind,
        old.manifest.capabilities[kind]!,
      ),
    ).toThrow("pins differ");
    expect(() =>
      two.resolveBinding(baseline.sha256, kind, {
        ...old.manifest.capabilities[kind]!,
        geometrySha256: "f".repeat(64),
      }),
    ).toThrow("pins differ");
  }
});

test("admission requires the separately pinned certificate and genuine source object/deck IDs", () => {
  const old = admitted();
  expect(() =>
    createTemplateQualificationResolver([
      { ...old, qualificationSha256: "f".repeat(64) },
    ]),
  ).toThrow("hash mismatch");
  expect(() => createTemplateQualificationResolver([old, old])).toThrow(
    "duplicate source",
  );
  const bad = admitted();
  bad.manifest.capabilities.cargo!.sourceDeckId = "unknown-deck";
  bad.qualificationSha256 = templateQualificationHash(bad.manifest);
  expect(() => createTemplateQualificationResolver([bad])).toThrow(
    "invalid capability",
  );
  const badObject = admitted();
  badObject.manifest.capabilities.seat!.sourceObjectIds = ["missing-seat"];
  badObject.qualificationSha256 = templateQualificationHash(badObject.manifest);
  expect(() => createTemplateQualificationResolver([badObject])).toThrow(
    "invalid capability",
  );
  const crossed = admitted(future(), "future");
  crossed.manifest.capabilities.walking!.sourceSha256 = baseline.sha256;
  crossed.qualificationSha256 = templateQualificationHash(crossed.manifest);
  expect(() => createTemplateQualificationResolver([crossed])).toThrow(
    "invalid capability",
  );
});

test("caller mutation cannot revise admitted bindings and missing capability never inherits old qualification", () => {
  const old = admitted(),
    snapshot = future(),
    next = admitted(snapshot, "future");
  delete next.manifest.capabilities.cargo;
  next.qualificationSha256 = templateQualificationHash(next.manifest);
  const resolver = createTemplateQualificationResolver([old, next]);
  const original = structuredClone(old.manifest.capabilities.walking!);
  old.manifest.capabilities.walking!.definitionId =
    "changed-after-construction";
  expect(resolver.resolveBinding(baseline.sha256, "walking", original)).toEqual(
    original,
  );
  expect(() =>
    resolver.resolveBinding(
      snapshot.sha256,
      "cargo",
      admitted().manifest.capabilities.cargo!,
    ),
  ).toThrow("not qualified");
  expect(
    Object.isFrozen(
      resolver.resolveSource(baseline).capabilities.walking!.sourceObjectIds,
    ),
  ).toBe(true);
});

test("two admitted sources never imply a refit; only the exact directed edge is accepted", () => {
  const old = admitted(),
    snapshot = future(),
    next = admitted(snapshot, "future");
  const certificate = constructionHash(
    "test-only explicit old-to-future migration qualification",
  );
  expect(() =>
    createTemplateQualificationResolver([old, next]).resolveRefit(
      baseline,
      snapshot,
      certificate,
    ),
  ).toThrow("transition not qualified");
  const resolver = createTemplateQualificationResolver(
    [old, next],
    [
      {
        fromSha256: baseline.sha256,
        toSha256: snapshot.sha256,
        fromQualificationSha256: old.qualificationSha256,
        toQualificationSha256: next.qualificationSha256,
        qualificationSha256: certificate,
      },
    ],
  );
  expect(resolver.resolveRefit(baseline, snapshot, certificate).toSha256).toBe(
    snapshot.sha256,
  );
  expect(() => resolver.resolveRefit(snapshot, baseline, certificate)).toThrow(
    "transition not qualified",
  );
  expect(() =>
    resolver.resolveRefit(baseline, snapshot, "f".repeat(64)),
  ).toThrow("transition not qualified");
  expect(() =>
    createTemplateQualificationResolver(
      [old, next],
      [
        {
          fromSha256: baseline.sha256,
          toSha256: snapshot.sha256,
          fromQualificationSha256: old.qualificationSha256,
          toQualificationSha256: "f".repeat(64),
          qualificationSha256: certificate,
        },
      ],
    ),
  ).toThrow("invalid explicit refit edge");
});
