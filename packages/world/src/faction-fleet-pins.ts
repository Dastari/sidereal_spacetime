/** Exact provisional fleet pins. Regenerate with scripts/pin-faction-fleet.ts --write; qualification remains separate. */
import type { PinnedPrefabShip } from "./prefab-ship-pins";
export const FEDERATION_FLEET_PIN_SET =
  "3ea8a0097c913ef87a6c797f6dedba6aeaaf1003fcb6064feea5e80aade70f81";
export const FEDERATION_FLEET_PINS: readonly PinnedPrefabShip[] = [
  {
    prefabId: "fed.s.wren-fleet",
    catalogRevision: "ship-components-v1@4",
    blueprintSha256:
      "cd0250b7ad01ee0d0dec3bc79ae7dd91cd574782951a39a44dc89d6a94c2b77f",
    flightDefinitionSha256:
      "52be0c0899dea62d86ed34fde5dd8c608c73e6cf4a470a16d46370e81a051f03",
    description:
      "Wren (provisional Federation Light courier, size S, fleet r1)",
    issueStock: [
      {
        socketKey: "lock/shipyard.equipment.wall-locker",
        containerName: "EVA suit locker",
        kit: "eva-suit",
      },
    ],
    issueEmptyStorage: true,
  },
  {
    prefabId: "fed.s.petrel-fleet",
    catalogRevision: "ship-components-v1@4",
    blueprintSha256:
      "db03861c3cf2bad46d00cf415fb94136ce5024e491293b55e3ca3fc3ce8ef78b",
    flightDefinitionSha256:
      "4f11706461ca241a59edf4f777f2c7ea39dd2223dc5a5c966acc595b01bffe29",
    description:
      "Petrel (provisional Federation Survey cutter, size S, fleet r1)",
    issueStock: [
      {
        socketKey: "lock/shipyard.equipment.wall-locker",
        containerName: "EVA suit locker",
        kit: "eva-suit",
      },
    ],
    issueEmptyStorage: true,
  },
  {
    prefabId: "fed.m.wayfarer-fleet",
    catalogRevision: "ship-components-v1@4",
    blueprintSha256:
      "afbd8010752693b3bff770d8ea856cefb864b5e7624c6397984ddadb645ff086",
    flightDefinitionSha256:
      "d5743df17b2616671f4e5fe069ddf8884969f718133d99af983f57655f91e72a",
    description:
      "Wayfarer (provisional Federation Expedition ship, size M, fleet r1)",
    issueStock: [
      {
        socketKey: "lock/shipyard.equipment.wall-locker",
        containerName: "EVA suit locker",
        kit: "eva-suit",
      },
    ],
    issueEmptyStorage: true,
  },
  {
    prefabId: "fed.m.heron-fleet",
    catalogRevision: "ship-components-v1@4",
    blueprintSha256:
      "f9f456dab369f22fabb064202d54f9d2b8a2e5536612db6c41a17cdb1b70bcfb",
    flightDefinitionSha256:
      "835089467474b63d1bf2d7deb3632cc8132156348ca1685639b510076d46c6ce",
    description:
      "Heron (provisional Federation Medical tender, size M, fleet r1)",
    issueStock: [
      {
        socketKey: "lock/shipyard.equipment.wall-locker",
        containerName: "EVA suit locker",
        kit: "eva-suit",
      },
    ],
    issueEmptyStorage: true,
  },
  {
    prefabId: "fed.l.kestrel-fleet",
    catalogRevision: "ship-components-v1@4",
    blueprintSha256:
      "5d62ef3b25e45fe3ee92031dcd6613721e615029000f227b42162d47b52c769b",
    flightDefinitionSha256:
      "7362f24f8adcd79c7458a74f963775048c05410cdba394ff09ce086199ad56e1",
    description:
      "Kestrel (provisional Federation Patrol frigate, size L, fleet r1)",
    issueStock: [
      {
        socketKey: "lock/shipyard.equipment.wall-locker",
        containerName: "EVA suit locker",
        kit: "eva-suit",
      },
    ],
    issueEmptyStorage: true,
  },
  {
    prefabId: "fed.l.albatross-fleet",
    catalogRevision: "ship-components-v1@4",
    blueprintSha256:
      "eb137c2d24059b1a1735ee23ff34bc569c4bdd4fce071d2f3ad2fa4493564a5c",
    flightDefinitionSha256:
      "c6b6bcfa92596b0c17451fbc1b802026376aa0b94ac6317c6b086c515a166f9d",
    description:
      "Albatross (provisional Federation Freight support, size L, fleet r1)",
    issueStock: [
      {
        socketKey: "lock/shipyard.equipment.wall-locker",
        containerName: "EVA suit locker",
        kit: "eva-suit",
      },
    ],
    issueEmptyStorage: true,
  },
];
