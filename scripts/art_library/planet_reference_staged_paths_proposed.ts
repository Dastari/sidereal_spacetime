const ROOT = "/@fs/root/sidereal_spacetime/scripts/art_library/review-staging/";
const FAMILY =
  "(?:(?:desert|rocky|ocean|temperate|ice|crystal|toxic|volcanic)(?:-moon-[12])?|rocky-moon|gas-giant-moon-[123]|toxic-fog|gas|cloud)";
const REVISION = new RegExp("^" + FAMILY + "-r[0-9]{3}$");
export function referenceRevisionPath(revision: string) {
  if (!REVISION.test(revision))
    throw new Error(
      "Expected a supported planet revision folder such as ice-r025",
    );
  return ROOT + revision + "/";
}
/** Query selects one folder beneath a fixed evidence root, never a filesystem URL.
 * Existing CLI request interception routes remain the default. */
export function referenceDirectPaths(query: URLSearchParams) {
  for (const key of ["kit", "weatherKit"])
    if (query.getAll(key).length > 1)
      throw new Error("Duplicate revision selector");
  const kit = query.has("kit")
      ? referenceRevisionPath(query.get("kit")!)
      : undefined,
    weather = query.has("weatherKit")
      ? referenceRevisionPath(query.get("weatherKit")!)
      : undefined;
  return {
    kit: kit ? kit + "kit.json" : "/planet-reference-kit.json",
    kitAssets: kit ?? "/planet-reference-assets/",
    weatherKit: weather
      ? weather + "kit.json"
      : "/planet-reference-cloud-kit.json",
    weatherAssets: weather ?? "/planet-reference-weather-assets/",
    hdr:
      kit || weather
        ? (kit ?? weather!) + "frontier-workshop.hdr"
        : "/assets/materials/frontier-workshop.hdr",
    direct: Boolean(kit || weather),
  };
}
/** Asset filenames from a kit cannot escape the selected revision directory. */
export function referenceAssetPath(prefix: string, file: string) {
  if (!/^[a-zA-Z0-9_-]+\.(?:png|jpg|jpeg|webp|ktx2|basis)$/i.test(file))
    throw new Error("Expected a revision-local texture filename");
  return prefix + file;
}
