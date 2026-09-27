async (page) => {
 await page.getByRole('button',{name:'Measure vertices',exact:true}).click();
 const clear=page.getByRole('button',{name:'Clear',exact:true});if(await clear.count() && await clear.isEnabled())await clear.click();
 const targets=await page.evaluate(async()=>{
  const {isMeasurableMesh,measurementVertexFromPick}=await import('/@fs/root/sidereal_spacetime/packages/render/src/layout-vertex-measurement.ts');
  const scene=window.armorEvidenceScene,camera=scene.activeCamera,engine=scene.getEngine(),canvas=engine.getRenderingCanvas(),rect=canvas.getBoundingClientRect();
  const points=[];
  for(const mesh of scene.meshes.filter(m=>m.metadata?.assetId?.startsWith('armor-block-')&&isMeasurableMesh(m,camera))){
   const positions=mesh.getVerticesData('position'),world=mesh.computeWorldMatrix(true),V=mesh.position.constructor;
   for(let n=0;n<positions.length;n+=3){
    const p=V.TransformCoordinates(new V(positions[n],positions[n+1],positions[n+2]),world);
    const screen=V.Project(p,world.constructor.Identity(),scene.getTransformMatrix(),camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight()));
    const x=(screen.x+.5)*rect.width/engine.getRenderWidth(),y=(screen.y+.5)*rect.height/engine.getRenderHeight();
    if(x<50||y<110||x>rect.width-50||y>rect.height-60)continue;
    if(document.elementFromPoint(rect.left+x,rect.top+y)!==canvas)continue;
    const hit=scene.pick((screen.x+.5)*engine.getHardwareScalingLevel(),(screen.y+.5)*engine.getHardwareScalingLevel(),m=>isMeasurableMesh(m,camera),false,camera);
    if(!hit?.pickedMesh?.metadata?.assetId?.startsWith('armor-block-'))continue;
    const vertex=measurementVertexFromPick(hit,camera,rect.width,rect.height,[0,0,0],x,y);
    if(!vertex)continue;
    if(points.some(prev=>Math.hypot(x+rect.left-prev.x,y+rect.top-prev.y)<80||Math.hypot(...vertex.map((v,i)=>v-prev.vertex[i]))<.5))continue;
    points.push({id:hit.pickedMesh.metadata.partId,x:rect.left+x,y:rect.top+y,vertex});break;
   }
   if(points.length>=2)break;
  }
  return points;
 });
 if(targets.length!==2)throw Error('Two visible armor vertices required: '+JSON.stringify(targets));
 for(const p of targets)await page.mouse.click(p.x,p.y);
 const points=await page.evaluate(()=>JSON.parse(document.querySelector('canvas').dataset.measurementPoints??'[]'));
 if(points.length!==2)throw Error('Two native vertices were not measured: '+JSON.stringify({targets,points}));
 await page.screenshot({path:'output/playwright/armor-editor-r005/measurement.png'});
 await page.getByRole('button',{name:'Select and move components',exact:true}).click();
 return {targets,measuredPoints:points,hardwareScalingVerified:true};
}
