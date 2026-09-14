import {planetEffects,type PlanetRecipe} from '../../packages/content/src/environment';
import {buildPlanetClouds} from '../../packages/render/src/environment/planet-clouds';
import {packPlanetGeometry} from '../../packages/render/src/environment/planet-build';
/** Exact existing native-volcanic smoke preparation; independent of cloudCoverage. */
export function buildReferenceVolcanicSmoke(recipe:PlanetRecipe,lod:0|1|2){
 const effective=Math.max(lod,recipe.resolution<48?2:recipe.resolution<64?1:0),coverage=planetEffects(recipe).smoke;
 if(recipe.style!=='volcanic'||effective>=2||coverage<=0)return undefined;
 return packPlanetGeometry(buildPlanetClouds({seed:recipe.seed+909,coverage,radius:1.145,detail:48,tint:[.24,.2,.22]}));
}
