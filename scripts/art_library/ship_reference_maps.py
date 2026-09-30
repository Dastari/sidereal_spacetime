"""Generate sparse quantized panel relief; colour/roughness/plastic remain material-owned."""
from pathlib import Path
import argparse
import numpy as np
import struct
import zlib


def save_png(path,data,colour):
    height,width=data.shape[:2]
    def chunk(name,payload):
        return struct.pack(">I",len(payload))+name+payload+struct.pack(">I",zlib.crc32(name+payload)&0xffffffff)
    raw=b"".join(b"\0"+row.tobytes() for row in data)
    path.write_bytes(b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",width,height,8,colour,0,0,0))+chunk(b"IDAT",zlib.compress(raw,9))+chunk(b"IEND",b""))

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--out",required=True)
    args=parser.parse_args()
    out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
    n=256
    h=np.full((n,n),128,dtype=np.float32)
    # One metre trim tile: sparse straight grooves, square fastener slots, no smooth noise.
    for p in (16,240):
        h[p:p+2,16:242]=116
        h[16:242,p:p+2]=116
    for x,y in ((28,28),(220,28),(28,220),(220,220)):
        h[y:y+8,x:x+8]=120
        h[y+3:y+5,x+1:x+7]=106
    h[180:182,42:82]=119
    h[180:182,90:116]=119
    dx=(np.roll(h,-1,axis=1)-np.roll(h,1,axis=1))/2/24
    dy=(np.roll(h,-1,axis=0)-np.roll(h,1,axis=0))/2/24
    normal=np.dstack((-dx,-dy,np.ones_like(h)))
    normal/=np.linalg.norm(normal,axis=2,keepdims=True)
    rgba=np.dstack(((normal*.5+.5)*255,h)).astype(np.uint8)
    save_png(out/"panel-normal.png",rgba,6)
    save_png(out/"panel-height.png",h.astype(np.uint8)[:,:,None],0)


if __name__=="__main__":main()
