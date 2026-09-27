/** Pure elevator prerequisite, not an installed/native-qualified asset or utility
 * allocator. Definitions and inputs must come from trusted authority adapters.
 * Geometry uses ship-local metres, Z up. No inventory or deck identity is moved
 * implicitly; attachments remain platform-relative until explicit disembarkation. */
export type LiftPoint = readonly [number, number, number];
export interface LiftBox {
  min: LiftPoint;
  max: LiftPoint;
}
export interface LiftStop {
  id: string;
  deckId: string;
  doorId: string;
  z: number;
}
export interface LiftDefinition {
  id: string;
  instanceId: string;
  revision: bigint;
  proofHash: string;
  platformId: string;
  cabinDoorId: string;
  powerPortId: string;
  stops: readonly LiftStop[];
  /** Shaft-space cabin envelope at walking-plane Z=0. Includes physical shell. */
  envelope: LiftBox;
  /** Single uninterrupted load-bearing cabin floor. Stacks require cargo adapter. */
  interior: LiftBox;
  capacityKg: number;
  carMassKg: number;
  maximumOccupants: number;
  speedMps: number;
  accelerationMps2: number;
  /** An explicit functional passive brake, not inferred from appearance. */
  brake: { decelerationMps2: number; holdingKg: number } | null;
  /** Authored effective-force/loss policy, not implicit terrestrial gravity. */
  workJPerKgMeter: number;
  runningWatts: number;
}
export interface LiftAttachment {
  id: string;
  entityId: string;
  kind: "character" | "cargo";
  sourceDeckId: string;
  sourceLocationRevision: bigint;
  loadRevision: bigint;
  massKg: number;
  bounds: LiftBox;
  restrained: boolean;
}
export interface LiftCall {
  id: string;
  actorId: string;
  stopId: string;
}
export interface LiftState {
  elevatorId: string;
  definitionRevision: bigint;
  proofHash: string;
  revision: bigint;
  commandRevision: bigint;
  tick: bigint;
  z: number;
  velocity: number;
  phase:
    | "docked"
    | "closing"
    | "moving"
    | "braking"
    | "braked"
    | "recovery-required";
  targetId: string | null;
  attachments: readonly LiftAttachment[];
  queue: readonly LiftCall[];
}
export interface LiftDoorState {
  id: string;
  fraction: number;
  latched: boolean;
}
export interface LiftAllocation {
  id: string;
  elevatorId: string;
  portId: string;
  tick: bigint;
  stateRevision: bigint;
  joules: number;
}
export interface LiftFrame {
  tick: bigint;
  definitionRevision: bigint;
  proofHash: string;
  doors: readonly LiftDoorState[];
  shaftObstacles: readonly LiftBox[];
  /** Server-derived admitted destinations, rechecked at dispatch AND arrival. */
  admittedStopIds: readonly string[];
  allocation: LiftAllocation | null;
  thresholdOccupied: boolean;
}
export interface LiftStep {
  state: LiftState;
  debit: { allocationId: string; portId: string; joules: number } | null;
  doorRequest:
    { kind: "close-all" } | { kind: "open-docked"; stopId: string } | null;
  reason: string | null;
}
export const LIFT_LIMITS = Object.freeze({
  stops: 32,
  occupants: 64,
  calls: 32,
  obstacles: 256,
  dt: 0.05,
});
const EPS = 1e-9;
function requireLift(value: unknown, why: string): asserts value {
  if (!value) throw Error("Elevator rules: " + why);
}
const finite = (v: number) => Number.isFinite(v) && Math.abs(v) < 1e9;
const id = (v: string) =>
  typeof v === "string" && v.length > 0 && v.length <= 160;
const box = (b: LiftBox) =>
  b.min.length === 3 &&
  b.max.length === 3 &&
  b.min.every((v, i) => finite(v) && finite(b.max[i]) && v < b.max[i]);
const contains = (outer: LiftBox, inner: LiftBox) =>
  inner.min.every(
    (v, i) => v >= outer.min[i] - EPS && inner.max[i] <= outer.max[i] + EPS,
  );
