import { type NativeRoomInstalledPart } from "./construction-native-room";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  compilePressureTopology,
  type PressureStructure,
} from "./construction-topology";
import { validateSealedDoorMotion } from "./construction-seal-motion";
import type { NativeAirlockState } from "./construction-airlock-controller";

export const NATIVE_EXTERNAL_AIRLOCK_AUDIT_SHA256 =
  "eb7eab8523d68906a302a84cf06a5b2a507229d15e89fb96f66d1ade8b6e0aa6";
interface CompositeAudit {
  schema: string;
  pass: boolean;
  sourcePins: Record<string, { path: string; sha256: string }>;
  placements: Omit<NativeRoomInstalledPart, "id" | "sha256">[];
  freeVolumes: { x: number; y: number; freeM3: number; excludedM3: number }[];
  checks: { name: string; pass: boolean }[];
}
const hash = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
/** Exact new native composition proof. No old-room certification is inherited.
 * Caller is trusted compilation/installation code, never reducer arguments. */
export function planNativeExternalAirlock(
  instanceId: string,
  auditBytes: Uint8Array,
  sources: Readonly<Record<string, Uint8Array>>,
) {
  const compile = createPublishedNativeExternalAirlockCompiler(auditBytes);
  const audit = JSON.parse(
    new TextDecoder().decode(auditBytes),
  ) as CompositeAudit;
  for (const [name, pin] of Object.entries(audit.sourcePins))
    if (!sources[name] || hash(sources[name]) !== pin.sha256)
      throw Error("Airlock plan: missing or changed native " + name);
  return compile(instanceId);
}
/** Build-verified publication factory: no GLB source bytes in the world bundle. */
export function createPublishedNativeExternalAirlockCompiler(
  auditBytes: Uint8Array,
) {
  if (hash(auditBytes) !== NATIVE_EXTERNAL_AIRLOCK_AUDIT_SHA256)
    throw Error("Airlock plan: exact composite audit required");
  const audit = JSON.parse(
    new TextDecoder().decode(auditBytes),
  ) as CompositeAudit;
  if (
    !audit.pass ||
    audit.schema !== "sidereal.native-external-airlock-composite-audit.v1" ||
    audit.checks.some((c) => !c.pass)
  )
    throw Error("Airlock plan: failed native qualification");
  return (instanceId: string) => {
    if (!instanceId || instanceId.length > 96)
      throw Error("Airlock plan: invalid instance identity");
    const installation = audit.placements.map(
      (p, i): NativeRoomInstalledPart => ({
        ...p,
        originM: [...p.originM],
        id: `${instanceId}:part:${i}`,
        sha256: audit.sourcePins[p.source].sha256,
      }),
    );
    return {
      instanceId,
      auditSha256: NATIVE_EXTERNAL_AIRLOCK_AUDIT_SHA256,
      installation,
      installationFingerprint: hash(
        new TextEncoder().encode(JSON.stringify(installation)),
      ),
      doors: (["inner", "outer"] as const).map((side) => ({
        id: `${instanceId}:${side}`,
        side,
        originM: (side === "inner" ? [2, 0, 0] : [6, 2, 0]) as [
          number,
          number,
          number,
        ],
        quarterTurns: side === "inner" ? 1 : 3,
      })),
      cells: [
        {
          id: `${instanceId}:interior`,
          volumeM3: audit.freeVolumes
            .filter((v) => v.x < 2)
            .reduce((n, v) => n + v.freeM3, 0),
        },
        {
          id: `${instanceId}:chamber`,
          volumeM3: audit.freeVolumes
            .filter((v) => v.x >= 2)
            .reduce((n, v) => n + v.freeM3, 0),
        },
      ],
      waitingPositionsM: {
        interior: [1, 1, 0.1875],
        chamber: [4, 1, 0.1875],
        exterior: [7, 1, 0.1875],
      },
      sealedFloorCount: 12,
      exteriorFloorCount: 4,
      qualification:
        "native-static-closure-open-portals-and-supported-route" as const,
      remaining: [
        "World binding and actual installed UUID/source comparison",
        "Two-door semantic opening/roof and private controller registration",
        "Accounted reservoir/vent ports and powered pump authority",
        "Vacuum survival and docking/EVA attachments",
        "Native renderer and browser acceptance; no whole-Wayfarer seal or final art approval",
      ],
    };
  };
}
export type NativeExternalAirlockPlan = ReturnType<
  typeof planNativeExternalAirlock
