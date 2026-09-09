import { validateNativePressureRoomDocument } from "@sidereal/sim/construction-pressure-document";
import type { ConstructionDocument } from "@sidereal/content/construction";
import {
  t,
  type ReducerCtx,
  type ViewCtx,
  type InferSchema,
} from "spacetimedb/server";
import type world from "./index";
import {
  acceptNativePressureRoomInstallation,
  NATIVE_ROOM_AUDIT_SHA256,
  type createNativePressureRoomCompiler,
  type NativeRoomInstalledPart,
} from "@sidereal/sim/construction-native-room";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { stableStringify } from "@sidereal/sim/layout-geometry";
import {
  sealedDoorMotionStep,
  sealedDoorPhase,
} from "@sidereal/sim/construction-seal-motion";
import { doorSweepOccupied } from "@sidereal/sim/construction-door-motion";
import {
  ATMOSPHERE_LIMITS,
  initializeAtmosphere,
  replaceAtmosphereModel,
  stepAtmosphere,
  ownAtmospheres,
} from "./construction-atmosphere";

type Context = ReducerCtx<InferSchema<typeof world>>;
type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;
export type NativePressureCompiler = ReturnType<
  typeof createNativePressureRoomCompiler
>;
import { NATIVE_PRESSURE_FLOW_POLICY } from "@sidereal/sim/construction-native-room-published";
export { NATIVE_PRESSURE_FLOW_POLICY } from "@sidereal/sim/construction-native-room-published";
const CLOCK_ID = "native-pressure-fixed-step-v1";
const STEP_SECONDS = 0.05;
// Derived immutable geometry only: accepted poses, gas and clocks remain in DB.
// Cache loss/restart therefore never changes simulation or grants authority.
const compiledCache = new WeakMap<
  NativePressureCompiler,
  Map<string, ReturnType<NativePressureCompiler>>
>();
const hash = (value: unknown) => constructionHash(stableStringify(value));
const demand = (ok: unknown, reason: string): void => {
  if (!ok) throw Error("Native pressure authority: " + reason);
};

/** The caller enumerates the actual server-compiled exhaustive installation.
 * This call belongs inside the spawn transaction, after native parts and the door
 * are installed. No transport parameters may supply this list or a compiler. */
