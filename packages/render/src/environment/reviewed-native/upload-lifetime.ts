export function createReviewedUploadLifetime(){
 let disposed=false;const owned=new Set<{dispose:()=>void}>(),waiting=new Set<(error:Error)=>void>();
 const check=()=>{if(disposed)throw new Error('Reviewed planet disposed');};
 function wait<T>(promise:Promise<T>):Promise<T>{check();return new Promise<T>((resolve,reject)=>{waiting.add(reject);promise.then(value=>{waiting.delete(reject);if(disposed)reject(new Error('Reviewed planet disposed'));else resolve(value);},error=>{waiting.delete(reject);reject(error);});});}
 return{check,wait,async yieldFrame(nextFrame:()=>Promise<void>){check();await wait(nextFrame());check();},
 async build<T extends {dispose:()=>void}>(node:T,upload:(node:T)=>Promise<void>){try{check();owned.add(node);await upload(node);check();owned.delete(node);return node;}catch(error){owned.delete(node);node.dispose();throw error;}},
 dispose(){if(disposed)return;disposed=true;for(const reject of waiting)reject(new Error('Reviewed planet disposed'));waiting.clear();for(const node of owned)node.dispose();owned.clear();},isDisposed:()=>disposed};
}
