"""r002 quiet microdetail: short tooling grooves; selective fasteners are real source geometry."""
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
    # A small tooling group occupies under five percent of each chart. No panel border grid:
    # meaningful frame joints/recesses are real geometry, and broad fields stay calm.
    h[178:182,40:85]=113
    h[178:182,94:119]=113
    h[168:171,40:65]=120
    yy,xx=np.mgrid[:n,:n]
    for cx,cy in ((45,153),(75,153)):
        radius=np.sqrt((xx-cx)**2+(yy-cy)**2)
        h[(radius>=4)&(radius<6)]=133   # shallow molded fastener lip
        h[radius<4]=113              # recessed dimple, no painted albedo dot
        h[(radius<3)&(abs(yy-cy)<1)]=104
    dx=(np.roll(h,-1,axis=1)-np.roll(h,1,axis=1))/2/24
    dy=(np.roll(h,-1,axis=0)-np.roll(h,1,axis=0))/2/24
    normal=np.dstack((-dx,-dy,np.ones_like(h)))
    normal/=np.linalg.norm(normal,axis=2,keepdims=True)
    rgba=np.dstack(((normal*.5+.5)*255,h)).astype(np.uint8)
    save_png(out/"panel-normal.png",rgba,6)
    save_png(out/"panel-height.png",h.astype(np.uint8)[:,:,None],0)


if __name__=="__main__":main()