const overlap = (a: LiftBox, b: LiftBox) =>
  a.min.every((v, i) => v < b.max[i] - EPS && b.min[i] < a.max[i] - EPS);
const unique = (values: readonly string[]) =>
  values.every(id) && new Set(values).size === values.length;
const stopAt = (d: LiftDefinition, z: number) =>
  d.stops.find((s) => Math.abs(s.z - z) <= EPS);
const mass = (s: LiftState) =>
  s.attachments.reduce((sum, a) => sum + a.massKg, 0);
export function validateLiftDefinition(d: LiftDefinition): void {
  requireLift(
    [d.id, d.instanceId, d.platformId, d.cabinDoorId, d.powerPortId].every(
      id,
    ) &&
      d.revision > 0n &&
      /^[a-f0-9]{64}$/.test(d.proofHash),
    "definition identity/proof",
  );
  requireLift(
    d.stops.length >= 2 &&
      d.stops.length <= LIFT_LIMITS.stops &&
      unique(d.stops.map((s) => s.id)) &&
      unique(d.stops.map((s) => s.doorId)) &&
      unique(d.stops.map((s) => s.deckId)),
    "stop identities/budget",
  );
  requireLift(
    d.stops.every(
      (s, i) =>
        id(s.deckId) &&
        finite(s.z) &&
        s.doorId !== d.cabinDoorId &&
        (!i || s.z > d.stops[i - 1].z),
    ),
    "ordered stop datums",
  );
  requireLift(
    box(d.envelope) &&
      box(d.interior) &&
      contains(d.envelope, d.interior) &&
      d.interior.min[2] === 0,
    "cabin support/envelope",
  );
  requireLift(
    [d.capacityKg, d.carMassKg, d.speedMps, d.accelerationMps2].every(
      (v) => finite(v) && v > 0,
    ) && [d.workJPerKgMeter, d.runningWatts].every((v) => finite(v) && v >= 0),
    "functional ratings",
  );
  requireLift(
    Number.isInteger(d.maximumOccupants) &&
      d.maximumOccupants > 0 &&
      d.maximumOccupants <= LIFT_LIMITS.occupants,
    "occupant budget",
  );
  if (d.brake)
    requireLift(
      [d.brake.decelerationMps2, d.brake.holdingKg].every(
        (v) => finite(v) && v > 0,
      ),
      "brake definition",
    );
}
function validateState(d: LiftDefinition, s: LiftState) {
  validateLiftDefinition(d);
  requireLift(
    s.elevatorId === d.id &&
      s.definitionRevision === d.revision &&
      s.proofHash === d.proofHash &&
      s.revision > 0n &&
      s.commandRevision > 0n &&
      s.tick >= 0n,
    "state provenance/revision",
  );
  requireLift(
    finite(s.z) &&
      finite(s.velocity) &&
      s.z >= d.stops[0].z - EPS &&
      s.z <= d.stops.at(-1)!.z + EPS &&
      Math.abs(s.velocity) <= d.speedMps + EPS,
    "accepted position/velocity",
  );
  requireLift(
    s.queue.length <= LIFT_LIMITS.calls &&
      unique(s.queue.map((c) => c.id)) &&
      s.queue.every(
        (c) => id(c.actorId) && d.stops.some((p) => p.id === c.stopId),
      ),
    "call queue",
  );
  requireLift(
    s.attachments.length <= d.maximumOccupants &&
      unique(s.attachments.map((a) => a.id)) &&
      unique(s.attachments.map((a) => a.entityId)),
    "attachment identities/budget",
  );
  for (const a of s.attachments) {
    requireLift(
      id(a.entityId) &&
        ["character", "cargo"].includes(a.kind) &&
        id(a.sourceDeckId) &&
        a.sourceLocationRevision > 0n &&
        a.loadRevision > 0n &&
        finite(a.massKg) &&
        a.massKg > 0,
      "attachment authority/load",
    );
    requireLift(
      box(a.bounds) &&
        contains(d.interior, a.bounds) &&
        Math.abs(a.bounds.min[2]) <= EPS,
      "attachment floor support/headroom",
    );
    if (a.kind === "cargo")
      requireLift(a.restrained, "cargo restraint required");
  }
  for (let i = 0; i < s.attachments.length; i++)
    for (let j = i + 1; j < s.attachments.length; j++)
      requireLift(
        !overlap(s.attachments[i].bounds, s.attachments[j].bounds),
        "occupied cabin space",
      );
  requireLift(mass(s) <= d.capacityKg + EPS, "load capacity");
  requireLift(
    s.targetId === null || d.stops.some((p) => p.id === s.targetId),
    "target stop",
  );
  requireLift(
    [
      "docked",
      "closing",
      "moving",
      "braking",
      "braked",
      "recovery-required",
    ].includes(s.phase),
    "phase",
  );
  if (s.phase === "docked")
    requireLift(stopAt(d, s.z) && s.velocity === 0, "docked alignment");
}
export function createLiftState(d: LiftDefinition, stopId: string): LiftState {
  validateLiftDefinition(d);
  const stop = d.stops.find((s) => s.id === stopId);
  requireLift(stop, "initial actual stop");
  return {
    elevatorId: d.id,
    definitionRevision: d.revision,
    proofHash: d.proofHash,
    revision: 1n,
    commandRevision: 1n,
    tick: 0n,
    z: stop.z,
    velocity: 0,
    phase: "docked",
    targetId: null,
    attachments: [],
    queue: [],
  };
}
function validateDoors(d: LiftDefinition, doors: readonly LiftDoorState[]) {
  requireLift(
    doors.length <= d.stops.length + 1 &&
      unique(doors.map((p) => p.id)) &&
      doors.every(
        (p) => finite(p.fraction) && p.fraction >= 0 && p.fraction <= 1,
      ),
    "door snapshot",
  );
  requireLift(
    doors.length === d.stops.length + 1 &&
      doors.every(
        (p) => p.id === d.cabinDoorId || d.stops.some((s) => s.doorId === p.id),
      ),
    "missing/unknown accepted door",
  );
}
function allClosed(d: LiftDefinition, doors: readonly LiftDoorState[]) {
  try {
    validateDoors(d, doors);
  } catch {
    return false;
  }
  return [d.cabinDoorId, ...d.stops.map((p) => p.doorId)].every((id) =>
    doors.some((p) => p.id === id && p.fraction === 0 && p.latched),
  );
}
export function landingOpenAllowed(
  d: LiftDefinition,
  s: LiftState,
  stopId: string,
): boolean {
  validateState(d, s);
  return (
    s.phase === "docked" &&
    s.velocity === 0 &&
    stopAt(d, s.z)?.id === stopId &&
    !!d.brake &&
    d.brake.holdingKg >= d.carMassKg + mass(s)
  );
}
/** Expected command revision does not race automatic motion revision. Durable
 * operation replay receipts and authoritative reach checks belong to world. */
