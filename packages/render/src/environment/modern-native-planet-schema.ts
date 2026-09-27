/** Inactive, renderer-owned import boundary. No fetching, composition, selection or
 * publication. Validation returns the original object, preserving native data. */
export const MODERN_NATIVE_PLANET_LAYOUTS = [
  'desert-geology', 'rocky-crater-geology', 'ocean-island-geology',
  'temperate-native-continents', 'connected-toxic-crust', 'crystal-geology',
  'volcanic-regional-geology', 'single-glacial-cut-diagnostic', 'gas-bands-and-rings',
  'solid-moon-craters', 'hybrid-moon-craters', 'toxic-moon-craters',
  'ice-moon-glacial', 'volcanic-moon-craters', 'crystal-moon-native-body',
] as const;
export type ModernNativePlanetLayout = typeof MODERN_NATIVE_PLANET_LAYOUTS[number];
export interface ModernNativeMaterial {
  readonly name: string;
  readonly linearColor: readonly number[];
  readonly roughness: number;
  readonly metallic?: number;
  readonly alpha?: number;
  readonly alphaMode?: 'OPAQUE' | 'MASK' | 'BLEND';
  readonly alphaCutoff?: number;
  readonly doubleSided?: boolean;
  readonly useTextureAlpha?: boolean;
  readonly invertY?: boolean;
  readonly textureColorSpace?: 'sRGB' | 'linear';
  readonly baseColorTexture?: string;
  readonly normalTexture?: string;
  readonly normalScale?: number;
  readonly emissiveTexture?: string;
  readonly metallicRoughnessTexture?: string;
  readonly clearcoatNormalTexture?: string;
  readonly emissiveColor?: readonly number[];
  readonly emissiveStrength?: number;
  readonly ior?: number;
  readonly clearcoatFactor?: number;
  readonly clearcoatRoughnessFactor?: number;
  readonly clearCoat?: {readonly intensity: number; readonly roughness: number};
  readonly transmissionFactor?: number;
  readonly thicknessFactor?: number;
  readonly attenuationColor?: readonly number[];
  readonly attenuationDistance?: number;
  readonly [metadata: string]: unknown;
}
export interface ModernNativePartRange {
  readonly partId: string;
  readonly firstTriangle: number;
  readonly triangleCount: number;
}
export interface ModernNativeVariant {
  readonly name: string;
  readonly positions: readonly number[];
  readonly normals: readonly number[];
  readonly uvs: readonly number[];
  readonly indices: readonly number[];
  readonly triangleMaterials: readonly number[];
  readonly [metadata: string]: unknown;
}
export interface ModernNativeCompositionRecipe {
  readonly referenceId: string;
  readonly layoutSeed: number;
  readonly scales?: readonly number[];
  readonly variantOffset?: number;
  readonly bodyVariant?: string;
  readonly retainedAllLOD?: boolean;
  readonly [metadata: string]: unknown;
}
export interface ModernNativePlanetHeader {
  readonly schema: 'sidereal.native-planet-kit.v1';
  readonly layout: ModernNativePlanetLayout;
  readonly materials: readonly ModernNativeMaterial[];
  readonly compositionRecipe?: ModernNativeCompositionRecipe;
  readonly [metadata: string]: unknown;
}
export interface ModernNativePlanetKit extends ModernNativePlanetHeader {
  readonly variants: readonly ModernNativeVariant[];
  readonly nativePartRanges?: readonly ModernNativePartRange[];
}
/** Descriptor shape only. No registry or moon identity inference is installed.
 * A layout/schema pass never qualifies fixed detail or authorizes activation. */
