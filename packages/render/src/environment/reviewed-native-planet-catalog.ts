import type {PlanetStyle} from '../../../content/src/environment';
import type {ModernNativePlanetLayout} from './modern-native-planet-schema';
import type {ReviewedNativeEncoding} from './reviewed-native-planet-encoding';
import catalog from './reviewed-native-planet-catalog.json';
export interface ReviewedNativeAssetPayload {
 readonly revision: string;
 readonly layout: string;
 readonly kitURL: string;
 readonly textureBaseURL: string;
 readonly sourceKitSha256: string;
 readonly runtimeKitSha256: string;
 readonly encoding: ReviewedNativeEncoding;
}
export interface ReviewedNativePlanetDescriptor extends ReviewedNativeAssetPayload {
 readonly id: string;
 readonly label: string;
 readonly style: PlanetStyle;
 readonly layout: ModernNativePlanetLayout;
 readonly fixedDetail: boolean;
 readonly glow: boolean;
 readonly localLight: boolean;
 readonly weather?: ReviewedNativeAssetPayload;
}
/** Generated from exact reviewed pins by package_reviewed_native_planets.py.
 * Explicit Genesis selection only; no inference from authoritative body names. */
export const REVIEWED_NATIVE_PLANETS: readonly ReviewedNativePlanetDescriptor[] = Object.freeze(
 catalog.map(value=>Object.freeze({...value,...(value.weather?{weather:Object.freeze(value.weather)}:{})}) as ReviewedNativePlanetDescriptor),
);
export function reviewedNativePlanet(id: string): ReviewedNativePlanetDescriptor | undefined {
 return REVIEWED_NATIVE_PLANETS.find(value=>value.id===id);
}
