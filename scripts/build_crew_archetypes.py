"""Original reference-led modular surfaces, preserving the existing sixteen-bone rig."""
import bpy, math, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
LOOKS=json.loads((ROOT/'packages/content/src/crew-looks.json').read_text())

def curved_visor(name,attachment,rig,parts,material,width=.46,bottom=1.405,top=1.665,front=-.30):
    # Closed authored optical shell. It is deliberately never sent to opaque sampling.
    n=14; radius=width/(2*math.sin(.80)); vertices=[]
    for thickness in [0,.009]:
        for z in [bottom,(bottom+top)/2,top]:
            for i in range(n+1):
                a=-.8+1.6*i/n
                vertices.append((math.sin(a)*radius,front+radius*(1-math.cos(a))+thickness,z))
    row=n+1; layer=row*3; faces=[]
    for back in [0,1]:
        for j in range(2):
            for i in range(n):
                a=back*layer+j*row+i; face=(a,a+1,a+row+1,a+row)
                faces.append(face if back==0 else tuple(reversed(face)))
    for j in [0,2]:
        for i in range(n):
            a=j*row+i; face=(a,a+layer,a+layer+1,a+1);faces.append(face if j==0 else tuple(reversed(face)))
    for i in [0,n]:
        for j in range(2):
            a=j*row+i;face=(a,a+row,a+row+layer,a+layer);faces.append(face if i==0 else tuple(reversed(face)))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    o=bpy.data.objects.new('GEO-'+name,mesh);bpy.context.collection.objects.link(o)
    for face in mesh.polygons:face.use_smooth=True
    o.data.materials.append(material);group=o.vertex_groups.new(name='head');group.add(list(range(len(vertices))),1,'REPLACE')
    mod=o.modifiers.new('Crew skeleton','ARMATURE');mod.object=rig;o.parent=rig;o['attachment']=attachment;o['optical_surface']=True;parts.append(o)
    return o

