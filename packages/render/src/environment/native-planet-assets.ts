import {composeNativePlanet,type NativePlanetKit} from "./native-planet-composition";
export const NATIVE_ICE_REVISION="ice-r015";
export const NATIVE_ICE_KIT_URL=`/assets/planets/${NATIVE_ICE_REVISION}/kit.json`;
let pending:Promise<NativePlanetKit>|undefined;
/** One immutable authored kit request shared across scenes; failed loads can retry. */
export function loadNativeIceKit():Promise<NativePlanetKit>{
 pending??=fetch(NATIVE_ICE_KIT_URL).then(async response=>{
  if(!response.ok)throw new Error(`Native ice kit HTTP${response.status}`);
  const kit=await response.json() as NativePlanetKit;
  if(kit.layout!=="glacial-interior")throw new Error("Unsupported native ice layout");
  // Existing strict native geometry/material/recipe and whole-output budget validation.
  composeNativePlanet(kit,0,.55,.65);
  return kit;
 }).catch(error=>{pending=undefined;throw error;});
 return pending;
}
