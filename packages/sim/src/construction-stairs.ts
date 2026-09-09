import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type {
  NativeStairAudit,
  NativeStairDelivery,
  NativeStairSupport,
  NativeStairSolid,
  NativeStairStep,
  StairInstallation,
  StairBounds2,
  StairPoint2,
} from "@sidereal/content/construction-stairs";
import type {
  TraversalPoint3,
  TraversalBounds3,
} from "@sidereal/content/construction-traversal";
import { transformPoint } from "@sidereal/content/ship-layout";
import { stableStringify, compareText } from "./layout-geometry";

export const STAIR_LIMITS = Object.freeze({
  bytes: 262144,
  parts: 128,
  supports: 128,
  solids: 1024,
  steps: 256,
  occupants: 64,
  coordinateM: 512,
  fixedSeconds: 0.05,
  maxIntentAgeMicros: 300000n,
});
const EPS = 1e-8;
const hash = (v: Uint8Array) => bytesToHex(sha256(v));
const digest = (v: unknown) =>
  hash(new TextEncoder().encode(stableStringify(v)));
const same = (a: unknown, b: unknown) =>
  stableStringify(a) === stableStringify(b);
function demand(ok: unknown, message: string): asserts ok {
  if (!ok) throw Error("Construction stairs: " + message);
}
const id = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9:_./-]{1,128}$/.test(v);
const finite = (v: unknown): v is number =>
  typeof v === "number" &&
  Number.isFinite(v) &&
  Math.abs(v) <= STAIR_LIMITS.coordinateM;
const point = (p: unknown, n: number) =>
  Array.isArray(p) && p.length === n && p.every(finite);
const validBounds = (b: any, n: number) =>
  b &&
  point(b.min, n) &&
  point(b.max, n) &&
  b.min.every((v: number, i: number) => v < b.max[i]);
const contains = (b: StairBounds2, p: StairPoint2) =>
  p.every((v, i) => v >= b.min[i] - EPS && v <= b.max[i] + EPS);
const containsBox = (a: StairBounds2, b: StairBounds2) =>
  b.min.every((v, i) => v >= a.min[i] - EPS && b.max[i] <= a.max[i] + EPS);
const add = (a: StairPoint2, b: StairPoint2): StairPoint2 => [
  a[0] + b[0],
  a[1] + b[1],
];
const translated = (b: StairBounds2, d: StairPoint2): StairBounds2 => ({
  min: add(b.min, d),
  max: add(b.max, d),
});
const tick = (v: bigint) =>
  demand(
    typeof v === "bigint" && v >= 0n && v <= 18446744073709551615n,
    "invalid tick/revision",
  );
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}
const distance = (a: TraversalPoint3, b: TraversalPoint3) =>
  Math.hypot(...a.map((v, i) => v - b[i]));
function boxDistance(a: TraversalBounds3, b: TraversalBounds3) {
  return Math.hypot(
    ...a.min.map((v, i) => Math.max(0, v - b.max[i], b.min[i] - a.max[i])),
  );
}
/** Exact capsule clearance for an axis-aligned rectangular family of vertical
 * centre segments. A larger swept box is conservative for non-axis-aligned input. */