export interface ModernNativePlanetDescriptor {
  readonly appearanceIdentity: string;
  readonly revision: string;
  readonly layout: ModernNativePlanetLayout;
  readonly kitURL: string;
  readonly kitSha256: string;
  readonly weather?: Readonly<{revision: string; kitURL: string; kitSha256: string}>;
}
export const MODERN_NATIVE_PLANET_LIMITS = Object.freeze({
  payloadBytes: 64 * 1024 * 1024,
  materials: 64,
  variants: 256,
  vertices: 4_000_000,
  triangles: 4_000_000,
});
const textureFields = ['baseColorTexture','normalTexture','emissiveTexture','metallicRoughnessTexture','clearcoatNormalTexture'] as const;
const revisionPattern = /^(?:(?:desert|rocky|ocean|temperate|ice|crystal|toxic|volcanic)(?:-moon-[12])?|rocky-moon|gas-giant-moon-[123]|gas|cloud|toxic-fog)-r\d{3}$/;
const texturePattern = /^[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|webp|ktx2|basis)$/i;
function fail(path: string): never {throw new Error(`Invalid native planet ${path}`);}
function object(value: unknown,path: string): Record<string,unknown> {
  if(!value || typeof value!=='object' || Array.isArray(value))fail(path);
  return value as Record<string,unknown>;
}
function string(value: unknown,path: string): asserts value is string {
  if(typeof value!=='string'||!value.length||value.length>512)fail(path);
}
function number(value: unknown,path: string,min=0,max=Number.MAX_VALUE): asserts value is number {
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(path);
}
function integer(value: unknown,path: string,min=0,max=Number.MAX_SAFE_INTEGER): asserts value is number {
  number(value,path,min,max);if(!Number.isSafeInteger(value))fail(path);
}
function vector(value: unknown,path: string,size: number,max=1): void {
  if(!Array.isArray(value)||value.length!==size)fail(path);
  for(const v of value)number(v,path,0,max);
}
export function validateModernNativePayloadBytes(bytes: number): void {
  integer(bytes,'payload byte budget',1,MODERN_NATIVE_PLANET_LIMITS.payloadBytes);
}
export function validateModernNativeMaterial(value: unknown): asserts value is ModernNativeMaterial {
  const m=object(value,'material');string(m.name,'material.name');vector(m.linearColor,'linearColor',3);number(m.roughness,'roughness',0,1);
  for(const key of ['metallic','alpha','alphaCutoff','clearcoatFactor','clearcoatRoughnessFactor','transmissionFactor'])if(m[key]!==undefined)number(m[key],key,0,1);
  for(const key of ['normalScale','emissiveStrength','thicknessFactor'])if(m[key]!==undefined)number(m[key],key);
  if(m.ior!==undefined)number(m.ior,'ior',1);
  if(m.attenuationDistance!==undefined)number(m.attenuationDistance,'attenuationDistance',Number.MIN_VALUE);
  if(m.emissiveColor!==undefined)vector(m.emissiveColor,'emissiveColor',3,Number.MAX_VALUE);
  if(m.attenuationColor!==undefined)vector(m.attenuationColor,'attenuationColor',3);
  for(const key of ['doubleSided','useTextureAlpha','invertY'])if(m[key]!==undefined&&typeof m[key]!=='boolean')fail(key);
  if(m.alphaMode!==undefined&&!['OPAQUE','MASK','BLEND'].includes(String(m.alphaMode)))fail('alphaMode');
  if(m.textureColorSpace!==undefined&&!['sRGB','linear'].includes(String(m.textureColorSpace)))fail('textureColorSpace');
  for(const key of textureFields)if(m[key]!==undefined){string(m[key],key);if(!texturePattern.test(m[key] as string))fail(key+' revision-local path');}
  if(m.clearCoat!==undefined){const c=object(m.clearCoat,'clearCoat');number(c.intensity,'clearCoat.intensity',0,1);number(c.roughness,'clearCoat.roughness',0,1);}
}
/** Header validation intentionally makes no claim about omitted geometry. */
export function validateModernNativePlanetHeader(value: unknown): asserts value is ModernNativePlanetHeader {
  const h=object(value,'header');
  if(h.schema!=='sidereal.native-planet-kit.v1')fail('schema');
  if(!MODERN_NATIVE_PLANET_LAYOUTS.includes(h.layout as ModernNativePlanetLayout))fail('layout');
  if(!Array.isArray(h.materials)||!h.materials.length||h.materials.length>MODERN_NATIVE_PLANET_LIMITS.materials)fail('materials budget');
  for(const m of h.materials)validateModernNativeMaterial(m);
  if(String(h.layout).includes('moon-')&&h.compositionRecipe===undefined)fail('compositionRecipe');
  if(h.compositionRecipe!==undefined){
    const recipe=object(h.compositionRecipe,'compositionRecipe');string(recipe.referenceId,'referenceId');
    if(!/^planets--[a-z0-9-]+$/.test(recipe.referenceId))fail('referenceId');
    integer(recipe.layoutSeed,'layoutSeed',0,2147483647);
    if(recipe.variantOffset!==undefined)integer(recipe.variantOffset,'variantOffset');
    if(recipe.retainedAllLOD!==undefined&&typeof recipe.retainedAllLOD!=='boolean')fail('retainedAllLOD');
    if(recipe.bodyVariant!==undefined)string(recipe.bodyVariant,'bodyVariant');
    if(recipe.scales!==undefined){if(!Array.isArray(recipe.scales)||!recipe.scales.length||recipe.scales.length>256)fail('scales');for(const v of recipe.scales)number(v,'scale',Number.MIN_VALUE);}
  }
}
/** Structural/attribute validation only. Does not re-normalize, triangulate,
 * weld, compose or prove source outward topology/GLB parity. */
