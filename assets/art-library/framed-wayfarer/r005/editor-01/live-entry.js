async (page) => {
 await page.setViewportSize({width:1600,height:1000});
 await page.getByRole('button',{name:'New',exact:true}).click();
 await page.getByRole('button',{name:'Open Wayfarer armor review',exact:true}).waitFor();
 await page.screenshot({path:'output/playwright/armor-editor-r005/open-review.png'});
 await page.getByRole('button',{name:'Open Wayfarer armor review',exact:true}).click();
 await page.waitForFunction(()=>{const c=document.querySelector('canvas');return c?.dataset.placements==='84'&&c.dataset.nativeWallPieces==='169'&&c.dataset.nativeWallMeshes==='855'&&c.dataset.structuralWallGuides==='0';},{},{timeout:30000});
 const evidence=await page.evaluate(async()=>{
  const response=await fetch('/assets/shipyard/armor-r005/hull.glb');
  const bytes=await response.arrayBuffer();
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  return {url:location.href,asset:{status:response.status,bytes:bytes.byteLength,sha256:digest},canvases:document.querySelectorAll('canvas').length,dataset:{...document.querySelector('canvas').dataset}};
 });
 if(evidence.asset.sha256!=='dcc978612d390e08895cb8dc9011d02e3ffe2a83be9480bcaa7bbc04fce4d1c8')throw Error('Wrong live native revision');
 if(evidence.canvases!==1||evidence.dataset.nativeWallIssues!=='[]'||evidence.dataset.nativeFloorIssues!=='[]')throw Error('Invalid live editor state');
 return evidence;
}