export function queueLiftCall(
  d: LiftDefinition,
  s: LiftState,
  call: LiftCall,
  expectedRevision: bigint,
  authority: {
    gameAdmitted: boolean;
    reachableOrAttached: boolean;
    allowedStops: readonly string[];
  },
): LiftState {
  validateState(d, s);
  requireLift(
    authority.gameAdmitted &&
      authority.reachableOrAttached &&
      authority.allowedStops.includes(call.stopId),
    "call permission/reach",
  );
  requireLift(
    expectedRevision === s.commandRevision &&
      id(call.id) &&
      id(call.actorId) &&
      d.stops.some((p) => p.id === call.stopId),
    "call revision/identity",
  );
  const duplicate = s.queue.find((p) => p.id === call.id);
  if (duplicate) {
    requireLift(
      duplicate.actorId === call.actorId && duplicate.stopId === call.stopId,
      "call replay differs",
    );
    return s;
  }
  requireLift(s.queue.length < LIFT_LIMITS.calls, "call budget");
  return {
    ...s,
    revision: s.revision + 1n,
    commandRevision: s.commandRevision + 1n,
    queue: [...s.queue, { ...call }],
  };
}
export function boardLift(
  d: LiftDefinition,
  s: LiftState,
  a: LiftAttachment,
  stopId: string,
  expectedRevision: bigint,
  doors: readonly LiftDoorState[],
  authority: {
    gameAdmitted: boolean;
    mayBoard: boolean;
    handlingReserved: boolean;
  },
): LiftState {
  validateState(d, s);
  requireLift(
    authority.gameAdmitted && authority.mayBoard && authority.handlingReserved,
    "boarding authority/reservation",
  );
  requireLift(
    expectedRevision === s.revision && landingOpenAllowed(d, s, stopId),
    "boarding actual held stop/revision",
  );
  validateDoors(d, doors);
  const stop = d.stops.find((p) => p.id === stopId)!;
  requireLift(
    a.sourceDeckId === stop.deckId &&
      [d.cabinDoorId, stop.doorId].every((id) =>
        doors.some((p) => p.id === id && p.fraction === 1 && !p.latched),
      ),
    "boarding deck/actual open doors",
  );
  const next = {
    ...s,
    revision: s.revision + 1n,
    attachments: [
      ...s.attachments,
      {
        ...a,
        bounds: {
          min: [...a.bounds.min] as LiftPoint,
          max: [...a.bounds.max] as LiftPoint,
        },
      },
    ],
  };
  validateState(d, next);
  return next;
}
export function liftAttachmentPosition(
  s: LiftState,
  attachmentId: string,
): LiftBox {
  const a = s.attachments.find((p) => p.id === attachmentId);
  requireLift(a, "attachment identity");
  return {
    min: [a.bounds.min[0], a.bounds.min[1], a.bounds.min[2] + s.z],
    max: [a.bounds.max[0], a.bounds.max[1], a.bounds.max[2] + s.z],
  };
}
function sweptCabin(d: LiftDefinition, from: number, to: number): LiftBox {
  return {
    min: [
      d.envelope.min[0],
      d.envelope.min[1],
      d.envelope.min[2] + Math.min(from, to),
    ],
    max: [
      d.envelope.max[0],
      d.envelope.max[1],
      d.envelope.max[2] + Math.max(from, to),
    ],
  };
}
/** Piecewise acceleration / cruise / braking, with an exact stop event inside
 * the fixed step. Never clamp a moving car to a landing with nonzero speed. */
