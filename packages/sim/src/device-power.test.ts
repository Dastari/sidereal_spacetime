import { expect, test } from "vitest";
import source from "@sidereal/content/wayfarer-rebuild-r002.json";
import type { ConstructionDocument } from "@sidereal/content/construction";
import {
  placedDeviceServices,
  deviceServicePortId,
  connectDevicePower,
  withDefaultDevicePower,
} from "@sidereal/content/device-services";
import { resolveDevicePower } from "./device-power";
import { readLayout } from "./layout-validation";
import { compileLayout } from "./layout-compiler";
const layout = (source as unknown as ConstructionDocument).layout;
test("all nine actual placed engines have unrated input ports and default reactor connections", () => {
  const devices = placedDeviceServices(layout),
    draft = withDefaultDevicePower(layout);
  expect(devices).toHaveLength(10);
  expect(
    devices.flatMap((d) => d.ports).every((p) => p.capacityPerSecond === null),
  ).toBe(true);
  const routes = draft
    .serviceConnections!.filter((r) => r.channel === "power")
    .map((r) => ({
      fromPortId: deviceServicePortId(r.fromDeviceId, r.fromPortId),
      toPortId: deviceServicePortId(r.toDeviceId, r.toPortId),
    }));
  expect(resolveDevicePower(devices, routes).poweredDeviceIds).toHaveLength(9);
  expect(
    resolveDevicePower(devices, routes, ["room-engineering"]).poweredDeviceIds,
  ).toEqual([]);
  expect(withDefaultDevicePower(draft)).toEqual(draft);
  expect(layout.nodes).toEqual([]);
  expect(draft.nodes).toEqual(layout.nodes);
  expect(draft.routes).toEqual(layout.routes);
  expect(compileLayout(draft).diagnostics).toEqual(
    compileLayout(layout).diagnostics,
  );
  expect(readLayout(draft).serviceConnections).toHaveLength(9);
});
test("power endpoints require real direction/channel and never infer adjacency", () => {
  const devices = placedDeviceServices(layout),
    draft = withDefaultDevicePower(layout);
  const link = draft.serviceConnections![0];
  const r = {
    from: deviceServicePortId(link.fromDeviceId, link.fromPortId),
    to: deviceServicePortId(link.toDeviceId, link.toPortId),
  };
  expect(resolveDevicePower(devices, []).poweredDeviceIds).toEqual([]);
  expect(() =>
    resolveDevicePower(devices, [{ fromPortId: r.to, toPortId: r.from }]),
  ).toThrow("Invalid power");
  expect(() =>
    resolveDevicePower(devices, [{ fromPortId: r.from, toPortId: "fake" }]),
  ).toThrow("Invalid power");
  expect(() =>
    resolveDevicePower(devices, [
      { fromPortId: r.from, toPortId: r.to },
      { fromPortId: r.from, toPortId: r.to },
    ]),
  ).toThrow("Invalid power");
});
test("logical circuits validate identities and direction without weakening physical route admission", () => {
  const draft = withDefaultDevicePower(layout);
  const link = draft.serviceConnections![0];
  for (const invalid of [
    { ...link, fromDeviceId: "missing" },
    { ...link, fromPortId: "fuel-out" },
    { ...link, channel: "fuel" },
    { ...link, toDeviceId: link.fromDeviceId },
    {
      ...link,
      fromDeviceId: link.toDeviceId,
      fromPortId: link.toPortId,
      toDeviceId: link.fromDeviceId,
      toPortId: link.fromPortId,
    },
  ])
    expect(() =>
      readLayout({ ...draft, serviceConnections: [invalid] }),
    ).toThrow(/device connection/);
  expect(() =>
    readLayout({
      ...draft,
      serviceConnections: [link, { ...link, id: "duplicate-input" }],
    }),
  ).toThrow(/device connection/);
  expect(() =>
    readLayout({ ...draft, serviceConnections: Array(1025).fill(link) }),
  ).toThrow("budget");
  expect(() =>
    readLayout({
      ...draft,
      serviceConnections: [{ ...link, id: draft.tiles[0].id }],
    }),
  ).toThrow("device connection");
  const removed = connectDevicePower(
    draft,
    null,
    deviceServicePortId(link.toDeviceId, link.toPortId),
  );
  expect(removed.serviceConnections).toHaveLength(8);
  expect(removed.routes).toEqual(layout.routes);
  const restored = connectDevicePower(
    removed,
    deviceServicePortId(link.fromDeviceId, link.fromPortId),
    deviceServicePortId(link.toDeviceId, link.toPortId),
  );
  expect(restored.serviceConnections).toHaveLength(9);
  expect(
    compileLayout({
      ...restored,
      serviceConnections: [...restored.serviceConnections!].reverse(),
    }).fingerprint,
  ).toEqual(compileLayout(restored).fingerprint);
});