export function installNativePressure(
  ctx: Context,
  input: {
    instanceId: string;
    deckId: string;
    doorId: string;
    actualParts: readonly NativeRoomInstalledPart[];
  },
  compile: NativePressureCompiler,
) {
  const instance = ctx.db.constructionInstance.id.find(input.instanceId);
  const door = ctx.db.constructionDoor.id.find(input.doorId);
  demand(
    instance && instance.owner.isEqual(ctx.sender),
    "owned installed instance required",
  );
  demand(
    door &&
      door.instanceId === input.instanceId &&
      door.deckId === input.deckId &&
      door.x === 2 &&
      door.y === 0 &&
      door.quarterTurns === 1,
    "installed door/frame required",
  );
  const documentIds = validateNativePressureRoomDocument(
    JSON.parse(instance!.documentJson) as ConstructionDocument,
  );
  demand(
    documentIds.deckId === input.deckId &&
      documentIds.openingId === input.doorId,
    "semantic door/deck differs from installed native fixture",
  );
  const existing = ctx.db.constructionNativePressure.id.find(input.instanceId);
  if (existing) {
    demand(
      existing.owner.isEqual(ctx.sender) &&
        existing.deckId === input.deckId &&
        existing.doorId === input.doorId &&
        existing.documentHash === hash(instance!.documentJson),
      "installation replay conflicts",
    );
    const accepted = compileAccepted(
      compile,
      existing.id,
      existing.deckId,
      existing.doorId,
      existing.acceptedFraction,
      existing.sealRetraction,
      input.actualParts,
    );
    demand(
      accepted.fingerprint === existing.installationFingerprint &&
        hash(input.actualParts) ===
          hash(JSON.parse(existing.installedPartsJson)),
      "installation replay conflicts",
    );
    demand(
      ctx.db.constructionAtmosphere.id.find(input.instanceId),
      "missing persistent gas",
    );
    return existing;
  }
  // Admission must happen inside the spawn transaction, before any pressure
  // write. Keep this aligned with the atmosphere solver's global work budget.
  demand(
    [...ctx.db.constructionNativePressure.iter()].length <
      ATMOSPHERE_LIMITS.instances,
    "installation admission budget exhausted",
  );
  demand(
    door!.fraction === 0 && !door!.targetOpen && !door!.moving,
    "initial closed server door required",
  );
  const accepted = compileAccepted(
    compile,
    input.instanceId,
    input.deckId,
    input.doorId,
    0,
    0,
    input.actualParts,
  );
  const row = {
    id: input.instanceId,
    owner: ctx.sender,
    deckId: input.deckId,
    doorId: input.doorId,
    documentHash: hash(instance!.documentJson),
    installedPartsJson: stableStringify(input.actualParts),
    installationFingerprint: accepted.fingerprint,
    auditSha256: NATIVE_ROOM_AUDIT_SHA256,
    acceptedFraction: 0,
    sealRetraction: 0,
    revision: 1n,
  };
  // Vacuum is the only install policy exposed here. Future nonzero allocation
  // requires an independently accounted server resource transaction.
  initializeAtmosphere(
    ctx.db.constructionAtmosphere,
    instance!,
    accepted.model,
    { kind: "vacuum" },
    ctx.db.constructionAtmosphereClock.id.find(CLOCK_ID)?.tick ?? 0n,
  );
  ctx.db.constructionNativePressure.insert(row);
  return row;
}
function compileAccepted(
  compile: NativePressureCompiler,
  instanceId: string,
  deckId: string,
  doorId: string,
  fraction: number,
  sealRetraction: number,
  parts: readonly NativeRoomInstalledPart[],
) {
  let cache = compiledCache.get(compile);
  if (!cache) {
    cache = new Map();
    compiledCache.set(compile, cache);
  }
  const key = stableStringify([
    instanceId,
    deckId,
    doorId,
    fraction,
    sealRetraction,
  ]);
  let compiled = cache.get(key);
  if (!compiled) {
    compiled = compile({
      instanceId,
      deckId,
      openingId: doorId,
      apertureFraction: fraction,
      sealRetraction,
      flowPolicy: NATIVE_PRESSURE_FLOW_POLICY,
    });
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(key, compiled);
  }
  const original = acceptNativePressureRoomInstallation(compiled, parts);
  // Pressure cells use fixture-local tile identities. The runtime deck identity
  // is authoritative and included in the derived proof, never client supplied.
  const structure = {
    ...original.structure,
    cells: original.structure.cells.map((c) => ({ ...c, deckId })),
  };
  return {
    fingerprint: compiled.requiredInstallationFingerprint,
    model: {
      structure,
      proofHash: hash([original.proofHash, deckId, structure]),
    },
    structureJson: stableStringify(structure),
  };
}

interface VerifiedInstallationInput {
  id: string;
  deckId: string;
  doorId: string;
  documentHash: string;
  installedPartsJson: string;
  installationFingerprint: string;
  acceptedFraction: number;
  sealRetraction: number;
}
const verifiedCache = new WeakMap<
  NativePressureCompiler,
  Map<
    string,
    {
      metadata: string;
      documentJson: string;
      partsJson: string;
      parts: NativeRoomInstalledPart[];
      accepted: ReturnType<typeof compileAccepted>;
    }
  >
>();
/** Exact persisted bytes and pose identify this derived cache entry. A row edit
 * without a revision bump still misses the cache and must pass full validation. */