export function validateModernNativePlanetKit(value: unknown,payloadBytes: number): ModernNativePlanetKit {
  validateModernNativePayloadBytes(payloadBytes);validateModernNativePlanetHeader(value);
  const h=value as ModernNativePlanetHeader & {variants?:unknown;nativePartRanges?:unknown};
  if(!Array.isArray(h.variants)||!h.variants.length||h.variants.length>MODERN_NATIVE_PLANET_LIMITS.variants)fail('variants budget');
  let vertices=0,triangles=0;const names=new Set<string>();
  for(const raw of h.variants){
    const v=object(raw,'variant');string(v.name,'variant.name');if(names.has(v.name))fail('duplicate variant name');names.add(v.name);
    for(const key of ['positions','normals','uvs','indices','triangleMaterials'])if(!Array.isArray(v[key]))fail('variant.'+key);
    const p=v.positions as unknown[],n=v.normals as unknown[],uv=v.uvs as unknown[],idx=v.indices as unknown[],roles=v.triangleMaterials as unknown[];
    if(!p.length||p.length%3||n.length!==p.length||uv.length!==p.length/3*2||!idx.length||idx.length%3||roles.length!==idx.length/3)fail('attribute lengths');
    vertices+=p.length/3;triangles+=idx.length/3;
    if(vertices>MODERN_NATIVE_PLANET_LIMITS.vertices||triangles>MODERN_NATIVE_PLANET_LIMITS.triangles)fail('geometry budget');
    for(const a of [p,n,uv])for(const x of a)number(x,'finite attribute',-Number.MAX_VALUE);
    for(const i of idx)integer(i,'vertex index',0,p.length/3-1);
    for(const role of roles)integer(role,'material index',0,h.materials.length-1);
    for(let i=0;i<n.length;i+=3)if(n[i]===0&&n[i+1]===0&&n[i+2]===0)fail('zero authored normal');
  }
  if(h.layout==='crystal-moon-native-body'||h.nativePartRanges!==undefined){
    const recipe=object(h.compositionRecipe,'part range recipe');string(recipe.bodyVariant,'bodyVariant');
    const body=(h.variants as ModernNativeVariant[]).find(v=>v.name===recipe.bodyVariant);if(!body)fail('part range bodyVariant');
    if(!Array.isArray(h.nativePartRanges)||!h.nativePartRanges.length||h.nativePartRanges.length>body.indices.length/3)fail('part ranges');
    let end=0;const ids=new Set<string>();
    for(const raw of h.nativePartRanges){const part=object(raw,'part range');string(part.partId,'partId');if(ids.has(part.partId))fail('duplicate partId');ids.add(part.partId);integer(part.firstTriangle,'firstTriangle');integer(part.triangleCount,'triangleCount',1);if(part.firstTriangle!==end)fail('part range gap/overlap/order');end+=part.triangleCount;}
    if(end!==body.indices.length/3)fail('part range coverage');
  }
  return value as ModernNativePlanetKit;
}
export function validateModernNativePlanetDescriptor(value: unknown): asserts value is ModernNativePlanetDescriptor {
  const d=object(value,'descriptor');string(d.appearanceIdentity,'appearanceIdentity');
  if(!MODERN_NATIVE_PLANET_LAYOUTS.includes(d.layout as ModernNativePlanetLayout))fail('descriptor.layout');
  const asset=(a:Record<string,unknown>)=>{string(a.revision,'revision');if(!revisionPattern.test(a.revision))fail('revision');if(a.kitURL!==`/assets/planets/${a.revision}/kit.json`)fail('kitURL');if(typeof a.kitSha256!=='string'||!/^[a-f0-9]{64}$/.test(a.kitSha256))fail('kitSha256');};
  asset(d);if(d.weather!==undefined)asset(object(d.weather,'weather descriptor'));
}
