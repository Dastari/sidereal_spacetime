import { afterEach, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { CREW_ARMOR_SLOTS } from "@sidereal/content/crew-armor";
import { crewWardrobeItem } from "@sidereal/content/crew-wardrobe";
import { currentOperatorEnsemblePlan } from "../packages/render/src/crew/operator-ensemble";
import { HEAD_ART_CANDIDATE } from "../packages/render/src/crew/head-art-revision";
import { verifyCrewSource } from "../packages/render/src/crew/crew-asset-cache";
import {
  diagnosticOperatorAppearance,
  diagnosticOperatorPlan,
  validateDiagnosticHeadSources,
} from "./prefab-render-harness/operator-plan";

afterEach(() => vi.unstubAllGlobals());
const manifestBytes = () =>
  readFileSync("assets/runtime/crew/heads/refinement-r005/manifest.json");
test.each(["marine", "security"] as const)(
  "complete %s diagnostic includes all seven requested armor slots and a real underlayer",
  (tier) => {
    const appearance = diagnosticOperatorAppearance("female", tier, false);
    for (const slot of CREW_ARMOR_SLOTS)
      expect(appearance.equippedComponents?.[slot]).toBe(`${tier}-${slot}`);
    const uniform = crewWardrobeItem(appearance.equippedComponents!.uniform!);
    expect(uniform?.slot).toBe("uniform");
    expect(uniform?.suit).toBeDefined();
    const plan = currentOperatorEnsemblePlan(
      { appearance, heldItem: "pistol" },
      "diagnostic",
      "request",
    );
    expect(
      plan.outfitSources.armor(
        tier === "marine" ? "armor.legs.heavy" : "armor.legs.standard",
        "female",
      ),
    ).toBeDefined();
  },
);
test("partial comparison explicitly preserves missing legs and uniform", () => {
  const appearance = diagnosticOperatorAppearance("female", "marine", true);
  expect(appearance.equippedComponents?.legs).toBeUndefined();
  expect(appearance.equippedComponents?.uniform).toBeUndefined();
});
test("legacy diagnostic makes no candidate fetch and production selection stays legacy", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const result = await diagnosticOperatorPlan(
    diagnosticOperatorAppearance("male", "marine", false),
    "pistol",
    "legacy",
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(result.manifest).toBeUndefined();
  expect(result.plan.appearance.headArtRevision).toBe("legacy");
});
test("explicit exact candidate replaces only manifest-declared head resources", async () => {
  const fetch = vi.fn(async () => new Response(manifestBytes()));
  vi.stubGlobal("fetch", fetch);
  const { plan, manifest } = await diagnosticOperatorPlan(
    diagnosticOperatorAppearance("female", "marine", false),
    "pistol",
    HEAD_ART_CANDIDATE,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(plan.appearance.headArtRevision).toBe(HEAD_ART_CANDIDATE);
  expect(plan.outfitSources.head.get("heads")!.url).toContain("/heads/v1/");
  const descriptor = plan.outfitSources.head.get("helmets")!;
  expect(descriptor.url).toContain("/heads/refinement-r005/");
  expect(descriptor.sha256).toBe(manifest!.files.helmets.sha256);
  const source = await verifyCrewSource(
    readFileSync("assets/runtime/crew/heads/refinement-r005/helmets.glb"),
    descriptor,
  );
  validateDiagnosticHeadSources(
    {
      outfitSources: {
        head: new Map([["helmets", source]]),
        headAtlases: new Map(),
        armor: () => undefined,
      },
    },
    manifest,
  );
});
test("bad candidate manifest and unknown selectors never fall back or silently select legacy", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}")),
  );
  const appearance = diagnosticOperatorAppearance("female", "marine", false);
  await expect(
    diagnosticOperatorPlan(appearance, null, HEAD_ART_CANDIDATE),
  ).rejects.toThrow("manifest mismatch");
  await expect(
    diagnosticOperatorPlan(appearance, null, "unregistered-heads"),
  ).rejects.toThrow("Unknown isolated head selection");
});
