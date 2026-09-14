import type {
  LayoutDocument,
  ServiceChannel,
} from "@sidereal/content/ship-layout";
import type { PartCatalog } from "@sidereal/content/assembly";
import {
  placedDeviceServices,
  deviceServicePortId,
  connectDevicePower,
} from "@sidereal/content/device-services";

interface Props {
  doc: LayoutDocument;
  catalog?: PartCatalog | null;
  channel: ServiceChannel;
  select: (ids: string[]) => void;
  commit: (change: (doc: LayoutDocument) => LayoutDocument) => void;
  blocked?: boolean;
}
/** Ports are discovered from placed devices, not a second equipment palette. */
export function DeviceServicesPanel({
  doc,
  catalog,
  channel,
  select,
  commit,
  blocked = false,
}: Props) {
  const devices = placedDeviceServices(doc, catalog ?? undefined);
  const visible = devices.filter((d) =>
    d.ports.some((p) => p.channel === channel),
  );
  if (!visible.length)
    return (
      <p className="layout-note">No placed devices have {channel} ports yet.</p>
    );
  return (
    <div className="layout-room-fields" aria-label="Placed system devices">
      {visible.map((device) => (
        <div key={device.placedObjectId}>
          <button
            className="layout-wide"
            onClick={() => select([device.placedObjectId])}
          >
            {device.label}
          </button>
          {device.ports
            .filter((port) => port.channel === channel)
            .map((port) => {
              const id = deviceServicePortId(device.placedObjectId, port.id);
              const connection = doc.serviceConnections?.find(
                (r) =>
                  r.channel === channel &&
                  r.toDeviceId === device.placedObjectId &&
                  r.toPortId === port.id,
              );
              const sources = devices
                .filter(
                  (d) =>
                    d.deckId === device.deckId &&
                    d.placedObjectId !== device.placedObjectId,
                )
                .flatMap((d) =>
                  d.ports
                    .filter(
                      (p) => p.channel === channel && p.direction === "out",
                    )
                    .map((p) => ({
                      id: deviceServicePortId(d.placedObjectId, p.id),
                      label: d.label,
                    })),
                );
              return (
                <div key={id}>
                  <span>
                    {port.direction === "out"
                      ? "Emits"
                      : port.direction === "in"
                        ? "Accepts"
                        : "Transfers"}{" "}
                    {port.channel}
                  </span>
                  {port.direction === "in" && channel === "power" ? (
                    <label>
                      Power source
                      <select
                        aria-label={`Power source for ${device.label}`}
                        disabled={blocked}
                        value={
                          connection
                            ? deviceServicePortId(
                                connection.fromDeviceId,
                                connection.fromPortId,
                              )
                            : ""
                        }
                        onChange={(event) => {
                          const from = event.target.value || null;
                          commit((current) =>
                            connectDevicePower(current, from, id),
                          );
                        }}
                      >
                        <option value="">Disconnected</option>
                        {sources.map((source) => (
                          <option key={source.id} value={source.id}>
                            {source.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {port.direction === "out" ? (
                    <p className="layout-note">
                      {doc.serviceConnections?.filter(
                        (r) =>
                          r.fromDeviceId === device.placedObjectId &&
                          r.fromPortId === port.id &&
                          r.channel === channel,
                      ).length ?? 0}{" "}
                      connected devices
                    </p>
                  ) : null}
                </div>
              );
            })}
        </div>
      ))}
      <p className="layout-note">
        Dotted links show device connections. Cable and pipe routing needs
        qualified physical supports.
      </p>
    </div>
  );
}
