/** Read-only authored geometry boundary shared by historical and modern callers.
 * Composers own their output arrays; source numeric arrays are never modified.
 */
export interface ReviewedComposerInput {
  readonly schema: "sidereal.native-planet-kit.v1";
  readonly layout?: string;
  readonly materials: readonly {
    readonly name: string;
    readonly linearColor: readonly number[];
    readonly roughness: number;
  }[];
  readonly variants: readonly {
    readonly name: string;
    readonly positions: readonly number[];
    readonly indices: readonly number[];
    readonly triangleMaterials: readonly number[];
    readonly normals?: readonly number[];
    readonly uvs?: readonly number[];
  }[];
}
