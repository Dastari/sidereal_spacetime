window.__snapshotIntegrationProbe={status:'pending'};(async()=>{try{
const path='/@fs/root/sidereal_spacetime/packages/render/src/';
const index=await(await fetch(path+'index.ts')).text(),decals=await(await fetch(path+'hull-decals.ts')).text(),lights=await(await fetch(path+'ship-lighting.ts')).text();
const u=(text,name)=>text.split('\n').find(l=>l.startsWith('import ')&&l.includes(name)&&l.includes(' from ')).match(/from "([^"]+)/)[1];
const [{Scene},{ArcRotateCamera},{Vector3},{CreateBox},{PBRMaterial},{HemisphericLight},{createWebGPUEngine},{createFastSnapshot:createFlightActiveSet},{createStaticMaterialFreeze},{createAntialiasing}]=await Promise.all([import(u(index,'Scene }')),import(u(index,'ArcRotateCamera')),import(u(index,'Vector3')),import(u(index,'CreateBox')),import(u(decals,'PBRMaterial')),import(u(lights,'HemisphericLight')),import(path+'webgpu-backend.ts'),import(path+'fast-snapshot.ts?t=R10_bundle_diagnostics'),import(path+'static-material-freeze.ts?t=R5_instance_dirty_bindings'),import(path+'antialiasing-pipeline.ts')]);
const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;const e=await createWebGPUEngine(canvas);e.setSize(320,240);
const s=new Scene(e);s.useRightHandedSystem=true;new ArcRotateCamera('probe-camera',.4,.95,8,Vector3.Zero(),s);new HemisphericLight('probe-fill',Vector3.Up(),s).intensity=1;
const mat=new PBRMaterial('probe-material',s);mat.metallic=0;mat.roughness=.6;
const source=CreateBox('prototype',{},s);source.material=mat;source.metadata={role:'hull'};s.removeMesh(source);
const instances=[-1,1].map(x=>{const mesh=source.createInstance('placed-'+x);mesh.position.x=x;mesh.metadata={role:'hull',partId:String(x)};return mesh;});
const [{GlowLayer},{DirectionalLight},{ShadowGenerator}]=await Promise.all([import(u(index,'GlowLayer')),import(u(lights,'DirectionalLight')),import(u(lights,'ShadowGenerator'))]);
const glow=new GlowLayer('probe-glow',s,{mainTextureFixedSize:128});glow.addIncludedOnlyMesh(source);for(const mesh of instances)glow.addIncludedOnlyMesh(mesh);
mat.emissiveColor.set(.1,.2,.3);source.receiveShadows=true;
const key=new DirectionalLight('probe-shadow-key',new Vector3(0,-1,1),s);key.position.set(0,5,-5);
const shadow=new ShadowGenerator(128,key);for(const mesh of instances)shadow.addShadowCaster(mesh);
const aa=createAntialiasing(s,s.activeCamera,{temporalResetIntegrated:true,storage:{getItem:()=>null,setItem:()=>{}}});
const materials=createStaticMaterialFreeze(s),owner=createFlightActiveSet(s);
window.__snapshotIntegrationResources={owner,materials,aa,s,e,source};const phases=[];window.__snapshotIntegrationPhases=phases;
for(const phase of ['normal','frozen','hidden','restored','shadow-once','shadow-refresh','glow-off','glow-on','lighting-off','lighting-on','disposed','replacement','geometry-edit','taa','deck']){
if(phase==='shadow-once')shadow.getShadowMap().refreshRate=0;
if(phase==='shadow-refresh')shadow.getShadowMap().resetRefreshCounter();
if(phase==='glow-off')glow.isEnabled=false;
if(phase==='glow-on')glow.isEnabled=true;
if(phase==='disposed')instances[1].dispose();
if(phase==='replacement'){instances[1]=source.createInstance('replacement');instances[1].position.x=1;instances[1].metadata={role:'hull',partId:'replacement'};}
if(phase==='geometry-edit'){const p=source.getVerticesData('position');for(let i=0;i<p.length;i+=3)p[i]*=1.2;source.updateVerticesData('position',p,true);}
if(phase==='hidden')instances[1].setEnabled(false);
if(phase==='restored')instances[1].setEnabled(true);
if(phase==='lighting-off'||phase==='lighting-on'){materials.invalidate();s.lightsEnabled=phase==='lighting-on';}
if(phase==='taa'){materials.invalidate();aa.set({mode:'taa'});}
e._device.pushErrorScope('validation');let calls=0,meanRGB=0;
for(let i=0;i<10;i++){materials.prepare();owner.prepare({ready:phase!=='normal'&&phase!=='deck',reducedMotion:true,temporal:phase==='taa',displayRevision:0});e._drawCalls.fetchNewFrame();e.beginFrame();s.render();if(i===9){const pixels=await e.readPixels(0,0,320,240);let sum=0;for(let p=0;p<pixels.length;p+=4)sum+=pixels[p]+pixels[p+1]+pixels[p+2];meanRGB=sum/(320*240*3);}e.endFrame();calls=e._drawCalls.current;await e._device.queue.onSubmittedWorkDone();await new Promise(r=>setTimeout(r,70));}
const error=await e._device.popErrorScope();
phases.push({phase,...owner.snapshot(),recorded:owner.activeStats(),materialFrozen:mat.isFrozen,drawCalls:calls,activeMeshes:s.getActiveMeshes().length,instanceIds:instances.filter(m=>!m.isDisposed()&&m.isEnabled()).map(m=>m.metadata.partId),meanRGB,shaderHasLight0:source.subMeshes[0].effect?.defines.includes('#define LIGHT0'),instanceBatchFrozen:!!source._instanceDataStorage.isFrozen,validationError:error?.message??null,aa:aa.snapshot()});
}
window.__snapshotIntegrationProbe={status:'complete',webgpu:e.isWebGPU,phases};
}catch(error){window.__snapshotIntegrationProbe={status:'failed',error:String(error),stack:error.stack}}})();window.__snapshotIntegrationProbe
