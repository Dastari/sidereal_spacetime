import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import {
  buildLayoutPressure,
  describePressureLayout,
  type PressureLayoutContracts,
  type PressureGeometryProof,
} from "./construction-pressure-layout";

/** Staged native fixture, not a generic native-asset pressure certification. */
export const NATIVE_ROOM_AUDIT_SHA256 =
  "f347642d4ae424e63fa5abe0326f2e6cf0d82a5f168f0191c878f327056eec4e";
const hash = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
const digest = (value: unknown) =>
  hash(new TextEncoder().encode(JSON.stringify(value)));
function demand(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error(`Native pressure fixture: ${reason}`);
}
interface NativePlacement {
  source: string;
  nodePrefix: string;
  originM: [number, number, number];
  quarterTurns: number;
}
export interface NativeRoomInstalledPart extends NativePlacement {
  id: string;
  sha256: string;
}
interface NativeRoomAudit {
  schema: string;
  pass: boolean;
  sourcePins: Record<string, { path: string; sha256: string }>;
  placements: NativePlacement[];
  freeVolumes: {
    x: number;
    y: number;
    nominalM3: number;
    freeM3: number;
    excludedM3: number;
  }[];
  qualification: { exteriorEnclosed: boolean; closedDoorAirtight: boolean };
}
export interface NativeRoomFlowPolicy {
  /** Trusted gameplay tuning; these are not measured native seal ratings. */
  id: string;
  openConductance: number;
  closedConductance: number;
}

/** Server/content loader only. Hashes every exact source dependency before
 * constructing proofs. Never accept this input or an installation match flag
 * from a client reducer. Runtime registration must additionally match the
 * returned installation fingerprint to the actual authoritative placed parts. */
export function createNativePressureRoomCompiler(input: {
  audit: Uint8Array;
  sources: Readonly<Record<string, Uint8Array>>;
}) {
  const compile = createPublishedNativePressureRoomCompiler(input.audit);
  const audit = JSON.parse(
    new TextDecoder().decode(input.audit),
  ) as NativeRoomAudit;
  for (const [name, pin] of Object.entries(audit.sourcePins))
    demand(
      input.sources[name] && hash(input.sources[name]) === pin.sha256,
      `missing or changed native source ${name}`,
    );
  return compile;
}

/** Runtime factory for a build-verified publication. Only the exact audited bytes
 * are accepted. Source GLBs are verified by publication and by the native loader;
 * they never belong in the authoritative world bundle. */
