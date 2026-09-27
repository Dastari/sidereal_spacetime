/** Exact retained Blender doorway surfaces. Publication does not grant pressure or art approval. */
export const DOORWAY250_VISUALS = {
  schema: "sidereal.doorway250-visual-package.v1",
  nativeRevision: "r003",
  qualificationRevision: "r004",
  sourceDirectory:
    "assets/art-library/designs/shipyard.structure.doorway250/revisions/r004",
  qualificationScope:
    "Offline bounded native enclosure only; no runtime pressure, flow, damage or owner art approval",
  artApproved: false,
  parts: [
    {
      part: "frame",
      url: "/assets/construction/doorway250-r004/frame.glb",
      sha256:
        "076c7c0b3854c3ca04ea6a792fa0b4a7a7ead03205521607e2ccca02ec376e77",
    },
    {
      part: "leaf",
      url: "/assets/construction/doorway250-r004/leaf.glb",
      sha256:
        "6adeb2aeff19237524c7d6cc0e6761dd8c8f0e3b81219545524fa474da42981f",
    },
    {
      part: "seat",
      url: "/assets/construction/doorway250-r004/seat.glb",
      sha256:
        "ad65ff5381d4fc1cf805aeb9cb54ef814a8e38efc1ee023ca43c7e9c6dbd6cd8",
    },
    {
      part: "gasket",
      url: "/assets/construction/doorway250-r004/gasket.glb",
      sha256:
        "e67f461a70867d294a7c225890cd5bb24e279ae1ede6bfca3f5fdc0a25143714",
    },
  ],
} as const;
export type Doorway250Part = (typeof DOORWAY250_VISUALS.parts)[number]["part"];
export const DOORWAY250_HINGE_GLTF_M = [0.3125, -0.1875, -0.0625] as const;
