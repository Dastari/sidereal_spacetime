/** Read-only inspection geometry. Route proposals do not change the live shared networks. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import savedWayfarerRoutes from "@sidereal/content/wayfarer-service-routes";
import type { ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";
import type {
  ShipComponentDefinition,
  ShipComponentPlacement,
  ShipComponentPort,
  ShipMountSocket,
  ShipComponentConnection,
} from "@sidereal/content/ship-components";
import { prefabShipSystemsInput } from "./prefab-ship-systems";
import {
  autoWireShipComponents,
  placedShipPort,
  shipPartToShip,
  shipPortsCompatible,
} from "./ship-systems";

export const DESIGN_CHANNELS = [
  "power",
  "data",
  "coolant",
  "fuel",
  "ventilation",
] as const;
export type DesignChannel = (typeof DESIGN_CHANNELS)[number];
export type DesignPoint = [number, number, number];
export interface DesignPort extends ShipComponentPort {
  key: string;
  componentId: string;
  position: DesignPoint;
  normal: DesignPoint;
}
export interface DesignComponent {
  id: string;
  name: string;
  placement: ShipComponentPlacement;
  definition: ShipComponentDefinition;
  mount?: { definition: ShipComponentDefinition; socket: ShipMountSocket };
  ports: DesignPort[];
  bounds: [DesignPoint, DesignPoint];
  belowDeck: boolean;
}
export interface DesignRoute {
  id: string;
  channel: DesignChannel;
  from: string;
  to: string;
  points: DesignPoint[];
}
export interface SystemsDesign {
  sourceHash: string;
  components: DesignComponent[];
  routes: DesignRoute[];
  unconnected: DesignPort[];
  routing: "saved-proposal" | "generated-proposal";
  unsupportedChannels: string[];
}
export interface ServiceRouteProposal {
  schema: "sidereal.service-route-proposal.v1";
  sourceHash: string;
  routes: DesignRoute[];
}
const key = (id: string, port: string) => `${id}/${port}`;
const samePoint = (a: DesignPoint, b: DesignPoint) =>
  a.every((v, i) => Math.abs(v - b[i]) < 1e-8);

/** Saved routes are admitted only against exact current port identities and finite bounded paths. */
export function validateServiceRouteProposal(
  proposal: ServiceRouteProposal,
  sourceHash: string,
  ports: Map<string, DesignPort>,
  links: readonly ShipComponentConnection[],
): DesignRoute[] {
  if (
    proposal.schema !== "sidereal.service-route-proposal.v1" ||
    proposal.sourceHash !== sourceHash ||
    !Array.isArray(proposal.routes) ||
    proposal.routes.length !== links.length ||
    proposal.routes.length > 1024
  )
    throw Error("Saved service routing does not match this installation");
  const expected = new Map(links.map((l) => [l.id, l]));
  const seen = new Set<string>();
  for (const r of proposal.routes) {
    const l = expected.get(r.id),
      from = ports.get(r.from),
      to = ports.get(r.to);
    if (
      !l ||
      seen.has(r.id) ||
      !from ||
      !to ||
      r.channel !== l.channel ||
      r.from !== key(l.from.placementId, l.from.portId) ||
      r.to !== key(l.to.placementId, l.to.portId) ||
      !shipPortsCompatible(from, to).ok
    )
      throw Error("Saved service routing has incompatible endpoints");
    seen.add(r.id);
    if (
      !Array.isArray(r.points) ||
      r.points.length < 2 ||
      r.points.length > 32 ||
      r.points.some(
        (p) =>
          !Array.isArray(p) ||
          p.length !== 3 ||
          p.some((v) => !Number.isFinite(v) || Math.abs(v) > 2048),
      ) ||
      !samePoint(r.points[0], from.position) ||
      !samePoint(r.points.at(-1)!, to.position)
    )
      throw Error("Saved service routing has invalid geometry");
  }
  return proposal.routes.map((r) => ({
    ...r,
    points: r.points.map((p) => [...p]),
  }));
}

