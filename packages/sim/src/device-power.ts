import type { PlacedDeviceServices } from "@sidereal/content/device-services";
import { deviceServicePortId } from "@sidereal/content/device-services";
export interface DevicePowerConnection {
  fromPortId: string;
  toPortId: string;
}
/** Bounded unrated connectivity gate; never represents an energy allocation.
 * Unknown endpoints, duplicate inputs and reversed/non-power ports reject. */
export function resolveDevicePower(
  devices: readonly PlacedDeviceServices[],
  connections: readonly DevicePowerConnection[],
  disabledDeviceIds: readonly string[] = [],
) {
  if (
    devices.length > 512 ||
    connections.length > 1024 ||
    new Set(devices.map((d) => d.placedObjectId)).size !== devices.length
  )
    throw Error("Device power identity/budget exceeded");
  const ids = new Set(devices.map((d) => d.placedObjectId));
  if (
    disabledDeviceIds.length > devices.length ||
    new Set(disabledDeviceIds).size !== disabledDeviceIds.length ||
    disabledDeviceIds.some((id) => !ids.has(id))
  )
    throw Error("Unknown disabled power device");
  const disabled = new Set(disabledDeviceIds);
  const ports = new Map(
    devices.flatMap((d) =>
      d.ports.map(
        (p) =>
          [
            deviceServicePortId(d.placedObjectId, p.id),
            { ...p, deviceId: d.placedObjectId },
          ] as const,
      ),
    ),
  );
  const used = new Set<string>(),
    powered = new Set<string>();
  for (const connection of connections) {
    const from = ports.get(connection.fromPortId),
      to = ports.get(connection.toPortId);
    if (
      !from ||
      !to ||
      from.deviceId === to.deviceId ||
      from.channel !== "power" ||
      to.channel !== "power" ||
      from.direction !== "out" ||
      to.direction !== "in" ||
      used.has(connection.toPortId)
    )
      throw Error("Invalid power connection");
    used.add(connection.toPortId);
    if (!disabled.has(from.deviceId) && !disabled.has(to.deviceId))
      powered.add(to.deviceId);
  }
  return { poweredDeviceIds: [...powered].sort(), unrated: true as const };
}
