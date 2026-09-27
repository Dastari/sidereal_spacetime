import { withBow } from "@sidereal/content/bow-profiles";
import { FED_CREST } from "../../packages/content/src/prefabs/federation";
/** Review-only host: the production dresser and kit, with no database or catalog publication. */
import {
  prefab,
  volume,
  polygonTiles,
  edge,
} from "../../packages/content/src/prefabs/builders";

export const BOW_REVIEW_POD = prefab({
  id: "review.pod",
  name: "Observation pod",
  description: "Grid-true bow profiles on a rotated, lower pod host.",
  faction: "Federation",
  role: "Observation pod",
  theme: "federation",
  sizeClass: "S",
  volumes: [
    volume(
      "pod",
      "hull",
      "pod",
      polygonTiles([
        [0, 0],
        [4, 0],
        [4, 4],
        [3, 5],
        [1, 5],
        [0, 4],
      ]).map((t) => (t.y >= 2 ? withBow(t, (t.y - 1) as 1 | 2 | 3, 1) : t)),
    ),
  ],
  rooms: [],
  edges: [],
  mounts: [],
  skylights: [],
  markings: { name: "POD", number: "OBS-02", emblem: "planet" },
});

export const BOW_REVIEW_CREST = structuredClone(FED_CREST);
BOW_REVIEW_CREST.id = "review.crest";
BOW_REVIEW_CREST.volumes[0].tiles = BOW_REVIEW_CREST.volumes[0].tiles.map(
  (t) => (t.x >= 21 ? withBow(t, (t.x - 20) as 1 | 2 | 3) : t),
);
BOW_REVIEW_CREST.skylights = [];
for (const m of BOW_REVIEW_CREST.mounts) {
  if (m.id === "helm") m.at = [21, 4.5];
  if (m.id === "command") m.at = [20, 2];
  if (m.id === "sensors") m.at = [20, 7];
}
export const BOW_HOSTS = [BOW_REVIEW_POD, BOW_REVIEW_CREST];

BOW_REVIEW_CREST.edges = BOW_REVIEW_CREST.edges.filter(
  (e) => e.id !== "canopy-bow",
);

/** Four identical pod assemblies, rotated/mirrored as complete hosts. */
export const BOW_INTERLOCKS = structuredClone(BOW_REVIEW_POD);
BOW_INTERLOCKS.id = "review.interlocks";
BOW_INTERLOCKS.name = "Pod interlock orientations";
BOW_INTERLOCKS.volumes = [0, 1, 2, 3].map((i) => {
  const original = BOW_REVIEW_POD.volumes[0];
  return {
    ...original,
    id: `pod-${i}`,
    tiles: original.tiles.map((t) => {
      const spec = (
        { square: [1, 1], slope1: [1, 1] } as Record<string, number[]>
      )[t.shape];
      let w = spec[0],
        h = spec[1];
      if (t.rot % 2) [w, h] = [h, w];
      if (i === 0) return { ...t };
      if (i === 1)
        return {
          ...t,
          x: 11 - t.y - h,
          y: t.x,
          rot: ((t.rot + 1) % 4) as 0 | 1 | 2 | 3,
        };
      if (i === 2)
        return {
          ...t,
          x: 4 - t.x - w,
          y: t.y + 7,
          reflected: !t.reflected,
          rot: ((4 - t.rot) % 4) as 0 | 1 | 2 | 3,
        };
      return {
        ...t,
        x: 11 - t.y - h,
        y: 11 - t.x - w,
        reflected: !t.reflected,
        rot: ((1 - t.rot + 4) % 4) as 0 | 1 | 2 | 3,
      };
    }),
  };
});
BOW_HOSTS.push(BOW_INTERLOCKS);
