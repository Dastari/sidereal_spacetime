import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { PartCatalog } from "@sidereal/content/assembly";
import {
  SERVICE_CHANNELS,
  type LayoutDocument,
  type Point,
} from "@sidereal/content/ship-layout";
import {
  deviceServicePortId,
  placedDeviceServices,
} from "@sidereal/content/device-services";
import type { CompiledLayout } from "@sidereal/sim/layout-compiler";
import { PRESSURE_COLORS } from "./PressureAreas";
import { previewPressureAreas } from "./pressure-preview";
import type { ViewState } from "./state";
import {
  projectContextPoint,
  projectContextPolygon,
  projectContextSegment,
} from "./context-overlay-projection";

interface Projection {
  planeTransform(elevation: number): readonly number[];
}
interface Props {
  doc: LayoutDocument;
  result?: CompiledLayout;
  deckId: string;
  catalog?: PartCatalog;
  layers?: ViewState["layers"];
  viewport: RefObject<Projection | null>;
  refresh: RefObject<() => void>;
}
const NS = "http://www.w3.org/2000/svg";
function attr(element: Element, name: string, value: string) {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}
const pointsAttribute = (points: readonly Point[]) =>
  points
    .map((point) => point.map((n) => Math.round(n * 100) / 100).join(","))
    .join(" ");