>;
/** Require actual server-owned placed records, not a client asserted match. */
export function acceptNativeExternalAirlockInstallation(
  plan: NativeExternalAirlockPlan,
  actual: readonly NativeRoomInstalledPart[],
) {
  if (actual.length !== plan.installation.length)
    throw Error("Airlock installation count changed");
  const byId = new Map(actual.map((p) => [p.id, p]));
  if (byId.size !== actual.length)
    throw Error("Airlock installation duplicate identity");
  for (const p of plan.installation) {
    const a = byId.get(p.id);
    if (
      !a ||
      a.source !== p.source ||
      a.sha256 !== p.sha256 ||
      a.nodePrefix !== p.nodePrefix ||
      a.quarterTurns !== p.quarterTurns ||
      JSON.stringify(a.originM) !== JSON.stringify(p.originM)
    )
      throw Error("Airlock installed source or transform changed");
  }
  return plan.installationFingerprint;
}
/** Finite flow through actual accepted apertures. Pump requests create no extra
 * paths: dedicated native reservoir/vent ports are not qualified by this audit.
 * Closed-reference volumes are retained through hinge motion (no leaf pumping). */
export function nativeExternalAirlockPressure(
  plan: NativeExternalAirlockPlan,
  deckId: string,
  state: NativeAirlockState,
  policy: { id: string; openConductance: number; unsealedConductance: number },
) {
  if (
    plan.auditSha256 !== NATIVE_EXTERNAL_AIRLOCK_AUDIT_SHA256 ||
    !deckId ||
    !policy.id ||
    !Number.isFinite(policy.openConductance) ||
    !Number.isFinite(policy.unsealedConductance) ||
    policy.unsealedConductance <= 0 ||
    policy.openConductance < policy.unsealedConductance ||
    policy.openConductance > 1
  )
    throw Error("Airlock pressure: invalid proof or gameplay policy");
  for (const side of ["inner", "outer"] as const)
    validateSealedDoorMotion(state[side]);
  const [interior, chamber] = plan.cells;
  const structure: PressureStructure = {
    cells: [
      { ...interior, deckId, faces: ["shell", "inner"] },
      { ...chamber, deckId, faces: ["shell", "inner", "outer"] },
    ],
    boundaries: [
      ...plan.cells.map((c) => ({
        id: `${c.id}:shell`,
        a: { cellId: c.id, faceId: "shell" },
        b: null,
        kind: "sealed" as const,
        pressureDefinitionId: plan.auditSha256,
      })),
      ...(["inner", "outer"] as const).map((side) => {
        const d = state[side],
          sealed = d.hingeFraction === 0 && d.sealRetraction === 0;
        return {
          id: `${plan.instanceId}:${side}`,
          a: {
            cellId: side === "inner" ? interior.id : chamber.id,
            faceId: side,
          },
          b: side === "inner" ? { cellId: chamber.id, faceId: "inner" } : null,
          ...(sealed
            ? {
                kind: "sealed" as const,
                pressureDefinitionId: plan.auditSha256,
              }
            : {
                kind: "flow" as const,
                conductanceMolesPerSecondPa:
                  policy.unsealedConductance +
                  (policy.openConductance - policy.unsealedConductance) *
                    d.hingeFraction,
                sourceDefinitionId: policy.id,
              }),
        };
      }),
    ],
  };
  return { structure, topology: compilePressureTopology(structure) };
}