function clearCapsuleEnvelope(
  xy: StairBounds2,
  zMin: number,
  zMax: number,
  body: NativeStairAudit["body"],
  solids: readonly { boundsM: TraversalBounds3 }[],
) {
  const core: TraversalBounds3 = {
    min: [xy.min[0], xy.min[1], zMin + body.radiusM],
    max: [xy.max[0], xy.max[1], zMax + body.heightM - body.radiusM],
  };
  return solids.every(
    (s) => boxDistance(core, s.boundsM) >= body.radiusM - EPS,
  );
}
function swept(
  a: TraversalPoint3,
  b: TraversalPoint3,
  body: NativeStairAudit["body"],
  solids: readonly { boundsM: TraversalBounds3 }[],
) {
  return clearCapsuleEnvelope(
    {
      min: [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
      max: [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
    },
    Math.min(a[2], b[2]),
    Math.max(a[2], b[2]),
    body,
    solids,
  );
}
function supportTouches(a: NativeStairSupport, b: NativeStairSupport) {
  return a.boundsM.min.every(
    (v, i) =>
      v <= b.boundsM.max[i] + EPS && a.boundsM.max[i] >= b.boundsM.min[i] - EPS,
  );
}
function transformBounds2(
  b: StairBounds2,
  q: number,
  o: TraversalPoint3,
): StairBounds2 {
  const points = [
    [b.min[0], b.min[1]],
    [b.min[0], b.max[1]],
    [b.max[0], b.min[1]],
    [b.max[0], b.max[1]],
  ].map((p) => {
    const v = transformPoint(p as StairPoint2, q);
    return [v[0] + o[0], v[1] + o[1]];
  });
  return {
    min: [
      Math.min(...points.map((p) => p[0])),
      Math.min(...points.map((p) => p[1])),
    ],
    max: [
      Math.max(...points.map((p) => p[0])),
      Math.max(...points.map((p) => p[1])),
    ],
  };
}
function transformBounds3(
  b: TraversalBounds3,
  q: number,
  o: TraversalPoint3,
): TraversalBounds3 {
  const xy = transformBounds2(
    { min: [b.min[0], b.min[1]], max: [b.max[0], b.max[1]] },
    q,
    o,
  );
  return {
    min: [...xy.min, b.min[2] + o[2]],
    max: [...xy.max, b.max[2] + o[2]],
  };
}
const branded = new WeakSet<CompiledStairWalkSurface>();
export interface CompiledStairWalkSurface {
  instanceId: string;
  stairId: string;
  instanceRevision: bigint;
  stairRevision: bigint;
  proofHash: string;
  body: NativeStairAudit["body"];
  lowerDeckId: string;
  upperDeckId: string;
  supports: readonly NativeStairSupport[];
  solids: readonly NativeStairSolid[];
  steps: readonly NativeStairStep[];
  policy: StairInstallation["policy"];
}
/** Offline full-byte validation; no built-in fixture or headroom-only qualification. */
export function createNativeStairCompiler(input: {
  delivery: NativeStairDelivery;
  audit: Uint8Array;
  sources: Readonly<Record<string, Uint8Array>>;
}) {
  const compile = createPublishedNativeStairCompiler(input);
  for (const [name, pin] of Object.entries(input.delivery.sources))
    demand(
      input.sources[name] && hash(input.sources[name]) === pin.sha256,
      "native source hash mismatch",
    );
  return compile;
}
/** Both inputs must be generated trusted server content, never reducer arguments. */
export function createPublishedNativeStairCompiler(input: {
  delivery: NativeStairDelivery;
  audit: Uint8Array;
}) {
  const delivery = JSON.parse(
    JSON.stringify(input.delivery),
  ) as NativeStairDelivery;
  demand(
    input.audit.byteLength <= STAIR_LIMITS.bytes &&
      delivery.status === "native-geometry-qualified" &&
      id(delivery.adapterId) &&
      id(delivery.revision) &&
      hash(input.audit) === delivery.auditSha256,
    "exact qualified native audit required",
  );
  const a = JSON.parse(
    new TextDecoder().decode(input.audit),
  ) as NativeStairAudit;
  demand(
    a.schema === "sidereal.native-stair-audit.v1" &&
      a.adapterId === delivery.adapterId &&
      a.revision === delivery.revision,
    "unsupported native audit",
  );
  demand(
    a.qualification &&
      [
        "nativeMeshMatch",
        "physicalApertures",
        "fullBodyStepSweeps",
        "supportedStops",
        "guardedLandings",
      ].every(
        (k) => a.qualification[k as keyof typeof a.qualification] === true,
      ),
    "full supported-step qualification required; headroom alone is insufficient",
  );
  demand(
    a.body?.radiusM === 0.3 && a.body.heightM === 1.8,
    "unsupported standing capsule",
  );
  for (const side of [a.decks?.lower, a.decks?.upper])
    demand(
      side &&
        finite(side.originZ) &&
        finite(side.walkingZ) &&
        side.walkingZ > side.originZ,
      "invalid deck datum",
    );
  demand(
    a.decks.upper.walkingZ > a.decks.lower.walkingZ,
    "ordered decks required",
  );
  demand(
    Array.isArray(a.parts) &&
      a.parts.length > 0 &&
      a.parts.length <= STAIR_LIMITS.parts &&
      new Set(a.parts.map((p) => p.id)).size === a.parts.length,
    "part budget/identity",
  );
  const parts = new Set(a.parts.map((p) => p.id));
  for (const p of a.parts)
    demand(
      id(p.id) &&
        id(p.sourceId) &&
        id(p.nodePrefix) &&
        point(p.originM, 3) &&
        [0, 1, 2, 3].includes(p.quarterTurns) &&
        /^[a-f0-9]{64}$/.test(delivery.sources[p.sourceId]?.sha256 ?? ""),
      "invalid native part/source",
    );
  demand(
    Array.isArray(a.apertures) &&
      a.apertures.length === 2 &&
      new Set(a.apertures.map((p) => p.id)).size === 2 &&
      new Set(a.apertures.map((p) => p.role)).size === 2,
    "actual lower-roof/upper-floor apertures required",
  );
  for (const p of a.apertures)
    demand(
      id(p.id) &&
        ["lower-roof", "upper-floor"].includes(p.role) &&
        validBounds(p.boundsM, 3),
      "invalid native aperture",
    );
  const upperAperture = a.apertures.find((p) => p.role === "upper-floor")!;
  const lowerAperture = a.apertures.find((p) => p.role === "lower-roof")!;
  demand(
    upperAperture.boundsM.min[2] === a.decks.upper.originZ &&
      upperAperture.boundsM.max[2] === a.decks.upper.walkingZ &&
      lowerAperture.boundsM.max[2] === a.decks.upper.originZ &&
      lowerAperture.boundsM.min[2] > a.decks.lower.originZ,
    "apertures do not match actual deck slabs",
  );
  demand(
    Array.isArray(a.supports) &&
      a.supports.length >= 2 &&
      a.supports.length <= STAIR_LIMITS.supports &&
      new Set(a.supports.map((s) => s.id)).size === a.supports.length,
    "support budget/identity",
  );
  demand(
    Array.isArray(a.solids) &&
      a.solids.length > 0 &&
      a.solids.length <= STAIR_LIMITS.solids &&
      new Set(a.solids.map((s) => s.id)).size === a.solids.length,
    "solid budget/identity",
  );
  for (const s of a.solids)
    demand(
      id(s.id) && parts.has(s.partId) && validBounds(s.boundsM, 3),
      "invalid native solid",
    );
  const supports = new Map(a.supports.map((s) => [s.id, s]));
  for (const s of a.supports) {
    demand(
      id(s.id) &&
        parts.has(s.partId) &&
        validBounds(s.boundsM, 2) &&
        finite(s.topZM) &&
        ["lower-landing", "tread", "intermediate", "upper-landing"].includes(
          s.kind,
        ) &&
        Array.isArray(s.neighbours) &&
        s.neighbours.length <= 8 &&
        new Set(s.neighbours).size === s.neighbours.length,
      "invalid support",
    );
    demand(
      a.solids.some(
        (p) =>
          p.partId === s.partId &&
          Math.abs(p.boundsM.max[2] - s.topZM) <= EPS &&
          containsBox(
            {
              min: [p.boundsM.min[0], p.boundsM.min[1]],
              max: [p.boundsM.max[0], p.boundsM.max[1]],
            },
            s.boundsM,
          ),
      ),
      "support lacks actual native backing",
    );
    for (const n of s.neighbours) {
      const next = supports.get(n);
      demand(
        next &&
          n !== s.id &&
          next.neighbours.includes(s.id) &&
          (supportTouches(s, next) ||
            (Array.isArray(a.steps) &&
              a.steps.some(
                (e) =>
                  (e.fromSupportId === s.id && e.toSupportId === next.id) ||
                  (e.toSupportId === s.id && e.fromSupportId === next.id),
              ))),
        "invalid/nonadjacent support graph",
      );
    }
    if (s.kind === "lower-landing")
      demand(
        s.topZM === a.decks.lower.walkingZ,
        "lower landing datum mismatch",
      );
    if (s.kind === "upper-landing")
      demand(
        s.topZM === a.decks.upper.walkingZ,
        "upper landing datum mismatch",
      );
  }
  demand(
    a.supports.some((s) => s.kind === "lower-landing") &&
      a.supports.some((s) => s.kind === "upper-landing"),
    "both native landings required",
  );
  const lim = a.limits;
  demand(
    lim &&
      [lim.maxRiseM, lim.maxDropM, lim.maxAdvanceM, lim.maxLiftM].every(
        (v) => finite(v) && v > 0,
      ) &&
      lim.maxRiseM <= 0.25 &&
      lim.maxDropM <= 0.25 &&
      lim.maxAdvanceM <= 0.75 &&
      lim.maxLiftM <= 0.4,
    "unsupported step limits",
  );
  demand(
    Array.isArray(a.steps) &&
      a.steps.length > 0 &&
      a.steps.length <= STAIR_LIMITS.steps &&
      new Set(a.steps.map((s) => s.id)).size === a.steps.length,
    "step budget/identity",
  );
  for (const step of a.steps) {
    const from = supports.get(step.fromSupportId),
      to = supports.get(step.toSupportId);
    demand(
      id(step.id) &&
        from &&
        to &&
        from.neighbours.includes(to.id) &&
        validBounds(step.fromBoundsM, 2) &&
        point(step.advanceM, 2) &&
        (step.advanceM[0] === 0) !== (step.advanceM[1] === 0) &&
        finite(step.clearanceZM),
      "invalid adjacent step envelope",
    );
    demand(
      containsBox(from.boundsM, step.fromBoundsM) &&
        containsBox(to.boundsM, translated(step.fromBoundsM, step.advanceM)),
      "step endpoints lack actual support",
    );
    demand(
      Math.abs(to.topZM - from.topZM) > EPS &&
        to.topZM - from.topZM <= lim.maxRiseM &&
        from.topZM - to.topZM <= lim.maxDropM &&
        Math.hypot(...step.advanceM) <= lim.maxAdvanceM &&
        step.clearanceZM >= Math.max(from.topZM, to.topZM) &&
        step.clearanceZM - Math.min(from.topZM, to.topZM) <= lim.maxLiftM,
      "step rise/drop/lift/advance exceeds bound",
    );
    const target = translated(step.fromBoundsM, step.advanceM),
      travel = {
        min: step.fromBoundsM.min.map((v, i) =>
          Math.min(v, target.min[i]),
        ) as StairPoint2,
        max: step.fromBoundsM.max.map((v, i) =>
          Math.max(v, target.max[i]),
        ) as StairPoint2,
      };
    demand(
      clearCapsuleEnvelope(
        step.fromBoundsM,
        from.topZM,
        step.clearanceZM,
        a.body,
        a.solids,
      ) &&
        clearCapsuleEnvelope(
          travel,
          step.clearanceZM,
          step.clearanceZM,
          a.body,
          a.solids,
        ) &&
        clearCapsuleEnvelope(
          target,
          to.topZM,
          step.clearanceZM,
          a.body,
          a.solids,
        ),
      "native full-body lift/forward/settle collision",
    );
  }
  const visited = new Set(
    a.supports.filter((s) => s.kind === "lower-landing").map((s) => s.id),
  );
  for (let pass = 0; pass < a.supports.length; pass++)
    for (const s of a.supports)
      if (visited.has(s.id))
        for (const n of s.neighbours) {
          const t = supports.get(n)!;
          if (
            t.topZM === s.topZM ||
            a.steps.some(
              (e) =>
                (e.fromSupportId === s.id && e.toSupportId === n) ||
                (e.toSupportId === s.id && e.fromSupportId === n),
            )
          )
            visited.add(n);
        }
  demand(
    a.supports
      .filter((s) => s.kind === "upper-landing")
      .every((s) => visited.has(s.id)),
    "upper landing has no qualified supported step route",
  );
  freeze(a);
  return (i: StairInstallation): CompiledStairWalkSurface => {
    demand(
      id(i.instanceId) &&
        id(i.stairId) &&
        id(i.lowerDeckId) &&
        id(i.upperDeckId) &&
        i.lowerDeckId !== i.upperDeckId &&
        point(i.originM, 3) &&
        [0, 1, 2, 3].includes(i.quarterTurns),
      "invalid installed frame/identity",
    );
    tick(i.instanceRevision);
    tick(i.stairRevision);
    demand(
      i.instanceRevision > 0n && i.stairRevision > 0n,
      "positive installed revisions required",
    );
    demand(
      i.parts.length === a.parts.length &&
        i.apertures.length === a.apertures.length &&
        i.supports.length === a.supports.length,
      "actual installation coverage mismatch",
    );
    const ids = [
      i.instanceId,
      i.stairId,
      i.lowerDeckId,
      i.upperDeckId,
      ...i.parts.map((p) => p.id),
      ...i.apertures.map((p) => p.id),
      ...i.supports.map((p) => p.id),
    ];
    demand(
      ids.every(id) && new Set(ids).size === ids.length,
      "installed identities overlap",
    );
    demand(
      id(i.policy.id) &&
        finite(i.policy.walkMps) &&
        i.policy.walkMps > 0 &&
        i.policy.walkMps <= 4 &&
        finite(i.policy.verticalMps) &&
        i.policy.verticalMps > 0 &&
        i.policy.verticalMps <= 2,
      "invalid trusted motion policy",
    );
    const q = i.quarterTurns,
      o = i.originM;
    const tr = (p: TraversalPoint3): TraversalPoint3 => {
      const xy = transformPoint([p[0], p[1]], q);
      return [xy[0] + o[0], xy[1] + o[1], p[2] + o[2]];
    };
    for (const p of a.parts) {
      const installed = i.parts.filter((t) => t.sourcePartId === p.id);
      demand(installed.length === 1, "missing/duplicate native part");
      const t = installed[0];
      demand(
        t.sourceId === p.sourceId &&
          t.nodePrefix === p.nodePrefix &&
          t.sha256 === delivery.sources[p.sourceId].sha256 &&
          same(t.originM, tr(p.originM)) &&
          t.quarterTurns === (p.quarterTurns + q) % 4,
        "actual native part transform/hash differs",
      );
    }
    for (const p of a.apertures) {
      const found = i.apertures.filter((t) => t.sourceApertureId === p.id);
      demand(
        found.length === 1 &&
          found[0].role === p.role &&
          found[0].state === "physical-opening" &&
          same(found[0].boundsM, transformBounds3(p.boundsM, q, o)),
        "actual aperture missing/covered/changed",
      );
    }
    const mapping = new Map(i.supports.map((p) => [p.sourceSupportId, p.id]));
    demand(
      mapping.size === a.supports.length &&
        a.supports.every((s) => mapping.has(s.id)),
      "actual support binding mismatch",
    );
    const partId = (source: string) =>
      i.parts.find((p) => p.sourcePartId === source)!.id;
    const out: CompiledStairWalkSurface = {
      instanceId: i.instanceId,
      stairId: i.stairId,
      instanceRevision: i.instanceRevision,
      stairRevision: i.stairRevision,
      proofHash: digest({
        audit: delivery.auditSha256,
        installation: {
          ...i,
          instanceRevision: i.instanceRevision.toString(),
          stairRevision: i.stairRevision.toString(),
          parts: [...i.parts].sort((a, b) => compareText(a.id, b.id)),
          apertures: [...i.apertures].sort((a, b) => compareText(a.id, b.id)),
          supports: [...i.supports].sort((a, b) => compareText(a.id, b.id)),
        },
      }),
      body: { ...a.body },
      lowerDeckId: i.lowerDeckId,
      upperDeckId: i.upperDeckId,
      policy: { ...i.policy },
      supports: a.supports.map((s) => ({
        ...s,
        id: mapping.get(s.id)!,
        partId: partId(s.partId),
        boundsM: transformBounds2(s.boundsM, q, o),
        topZM: s.topZM + o[2],
        neighbours: s.neighbours.map((n) => mapping.get(n)!),
      })),
      solids: a.solids.map((s) => ({
        ...s,
        id: `${partId(s.partId)}:${s.id}`,
        partId: partId(s.partId),
        boundsM: transformBounds3(s.boundsM, q, o),
      })),
      steps: a.steps.map((s) => ({
        ...s,
        id: `${i.stairId}:${s.id}`,
        fromSupportId: mapping.get(s.fromSupportId)!,
        toSupportId: mapping.get(s.toSupportId)!,
        fromBoundsM: transformBounds2(s.fromBoundsM, q, o),
        advanceM: transformPoint(s.advanceM, q),
        clearanceZM: s.clearanceZM + o[2],
      })),
    };
    demand(
      out.supports.every((s) => validBounds(s.boundsM, 2) && finite(s.topZM)) &&
        out.solids.every((s) => validBounds(s.boundsM, 3)),
      "transformed geometry exceeds bounds",
    );
    branded.add(out);
    return freeze(out);
  };
}

export interface StairWalkIntent {
  sequence: bigint;
  dx: number;
  dy: number;
}
export interface StairStepProgress {
  stepId: string;
  reverse: boolean;
  launchM: TraversalPoint3;
  distanceM: number;
  returning: boolean;
}
export interface StairWalkState {
  walkId: string;
  actorId: string;
  instanceId: string;
  stairId: string;
  visitId: string;
  sourceDeckId: string;
  proofHash: string;
  supportId: string;
  positionM: TraversalPoint3;
  inputSequence: bigint;
  input: { dx: number; dy: number; receivedMicros: bigint } | null;
  lastTick: bigint;
  revision: bigint;
  enteredFlight: boolean;
  phase:
    "walking" | "stopped" | "stepping" | "returning" | "blocked" | "exited";
  pending: StairStepProgress | null;
}
export interface StairReservation {
  walkId: string;
  visitId: string;
  actorId: string;
  instanceId: string;
  stairId: string;
  proofHash: string;
}
export interface StairWalkAuthority {
  actorPresent: boolean;
  admitted: boolean;
  connected: boolean;
  mayWalk: boolean;
  instanceRevision: bigint;
  stairRevision: bigint;
  nowMicros: bigint;
  receivedMicros: bigint;
  reservation: StairReservation | null;
  /** Other actual accepted bodies/native moving obstacles, supplied by authority. */
  occupied: readonly TraversalBounds3[];
}
export interface StairWalkDecision {
  state: StairWalkState;
  exit: { deckId: string; positionM: TraversalPoint3 } | null;
  releaseReservation: boolean;
}
function accepted(s: CompiledStairWalkSurface) {
  demand(branded.has(s), "server-compiled native stair required");
}
function standing(
  s: CompiledStairWalkSurface,
  support: NativeStairSupport,
  p: TraversalPoint3,
) {
  return (
    p[2] === support.topZM &&
    contains(support.boundsM, [p[0], p[1]]) &&
    swept(p, p, s.body, s.solids)
  );
}
export function beginStairWalk(
  s: CompiledStairWalkSurface,
  actor: {
    /** Fresh server UUID for this continuous stair occupancy. */
    walkId: string;
    actorId: string;
    instanceId: string;
    visitId: string;
    deckId: string;
    positionM: TraversalPoint3;
    inputSequence: bigint;
    admitted: boolean;
    connected: boolean;
    standing: boolean;
  },
  currentTick: bigint,
): { state: StairWalkState; reservation: StairReservation } {
  accepted(s);
  tick(currentTick);
  tick(actor.inputSequence);
  demand(
    id(actor.walkId) &&
      id(actor.actorId) &&
      id(actor.visitId) &&
      actor.instanceId === s.instanceId &&
      actor.admitted === true &&
      actor.connected === true &&
      actor.standing === true &&
      point(actor.positionM, 3),
    "admitted standing actor required",
  );
  const kind =
    actor.deckId === s.lowerDeckId
      ? "lower-landing"
      : actor.deckId === s.upperDeckId
        ? "upper-landing"
        : null;
  const support = s.supports.find(
    (p) => p.kind === kind && standing(s, p, actor.positionM),
  );
  demand(support, "actor outside actual supported landing");
  const state: StairWalkState = {
    walkId: actor.walkId,
    actorId: actor.actorId,
    instanceId: s.instanceId,
    stairId: s.stairId,
    visitId: actor.visitId,
    sourceDeckId: actor.deckId,
    proofHash: s.proofHash,
    supportId: support.id,
    positionM: [...actor.positionM],
    inputSequence: actor.inputSequence,
    input: null,
    lastTick: currentTick,
    revision: 1n,
    enteredFlight: false,
    phase: "stopped",
    pending: null,
  };
  return {
    state,
    reservation: {
      walkId: actor.walkId,
      visitId: actor.visitId,
      actorId: actor.actorId,
      instanceId: s.instanceId,
      stairId: s.stairId,
      proofHash: s.proofHash,
    },
  };
}
function route(s: CompiledStairWalkSurface, p: StairStepProgress) {
  const step = s.steps.find((e) => e.id === p.stepId);
  demand(step, "unknown active step");
  const from = s.supports.find(
      (a) => a.id === (p.reverse ? step.toSupportId : step.fromSupportId),
    )!,
    to = s.supports.find(
      (a) => a.id === (p.reverse ? step.fromSupportId : step.toSupportId),
    )!;
  const advance: StairPoint2 = p.reverse
    ? [-step.advanceM[0], -step.advanceM[1]]
    : [...step.advanceM];
  const bounds = p.reverse
    ? translated(step.fromBoundsM, step.advanceM)
    : step.fromBoundsM;
  demand(
    point(p.launchM, 3) &&
      p.launchM[2] === from.topZM &&
      contains(bounds, [p.launchM[0], p.launchM[1]]) &&
      finite(p.distanceM) &&
      p.distanceM >= 0 &&
      typeof p.returning === "boolean" &&
      typeof p.reverse === "boolean",
    "invalid active step pose",
  );
  const target: TraversalPoint3 = [
    p.launchM[0] + advance[0],
    p.launchM[1] + advance[1],
    to.topZM,
  ];
  const points: TraversalPoint3[] = [
    p.launchM,
    [p.launchM[0], p.launchM[1], step.clearanceZM],
    [target[0], target[1], step.clearanceZM],
    target,
  ];
  const lengths = points.slice(1).map((b, i) => distance(points[i], b)),
    total = lengths.reduce((a, b) => a + b, 0);
  demand(
    p.distanceM <= total + EPS,
    "active step progress exceeds qualified route",
  );
  return { from, to, advance, points, lengths, total };
}
function at(
  points: readonly TraversalPoint3[],
  lengths: readonly number[],
  distanceM: number,
): TraversalPoint3 {
  let left = distanceM;
  for (let i = 0; i < lengths.length; i++) {
    if (lengths[i] > EPS && left <= lengths[i])
      return points[i].map(
        (v, k) => v + ((points[i + 1][k] - v) * left) / lengths[i],
      ) as TraversalPoint3;
    left -= lengths[i];
  }
  return [...points[points.length - 1]];
}
function interval(
  b: StairBounds2,
  start: StairPoint2,
  delta: StairPoint2,
): [number, number] | null {
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 2; i++) {
    if (Math.abs(delta[i]) < EPS) {
      if (start[i] < b.min[i] - EPS || start[i] > b.max[i] + EPS) return null;
      continue;
    }
    const a = (b.min[i] - start[i]) / delta[i],
      c = (b.max[i] - start[i]) / delta[i];
    lo = Math.max(lo, Math.min(a, c));
    hi = Math.min(hi, Math.max(a, c));
  }
  return lo <= hi + EPS ? [lo, hi] : null;
}
function planarSupport(
  s: CompiledStairWalkSurface,
  source: NativeStairSupport,
  a: TraversalPoint3,
  b: TraversalPoint3,
): NativeStairSupport | null {
  const reached = new Set([source.id]);
  for (let n = 0; n < s.supports.length; n++)
    for (const p of s.supports)
      if (reached.has(p.id))
        for (const neighbour of p.neighbours) {
          const other = s.supports.find((t) => t.id === neighbour)!;
          if (other.topZM === source.topZM) reached.add(other.id);
        }
  const candidates = s.supports.filter((p) => reached.has(p.id)),
    start: StairPoint2 = [a[0], a[1]],
    delta: StairPoint2 = [b[0] - a[0], b[1] - a[1]];
  const intervals = candidates
    .map((p) => interval(p.boundsM, start, delta))
    .filter((v): v is [number, number] => !!v)
    .sort((a, b) => a[0] - b[0]);
  let covered = 0;
  for (const [lo, hi] of intervals) {
    if (lo > covered + EPS) return null;
    covered = Math.max(covered, hi);
  }
  if (covered < 1 - EPS) return null;
  return candidates.find((p) => contains(p.boundsM, [b[0], b[1]])) ?? null;
}
function verifyState(s: CompiledStairWalkSurface, state: StairWalkState) {
  demand(
    id(state.walkId) &&
      id(state.actorId) &&
      id(state.visitId) &&
      state.instanceId === s.instanceId &&
      state.stairId === s.stairId &&
      state.proofHash === s.proofHash &&
      [s.lowerDeckId, s.upperDeckId].includes(state.sourceDeckId) &&
      point(state.positionM, 3) &&
      typeof state.enteredFlight === "boolean" &&
      [
        "walking",
        "stopped",
        "stepping",
        "returning",
        "blocked",
        "exited",
      ].includes(state.phase),
    "invalid persisted stair state",
  );
  tick(state.inputSequence);
  if (state.input) {
    tick(state.input.receivedMicros);
    demand(
      [state.input.dx, state.input.dy].every(
        (v) => Number.isFinite(v) && Math.abs(v) <= 1,
      ),
      "invalid persisted planar intent",
    );
  }
  tick(state.lastTick);
  tick(state.revision);
  const support = s.supports.find((p) => p.id === state.supportId);
  demand(support, "missing actual support");
  if (state.pending) {
    const r = route(s, state.pending);
    demand(
      r.from.id === support.id &&
        same(state.positionM, at(r.points, r.lengths, state.pending.distanceM)),
      "persisted step placement differs",
    );
  } else
    demand(
      standing(s, support, state.positionM),
      "persisted unsupported/intersecting stance",
    );
  return support;
}
/** Pure fixed-tick movement. Individual risers use bounded native-qualified
 * kinematic steps; ordinary planar intent controls walking and continuing each
 * step. Stopping/reversing returns an unfinished step to its last supported pose.
 * It never automatically traverses the entire flight or writes client elevation. */
export function stepStairWalk(
  s: CompiledStairWalkSurface,
  state: StairWalkState,
  intent: StairWalkIntent,
  nextTick: bigint,
  authority: StairWalkAuthority,
): StairWalkDecision {
  accepted(s);
  const support = verifyState(s, state);
  tick(nextTick);
  tick(intent.sequence);
  tick(authority.nowMicros);
  tick(authority.receivedMicros);
  tick(authority.instanceRevision);
  tick(authority.stairRevision);
  demand(
    [intent.dx, intent.dy].every((v) => Number.isFinite(v) && Math.abs(v) <= 1),
    "invalid planar intent",
  );
  for (const key of [
    "actorPresent",
    "admitted",
    "connected",
    "mayWalk",
  ] as const)
    demand(typeof authority[key] === "boolean", "invalid actor authority");
  demand(
    authority.occupied.length <= STAIR_LIMITS.occupants &&
      authority.occupied.every((b) => validBounds(b, 3)),
    "occupied body budget/geometry",
  );
  const result = (
    next: StairWalkState,
    exit: StairWalkDecision["exit"] = null,
  ): StairWalkDecision => ({ state: next, exit, releaseReservation: !!exit });
  if (nextTick <= state.lastTick || state.phase === "exited")
    return result(state);
  const next: StairWalkState = {
    ...state,
    positionM: [...state.positionM],
    pending: state.pending
      ? { ...state.pending, launchM: [...state.pending.launchM] }
      : null,
    lastTick: nextTick,
    revision: state.revision + 1n,
  };
  tick(next.revision);
  const reserved =
    authority.reservation &&
    same(authority.reservation, {
      walkId: state.walkId,
      visitId: state.visitId,
      actorId: state.actorId,
      instanceId: s.instanceId,
      stairId: s.stairId,
      proofHash: s.proofHash,
    });
  if (
    authority.instanceRevision !== s.instanceRevision ||
    authority.stairRevision !== s.stairRevision ||
    !reserved ||
    !authority.actorPresent
  )
    return result({ ...next, phase: "blocked" });
  if (intent.sequence >= state.inputSequence) {
    if (intent.sequence === state.inputSequence && state.input)
      demand(
        intent.dx === state.input.dx &&
          intent.dy === state.input.dy &&
          authority.receivedMicros === state.input.receivedMicros,
        "input sequence reused with different intent/time",
      );
    else {
      demand(
        authority.receivedMicros <= authority.nowMicros,
        "future input receipt",
      );
      next.inputSequence = intent.sequence;
      next.input = {
        dx: intent.dx,
        dy: intent.dy,
        receivedMicros: authority.receivedMicros,
      };
    }
  }
  const fresh =
    !!next.input &&
    authority.nowMicros >= next.input.receivedMicros &&
    authority.nowMicros - next.input.receivedMicros <=
      STAIR_LIMITS.maxIntentAgeMicros;
  const enabled =
    fresh && authority.admitted && authority.connected && authority.mayWalk;
  const norm = Math.max(
      1,
      Math.hypot(next.input?.dx ?? 0, next.input?.dy ?? 0),
    ),
    direction: StairPoint2 = enabled
      ? [next.input!.dx / norm, next.input!.dy / norm]
      : [0, 0];
  const obstacles = [
    ...s.solids,
    ...authority.occupied.map((boundsM) => ({ boundsM })),
  ];
  const finish = (out: StairWalkState): StairWalkDecision => {
    if (!out.pending && out.enteredFlight) {
      const resting = s.supports.find((p) => p.id === out.supportId)!;
      const margin = s.body.radiusM;
      const inside = out.positionM
        .slice(0, 2)
        .every(
          (v, k) =>
            v >= resting.boundsM.min[k] + margin - EPS &&
            v <= resting.boundsM.max[k] - margin + EPS,
        );
      if (
        inside &&
        (resting.kind === "lower-landing" || resting.kind === "upper-landing")
      )
        return result(
          { ...out, phase: "exited" },
          {
            deckId:
              resting.kind === "lower-landing" ? s.lowerDeckId : s.upperDeckId,
            positionM: [...out.positionM],
          },
        );
    }
    return result(out);
  };
  if (next.pending) {
    const p = next.pending,
      r = route(s, p),
      length = Math.hypot(...r.advance),
      drive =
        (direction[0] * r.advance[0] + direction[1] * r.advance[1]) / length;
    if (drive <= EPS) p.returning = true;
    // Returns are physical recovery of one unfinished riser, even after disconnect.
    const sign = p.returning ? -1 : 1;
    let remaining = STAIR_LIMITS.fixedSeconds,
      progress = p.distanceM;
    while (
      remaining > EPS &&
      ((sign > 0 && progress < r.total - EPS) || (sign < 0 && progress > EPS))
    ) {
      let cumulative = 0,
        index = 0;
      for (; index < r.lengths.length; index++) {
        const end = cumulative + r.lengths[index];
        if (
          r.lengths[index] > EPS &&
          (sign > 0
            ? progress < end - EPS && progress >= cumulative - EPS
            : progress > cumulative + EPS && progress <= end + EPS)
        )
          break;
        cumulative = end;
      }
      if (index >= r.lengths.length) break;
      const vertical = r.points[index][2] !== r.points[index + 1][2],
        speed = vertical
          ? s.policy.verticalMps
          : s.policy.walkMps * (p.returning ? 1 : Math.max(0, drive));
      const available =
          sign > 0
            ? cumulative + r.lengths[index] - progress
            : progress - cumulative,
        amount = Math.min(available, speed * remaining),
        candidate = Math.max(0, Math.min(r.total, progress + sign * amount));
      const from = at(r.points, r.lengths, progress),
        to = at(r.points, r.lengths, candidate);
      if (!swept(from, to, s.body, obstacles)) {
        p.distanceM = progress;
        next.positionM = from;
        return result({ ...next, phase: "blocked" });
      }
      progress = candidate;
      remaining -= amount / speed;
      if (amount <= EPS) break;
    }
    p.distanceM = Math.max(0, Math.min(r.total, progress));
    next.positionM = at(r.points, r.lengths, p.distanceM);
    if (
      (p.returning && p.distanceM <= EPS) ||
      (!p.returning && p.distanceM >= r.total - EPS)
    ) {
      const target = p.returning ? r.from : r.to;
      next.positionM = p.returning ? [...p.launchM] : [...r.points[3]];
      demand(
        standing(s, target, next.positionM),
        "step cannot settle on unsupported geometry",
      );
      next.supportId = target.id;
      next.pending = null;
      next.enteredFlight = true;
      next.phase = p.returning ? "stopped" : "walking";
      return finish(next);
    }
    next.phase = p.returning ? "returning" : "stepping";
    return result(next);
  }
  if (Math.hypot(...direction) <= EPS)
    return finish({ ...next, phase: "stopped" });
  const delta: StairPoint2 = [
      direction[0] * s.policy.walkMps * STAIR_LIMITS.fixedSeconds,
      direction[1] * s.policy.walkMps * STAIR_LIMITS.fixedSeconds,
    ],
    xy: StairPoint2 = [state.positionM[0], state.positionM[1]];
  const launches = s.steps
    .flatMap((step) => {
      const reverse = step.toSupportId === support.id;
      if (!reverse && step.fromSupportId !== support.id) return [];
      const advance: StairPoint2 = reverse
        ? [-step.advanceM[0], -step.advanceM[1]]
        : step.advanceM;
      if (direction[0] * advance[0] + direction[1] * advance[1] <= EPS)
        return [];
      const bounds = reverse
          ? translated(step.fromBoundsM, step.advanceM)
          : step.fromBoundsM,
        hit = interval(bounds, xy, delta);
      return hit ? [{ step, reverse, t: Math.max(0, hit[0]) }] : [];
    })
    .sort((a, b) => a.t - b.t || compareText(a.step.id, b.step.id));
  if (launches.length) {
    const launch = launches[0],
      positionM: TraversalPoint3 = [
        xy[0] + delta[0] * launch.t,
        xy[1] + delta[1] * launch.t,
        support.topZM,
      ];
    if (!swept(state.positionM, positionM, s.body, obstacles))
      return result({ ...next, phase: "blocked" });
    next.positionM = positionM;
    next.pending = {
      stepId: launch.step.id,
      reverse: launch.reverse,
      launchM: [...positionM],
      distanceM: 0,
      returning: false,
    };
    next.phase = "stepping";
    return result(next);
  }
  const positionM: TraversalPoint3 = [
      xy[0] + delta[0],
      xy[1] + delta[1],
      support.topZM,
    ],
    target = planarSupport(s, support, state.positionM, positionM);
  if (!target || !swept(state.positionM, positionM, s.body, obstacles))
    return result({ ...next, phase: "blocked" });
  next.supportId = target.id;
  next.positionM = positionM;
  next.phase = "walking";
  return finish(next);
}
