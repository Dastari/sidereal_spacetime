import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { stableStringify, compareText } from "./layout-geometry";
import { transformPoint } from "@sidereal/content/ship-layout";
import type {
  NativeTraversalAudit,
  NativeTraversalDelivery,
  InstalledTraversalPart,
  InstalledTraversalAperture,
  TraversalPoint3,
  TraversalBounds3,
} from "@sidereal/content/construction-traversal";

export const TRAVERSAL_LIMITS = Object.freeze({
  parts: 128,
  pathPoints: 16,
  reservations: 64,
  coordinateM: 512,
  fixedSeconds: 0.05,
});
const EPS = 1e-8;
const digestBytes = (value: Uint8Array) => bytesToHex(sha256(value));
const digest = (value: unknown) =>
  digestBytes(new TextEncoder().encode(stableStringify(value)));
const equal = (a: unknown, b: unknown) =>
  stableStringify(a) === stableStringify(b);
function requireTraversal(ok: unknown, message: string): asserts ok {
  if (!ok) throw Error("Construction traversal: " + message);
}
const validId = (id: unknown) =>
  typeof id === "string" && /^[a-zA-Z0-9:_./-]{1,128}$/.test(id);
const validSha = (hash: unknown) =>
  typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash);
const number = (v: unknown, low: number, high: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= low && v <= high;
const point = (p: unknown): p is TraversalPoint3 =>
  Array.isArray(p) &&
  p.length === 3 &&
  p.every((n) =>
    number(n, -TRAVERSAL_LIMITS.coordinateM, TRAVERSAL_LIMITS.coordinateM),
  );
function validBox(box: TraversalBounds3) {
  return (
    box &&
    point(box.min) &&
    point(box.max) &&
    box.min.every((n, i) => n < box.max[i])
  );
}
function contains(outer: TraversalBounds3, inner: TraversalBounds3) {
  return inner.min.every(
    (n, i) => n >= outer.min[i] - EPS && inner.max[i] <= outer.max[i] + EPS,
  );
}
function overlap(a: TraversalBounds3, b: TraversalBounds3) {
  return a.min.every((n, i) => n < b.max[i] - EPS && a.max[i] > b.min[i] + EPS);
}
function bodySweep(
  a: TraversalPoint3,
  b: TraversalPoint3,
  body: NativeTraversalAudit["body"],
): TraversalBounds3 {
  return {
    min: [
      Math.min(a[0], b[0]) - body.radiusM,
      Math.min(a[1], b[1]) - body.radiusM,
      Math.min(a[2], b[2]),
    ],
    max: [
      Math.max(a[0], b[0]) + body.radiusM,
      Math.max(a[1], b[1]) + body.radiusM,
      Math.max(a[2], b[2]) + body.heightM,
    ],
  };
}
const distance = (a: TraversalPoint3, b: TraversalPoint3) =>
  Math.hypot(...a.map((n, i) => n - b[i]));
function tick(value: bigint) {
  requireTraversal(
    typeof value === "bigint" && value >= 0n && value <= 18446744073709551615n,
    "invalid fixed tick",
  );
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}

export interface TraversalInstallation {
  instanceId: string;
  linkId: string;
  instanceRevision: bigint;
  linkRevision: bigint;
  originM: TraversalPoint3;
  quarterTurns: number;
  lower: { deckId: string; originZ: number; walkingZ: number };
  upper: { deckId: string; originZ: number; walkingZ: number };
  parts: readonly InstalledTraversalPart[];
  apertures: readonly InstalledTraversalAperture[];
  /** Explicit trusted manual-review tuning; not a native actuator rating. */
  policy: { id: string; metresPerSecond: number };
}
export interface CompiledTraversalLink {
  readonly id: string;
  readonly instanceId: string;
  readonly instanceRevision: bigint;
  readonly revision: bigint;
  readonly proofHash: string;
  readonly auditSha256: string;
  readonly body: NativeTraversalAudit["body"];
  readonly lower: {
    deckId: string;
    walkingZ: number;
    anchorM: TraversalPoint3;
    freeBoundsM: TraversalBounds3;
  };
  readonly upper: {
    deckId: string;
    walkingZ: number;
    anchorM: TraversalPoint3;
    freeBoundsM: TraversalBounds3;
  };
  readonly pathM: readonly TraversalPoint3[];
  readonly corridorFreeBoundsM: readonly TraversalBounds3[];
  readonly metresPerSecond: number;
}
const acceptedLinks = new WeakSet<CompiledTraversalLink>();
function accepted(link: CompiledTraversalLink) {
  requireTraversal(
    acceptedLinks.has(link),
    "server-compiled native link required",
  );
}

/** Offline/native publication validator. Full source bytes are verified here;
 * no source binary is needed by the separate compact runtime constructor. */
export function createNativeTraversalCompiler(input: {
  delivery: NativeTraversalDelivery;
  audit: Uint8Array;
  sources: Readonly<Record<string, Uint8Array>>;
}) {
  const compile = createPublishedNativeTraversalCompiler(input);
  for (const [id, pin] of Object.entries(input.delivery.sources))
    requireTraversal(
      input.sources[id] && digestBytes(input.sources[id]) === pin.sha256,
      "native source hash mismatch",
    );
  return compile;
}

/** Compact server-content constructor. Both expected delivery registry and raw
 * audit bytes must come from generated, build-verified publication constants.
 * Neither argument is a reducer payload or client certification. The publication
 * installer must verify every source GLB; actual installed parts/apertures are
 * still exhaustively checked by the returned compiler. No built-in qualification
 * is registered here, and staged/unrecognized audit bytes always reject. */
export function createPublishedNativeTraversalCompiler(input: {
  delivery: NativeTraversalDelivery;
  audit: Uint8Array;
}) {
  const delivery = input.delivery;
  requireTraversal(
    delivery.status === "native-geometry-qualified",
    "native delivery is unqualified/staged",
  );
  requireTraversal(
    validId(delivery.adapterId) &&
      validId(delivery.revision) &&
      validSha(delivery.auditSha256),
    "invalid trusted delivery pin",
  );
  requireTraversal(
    digestBytes(input.audit) === delivery.auditSha256,
    "native audit hash mismatch",
  );
  const audit = JSON.parse(
    new TextDecoder().decode(input.audit),
  ) as NativeTraversalAudit;
  requireTraversal(
    audit.schema === "sidereal.native-traversal-audit.v1" &&
      audit.adapterId === delivery.adapterId &&
      audit.revision === delivery.revision,
    "unrecognized native audit",
  );
  requireTraversal(
    audit.qualification?.nativeMeshMatch === true &&
      audit.qualification.physicalApertures === true &&
      audit.qualification.capsuleSweepClear === true &&
      audit.qualification.guardedLandings === true,
    "native physical aperture/path qualification required",
  );
  const sourcePins = Object.entries(delivery.sources);
  requireTraversal(
    sourcePins.length > 0 && sourcePins.length <= TRAVERSAL_LIMITS.parts,
    "native source budget",
  );
  for (const [id, pin] of sourcePins)
    requireTraversal(
      validId(id) && validSha(pin.sha256),
      "invalid native source pin",
    );
  requireTraversal(
    audit.body &&
      number(audit.body.radiusM, 0.1, 1) &&
      number(audit.body.heightM, audit.body.radiusM * 2, 3),
    "invalid qualified actor body",
  );
  requireTraversal(
    Array.isArray(audit.pathM) &&
      audit.pathM.length >= 2 &&
      audit.pathM.length <= TRAVERSAL_LIMITS.pathPoints &&
      audit.pathM.every(point),
    "invalid native path",
  );
  requireTraversal(
    Array.isArray(audit.corridorFreeBoundsM) &&
      audit.corridorFreeBoundsM.length === audit.pathM.length - 1 &&
      audit.corridorFreeBoundsM.every(validBox),
    "one qualified free box per path segment required",
  );
  requireTraversal(
    audit.decks &&
      number(audit.decks.lower.originZ, -512, 512) &&
      number(audit.decks.lower.walkingZ, audit.decks.lower.originZ, 512) &&
      number(
        audit.decks.upper.originZ,
        audit.decks.lower.walkingZ + 0.5,
        512,
      ) &&
      number(audit.decks.upper.walkingZ, audit.decks.upper.originZ, 512),
    "invalid native deck datums",
  );
  for (const [side, index] of [
    ["lower", 0],
    ["upper", audit.pathM.length - 1],
  ] as const) {
    const landing = audit.landings?.[side];
    requireTraversal(
      landing &&
        point(landing.anchorM) &&
        validBox(landing.freeBoundsM) &&
        equal(landing.anchorM, audit.pathM[index]) &&
        landing.anchorM[2] === audit.decks[side].walkingZ &&
        contains(
          landing.freeBoundsM,
          bodySweep(landing.anchorM, landing.anchorM, audit.body),
        ),
      "invalid native landing",
    );
  }
  requireTraversal(
    Array.isArray(audit.apertures) &&
      audit.apertures.length === 2 &&
      new Set(audit.apertures.map((a) => a.role)).size === 2 &&
      audit.apertures.every(
        (a) =>
          validId(a.id) &&
          ["lower-roof", "upper-floor"].includes(a.role) &&
          validBox(a.boundsM),
      ),
    "both physical slab apertures required",
  );
  requireTraversal(
    Array.isArray(audit.parts) &&
      audit.parts.length > 0 &&
      audit.parts.length <= TRAVERSAL_LIMITS.parts &&
      audit.parts.every(
        (p) =>
          validId(p.id) &&
          delivery.sources[p.sourceId] &&
          validId(p.nodePrefix) &&
          point(p.originM) &&
          [0, 1, 2, 3].includes(p.quarterTurns),
      ),
    "invalid native part inventory",
  );
  const nativeIds = [
    ...audit.parts.map((p) => p.id),
    ...audit.apertures.map((a) => a.id),
  ];
  requireTraversal(
    new Set(nativeIds).size === nativeIds.length,
    "duplicate native source identity",
  );
  let total = 0;
  for (let i = 1; i < audit.pathM.length; i++) {
    const a = audit.pathM[i - 1],
      b = audit.pathM[i],
      sweep = bodySweep(a, b, audit.body);
    const segment = distance(a, b);
    total += segment;
    requireTraversal(
      segment > EPS && total <= 64 && b[2] >= a[2],
      "invalid native path length or direction",
    );
    requireTraversal(
      contains(audit.corridorFreeBoundsM[i - 1], sweep),
      "native segment body leaves qualified free corridor",
    );
    for (const aperture of audit.apertures)
      if (
        sweep.min[2] < aperture.boundsM.max[2] - EPS &&
        sweep.max[2] > aperture.boundsM.min[2] + EPS
      ) {
        requireTraversal(
          [0, 1].every(
            (k) =>
              sweep.min[k] >= aperture.boundsM.min[k] - EPS &&
              sweep.max[k] <= aperture.boundsM.max[k] + EPS,
          ),
          "body crosses intact slab outside physical aperture",
        );
      }
  }
  const floorAperture = audit.apertures.find((a) => a.role === "upper-floor")!;
  const roofAperture = audit.apertures.find((a) => a.role === "lower-roof")!;
  requireTraversal(
    floorAperture.boundsM.min[2] === audit.decks.upper.originZ &&
      floorAperture.boundsM.max[2] === audit.decks.upper.walkingZ &&
      roofAperture.boundsM.min[2] >=
        audit.decks.lower.walkingZ + audit.body.heightM &&
      roofAperture.boundsM.max[2] <= audit.decks.upper.originZ,
    "physical apertures do not match actual deck slabs",
  );
  const sourceDefinitions = JSON.parse(
    JSON.stringify(delivery.sources),
  ) as NativeTraversalDelivery["sources"];
  const auditSha256 = delivery.auditSha256;
  return (installation: TraversalInstallation): CompiledTraversalLink => {
    requireTraversal(
      validId(installation.instanceId) &&
        validId(installation.linkId) &&
        point(installation.originM) &&
        [0, 1, 2, 3].includes(installation.quarterTurns),
      "invalid installed link frame",
    );
    tick(installation.instanceRevision);
    tick(installation.linkRevision);
    requireTraversal(
      installation.instanceRevision > 0n && installation.linkRevision > 0n,
      "positive installed revisions required",
    );
    const transform = (p: TraversalPoint3): TraversalPoint3 => {
      const q = transformPoint([p[0], p[1]], installation.quarterTurns);
      return [
        q[0] + installation.originM[0],
        q[1] + installation.originM[1],
        p[2] + installation.originM[2],
      ];
    };
    const box = (b: TraversalBounds3): TraversalBounds3 => {
      const corners = [
        transform(b.min),
        transform(b.max),
        transform([b.min[0], b.max[1], b.min[2]]),
        transform([b.max[0], b.min[1], b.max[2]]),
      ];
      return {
        min: [0, 1, 2].map((k) =>
          Math.min(...corners.map((p) => p[k])),
        ) as TraversalPoint3,
        max: [0, 1, 2].map((k) =>
          Math.max(...corners.map((p) => p[k])),
        ) as TraversalPoint3,
      };
    };
    requireTraversal(
      validId(installation.lower.deckId) &&
        validId(installation.upper.deckId) &&
        installation.lower.deckId !== installation.upper.deckId,
      "two distinct installed decks required",
    );
    for (const side of ["lower", "upper"] as const)
      requireTraversal(
        installation[side].originZ ===
          audit.decks[side].originZ + installation.originM[2] &&
          installation[side].walkingZ ===
            audit.decks[side].walkingZ + installation.originM[2],
        "installed deck datum differs from native delivery",
      );
    requireTraversal(
      Array.isArray(installation.parts) &&
        installation.parts.length === audit.parts.length &&
        Array.isArray(installation.apertures) &&
        installation.apertures.length === audit.apertures.length,
      "exhaustive installed parts and apertures required",
    );
    const actualIds = [
      ...installation.parts.map((p) => p.id),
      ...installation.apertures.map((p) => p.id),
    ];
    requireTraversal(
      actualIds.every(validId) && new Set(actualIds).size === actualIds.length,
      "duplicate installed identity",
    );
    for (const expected of audit.parts) {
      const found = installation.parts.filter(
        (p) => p.sourcePartId === expected.id,
      );
      requireTraversal(
        found.length === 1,
        "missing/duplicate installed source part",
      );
      const p = found[0];
      requireTraversal(
        p.sourceId === expected.sourceId &&
          p.sha256 === sourceDefinitions[expected.sourceId].sha256 &&
          p.nodePrefix === expected.nodePrefix &&
          equal(p.originM, transform(expected.originM)) &&
          p.quarterTurns ===
            (expected.quarterTurns + installation.quarterTurns) % 4,
        "installed native part changed",
      );
    }
    for (const expected of audit.apertures) {
      const found = installation.apertures.filter(
        (a) => a.sourceApertureId === expected.id,
      );
      requireTraversal(
        found.length === 1 &&
          found[0].state === "physical-opening" &&
          found[0].role === expected.role &&
          equal(found[0].boundsM, box(expected.boundsM)),
        "missing or covered physical aperture",
      );
    }
    requireTraversal(
      validId(installation.policy.id) &&
        number(installation.policy.metresPerSecond, 0.1, 4),
      "invalid trusted manual motion policy",
    );
    const result: CompiledTraversalLink = {
      id: installation.linkId,
      instanceId: installation.instanceId,
      instanceRevision: installation.instanceRevision,
      revision: installation.linkRevision,
      auditSha256,
      proofHash: digest({
        auditSha256,
        ...installation,
        parts: [...installation.parts].sort((a, b) =>
          compareText(a.sourcePartId, b.sourcePartId),
        ),
        apertures: [...installation.apertures].sort((a, b) =>
          compareText(a.sourceApertureId, b.sourceApertureId),
        ),
        instanceRevision: String(installation.instanceRevision),
        linkRevision: String(installation.linkRevision),
      }),
      body: { ...audit.body },
      lower: {
        deckId: installation.lower.deckId,
        walkingZ: installation.lower.walkingZ,
        anchorM: transform(audit.landings.lower.anchorM),
        freeBoundsM: box(audit.landings.lower.freeBoundsM),
      },
      upper: {
        deckId: installation.upper.deckId,
        walkingZ: installation.upper.walkingZ,
        anchorM: transform(audit.landings.upper.anchorM),
        freeBoundsM: box(audit.landings.upper.freeBoundsM),
      },
      pathM: audit.pathM.map(transform),
      corridorFreeBoundsM: audit.corridorFreeBoundsM.map(box),
      metresPerSecond: installation.policy.metresPerSecond,
    };
    requireTraversal(
      result.pathM.every(point) &&
        [
          result.lower.freeBoundsM,
          result.upper.freeBoundsM,
          ...result.corridorFreeBoundsM,
        ].every(validBox),
      "transformed native path exceeds bounds",
    );
    acceptedLinks.add(result);
    return freeze(result);
  };
}

/** All actor fields come from private authoritative rows, never command coordinates. */
export interface TraversalActorSnapshot {
  id: string;
  instanceId: string;
  deckId: string;
  visitId: string;
  positionM: TraversalPoint3;
  locationRevision: bigint;
  admitted: boolean;
  connected: boolean;
  mayTraverse: boolean;
  standing: boolean;
}
export interface BeginTraversalRequest {
  linkId: string;
  expectedVisitId: string;
  expectedLocationRevision: bigint;
  expectedInstanceRevision: bigint;
  expectedLinkRevision: bigint;
  operationId: string;
}
export interface TraversalReservation {
  linkId: string;
  instanceId: string;
  traversalId: string;
  actorId: string;
  proofHash: string;
  boundsM: TraversalBounds3[];
}
export interface TraversalState {
  id: string;
  actorId: string;
  instanceId: string;
  linkId: string;
  visitId: string;
  proofHash: string;
  sourceDeckId: string;
  destinationDeckId: string;
  startPositionM: TraversalPoint3;
  distanceM: number;
  mode: "outbound" | "returning";
  phase:
    | "approaching"
    | "transit"
    | "returning"
    | "blocked"
    | "arrived"
    | "cancelled";
  interruption:
    | ""
    | "cancelled"
    | "access-lost"
    | "disconnected"
    | "actor-unavailable"
    | "forward-obstructed"
    | "geometry-changed"
    | "reservation-lost"
    | "source-blocked";
  startedTick: bigint;
  lastTick: bigint;
  revision: bigint;
}
export interface TraversalBeginReceipt {
  actorId: string;
  operationId: string;
  requestHash: string;
  traversalId: string;
}
export type BeginTraversalResult =
  | { replay: true; receipt: TraversalBeginReceipt }
  | {
      replay: false;
      receipt: TraversalBeginReceipt;
      state: TraversalState;
      reservation: TraversalReservation;
    };
function route(
  link: CompiledTraversalLink,
  state: Pick<
    TraversalState,
    "sourceDeckId" | "destinationDeckId" | "startPositionM"
  >,
) {
  const up = state.sourceDeckId === link.lower.deckId;
  requireTraversal(
    (up || state.sourceDeckId === link.upper.deckId) &&
      state.destinationDeckId === (up ? link.upper.deckId : link.lower.deckId),
    "invalid traversal deck pair",
  );
  const from = up ? link.lower : link.upper,
    to = up ? link.upper : link.lower;
  requireTraversal(
    point(state.startPositionM) &&
      state.startPositionM[2] === from.walkingZ &&
      contains(
        from.freeBoundsM,
        bodySweep(state.startPositionM, from.anchorM, link.body),
      ),
    "actor outside protected native landing",
  );
  const points = [
    state.startPositionM,
    ...(up ? link.pathM : [...link.pathM].reverse()),
  ];
  const lengths = points.slice(1).map((p, i) => distance(points[i], p));
  return {
    from,
    to,
    points,
    lengths,
    approachM: lengths[0],
    lengthM: lengths.reduce((n, v) => n + v, 0),
  };
}
function reservation(
  link: CompiledTraversalLink,
  actorId: string,
  traversalId: string,
): TraversalReservation {
  return {
    linkId: link.id,
    instanceId: link.instanceId,
    actorId,
    traversalId,
    proofHash: link.proofHash,
    boundsM: [
      link.lower.freeBoundsM,
      link.upper.freeBoundsM,
      ...link.corridorFreeBoundsM,
    ].map((b) => ({ min: [...b.min], max: [...b.max] })),
  };
}
/** Derived reservation footprint; parent stores this exact result and compares
 * other actual actor bodies/reservations before admission and each fixed tick. */
export function traversalReservationFor(
  link: CompiledTraversalLink,
  actorId: string,
  traversalId: string,
): TraversalReservation {
  accepted(link);
  requireTraversal(
    validId(actorId) && validId(traversalId),
    "invalid reservation holder",
  );
  return reservation(link, actorId, traversalId);
}

export function traversalReservationConflicts(
  candidate: TraversalReservation,
  current: readonly TraversalReservation[],
) {
  requireTraversal(
    current.length <= TRAVERSAL_LIMITS.reservations,
    "reservation work budget exceeded",
  );
  for (const r of [candidate, ...current])
    requireTraversal(
      validId(r.linkId) &&
        validId(r.instanceId) &&
        validId(r.actorId) &&
        validId(r.traversalId) &&
        validSha(r.proofHash) &&
        Array.isArray(r.boundsM) &&
        r.boundsM.length > 0 &&
        r.boundsM.length <= TRAVERSAL_LIMITS.pathPoints + 1 &&
        r.boundsM.every(validBox),
      "invalid reservation",
    );
  return current.some(
    (r) =>
      r.actorId === candidate.actorId ||
      (r.instanceId === candidate.instanceId &&
        (r.linkId === candidate.linkId ||
          r.boundsM.some((a) => candidate.boundsM.some((b) => overlap(a, b))))),
  );
}
export function beginTraversal(
  link: CompiledTraversalLink,
  actor: TraversalActorSnapshot,
  request: BeginTraversalRequest,
  context: {
    tick: bigint;
    reservations: readonly TraversalReservation[];
    previous?: TraversalBeginReceipt;
    allocateTraversalId: () => string;
  },
): BeginTraversalResult {
  accepted(link);
  tick(context.tick);
  requireTraversal(
    actor.admitted === true &&
      actor.connected === true &&
      actor.mayTraverse === true,
    "admitted connected actor permission required",
  );
  requireTraversal(
    validId(actor.id) &&
      validId(actor.visitId) &&
      actor.instanceId === link.instanceId &&
      actor.visitId === request.expectedVisitId &&
      request.linkId === link.id &&
      validId(request.operationId),
    "actor instance/visit/link mismatch",
  );
  tick(request.expectedLocationRevision);
  tick(request.expectedInstanceRevision);
  tick(request.expectedLinkRevision);
  const requestHash = digest({
    ...request,
    actorId: actor.id,
    expectedLocationRevision: String(request.expectedLocationRevision),
    expectedInstanceRevision: String(request.expectedInstanceRevision),
    expectedLinkRevision: String(request.expectedLinkRevision),
  });
  if (context.previous) {
    requireTraversal(
      context.previous.actorId === actor.id &&
        context.previous.operationId === request.operationId &&
        context.previous.requestHash === requestHash,
      "operation replay conflicts",
    );
    return { replay: true, receipt: context.previous };
  }
  requireTraversal(
    actor.standing === true &&
      actor.locationRevision === request.expectedLocationRevision &&
      link.instanceRevision === request.expectedInstanceRevision &&
      link.revision === request.expectedLinkRevision,
    "standing actor or expected revision conflict",
  );
  const sourceDeckId = actor.deckId,
    destinationDeckId =
      sourceDeckId === link.lower.deckId
        ? link.upper.deckId
        : link.lower.deckId;
  route(link, {
    sourceDeckId,
    destinationDeckId,
    startPositionM: actor.positionM,
  });
  // Evaluate reservation before allocating a persistent identity.
  requireTraversal(
    !traversalReservationConflicts(
      reservation(link, actor.id, "pending-traversal"),
      context.reservations,
    ),
    "link or landing reservation occupied",
  );
  requireTraversal(
    context.reservations.length < TRAVERSAL_LIMITS.reservations,
    "reservation admission budget exhausted",
  );
  const id = context.allocateTraversalId();
  requireTraversal(
    validId(id) && !context.reservations.some((r) => r.traversalId === id),
    "invalid server traversal identity",
  );
  const state: TraversalState = {
    id,
    actorId: actor.id,
    instanceId: link.instanceId,
    linkId: link.id,
    visitId: actor.visitId,
    proofHash: link.proofHash,
    sourceDeckId,
    destinationDeckId,
    startPositionM: [...actor.positionM],
    distanceM: 0,
    mode: "outbound",
    phase:
      distance(
        actor.positionM,
        sourceDeckId === link.lower.deckId
          ? link.lower.anchorM
          : link.upper.anchorM,
      ) > 0
        ? "approaching"
        : "transit",
    interruption: "",
    startedTick: context.tick,
    lastTick: context.tick,
    revision: 1n,
  };
  return {
    replay: false,
    receipt: {
      actorId: actor.id,
      operationId: request.operationId,
      requestHash,
      traversalId: id,
    },
    state,
    reservation: reservation(link, actor.id, id),
  };
}
export interface TraversalStepAuthority {
  actorPresent: boolean;
  connected: boolean;
  mayTraverse: boolean;
  cancelRequested: boolean;
  instanceRevision: bigint;
  linkRevision: bigint;
  reservation: TraversalReservation | null;
  forwardClear: boolean;
  reverseClear: boolean;
  destinationClear: boolean;
  sourceClear: boolean;
}
function validatedState(link: CompiledTraversalLink, state: TraversalState) {
  accepted(link);
  requireTraversal(
    validId(state.id) &&
      validId(state.actorId) &&
      validId(state.visitId) &&
      state.instanceId === link.instanceId &&
      state.linkId === link.id &&
      state.proofHash === link.proofHash,
    "persistent traversal native link mismatch",
  );
  tick(state.startedTick);
  tick(state.lastTick);
  tick(state.revision);
  requireTraversal(
    state.lastTick >= state.startedTick &&
      state.revision > 0n &&
      ["outbound", "returning"].includes(state.mode) &&
      [
        "approaching",
        "transit",
        "returning",
        "blocked",
        "arrived",
        "cancelled",
      ].includes(state.phase) &&
      [
        "",
        "cancelled",
        "access-lost",
        "disconnected",
        "actor-unavailable",
        "forward-obstructed",
        "geometry-changed",
        "reservation-lost",
        "source-blocked",
      ].includes(state.interruption),
    "invalid persistent traversal state",
  );
  const r = route(link, state);
  requireTraversal(
    number(state.distanceM, 0, r.lengthM) &&
      (state.phase !== "arrived" ||
        (state.distanceM === r.lengthM && state.mode === "outbound")) &&
      (state.phase !== "cancelled" ||
        (state.distanceM === 0 && state.mode === "returning")) &&
      (state.phase !== "approaching" ||
        (state.mode === "outbound" && state.distanceM < r.approachM)) &&
      (state.phase !== "transit" ||
        (state.mode === "outbound" &&
          state.distanceM >= r.approachM &&
          state.distanceM < r.lengthM)) &&
      (state.phase !== "returning" || state.mode === "returning"),
    "invalid persistent path progress",
  );
  return r;
}
export function traversalPlacement(
  link: CompiledTraversalLink,
  state: TraversalState,
) {
  const r = validatedState(link, state);
  if (state.phase === "arrived")
    return {
      positionM: [...r.to.anchorM] as TraversalPoint3,
      deckId: state.destinationDeckId,
      standing: true,
      releaseReservation: true,
    };
  if (state.phase === "cancelled")
    return {
      positionM: [...state.startPositionM] as TraversalPoint3,
      deckId: state.sourceDeckId,
      standing: true,
      releaseReservation: true,
    };
  let remaining = state.distanceM;
  let positionM: TraversalPoint3 = [...r.points[r.points.length - 1]];
  for (let i = 0; i < r.lengths.length; i++) {
    const n = r.lengths[i];
    if (n === 0) continue;
    if (remaining <= n) {
      const t = remaining / n;
      positionM = r.points[i].map(
        (v, k) => v + (r.points[i + 1][k] - v) * t,
      ) as TraversalPoint3;
      break;
    }
    remaining -= n;
  }
  return {
    positionM,
    deckId: state.sourceDeckId,
    standing: false,
    releaseReservation: false,
  };
}
/** One server fixed tick, irrespective of numerical tick gap. Authority derives
 * access, physical obstruction and reservations from private state on each call.
 * Lost geometry/reservations block safely; no client fallback coordinates exist. */
export function stepTraversal(
  link: CompiledTraversalLink,
  state: TraversalState,
  nextTick: bigint,
  authority: TraversalStepAuthority,
): TraversalState {
  const r = validatedState(link, state);
  tick(nextTick);
  for (const field of [
    "actorPresent",
    "connected",
    "mayTraverse",
    "cancelRequested",
    "forwardClear",
    "reverseClear",
    "destinationClear",
    "sourceClear",
  ] as const)
    requireTraversal(
      typeof authority[field] === "boolean",
      "invalid step authority",
    );
  tick(authority.instanceRevision);
  tick(authority.linkRevision);
  if (
    nextTick <= state.lastTick ||
    state.phase === "arrived" ||
    state.phase === "cancelled"
  )
    return state;
  tick(state.revision + 1n);
  const next = { ...state, lastTick: nextTick, revision: state.revision + 1n };
  if (
    authority.instanceRevision !== link.instanceRevision ||
    authority.linkRevision !== link.revision
  )
    return { ...next, phase: "blocked", interruption: "geometry-changed" };
  if (
    !authority.reservation ||
    !equal(authority.reservation, reservation(link, state.actorId, state.id))
  )
    return { ...next, phase: "blocked", interruption: "reservation-lost" };
  let reason: TraversalState["interruption"] = state.interruption;
  if (!authority.actorPresent) reason = "actor-unavailable";
  else if (!authority.connected) reason = "disconnected";
  else if (!authority.mayTraverse) reason = "access-lost";
  else if (authority.cancelRequested) reason = "cancelled";
  else if (state.mode === "outbound" && !authority.forwardClear)
    reason = "forward-obstructed";
  const reversing = state.mode === "returning" || reason !== "";
  if (reversing) {
    if (
      !authority.reverseClear ||
      (state.distanceM <=
        link.metresPerSecond * TRAVERSAL_LIMITS.fixedSeconds &&
        !authority.sourceClear)
    )
      return {
        ...next,
        mode: "returning",
        phase: "blocked",
        interruption: !authority.sourceClear ? "source-blocked" : reason,
      };
    const distanceM = Math.max(
      0,
      state.distanceM - link.metresPerSecond * TRAVERSAL_LIMITS.fixedSeconds,
    );
    return {
      ...next,
      distanceM,
      mode: "returning",
      phase: distanceM === 0 ? "cancelled" : "returning",
      interruption: reason,
    };
  }
  const distanceM = Math.min(
    r.lengthM,
    state.distanceM + link.metresPerSecond * TRAVERSAL_LIMITS.fixedSeconds,
  );
  if (distanceM === r.lengthM && !authority.destinationClear)
    return {
      ...next,
      mode: "returning",
      phase: "blocked",
      interruption: "forward-obstructed",
    };
  return {
    ...next,
    distanceM,
    phase:
      distanceM === r.lengthM
        ? "arrived"
        : distanceM < r.approachM
          ? "approaching"
          : "transit",
  };
}
