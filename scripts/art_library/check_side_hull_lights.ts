import{readFileSync,writeFileSync}from'node:fs';
import{NullEngine}from'@babylonjs/core/Engines/nullEngine';
import{Scene}from'@babylonjs/core/scene';
import{TransformNode}from'@babylonjs/core/Meshes/transformNode';
import{createEquipmentLighting}from'../../packages/render/src/equipment-lighting';
import type{PartCatalog,AssemblyDocument}from'../../packages/content/src/assembly';
const out=process.argv[2]??'.runtime/art-library/side-hull/r003',c:PartCatalog=JSON.parse(readFileSync(out+'/ship-catalog.json','utf8')),d:AssemblyDocument=JSON.parse(readFileSync(out+'/ship-wayfarer.json','utf8'));
const e=new NullEngine(),s=new Scene(e),checks=[];
for(const p of d.parts){const a=c.assets.find(a=>a.id===p.assetId)!;if(a.visual?.designId!=='shipyard.hull.side-armor'||!a.lights?.length)continue;const parent=new TransformNode(p.id,s),rig=createEquipmentLighting(s,parent,a.lights);checks.push({placement:p.id,described:a.lights.length,created:rig.lights.length,bounded:rig.lights.every(l=>l.range<=3&&l.intensity<=2),positions:rig.lights.map(l=>l.position.asArray()),directions:rig.lights.map(l=>l.direction.asArray())});rig.dispose();parent.dispose();}
const report={passed:checks.length>0&&checks.every(c=>c.created===c.described&&c.bounded),pipeline:'Actual createEquipmentLighting in Babylon NullEngine. Visual spill requires browser capture.',totalFixtures:checks.reduce((n,c)=>n+c.created,0),checks};writeFileSync(out+'/light-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));s.dispose();e.dispose();if(!report.passed)process.exitCode=1;
