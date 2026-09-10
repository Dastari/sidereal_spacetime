"""Qualify fixed authored carrier/payload sockets at every allowed quarter turn."""
import argparse
import json
from pathlib import Path
from validate_cargo_carriers import ROOT, digest, triangles
from validate_reserved_envelope import qualify_points, qualify_glb
from stage_cargo_carriers import INPUTS

BASE=ROOT/'assets/art-library/designs/cargo.carrier.grid-support/revisions/r000/a003'
RECEIVER=ROOT/'assets/art-library/designs/cargo.restraint.standard-small/revisions/r000/a001'


def qualify():
    for _,relative,expected in INPUTS:
        assert digest(ROOT/relative)==expected, 'Pinned native carrier/receiver changed'
    qualify_glb(RECEIVER/'receiver-set.glb',[[0,0],[1,0],[1,1],[0,1]],0,.6875)
    spec=json.loads((RECEIVER/'interface.json').read_text())
    receiver_faces,_=triangles(RECEIVER/'receiver-set.glb')
    receivers=[p for _,face in receiver_faces for p in face]
    audit=json.loads((ROOT/'docs/handoffs/cargo_grid_model_audit.json').read_text())
    rows=[r for r in audit['rows'] if r['appearance'] in spec['payloadAppearances']]
    proofs=[]
    for width in (1,2):
        carrier=BASE/f'carrier-{width}m.glb'
        qualify_glb(carrier,[[0,0],[width,0],[width,width],[0,width]],0,.6875)
        frame_faces,_=triangles(carrier)
        frame=[p for _,face in frame_faces for p in face]
        interface=json.loads((BASE/f'carrier-{width}m-interface.json').read_text())
        assert interface['nominalSizeM']==[width,width,.6875]
        x0,y0,x1,y1=interface['payloadCellInteriorM']
        dx,dy,dz=spec['payloadTranslationM']
        payload_polygon=[[x0-dx,y0-dy],[x1-dx,y0-dy],[x1-dx,y1-dy],[x0-dx,y1-dy]]
        for row in rows:
            payload_path=ROOT/row['glbPath']
            assert digest(payload_path)==row['glbSha256'] and row['glbSha256'] in spec['payloadGlbSha256']
            faces,_=triangles(payload_path)
            original=[p for _,face in faces for p in face]
            # Source pivot is untouched; the receiver contract declares the mount.
            payload_source=qualify_glb(payload_path,payload_polygon,interface['payloadFloorM']-dz,interface['payloadCeilingM']-dz)
            mounted=[(p[0]+dx,p[1]+dy,p[2]+dz) for p in original]
            for q in range(4):
                def rotate(p):
                    x,y,z=p
                    return [(x,y,z),(width-y,x,z),(width-x,width-y,z),(y,width-x,z)][q]
                points=[rotate(p) for p in frame+receivers+mounted]
                proof=qualify_points(points,[[0,0],[width,0],[width,width],[0,width]],0,.6875)
                proofs.append({'carrierWidthM':width,'payloadAssetId':row['assetId'],'payloadGlbSha256':row['glbSha256'],
                  'carrierGlbSha256':digest(carrier),'receiverGlbSha256':digest(RECEIVER/'receiver-set.glb'),
                  'quarterTurns':q,'reservedFootprintM':[[0,0],[width,0],[width,width],[0,width]],'reservedBottomM':0,'reservedTopM':.6875,
                  'declaredPivotLocalM':[width/2,width/2,0],'declaredPayloadSocketTranslationM':[dx,dy,dz],
                  'payloadSourceReservationM':{'footprint':payload_polygon,'bottom':interface['payloadFloorM']-dz,'top':interface['payloadCeilingM']-dz},
                  'payloadSourceEvidence':payload_source,**proof})
    assert len(proofs)==16
    return {'schema':'sidereal.secured-cargo-envelope.v1','sourceGeometryModified':False,'automaticScaleOrRecenter':False,
      'envelopeQualified':True,'relativePayloadQuarterTurns':[0],'assemblyQuarterTurns':[0,1,2,3],
      'engineeringCertification':False,'ownerArtSignoff':False,'runtimeRegistered':False,'assemblies':proofs}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();result=qualify();args.output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'qualifiedAssemblies':len(result['assemblies']),'unchangedNativeGeometry':True,'runtimeRegistered':False}))