function poweredTravel(
  initialSpeed: number,
  distance: number,
  cap: number,
  acceleration: number,
  dt: number,
) {
  let speed = initialSpeed,
    remaining = distance,
    elapsed = dt;
  for (let event = 0; event < 6 && elapsed > EPS && remaining > EPS; event++) {
    const stopping = (speed * speed) / (2 * acceleration);
    if (stopping >= remaining - EPS) {
      requireLift(
        stopping <= remaining + 1e-7,
        "target is inside powered stopping envelope",
      );
      const time = Math.min(elapsed, speed / acceleration);
      remaining -= speed * time - (acceleration * time * time) / 2;
      speed = Math.max(0, speed - acceleration * time);
      elapsed -= time;
      if (speed <= EPS && remaining <= 1e-7) {
        remaining = 0;
        speed = 0;
      }
    } else if (speed >= cap - EPS) {
      const time = Math.min(elapsed, (remaining - stopping) / speed);
      remaining -= speed * time;
      elapsed -= time;
    } else {
      const switchTime =
        (-speed + Math.sqrt((speed * speed) / 2 + acceleration * remaining)) /
        acceleration;
      const time = Math.min(elapsed, switchTime, (cap - speed) / acceleration);
      remaining -= speed * time + (acceleration * time * time) / 2;
      speed += acceleration * time;
      elapsed -= time;
    }
  }
  return { distance: distance - Math.max(0, remaining), speed };
}