function verifiedInstallation(
  compile: NativePressureCompiler,
  installed: VerifiedInstallationInput,
  documentJson: string,
) {
  let cache = verifiedCache.get(compile);
  if (!cache) {
    cache = new Map();
    verifiedCache.set(compile, cache);
  }
  const metadata = stableStringify([
    installed.deckId,
    installed.doorId,
    installed.documentHash,
    installed.installationFingerprint,
    installed.acceptedFraction,
    installed.sealRetraction,
  ]);
  const old = cache.get(installed.id);
  if (
    old &&
    old.metadata === metadata &&
    old.documentJson === documentJson &&
    old.partsJson === installed.installedPartsJson
  )
    return old;
  demand(
    hash(documentJson) === installed.documentHash,
    "installed document changed; validated replacement required",
  );
  const parts = JSON.parse(
    installed.installedPartsJson,
  ) as NativeRoomInstalledPart[];
  const accepted = compileAccepted(
    compile,
    installed.id,
    installed.deckId,
    installed.doorId,
    installed.acceptedFraction,
    installed.sealRetraction,
    parts,
  );
  demand(
    accepted.fingerprint === installed.installationFingerprint,
    "installed parts changed",
  );
  const next = {
    metadata,
    documentJson,
    partsJson: installed.installedPartsJson,
    parts,
    accepted,
  };
  if (cache.size >= ATMOSPHERE_LIMITS.instances && !cache.has(installed.id))
    cache.delete(cache.keys().next().value!);
  cache.set(installed.id, next);
  return next;
}

/** Called only once from the server-only world scheduler. Native doors must be
 * excluded from the generic hinge step. Accepted hinge and gasket update together
 * before their finite gas step; each call consumes exactly 50ms without catch-up. */
export function stepNativePressure(
  ctx: Context,
  compile: NativePressureCompiler,
) {
  const installations = [...ctx.db.constructionNativePressure.iter()];
  // Empty installations have no elapsed work to preserve. The next admitted
  // instance consumes one fixed step, never the idle wall-clock interval.
  if (installations.length === 0) return false;
  const oldClock = ctx.db.constructionAtmosphereClock.id.find(CLOCK_ID);
  const now = ctx.timestamp.microsSinceUnixEpoch;
  demand(now >= 0n, "invalid scheduler timestamp");
  if (oldClock && now <= oldClock.lastScheduleMicros) return false;
  const tick = (oldClock?.tick ?? 0n) + 1n;
  demand(tick <= 18446744073709551615n, "simulation clock exhausted");
  demand(
    installations.length <= ATMOSPHERE_LIMITS.instances,
    "installation budget exceeded",
  );
  for (const installed of installations) {
    const instance = ctx.db.constructionInstance.id.find(installed.id);
    const door = ctx.db.constructionDoor.id.find(installed.doorId);
    demand(
      instance && instance.owner.isEqual(installed.owner),
      "installed document changed; validated replacement required",
    );
    demand(
      installed.auditSha256 === NATIVE_ROOM_AUDIT_SHA256,
      "native source qualification changed",
    );
    demand(
      door &&
        door.instanceId === installed.id &&
        door.deckId === installed.deckId &&
        door.x === 2 &&
        door.y === 0 &&
        door.quarterTurns === 1 &&
        door.fraction === installed.acceptedFraction,
      "hinge state bypassed native seal controller",
    );
    const verified = verifiedInstallation(
      compile,
      installed,
      instance!.documentJson,
    );
    const parts = verified.parts,
      prior = verified.accepted;
    const gas = ctx.db.constructionAtmosphere.id.find(installed.id);
    demand(
      gas &&
        gas.owner.isEqual(installed.owner) &&
        gas.proofHash === prior.model.proofHash &&
        gas.structureJson === prior.structureJson,
      "pressure model no longer matches installation",
    );
    const idle = door!.targetOpen
      ? installed.acceptedFraction === 1
      : installed.acceptedFraction === 0 && installed.sealRetraction === 0;
    const bodies = idle
      ? []
      : [...ctx.db.constructionLocation.by_instance.filter(installed.id)]
          .filter((l) => l.deckId === installed.deckId)
          .map((l) => ctx.db.character.id.find(l.characterId))
          .filter((a) => a?.shipId === installed.id)
          .map((a) => ({
            position: [a!.localX, a!.localY] as [number, number],
            radius: 0.3,
          }));
    const obstructed = doorSweepOccupied(
      {
        id: door!.id,
        origin: [door!.x, door!.y],
        quarterTurns: door!.quarterTurns,
      },
      bodies,
    );
    const next = sealedDoorMotionStep(
      {
        hingeFraction: installed.acceptedFraction,
        sealRetraction: installed.sealRetraction,
        targetOpen: door!.targetOpen,
        blocked: door!.blocked,
      },
      STEP_SECONDS,
      {
        hingeSeconds: 1,
        sealSeconds: 0.25,
        actuationAllowed: true,
        deploymentAllowed: true,
        hingeObstructed: obstructed,
        sealObstructed: obstructed,
      },
    );
    const poseChanged =
      next.hingeFraction !== installed.acceptedFraction ||
      next.sealRetraction !== installed.sealRetraction;
    if (poseChanged) {
      const accepted = compileAccepted(
        compile,
        installed.id,
        installed.deckId,
        installed.doorId,
        next.hingeFraction,
        next.sealRetraction,
        parts,
      );
      replaceAtmosphereModel(
        ctx.db.constructionAtmosphere,
        installed.id,
        gas!.revision,
        accepted.model,
        "reject-removal",
      );
      ctx.db.constructionNativePressure.id.update({
        ...installed,
        acceptedFraction: next.hingeFraction,
        sealRetraction: next.sealRetraction,
        revision: installed.revision + 1n,
      });
    }
    const phase = sealedDoorPhase(next);
    const moving = phase !== "open" && phase !== "closed";
    if (
      poseChanged ||
      next.blocked !== door!.blocked ||
      moving !== door!.moving
    )
      ctx.db.constructionDoor.id.update({
        ...door!,
        fraction: next.hingeFraction,
        blocked: next.blocked,
        moving,
        revision: door!.revision + 1n,
      });
  }
  stepAtmosphere(ctx.db.constructionAtmosphere, tick, STEP_SECONDS);
  const clock = { id: CLOCK_ID, tick, lastScheduleMicros: now };
  if (oldClock) ctx.db.constructionAtmosphereClock.id.update(clock);
  else ctx.db.constructionAtmosphereClock.insert(clock);
  return true;
}

