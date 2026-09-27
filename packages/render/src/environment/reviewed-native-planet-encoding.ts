/** Lossless transport only: decoded native corner/triangle inventory is unchanged. */
export type ReviewedNativeEncoding = 'json' | 'native-packed-v1';
export const REVIEWED_NATIVE_PAYLOAD_LIMIT = 64 * 1024 * 1024;
export const REVIEWED_NATIVE_HEADER_LIMIT = 4 * 1024 * 1024;
const fields = ['positions','normals','uvs','indices','triangleMaterials'] as const;
function invalid(message: string): never {throw new Error(`Invalid reviewed native payload: ${message}`);}
function record(value: unknown): Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value))invalid('object required');return value as Record<string,unknown>;
}
function uint(value: unknown): number {if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)invalid('nonnegative integer required');return value;}
/** SDNPK001; uint32 LE header-byte-count, uint32 LE blob-byte-count; UTF8 JSON
 * {kit,buffers}; zero padding to 8 bytes; little-endian f64/u32 buffer blob.
 * The worker must verify the descriptor SHA256 before decoding and then validate
 * the decoded kit. This decoder does not select assets or qualify their LOD. */
export function decodeReviewedNativePayload(bytes: Uint8Array,encoding: ReviewedNativeEncoding): unknown {
 if(!bytes.byteLength||bytes.byteLength>REVIEWED_NATIVE_PAYLOAD_LIMIT)invalid('64MiB bound');
 const text=new TextDecoder('utf-8',{fatal:true});
 if(encoding==='json')return JSON.parse(text.decode(bytes));
 if(encoding!=='native-packed-v1'||bytes.byteLength<16||text.decode(bytes.subarray(0,8))!=='SDNPK001')invalid('encoding or magic');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),headerLength=view.getUint32(8,true),blobLength=view.getUint32(12,true);
 const blobStart=Math.ceil((16+headerLength)/8)*8;
 if(!headerLength||headerLength>REVIEWED_NATIVE_HEADER_LIMIT||blobStart+blobLength!==bytes.byteLength)invalid('header/blob bounds');
 for(let i=16+headerLength;i<blobStart;i++)if(bytes[i]!==0)invalid('header padding');
 const header=record(JSON.parse(text.decode(bytes.subarray(16,16+headerLength)))),kit=record(header.kit);
 if(!Array.isArray(header.buffers)||header.buffers.length>1280||!Array.isArray(kit.variants))invalid('buffer inventory');
 let end=0;
 const decoded=header.buffers.map(raw=>{
  const b=record(raw),offset=uint(b.offset),length=uint(b.length),stride=b.type==='f64'?8:b.type==='u32'?4:invalid('numeric type');
  if(length>16_777_216||offset!==Math.ceil(end/8)*8||offset+length*stride>blobLength)invalid('numeric buffer bounds/order');
  for(let i=end;i<offset;i++)if(bytes[blobStart+i]!==0)invalid('buffer padding');
  const values=new Array<number>(length);
  for(let i=0;i<length;i++){const value=b.type==='f64'?view.getFloat64(blobStart+offset+i*8,true):view.getUint32(blobStart+offset+i*4,true);if(!Number.isFinite(value))invalid('nonfinite attribute');values[i]=value;}
  end=offset+length*stride;return {type:b.type,values};
 });
 if(end!==blobLength)invalid('trailing blob data');
 const used=new Set<number>();
 for(const raw of kit.variants){const variant=record(raw);for(const field of fields){
  if(variant[field]===undefined)continue;
  const marker=record(variant[field]);if(Object.keys(marker).length!==1)invalid('buffer reference shape');
  const index=uint(marker.$nativeBuffer),buffer=decoded[index];
  if(!buffer||used.has(index)||buffer.type!==(field==='indices'||field==='triangleMaterials'?'u32':'f64'))invalid('buffer reference/type');
  used.add(index);variant[field]=buffer.values;
 }}
 if(used.size!==decoded.length)invalid('unreferenced buffer');
 return kit;
}
