import { useEffect, useState } from "react";
import type { MapBody } from "@sidereal/content/system-map";
/** Catalog portraits are derived from hash-matched asset renders, never loaded as 3D scenes. */
export function useCelestialSnapshots(bodies: readonly MapBody[]) {
  const [entries, setEntries] = useState<Record<string, { url: string }>>({});
  useEffect(() => {
    const controller = new AbortController();
    fetch("/map-snapshots/manifest.json", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error("Snapshot catalog unavailable");
        return r.json();
      })
      .then((data) => {
        if (!controller.signal.aborted && data.schema === 1)
          setEntries(data.entries);
      })
      .catch(() => {
        /* Named markers remain available if the snapshot catalog cannot load. */
      });
    return () => controller.abort();
  }, []);
  return Object.fromEntries(
    bodies.flatMap((b) =>
      b.appearance && entries[b.appearance]
        ? [[b.id, entries[b.appearance].url]]
        : [],
    ),
  );
}