/** Annotation context is visible in every component mode; only that mode's native parts receive input. */
export function LayoutContextOverlay({
  doc,
  result,
  deckId,
  catalog,
  layers,
  viewport,
  refresh,
}: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const pressure = useMemo(
    () =>
      layers?.pressure !== false && result
        ? previewPressureAreas(doc, result)
        : undefined,
    [doc, result, layers?.pressure],
  );
  useEffect(() => {
    const host = svg.current;
    if (!host) return;
    const updates: ((
      matrix: readonly number[],
      width: number,
      height: number,
    ) => void)[] = [];
    const fragment = document.createDocumentFragment();
    const shape = (name: string, attributes: Record<string, string>) => {
      const element = document.createElementNS(NS, name);
      for (const [key, value] of Object.entries(attributes))
        element.setAttribute(key, value);
      fragment.appendChild(element);
      return element;
    };
    const polygon = (vertices: Point[], color: string, label: string) => {
      const element = shape("polygon", {
        fill: color,
        "fill-opacity": "0.17",
        stroke: color,
        "stroke-width": "0.6",
        "aria-label": label,
      });
      updates.push((matrix, width, height) =>
        attr(
          element,
          "points",
          pointsAttribute(
            projectContextPolygon(matrix, vertices, width, height),
          ),
        ),
      );
    };
    if (layers?.pressure !== false)
      for (const area of pressure?.areas ?? []) {
        if (area.deckId !== deckId) continue;
        for (const tile of doc.tiles.filter((tile) =>
          area.tileIds.includes(tile.id),
        ))
          polygon(
            tile.vertices,
            PRESSURE_COLORS[area.status],
            `Pressure area: ${area.roomNames.join(", ") || "Unnamed"}`,
          );
      }
    if (layers?.routes !== false) {
      const devices = placedDeviceServices(doc, catalog);
      for (const connection of doc.serviceConnections ?? []) {
        const from = devices.find(
          (device) => device.placedObjectId === connection.fromDeviceId,
        );
        const to = devices.find(
          (device) => device.placedObjectId === connection.toDeviceId,
        );
        if (!from || !to || from.deckId !== deckId || to.deckId !== deckId)
          continue;
        const a = from.position.slice(0, 2).map((n) => n * 32) as Point;
        const b = to.position.slice(0, 2).map((n) => n * 32) as Point;
        const element = shape("polyline", {
          fill: "none",
          stroke: SERVICE_CHANNELS[connection.channel].color,
          "stroke-width": "1.5",
          "stroke-dasharray": "2 5",
          "aria-label": `${connection.channel} device connection`,
        });
        updates.push((matrix, width, height) =>
          attr(
            element,
            "points",
            pointsAttribute(projectContextSegment(matrix, a, b, width, height)),
          ),
        );
      }
      for (const route of doc.routes.filter(
        (route) => route.deckId === deckId,
      )) {
        const element = shape("path", {
          fill: "none",
          stroke: SERVICE_CHANNELS[route.channel].color,
          "stroke-width": "2",
          "stroke-dasharray": SERVICE_CHANNELS[route.channel].dash,
          "aria-label": `${route.channel} route`,
        });
        updates.push((matrix, width, height) =>
          attr(
            element,
            "d",
            route.path
              .slice(1)
              .map((point, i) => {
                const projected = projectContextSegment(
                  matrix,
                  route.path[i],
                  point,
                  width,
                  height,
                );
                return projected.length
                  ? `M${pointsAttribute([projected[0]])} L${pointsAttribute([projected[1]])}`
                  : "";
              })
              .join(" "),
          ),
        );
      }
      const ports = doc.nodes
        .filter((node) => node.deckId === deckId)
        .map((node) => ({
          id: node.id,
          point: node.point,
          channel: node.channel,
        }));
      for (const device of placedDeviceServices(doc, catalog).filter(
        (device) => device.deckId === deckId,
      ))
        for (const port of device.ports) {
          const id = deviceServicePortId(device.placedObjectId, port.id);
          if (!ports.some((node) => node.id === id))
            ports.push({
              id,
              point: device.position
                .slice(0, 2)
                .map((n) => Math.round(n * 32)) as Point,
              channel: port.channel,
            });
        }
      for (const port of ports) {
        const element = shape("circle", {
          r: "3.5",
          fill: "#071923",
          stroke: SERVICE_CHANNELS[port.channel].color,
          "stroke-width": "1.5",
          visibility: "hidden",
          "aria-label": `${port.channel} port`,
        });
        updates.push((matrix, width, height) => {
          const projected = projectContextPoint(
            matrix,
            port.point,
            width,
            height,
          );
          attr(element, "visibility", projected ? "visible" : "hidden");
          if (projected) {
            attr(element, "cx", String(projected[0]));
            attr(element, "cy", String(projected[1]));
          }
        });
      }
    }
    if (layers?.labels !== false)
      for (const room of doc.rooms.filter((room) => room.deckId === deckId)) {
        const element = shape("text", {
          fill: "#e3f3fa",
          stroke: "#071923",
          "stroke-width": "3.5",
          "stroke-linejoin": "round",
          "paint-order": "stroke",
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-family": "Barlow Condensed",
          "font-size": "14",
          visibility: "hidden",
          "aria-label": `Room: ${room.name}`,
        });
        element.textContent = room.name;
        updates.push((matrix, width, height) => {
          const projected = projectContextPoint(
            matrix,
            room.seed,
            width,
            height,
          );
          attr(element, "visibility", projected ? "visible" : "hidden");
          if (projected) {
            attr(element, "x", String(projected[0]));
            attr(element, "y", String(projected[1]));
          }
        });
      }
    host.replaceChildren(fragment);
    const deck = doc.decks.find((deck) => deck.id === deckId);
    const floorThickness =
      doc.structure?.schema === "sidereal.layout-structure.v2"
        ? (doc.structure.deckProfiles.find(
            (profile) => profile.deckId === deckId,
          )?.floorThickness ?? 6)
        : 6;
    const elevation = ((deck?.elevation ?? 0) + floorThickness) / 32 + 0.004;
    const update = () => {
      if (!viewport.current) return;
      const width = host.clientWidth,
        height = host.clientHeight;
      const matrix = viewport.current.planeTransform(elevation);
      attr(host, "viewBox", `0 0 ${width} ${height}`);
      for (const draw of updates) draw(matrix, width, height);
    };
    refresh.current = update;
    const resize = new ResizeObserver(update);
    resize.observe(host);
    update();
    return () => {
      if (refresh.current === update) refresh.current = () => {};
      resize.disconnect();
      host.replaceChildren();
    };
  }, [
    doc,
    result,
    deckId,
    catalog,
    layers?.labels,
    layers?.routes,
    layers?.pressure,
    pressure,
    viewport,
    refresh,
  ]);
  return (
    <svg
      ref={svg}
      className="layout-context-overlay"
      aria-label="Room, pressure and systems context"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        pointerEvents: "none",
      }}
    />
  );
}