export function buildSystemsDesign(
  doc: ShipPrefabDocumentV1,
  catalogRevision: string,
  proposal?: ServiceRouteProposal | null,
): SystemsDesign {
  const input = prefabShipSystemsInput(doc, catalogRevision);
  const defs = new Map(input.catalog.components.map((d) => [d.id, d]));
  const sockets = new Map(input.hull.hardpoints.map((p) => [p.id, p.socket]));
  const components = [...(input.components ?? [])]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((placement) => {
      const definition = defs.get(placement.componentId);
      if (!definition) throw Error("Missing installed component definition");
      const socket = placement.hardpointId
        ? sockets.get(placement.hardpointId)
        : undefined;
      const mount = socket ? { definition, socket } : undefined;
      const ports = definition.ports
        .filter((p) => DESIGN_CHANNELS.includes(p.channel as DesignChannel))
        .map((p) => ({
          ...p,
          ...placedShipPort(placement, p, mount),
          key: key(placement.id, p.id),
          componentId: placement.id,
        }));
      const [lo, hi] = definition.mount.envelopeM;
      const corners: DesignPoint[] = [];
      for (const x of [lo[0], hi[0]])
        for (const y of [lo[1], hi[1]])
          for (const z of [lo[2], hi[2]])
            corners.push(shipPartToShip(placement, [x, y, z], mount));
      const bounds: [DesignPoint, DesignPoint] = [
        [0, 1, 2].map((i) =>
          Math.min(...corners.map((p) => p[i])),
        ) as DesignPoint,
        [0, 1, 2].map((i) =>
          Math.max(...corners.map((p) => p[i])),
        ) as DesignPoint,
      ];
      return {
        id: placement.id,
        name: definition.name,
        placement,
        definition,
        mount,
        ports,
        bounds,
        belowDeck: placement.position[2] < 0,
      };
    });
  const ports = new Map(
    components.flatMap((c) => c.ports.map((p) => [p.key, p] as const)),
  );
  const sourceHash = bytesToHex(
    sha256(
      utf8ToBytes(
        JSON.stringify(
          components.map((c) => ({
            placement: c.placement,
            definition: c.definition.id,
            revision: c.definition.revision,
            ports: c.ports,
            bounds: c.bounds,
          })),
        ),
      ),
    ),
  );
  const links = autoWireShipComponents(
    input.catalog,
    input.hull,
    input.components ?? [],
  ).filter((l) => DESIGN_CHANNELS.includes(l.channel as DesignChannel));
  if (links.length > 1024)
    throw Error("Systems inspection routing budget exceeded");
  const plane = Math.min(
    -1.75,
    ...components.map((c) => c.bounds[0][2] - 0.25),
  );
  const generated = links.map((l) => {
    const from = ports.get(key(l.from.placementId, l.from.portId))!,
      to = ports.get(key(l.to.placementId, l.to.portId))!;
    const channel = l.channel as DesignChannel;
    const lane = DESIGN_CHANNELS.indexOf(channel);
    const z = plane - lane * 0.12,
      x = 1.5 + lane * 0.18;
    const exit = (p: DesignPort): DesignPoint =>
      p.position.map((v, i) => v + p.normal[i] * 0.25) as DesignPoint;
    const a = exit(from),
      b = exit(to);
    const points: DesignPoint[] = [
      from.position,
      a,
      [a[0], a[1], z],
      [x, a[1], z],
      [x, b[1], z],
      [b[0], b[1], z],
      b,
      to.position,
    ];
    return {
      id: l.id,
      channel,
      from: from.key,
      to: to.key,
      points: points
        .filter((p, i) => i === 0 || !samePoint(p, points[i - 1]))
        .map((p) => [...p] as DesignPoint),
    };
  });
  const saved =
    proposal === undefined &&
    doc.id === "fed.m.wayfarer" &&
    savedWayfarerRoutes.sourceHash === sourceHash
      ? (savedWayfarerRoutes as ServiceRouteProposal)
      : proposal;
  const routes = saved
    ? validateServiceRouteProposal(saved, sourceHash, ports, links)
    : generated;
  const destinations = new Set(routes.map((r) => r.to));
  return {
    sourceHash,
    components,
    routes,
    routing: saved ? "saved-proposal" : "generated-proposal",
    unsupportedChannels: [
      ...new Set(
        components.flatMap((c) =>
          c.definition.ports
            .filter(
              (p) => !DESIGN_CHANNELS.includes(p.channel as DesignChannel),
            )
            .map((p) => p.channel),
        ),
      ),
    ].sort(),
    unconnected: [...ports.values()].filter(
      (p) =>
        p.direction === "in" &&
        !p.id.startsWith("shore-") &&
        !destinations.has(p.key),
    ),
  };
}
