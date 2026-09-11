/** One upload/compile continuation per browser frame across all bodies. */
export function createPlanetBuildScheduler() {
 const queue:Array<()=>void>=[];let frame:number|undefined,disposed=false;
 function schedule(){if(frame!==undefined||!queue.length||disposed)return;frame=requestAnimationFrame(()=>{frame=undefined;queue.shift()?.();schedule();});}
 return {
  next:()=>disposed?Promise.resolve():new Promise<void>(resolve=>{queue.push(resolve);schedule();}),
  dispose(){disposed=true;if(frame!==undefined)cancelAnimationFrame(frame);frame=undefined;for(const resolve of queue.splice(0))resolve();}
 };
}
