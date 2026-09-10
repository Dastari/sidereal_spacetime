/** Exact native transport assemblies. Gameplay balance is provisional and owner
 * authorized for implementation; artistic/engineering sign-off is not implied. */
export const CARGO_CARRIER_REVISION = "r000-a003-small-receiver-a001";
export const CARGO_CARRIER_GAMEPLAY = "provisional-cargo-gameplay-r001";
export const CARGO_CARRIER_FAMILY = "carrier-pad-075-grid1m-r000";
export const CARGO_CARRIER_SOURCE = {
  oneMetre: {
    id: "carrier-1m",
    widthUnits: 32,
    heightUnits: 22,
    glbSha256:
      "faa8a7b7786c4e92cfeb6ec5b25d43739ad070e202d4e2f1ee1dc98ca6877f78",
    glbPath:
      "assets/art-library/designs/cargo.carrier.grid-support/revisions/r000/a003/carrier-1m.glb",
    tareMassKg: 20,
    maxGrossMassKg: 250,
    maxTopLoadKg: 1000,
  },
  twoMetre: {
    id: "carrier-2m",
    widthUnits: 64,
    heightUnits: 22,
    glbSha256:
      "5e42e6ab46b00674129ffafe136affefa6586325c1149e838bf9ff693b9769fd",
    glbPath:
      "assets/art-library/designs/cargo.carrier.grid-support/revisions/r000/a003/carrier-2m.glb",
    tareMassKg: 60,
    maxGrossMassKg: 1000,
    maxTopLoadKg: 2000,
  },
  receiver: {
    id: "standard-small-receiver-set",
    glbSha256:
      "dac3fd3c6cca793929f9deaae8030b867ad214081cd5719cbc21778133d83044",
    glbPath:
      "assets/art-library/designs/cargo.restraint.standard-small/revisions/r000/a001/receiver-set.glb",
  },
} as const;
/** Empty-assembly tare includes the qualified payload shell and securing parts.
 * This is an explicit balance number, not a material-density calculation. */
export const SECURED_CARGO_PAYLOADS = [
  {
    appearance: "standard-small",
    installedAssetId: "part-c06e4f5f6f6dace38e41",
    glbSha256:
      "2c7f3a8a9c39ed54af84b5a42694188db99fd94c706071384dec3bf8c394e5bf",
    glbPath:
      "assets/art-library/designs/cargo.standard.small/revisions/r003/glb.glb",
  },
  {
    appearance: "standard-small-red",
    installedAssetId: "part-5382f8dbbeb54e663d33",
    glbSha256:
      "9c3e1914626d0149e298d7cdcfe70fe88c64f68df36a761994f4f9dc97453cd6",
    glbPath:
      "assets/art-library/designs/cargo.standard.small/revisions/r003/appearances/standard-small-red/glb.glb",
  },
] as const;
export type CargoCarrierSize = "oneMetre" | "twoMetre";
export const CARGO_CARRIER_RETENTION = {
  revision: "fixed-orientation-small-feet-r001",
  footWidthM: 0.04,
  openingM: 0.044,
  receiverWallHeightM: 0.028,
  maximumUpwardTravelM: 0.01975005865097046,
  payloadTranslationM: [0.5, 0.5377499908208847, 0.09375] as const,
  acceptedRelativeQuarterTurns: [0] as const,
  assemblyQuarterTurns: [0, 1, 2, 3] as const,
  payloadsPerAssembly: 1,
  /** The remaining cells on a2m frame are reserved, not extra inventory slots. */
  selectedCell: [0, 0] as const,
  closedPayloadMaxHeightM: 0.5114999413490295,
  patchLoadKg: 1000,
  gridLoadKg: 5000,
} as const;