def build_archetypes(brick,rig,parts,materials):
    def b(name,loc,size,role='trim',bone='head',bevel=.006,tag=None):
        return brick(name,loc,size,role,bone,bevel,tag)
    def cross(name,x,y,z,scale,tag,bone='spine'):
        b(name+'-vertical',(x,y,z),(scale*.32,.014,scale),'insignia',bone,.002,tag)
        b(name+'-horizontal',(x,y-.002,z),(scale,.014,scale*.32),'insignia',bone,.002,tag)
    # Remove only old flat visor geometry; opaque helmet structures and bone assignments survive.
    for o in list(parts):
        if o.name in ['GEO-helmet-visor','GEO-visor-reflection','GEO-marine-visor','GEO-explorer-wide-visor']:
            parts.remove(o);bpy.data.objects.remove(o,do_unlink=True)
    for name,tag,width,bottom,top,front in [('standard-curved-visor','visor-standard',.46,1.405,1.665,-.30),('marine-curved-visor','helmet-marine',.46,1.425,1.645,-.322),('explorer-curved-visor','helmet-explorer',.50,1.42,1.705,-.323)]:
        curved_visor(name,tag,rig,parts,materials['visor'],width,bottom,top,front)
    # Fine shared seams, chest connectors and practical armor lights; no emissive body plates.
    for side,s in [('L',1),('R',-1)]:
        b('wrist-seal-'+side,(s*.40,-.134,.806),(.14,.018,.026),'rubber','forearm.'+side,.003)
        for k in [-1,1]:
            b('boot-toe-fastener-'+side+str(k),(s*.14+k*.06,-.249,.13),(.023,.013,.028),'insignia','foot.'+side,.003)
        b('shin-edge-'+side,(s*.225,-.095,.29),(.025,.035,.185),'trim','shin.'+side,.004)
        b('shoulder-trim-'+side,(s*.325,-.169,1.19),(.18,.021,.025),'trim','upper_arm.'+side,.004)
        for k in range(3):
            b('finger-joint-'+side+str(k),(s*.40+(k-1)*.038,-.119,.693),(.027,.012,.015),'trim','hand.'+side,.002)
    # Officer torso with real lapels and brass buttons, plus scientist split coat.
    b('uniform-core',(0,0,1.025),(.445,.30,.40),'suit','spine',.025,'body-uniform')
    b('uniform-shirt',(0,-.166,1.16),(.17,.04,.16),'trim','spine',.008,'body-uniform')
    for s in [-1,1]:
        o=b('uniform-lapel'+str(s),(s*.09,-.201,1.14),(.065,.025,.17),'suit','spine',.004,'body-uniform');o.rotation_euler.y=s*.28
    b('uniform-tie',(0,-.192,1.165),(.036,.025,.11),'insignia','spine',.002,'body-uniform')
    for z in [.95,1.01,1.075]:
        for x in [-.085,.085]:b('uniform-button'+str((x,z)),(x,-.165,z),(.022,.017,.022),'insignia','spine',.003,'body-uniform')
    b('lab-coat-torso',(0,0,1.025),(.46,.31,.41),'suit','spine',.025,'body-lab-coat')
    for s in [-1,1]:
        b('lab-coat-lapel'+str(s),(s*.085,-.174,1.16),(.095,.032,.15),'trim','spine',.008,'body-lab-coat')
        b('lab-coat-tail'+str(s),(s*.14,-.03,.79),(.205,.29,.22),'suit','thigh.'+('L' if s==1 else 'R'),.012,'body-lab-coat')
    # Peaked caps have stepped crowns, distinct bands, projecting brims and actual badges.
    for kind,color in [('captain','trim'),('security','accent'),('mechanic','accent')]:
        tag='helmet-'+kind
        b(kind+'-cap-band',(0,.005,1.704),(.485,.405,.072),'suit','head',.009,tag)
        for j in range(3):
            b(kind+'-cap-course'+str(j),(0,.005+j*.006,1.754+j*.030),(.51-j*.055,.43-j*.035,.044),color,'head',.009,tag)
        b(kind+'-brim',(0,-.236,1.681),(.51,.185,.042),'suit','head',.007,tag)
        b(kind+'-brim-edge',(0,-.326,1.681),(.455,.018,.016),'insignia','head',.003,tag)
        for s in [-1,1]:
            b(kind+'-side-lock'+str(s),(s*.199,.025,1.59),(.063,.245,.18),'hair','head',.008,tag)
            b(kind+'-cap-stud'+str(s),(s*.233,-.205,1.735),(.019,.013,.024),'insignia','head',.003,tag)
        b(kind+'-badge',(0,-.227,1.765),(.080,.028,.073),'insignia','head',.004,tag)
        b(kind+'-badge-inset',(0,-.244,1.773),(.025,.012,.032),'suit','head',.002,tag)
        if kind=='mechanic':
            b('mechanic-cap-panel',(0,.003,1.849),(.09,.33,.03),'suit','head',.005,tag)
            b('mechanic-cap-lamp',(.19,-.18,1.756),(.09,.065,.075),'trim','head',.007,tag)
            b('mechanic-cap-lamp-face',(.19,-.217,1.756),(.061,.012,.041),'light','head',.002,tag)
    # White medical, striped pilot, and ochre industrial pressure helmets.
    for kind in ['medic','pilot','salvage']:
        tag='helmet-'+kind;outer='accent' if kind=='salvage' else 'trim'
        for j in range(4):
            b(kind+'-helmet-crown'+str(j),(0,.028,1.752+j*.03),(.54-j*.075,.46-j*.035,.055),outer,'head',.011,tag)
        for s in [-1,1]:
            b(kind+'-temple'+str(s),(s*.258,.02,1.56),(.10,.42,.31),outer,'head',.015,tag)
            b(kind+'-comms'+str(s),(s*.32,.05,1.56),(.045,.145,.17),'suit','head',.008,tag)
            b(kind+'-comms-inset'+str(s),(s*.347,.022,1.56),(.016,.071,.081),'insignia','head',.004,tag)
            b(kind+'-cheek'+str(s),(s*.217,-.231,1.397),(.095,.09,.13),outer,'head',.01,tag)
            b(kind+'-visor-rim'+str(s),(s*.223,-.265,1.545),(.018,.025,.25),'rubber','head',.003,tag)
        b(kind+'-jaw',(0,-.039,1.323),(.53,.44,.10),outer,'head',.014,tag)
        b(kind+'-jaw-seal',(0,-.271,1.343),(.31,.022,.027),'rubber','head',.004,tag)
        b(kind+'-brow',(0,-.234,1.716),(.45,.061,.046),outer,'head',.009,tag)
        curved_visor(kind+'-visor',tag,rig,parts,materials['visor'])
        if kind=='medic':cross('medic-helmet-mark',0,-.257,1.772,.145,tag,'head')
        elif kind=='pilot':
            for j in range(4):
                for x in [-.084,0,.084]:
                    b('pilot-stripe'+str((j,x)),(x,.028,1.782+j*.03),(.040,.46-j*.035,.014),'insignia' if x==0 else 'accent','head',.003,tag)
            b('pilot-front-stripe',(0,-.268,1.765),(.055,.018,.087),'insignia','head',.003,tag)
        else:
            for s in [-1,1]:b('salvage-hazard'+str(s),(s*.19,-.273,1.703),(.065,.014,.036),'rubber','head',.003,tag)
    # Open engineer lamp helmet now carries two optics and actual segmented rear shell.
    for s in [-1,1]:
        b('engineer-optic-housing'+str(s),(s*.17,-.224,1.728),(.10,.12,.098),'trim','head',.009,'helmet-engineer')
        b('engineer-optic-lens'+str(s),(s*.17,-.29,1.728),(.062,.012,.054),'light','head',.006,'helmet-engineer')
        for k in range(3):b('engineer-shell-course'+str((s,k)),(s*(.21-k*.065),.07,1.75+k*.028),(.075,.26,.067),'accent','head',.007,'helmet-engineer')
    # Recon silhouette: segmented olive shroud, dark face insert and green binocular lenses.
    tag='helmet-recon'
    for j in range(4):b('recon-shell-course'+str(j),(0,.04,1.735+j*.039),(.52-j*.065,.45-j*.032,.06),'accent','head',.01,tag)
    b('recon-mask',(0,-.214,1.455),(.42,.13,.25),'rubber','head',.018,tag)
    for s in [-1,1]:
        b('recon-cheek'+str(s),(s*.235,.01,1.52),(.10,.43,.30),'suit','head',.014,tag)
        b('recon-optic-shell'+str(s),(s*.12,-.305,1.6),(.155,.15,.145),'suit','head',.015,tag)
        b('recon-optic-ring'+str(s),(s*.12,-.39,1.6),(.117,.035,.11),'insignia','head',.009,tag)
        b('recon-optic-lens'+str(s),(s*.12,-.413,1.6),(.077,.013,.075),'light','head',.015,tag)
        b('recon-comms'+str(s),(s*.305,.04,1.59),(.049,.15,.15),'trim','head',.009,tag)
    # Purple asymmetric stepped hair, finer courses than the original swept haircut.
    tag='hair-scientist'
    for row in range(4):
        for col in range(5):
            x=(col-2)*.085;y=(row-1.5)*.095;z=1.716+.024*((col+2*row)%3)+(.018 if col<2 else 0)
            b('scientist-lock'+str((row,col)),(x,y,z),(.101,.112,.117),'hair','head',.005,tag)
    for s in [-1,1]:
        for j in range(3):b('scientist-side-lock'+str((s,j)),(s*.216,.105-j*.085,1.59+.028*(j%2)),(.069,.10,.19),'hair','head',.006,tag)
    for i in range(4):b('scientist-fringe'+str(i),(-.14+i*.084,-.198,1.626+.017*(i%2)),(.092,.06,.105),'hair','head',.004,tag)
    # Archetype-specific overlays produce more than palette swaps.
    for look in LOOKS:
        tag='look-'+look
        if look in ['captain','security']:
            for side,s in [('L',1),('R',-1)]:
                b(look+'-epaulette'+side,(s*.33,-.015,1.275),(.20,.24,.036),'insignia','upper_arm.'+side,.005,tag)
                for j in range(3 if look=='captain' else 1):b(look+'-rank'+side+str(j),(s*.40,-.127,.84+j*.032),(.125,.018,.014),'insignia','forearm.'+side,.002,tag)
            b(look+'-breast-badge',(-.13,-.177,1.12),(.065,.025,.064),'insignia','spine',.006,tag)
        elif look=='medic':
            b('medic-breastplate',(0,-.18,1.08),(.36,.075,.24),'trim','spine',.015,tag)
            cross('medic-breast-mark',0,-.226,1.085,.10,tag)
            for side,s in [('L',1),('R',-1)]:
                b('medic-arm-band'+side,(s*.39,-.017,1.04),(.18,.245,.055),'accent','upper_arm.'+side,.006,tag)
                b('medic-shin-band'+side,(s*.14,-.125,.32),(.18,.026,.065),'accent','shin.'+side,.004,tag)
        elif look=='pilot':
            for x in [-.145,.145]:b('pilot-harness'+str(x),(x,-.19,1.07),(.045,.058,.29),'rubber','spine',.008,tag)
            b('pilot-chest-console',(0,-.204,1.105),(.19,.055,.14),'accent','spine',.01,tag)
            for j in range(3):b('pilot-control'+str(j),(-.052+j*.052,-.237,1.11),(.031,.012,.05),'light' if j==0 else 'trim','spine',.003,tag)
        elif look in ['salvage','mechanic','recon']:
            b(look+'-vest',(0,-.183,1.055),(.42,.073,.30),'suit','spine',.019,tag)
            for s in [-1,1]:
                b(look+'-vest-rail'+str(s),(s*.15,-.229,1.07),(.055,.025,.30),'accent','spine',.006,tag)
                for j in range(2):b(look+'-pouch'+str((s,j)),(s*(.11+j*.09),-.196,.884),(.074,.085,.095),'accent' if look!='recon' else 'rubber','pelvis',.009,tag)
            b(look+'-status',(.055,-.233,1.154),(.042,.012,.031),'light','spine',.003,tag)
            if look=='salvage':
                for i in range(6):b('salvage-feed-tube'+str(i),(-.224,-.13,1.015+i*.043),(.058,.076,.031),'insignia','spine',.007,tag)
            if look=='mechanic':
                for j in range(3):b('mechanic-driver'+str(j),(-.20+j*.047,-.263,.925),(.024,.027,.14),'trim','pelvis',.003,tag)
        elif look=='scientist':
            b('scientist-lab-pocket',(-.125,-.186,1.07),(.11,.027,.105),'trim','spine',.006,tag)
            b('scientist-ID',(.125,-.186,1.14),(.055,.018,.075),'insignia','spine',.003,tag)
            for i in range(3):b('scientist-pen'+str(i),(-.157+i*.028,-.205,1.117),(.012,.012,.08),'light' if i==0 else 'accent','spine',.002,tag)
    # Octagonal shell courses catch light around corners instead of reading as stacked slabs.
    # Original mesh data are replaced before rig export; head weights and material roles survive.
    for o in list(parts):
        shell = ('helmet-crown' in o.name or 'shell-course' in o.name or o.name in ['GEO-engineer-cap','GEO-marine-crown'])
        if not shell: continue
        lo=[min(v.co[i] for v in o.data.vertices) for i in range(3)]
        hi=[max(v.co[i] for v in o.data.vertices) for i in range(3)]
        cut=min(hi[0]-lo[0],hi[1]-lo[1])*.18
        ring=[(lo[0]+cut,lo[1]),(hi[0]-cut,lo[1]),(hi[0],lo[1]+cut),(hi[0],hi[1]-cut),(hi[0]-cut,hi[1]),(lo[0]+cut,hi[1]),(lo[0],hi[1]-cut),(lo[0],lo[1]+cut)]
        verts=[(x,y,z) for z in [lo[2],hi[2]] for x,y in ring]
        faces=[tuple(reversed(range(8))),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
        mesh=bpy.data.meshes.new(o.name+'-octagonal');mesh.from_pydata(verts,[],faces);mesh.update()
        for material in o.data.materials:mesh.materials.append(material)
        o.data=mesh
        group=o.vertex_groups.get('head') or o.vertex_groups.new(name='head');group.add(list(range(16)),1,'REPLACE')
        bevel=o.modifiers.new('Molded shell corner','BEVEL');bevel.width=.005;bevel.segments=2
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_move_up(modifier=bevel.name)
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    for s in [-1,1]:
        b('recon-lens-dark-ring'+str(s),(s*.12,-.418,1.6),(.093,.018,.091),'rubber','head',.009,'helmet-recon')
        b('recon-lens-core'+str(s),(s*.12,-.433,1.6),(.051,.018,.049),'light','head',.011,'helmet-recon')
        b('mechanic-ear-module'+str(s),(s*.258,.025,1.55),(.089,.18,.15),'accent','head',.015,'helmet-mechanic')
        b('mechanic-ear-inset'+str(s),(s*.308,.017,1.55),(.016,.10,.08),'rubber','head',.004,'helmet-mechanic')
        b('medic-side-course'+str(s),(s*.313,.022,1.685),(.048,.28,.055),'accent','head',.006,'helmet-medic')
    b('medic-crown-red-mark',(0,.025,1.879),(.135,.31,.029),'accent','head',.005,'helmet-medic')
    for kind in ['captain','security']:
        b(kind+'-gold-front-band',(0,-.211,1.712),(.43,.023,.029),'insignia','head',.004,'helmet-'+kind)
    # Enclosed helmets need a complete rear shell, not only a roof and cheek plates.
    # These sit outside the head (+Y is rear), meet side shells, and keep face glass separate.
    for kind,outer in [('standard','trim'),('marine','suit'),('explorer','trim'),('medic','trim'),('pilot','trim'),('salvage','accent'),('recon','suit')]:
        tag='helmet-'+kind
        b(kind+'-rear-shell',(0,.209,1.54),(.49,.115,.42),outer,'head',.018,tag)
        b(kind+'-rear-neck-seal',(0,.211,1.318),(.38,.087,.044),'rubber','head',.007,tag)
        b(kind+'-rear-service-recess',(0,.272,1.493),(.245,.017,.112),'rubber','head',.007,tag)
        for j in range(3):b(kind+'-rear-vent'+str(j),(0,.285,1.463+j*.03),(.18,.012,.009),'trim','head',.002,tag)
        for s in [-1,1]:b(kind+'-rear-corner'+str(s),(s*.232,.175,1.515),(.078,.13,.30),outer,'head',.012,tag)
    for kind in ['captain','security','mechanic','engineer']:
        tag='helmet-'+kind
        b(kind+'-rear-hair',(0,.158,1.565),(.42,.075,.215),'hair','head',.009,tag)
        if kind=='engineer':b('engineer-rear-shell',(0,.204,1.692),(.48,.076,.16),'accent','head',.011,tag)
        else:b(kind+'-rear-cap-band',(0,.222,1.708),(.43,.03,.05),'suit','head',.006,tag)