export const nativePressureProjection = t.row(
  "ConstructionNativePressureStatus",
  {
    instanceId: t.string(),
    deckId: t.string(),
    doorId: t.string().primaryKey(),
    fraction: t.f64(),
    sealRetraction: t.f64(),
    revision: t.u64(),
    atmosphereRevision: t.u64(),
    ventedMoles: t.f64(),
    compartments: t.array(
      t.object("ConstructionNativePressureCompartment", {
        id: t.string(),
        volumeM3: t.f64(),
        pressurePa: t.f64(),
      }),
    ),
  },
);
/** gameView wrapper must apply connection admission. Grant expiry is committed
 * by expireGrants on the authority step, matching existing private draft views. */
export function ownNativePressure(ctx: ReadContext) {
  const readable = new Set(
    [...ctx.db.constructionGrant.by_principal.filter(ctx.sender)]
      .filter((g) => !g.revoked && g.capability === "draft.read")
      .map((g) => g.workspaceId),
  );
  const gas = new Map(
    ownAtmospheres(ctx.db.constructionAtmosphere, ctx.sender).map((row) => [
      row.instanceId,
      row,
    ]),
  );
  return [
    ...ctx.db.constructionNativePressure.by_owner.filter(ctx.sender),
  ].flatMap((row) => {
    const instance = ctx.db.constructionInstance.id.find(row.id);
    const state = gas.get(row.id);
    if (
      !instance ||
      !instance.owner.isEqual(ctx.sender) ||
      !readable.has(instance.workspaceId) ||
      !state
    )
      return [];
    return [
      {
        instanceId: row.id,
        deckId: row.deckId,
        doorId: row.doorId,
        fraction: row.acceptedFraction,
        sealRetraction: row.sealRetraction,
        revision: row.revision,
        atmosphereRevision: state.revision,
        ventedMoles: state.ventedMoles,
        compartments: state.compartments.map(
          ({ id, volumeM3, pressurePa }) => ({ id, volumeM3, pressurePa }),
        ),
      },
    ];
  });
}
