import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import {
  createNativePressureRoomCompiler,
  acceptNativePressureRoomInstallation,
} from "./construction-native-room";
import { stepCompartmentGas } from "./construction-topology";

const audit = new Uint8Array(
  readFileSync(
    "assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r006/qualification-a007/native-room-validation.json",
  ),
);
const pins = JSON.parse(new TextDecoder().decode(audit)).sourcePins as Record<
  string,
  { path: string }
>;
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const nativeSourcePath = (path: string) =>
  resolve(repositoryRoot, path.replace(/^\/root\/sidereal_spacetime\//, ""));
const sources = Object.fromEntries(
  Object.entries(pins).map(([id, pin]) => [
    id,
    new Uint8Array(readFileSync(nativeSourcePath(pin.path))),
  ]),
);
const compiler = createNativePressureRoomCompiler({ audit, sources });
const policy = {
  id: "test-gameplay-flow",
  openConductance: 0.002,
  closedConductance: 0.00001,
};
const build = (instanceId = "ship-a", apertureFraction = 0) =>
  compiler({
    instanceId,
    apertureFraction,
    sealRetraction: 1,
    flowPolicy: policy,
  });

test("native audit and every visual/proof dependency must match exact bytes", () => {
  const changed = audit.slice();
  changed[changed.length - 2] ^= 1;
  expect(() =>
    createNativePressureRoomCompiler({ audit: changed, sources }),
  ).toThrow("audit");
  for (const name of Object.keys(sources)) {
    const bytes = sources[name].slice();
    bytes[bytes.length - 1] ^= 1;
    expect(() =>
      createNativePressureRoomCompiler({
        audit,
        sources: { ...sources, [name]: bytes },
      }),
    ).toThrow("native source");
  }
});
test("actual native solid volume produces two finite-flow compartments without spawning gas", () => {
  const result = build();
  expect(result.geometry.cells).toHaveLength(8);
  expect(result.topology.compartments).toHaveLength(2);
  expect(
    result.topology.compartments.reduce((sum, c) => sum + c.volumeM3, 0),
  ).toBeCloseTo(20.166636778619175, 6);
  expect(
    result.topology.flows.reduce(
      (sum, f) => sum + f.conductanceMolesPerSecondPa,
      0,
    ),
  ).toBeCloseTo(policy.closedConductance);
  expect("gas" in result).toBe(false);
  expect(result.qualification).toBe("native-static-seal-qualified");
});
test("closed unqualified seal passes gas conservatively; accepted opening increases rate", () => {
  const closed = build(),
    opened = build("ship-a", 1);
  const initial = closed.topology.compartments.map((c, i) => ({
    compartmentId: c.id,
    moles: i ? 0 : 100,
  }));
  const slow = stepCompartmentGas(closed.topology, initial, 0.1);
  const fast = stepCompartmentGas(opened.topology, initial, 0.1);
  expect(slow.gas.every((c) => c.moles > 0)).toBe(true);
  expect(fast.gas[1].moles).toBeGreaterThan(slow.gas[1].moles);
  for (const step of [slow, fast]) {
    expect(step.ventedMoles).toBe(0);
    expect(step.gas.reduce((sum, c) => sum + c.moles, 0)).toBeCloseTo(100);
  }
  expect(
    build("ship-a", 0.5).topology.flows.reduce(
      (sum, f) => sum + f.conductanceMolesPerSecondPa,
      0,
    ),
  ).toBeCloseTo((policy.openConductance + policy.closedConductance) / 2);
});
test("new instances keep disjoint stable native placements and gas cell identities", () => {
  const a = build(),
    b = build("ship-b");
  expect(a.requiredInstallationFingerprint).toBe(
    build().requiredInstallationFingerprint,
  );
  expect(b.requiredInstallationFingerprint).not.toBe(
    a.requiredInstallationFingerprint,
  );
  expect(
    a.installation.some((p) => b.installation.some((q) => q.id === p.id)),
  ).toBe(false);
  expect(
    a.geometry.cells.some((p) => b.geometry.cells.some((q) => q.id === p.id)),
  ).toBe(false);
  a.installation[0].originM[0] = 200;
  expect(build().installation[0].originM[0]).toBe(0);
});
test("zero leakage and invalid or unbounded gameplay policies are rejected", () => {
  for (const closedConductance of [0, -1, NaN, Infinity])
    expect(() =>
      compiler({
        instanceId: "a",
        apertureFraction: 0,
        flowPolicy: { ...policy, closedConductance },
        sealRetraction: 1,
      }),
    ).toThrow("positive");
  for (const apertureFraction of [-0.1, 1.1, NaN, Infinity])
    expect(() => build("a", apertureFraction)).toThrow("aperture");
});

test("authority acceptance checks actual installed identity, definition and placement", () => {
  const compiled = build();
  const accepted = acceptNativePressureRoomInstallation(
    compiled,
    [...compiled.installation].reverse(),
  );
  expect(accepted.structure).toEqual(compiled.structure);
  expect(accepted.proofHash).toMatch(/^[0-9a-f]{64}$/);
  expect(() =>
    acceptNativePressureRoomInstallation(
      compiled,
      compiled.installation.slice(1),
    ),
  ).toThrow("count");
  for (const change of [
    (parts: typeof compiled.installation) => {
      parts[0].sha256 = "0".repeat(64);
    },
    (parts: typeof compiled.installation) => {
      parts[0].originM[0] += 0.001;
    },
    (parts: typeof compiled.installation) => {
      parts[0].quarterTurns = 3;
    },
    (parts: typeof compiled.installation) => {
      parts[0].nodePrefix += "-wrong";
    },
    (parts: typeof compiled.installation) => {
      parts[0].id = parts[1].id;
    },
  ]) {
    const parts = structuredClone(compiled.installation);
    change(parts);
    expect(() =>
      acceptNativePressureRoomInstallation(compiled, parts),
    ).toThrow();
  }
  const open = build("ship-a", 1);
  expect(
    acceptNativePressureRoomInstallation(open, open.installation).proofHash,
  ).not.toBe(accepted.proofHash);
});

test("only the qualified fully deployed seal at the exact closed hinge isolates gas", () => {
  const closed = compiler({
    instanceId: "sealed-room",
    apertureFraction: 0,
    sealRetraction: 0,
    flowPolicy: policy,
  });
  expect(closed.topology.compartments).toHaveLength(2);
  expect(closed.topology.flows).toHaveLength(0);
  const initial = closed.topology.compartments.map((c, i) => ({
    compartmentId: c.id,
    moles: i ? 0 : 100,
  }));
  expect(stepCompartmentGas(closed.topology, initial, 1).gas).toEqual(initial);
  for (const sealRetraction of [0.000001, 0.5, 1]) {
    const unseated = compiler({
      instanceId: "sealed-room",
      apertureFraction: 0,
      sealRetraction,
      flowPolicy: policy,
    });
    expect(unseated.topology.flows.length).toBeGreaterThan(0);
  }
  for (const sealRetraction of [0, 0.5, NaN, -1])
    expect(() =>
      compiler({
        instanceId: "sealed-room",
        apertureFraction: 0.01,
        sealRetraction,
        flowPolicy: policy,
      }),
    ).toThrow("seal");
});