/** Fixed 50 ms movement; returns an energy debit that MUST commit atomically with
 * the result. No allocation means passive braking, never free powered travel.
 * Door requests do not change collision or spend unallocated door energy. */
export function stepLift(
  d: LiftDefinition,
  s: LiftState,
  f: LiftFrame,
): LiftStep {
  validateState(d, s);
  requireLift(
    f.tick >= 0n &&
      f.definitionRevision === d.revision &&
      f.proofHash === d.proofHash,
    "frame provenance",
  );
  const result = (
    state: LiftState,
    reason: string | null = null,
    debit: LiftStep["debit"] = null,
    doorRequest: LiftStep["doorRequest"] = null,
  ): LiftStep => ({ state, reason, debit, doorRequest });
  if (f.tick <= s.tick) return result(s);
  requireLift(
    f.shaftObstacles.length <= LIFT_LIMITS.obstacles &&
      f.shaftObstacles.every(box),
    "shaft obstacle budget",
  );
  const next = { ...s, tick: f.tick, revision: s.revision + 1n };
  if (s.phase === "recovery-required")
    return result(next, "qualified recovery mechanism required");
  const loaded = d.carMassKg + mass(s),
    brake = d.brake && d.brake.holdingKg >= loaded ? d.brake : null;
  const closed = allClosed(d, f.doors);
  const target = d.stops.find(
    (p) => p.id === (s.targetId ?? s.queue[0]?.stopId),
  );
  if (!target) {
    requireLift(s.velocity === 0, "moving car has no target");
    return result(s);
  }
  next.targetId = target.id;
  const allowed = f.admittedStopIds.includes(target.id),
    distance = target.z - s.z,
    dt = LIFT_LIMITS.dt;
  if (Math.abs(distance) <= EPS && s.velocity === 0 && allowed && brake) {
    next.phase = "docked";
    next.targetId = null;
    next.queue = s.queue.filter((p) => p.stopId !== target.id);
    return result(next, null, null, { kind: "open-docked", stopId: target.id });
  }
  if (!closed && s.velocity === 0) {
    next.phase = "closing";
    return result(next, "door interlock", null, { kind: "close-all" });
  }
  const direction = Math.sign(distance),
    speed = Math.abs(s.velocity);
  const motion = poweredTravel(
    speed,
    Math.abs(distance),
    d.speedMps,
    d.accelerationMps2,
    dt,
  );
  const velocity = direction * motion.speed;
  const delta = direction * motion.distance;
  const joules =
    Math.abs(delta) * loaded * d.workJPerKgMeter + d.runningWatts * dt;
  const a = f.allocation,
    allocationOK =
      !!a &&
      id(a.id) &&
      a.elevatorId === d.id &&
      a.portId === d.powerPortId &&
      a.tick === f.tick &&
      a.stateRevision === s.revision &&
      finite(a.joules) &&
      a.joules >= joules;
  // Before powering motion, reserve the complete passive stopping envelope too.
  const stopDistance = brake
    ? (velocity * velocity) / (2 * brake.decelerationMps2)
    : Infinity;
  const ahead = s.z + delta + Math.sign(velocity) * stopDistance;
  const clearance =
    finite(ahead) &&
    ahead >= d.stops[0].z - EPS &&
    ahead <= d.stops.at(-1)!.z + EPS &&
    !f.shaftObstacles.some((o) => overlap(sweptCabin(d, s.z, ahead), o));
  if (
    !allowed ||
    !closed ||
    f.thresholdOccupied ||
    !allocationOK ||
    !brake ||
    !clearance
  ) {
    const reason = !allowed
      ? "destination permission lost"
      : !closed
        ? "door interlock"
        : f.thresholdOccupied
          ? "threshold occupied"
          : !allocationOK
            ? "power allocation unavailable"
            : !brake
              ? "qualified brake unavailable"
              : "shaft obstruction";
    if (!brake) {
      next.phase = "recovery-required";
      return result(next, reason);
    }
    const newSpeed = Math.max(0, speed - brake.decelerationMps2 * dt);
    const brakingDelta =
      (Math.sign(s.velocity) *
        (speed + newSpeed) *
        Math.min(dt, speed / brake.decelerationMps2)) /
      2;
    const z = s.z + brakingDelta;
    if (
      z < d.stops[0].z - EPS ||
      z > d.stops.at(-1)!.z + EPS ||
      f.shaftObstacles.some((o) => overlap(sweptCabin(d, s.z, z), o))
    ) {
      next.phase = "recovery-required";
      return result(next, "braking envelope invalidated");
    }
    next.z = z;
    next.velocity = Math.sign(s.velocity) * newSpeed;
    next.phase = newSpeed ? "braking" : "braked";
    return result(next, reason);
  }
  next.z = s.z + delta;
  next.velocity = velocity;
  next.phase = "moving";
  return result(next, null, {
    allocationId: a!.id,
    portId: d.powerPortId,
    joules,
  });
}