export function createPublishedNativePressureRoomCompiler(
  auditBytes: Uint8Array,
) {
  demand(hash(auditBytes) === NATIVE_ROOM_AUDIT_SHA256, "unrecognized audit");
  const audit = JSON.parse(
    new TextDecoder().decode(auditBytes),
  ) as NativeRoomAudit;
  demand(
    audit.pass &&
      audit.schema === "sidereal.native-pressure-test-room.v1" &&
      audit.qualification.exteriorEnclosed &&
      audit.qualification.closedDoorAirtight,
    "unexpected qualification",
  );

  return function compile(input: {
    instanceId: string;
    deckId?: string;
    openingId?: string;
    /** Actual server-accepted aperture fraction, never the requested pose. */
    apertureFraction: number;
    /** Server-accepted native SealRetracted weight:0 deployed,1 retracted. */
    sealRetraction: number;
    flowPolicy: NativeRoomFlowPolicy;
  }) {
    demand(
      typeof input.instanceId === "string" &&
        input.instanceId.length > 0 &&
        input.instanceId.length <= 128,
      "invalid instance",
    );
    demand(
      Number.isFinite(input.apertureFraction) &&
        input.apertureFraction >= 0 &&
        input.apertureFraction <= 1,
      "invalid accepted aperture",
    );
    demand(
      Number.isFinite(input.sealRetraction) &&
        input.sealRetraction >= 0 &&
        input.sealRetraction <= 1 &&
        (input.apertureFraction === 0 || input.sealRetraction === 1),
      "hinge requires retracted accepted seal",
    );
    const sealed = input.apertureFraction === 0 && input.sealRetraction === 0;
    const policy = input.flowPolicy;
    demand(
      typeof policy.id === "string" &&
        policy.id.length > 0 &&
        policy.id.length <= 128 &&
        Number.isFinite(policy.closedConductance) &&
        policy.closedConductance > 0 &&
        Number.isFinite(policy.openConductance) &&
        policy.openConductance >= policy.closedConductance &&
        policy.openConductance <= 1,
      "unrated door requires positive bounded closed flow",
    );

    const deckId = input.deckId ?? "test-deck";
    const openingId = input.openingId ?? "central-door";
    demand(
      [deckId, openingId].every((id) => /^[a-zA-Z0-9:_./-]{1,160}$/.test(id)),
      "invalid mapped identity",
    );
    const layout = emptyLayout(input.instanceId, deckId);
    layout.name = "Native pressure test room";
    layout.decks[0].roof = true;
    for (const v of audit.freeVolumes) {
      const tile = stampTile(`floor-${v.x}-${v.y}`, deckId, "rectangle", [
        v.x * 32,
        v.y * 32,
      ]);
      tile.vertices = [
        [v.x * 32, v.y * 32],
        [(v.x + 1) * 32, v.y * 32],
        [(v.x + 1) * 32, (v.y + 1) * 32],
        [v.x * 32, (v.y + 1) * 32],
      ];
      layout.tiles.push(tile);
    }
    layout.partitions.push({
      id: "central-wall",
      deckId,
      a: [64, 0],
      b: [64, 64],
      seal: "design-sealed",
    });
    layout.openings.push({
      id: openingId,
      deckId,
      partitionId: "central-wall",
      a: [64, 12],
      b: [64, 52],
      kind: "door",
      clearance: 16,
      sill: 0,
    });
    const options = { floorTopUnitsByDeck: { [deckId]: 6 } };
    const geometry = describePressureLayout(layout, input.instanceId, options);
    const proof: PressureGeometryProof = {
      id: "native-room-exterior-and-volume-r006",
      geometryFingerprint: geometry.geometryFingerprint,
      sourceDefinitionId: "shipyard.structure.boundary-kit/test-room",
      sourceRevision: "r006-qualification-a007",
      sourceSha256: NATIVE_ROOM_AUDIT_SHA256,
      validated: true,
    };
    const contracts: PressureLayoutContracts = {
      freeVolumes: geometry.cells.map((cell) => {
        const v = audit.freeVolumes.find(
          (v) => cell.tileId === `floor-${v.x}-${v.y}`,
        );
        demand(
          v && Math.abs(cell.nominalPrismVolumeM3 - v.nominalM3) < 1e-9,
          "native volume mismatch",
        );
        return {
          cellId: cell.id,
          freeVolumeM3: v.freeM3,
          excludedSolidVolumeM3: v.excludedM3,
          displacementAccounting: "validated-native-solid-exclusion",
          proof,
        };
      }),
      surfaces: geometry.surfaces
        .filter((s) => s.kind !== "continuous" && s.kind !== "opening")
        .map((s) => ({
          surfaceId: s.id,
          kind: "sealed",
          coverageProof: proof,
          seal: {
            interfaceId: "fixed-native-room-exterior-and-jambs",
            airtight: true,
            proof,
          },
        })),
      openings: [
        {
          openingId,
          coverageProof: proof,
          flowProof: { ...proof, id: `unrated-flow-policy:${policy.id}` },
          open: input.apertureFraction > 0,
          openConductance:
            policy.closedConductance +
            (policy.openConductance - policy.closedConductance) *
              input.apertureFraction,
          closedConductance: sealed ? 0 : policy.closedConductance,
          closure: sealed ? "verified-seal" : "ungasketed",
          ...(sealed
            ? {
                seal: {
                  interfaceId: "native-room-gasket-contact-a007",
                  airtight: true as const,
                  proof,
                },
              }
            : {}),
        },
      ],
    };
    const installation = audit.placements.map((p, i) => ({
      ...p,
      originM: [...p.originM] as [number, number, number],
      id: digest(["native-pressure-part", input.instanceId, i, p]).slice(0, 32),
      sha256: audit.sourcePins[p.source].sha256,
    }));
    return {
      ...buildLayoutPressure(layout, input.instanceId, options, contracts),
      layout,
      installation,
      requiredInstallationFingerprint: digest(installation),
      qualification: "native-static-seal-qualified" as const,
      volumeModel: "fixed-closed-pose-above-walk-datum" as const,
      flowPolicyId: policy.id,
      // No initial gas, client authority, live refit, damage or airlock claim.
    };
  };
}

/** Compare the actual server-owned installation, not a client match flag.
 * Renderer visibility is deliberately absent. The adapter at the installation
 * boundary must enumerate all structural parts (including unexpected extras). */
export function acceptNativePressureRoomInstallation(
  compiled: ReturnType<ReturnType<typeof createNativePressureRoomCompiler>>,
  actual: readonly NativeRoomInstalledPart[],
) {
  demand(
    actual.length === compiled.installation.length,
    "installation count changed",
  );
  const byId = new Map(actual.map((p) => [p.id, p]));
  demand(byId.size === actual.length, "duplicate installed identity");
  const ordered = compiled.installation.map((expected) => {
    const part = byId.get(expected.id);
    demand(
      part &&
        part.source === expected.source &&
        part.sha256 === expected.sha256 &&
        part.nodePrefix === expected.nodePrefix &&
        part.quarterTurns === expected.quarterTurns &&
        Array.isArray(part.originM) &&
        part.originM.length === 3 &&
        part.originM.every(
          (n, i) => Number.isFinite(n) && n === expected.originM[i],
        ),
      "native installed transform or definition changed",
    );
    return {
      source: part.source,
      nodePrefix: part.nodePrefix,
      originM: [...part.originM],
      quarterTurns: part.quarterTurns,
      id: part.id,
      sha256: part.sha256,
    };
  });
  demand(
    digest(ordered) === compiled.requiredInstallationFingerprint,
    "installation fingerprint mismatch",
  );
  return {
    structure: compiled.structure,
    proofHash: digest([
      NATIVE_ROOM_AUDIT_SHA256,
      compiled.requiredInstallationFingerprint,
      compiled.geometry.geometryFingerprint,
      compiled.flowPolicyId,
      compiled.structure,
    ]),
  };
}