/** Completion returns an explicit deck/location commit for the world adapter;
 * simply passing a deck's height never changes an attachment's source deck. */
export function disembarkLift(
  d: LiftDefinition,
  s: LiftState,
  attachmentId: string,
  stopId: string,
  expectedRevision: bigint,
  doors: readonly LiftDoorState[],
  authority: {
    gameAdmitted: boolean;
    mayExit: boolean;
    exitSupportReserved: boolean;
    /** Exact target support/clearance must be derived by the native landing adapter. */
    destinationBounds: LiftBox;
  },
) {
  validateState(d, s);
  requireLift(
    authority.gameAdmitted &&
      authority.mayExit &&
      authority.exitSupportReserved,
    "exit authority/support reservation",
  );
  requireLift(
    expectedRevision === s.revision && landingOpenAllowed(d, s, stopId),
    "exit held landing/revision",
  );
  validateDoors(d, doors);
  const stop = d.stops.find((p) => p.id === stopId)!;
  requireLift(
    [d.cabinDoorId, stop.doorId].every((id) =>
      doors.some((p) => p.id === id && p.fraction === 1 && !p.latched),
    ),
    "actual open exit doors",
  );
  const occupant = s.attachments.find((a) => a.id === attachmentId);
  requireLift(
    occupant &&
      box(authority.destinationBounds) &&
      Math.abs(authority.destinationBounds.min[2] - stop.z) <= EPS,
    "qualified destination support datum",
  );
  requireLift(
    authority.destinationBounds.min.every(
      (v, i) =>
        Math.abs(
          authority.destinationBounds.max[i] -
            v -
            (occupant.bounds.max[i] - occupant.bounds.min[i]),
        ) <= EPS,
    ),
    "exit body/load dimensions changed",
  );
  return {
    state: {
      ...s,
      revision: s.revision + 1n,
      attachments: s.attachments.filter((a) => a.id !== attachmentId),
    },
    exit: {
      entityId: occupant.entityId,
      deckId: stop.deckId,
      bounds: authority.destinationBounds,
      expectedLocationRevision: occupant.sourceLocationRevision,
      expectedLoadRevision: occupant.loadRevision,
    },
  };
}

export function cancelQueuedLiftCall(
  d: LiftDefinition,
  s: LiftState,
  callId: string,
  expectedCommandRevision: bigint,
  authority: { actorId: string; gameAdmitted: boolean; mayCancel: boolean },
): LiftState {
  validateState(d, s);
  requireLift(
    authority.gameAdmitted &&
      authority.mayCancel &&
      expectedCommandRevision === s.commandRevision,
    "cancel permission/command revision",
  );
  const call = s.queue.find((p) => p.id === callId);
  requireLift(
    call && call.actorId === authority.actorId,
    "owned queued call required",
  );
  requireLift(
    call.stopId !== s.targetId,
    "active destination cancellation requires a separate supported recovery command",
  );
  return {
    ...s,
    revision: s.revision + 1n,
    commandRevision: s.commandRevision + 1n,
    queue: s.queue.filter((p) => p.id !== callId),
  };
}
