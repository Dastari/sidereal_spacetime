"""Modular original crew geometry and shared two-link holding poses."""
import bpy, math
from mathutils import Vector, Matrix


def build_variants(brick):
    # Slim pressure suit uses overlapping ribbed fabric rather than the jacket panels.
    brick('flight-torso',(0,0,1.02),(.43,.28,.40),'suit','spine',.04,'body-flight-suit')
    brick('flight-yoke',(0,-.15,1.17),(.35,.055,.09),'trim','spine',.01,'body-flight-suit')
    for x in [-.14,.14]: brick('flight-seal'+str(x),(x,-.15,1.01),(.045,.035,.24),'rubber','spine',.006,'body-flight-suit')
    for z in [.92,.96,1.0]: brick('flight-rib'+str(z),(0,-.152,z),(.21,.03,.019),'accent','spine',.003,'body-flight-suit')
    # Utility vest: asymmetrical tool pouches and a raised shoulder harness.
    for s in [-1,1]:
        brick('utility-strap'+str(s),(s*.16,-.202,1.075),(.065,.085,.32),'rubber','spine',.01,'armor-utility')
        brick('utility-pouch'+str(s),(s*.15,-.255,.94),(.135,.12,.13),'accent','spine',.012,'armor-utility')
        brick('utility-fastener'+str(s),(s*.15,-.321,.965),(.055,.018,.025),'trim','spine',.004,'armor-utility')
    brick('utility-tool',(.255,-.075,.91),(.075,.085,.26),'trim','pelvis',.007,'armor-utility')
    # Marine: substantial cuirass, stepped pauldrons and additional shin plates.
    brick('heavy-cuirass',(0,-.205,1.07),(.49,.17,.32),'trim','spine',.035,'armor-heavy')
    brick('heavy-center',(0,-.303,1.09),(.32,.055,.19),'accent','spine',.025,'armor-heavy')
    brick('heavy-abdomen',(0,-.19,.86),(.30,.09,.12),'trim','pelvis',.016,'armor-heavy')
    for side,s in [('L',1),('R',-1)]:
        brick('heavy-pauldron'+side,(s*.35,.005,1.22),(.29,.38,.23),'trim',f'upper_arm.{side}',.035,'armor-heavy')
        brick('heavy-shoulder-stripe'+side,(s*.35,-.195,1.23),(.19,.04,.105),'accent',f'upper_arm.{side}',.009,'armor-heavy')
        brick('heavy-greave'+side,(s*.14,-.14,.30),(.23,.10,.22),'trim',f'shin.{side}',.022,'armor-heavy')
    # Expedition: padded flared vest, hose segments and a mounted instrument.
    brick('expedition-vest',(0,-.19,1.045),(.48,.10,.35),'suit','spine',.035,'armor-expedition')
    for s in [-1,1]:
        brick('expedition-pocket'+str(s),(s*.13,-.255,1.0),(.17,.075,.16),'trim','spine',.016,'armor-expedition')
        for z in [1.13,1.18,1.23]: brick('expedition-hose'+str((s,z)),(s*.215,-.17,z),(.065,.09,.055),'accent','spine',.009,'armor-expedition')
    brick('expedition-screen',(0,-.251,1.16),(.10,.035,.07),'light','spine',.008,'armor-expedition')
    # Three genuinely different head silhouettes: work brim, heavy respirator, tall expedition shell.
    brick('engineer-cap',(0,.01,1.75),(.51,.43,.15),'accent','head',.024,'helmet-engineer')
    brick('engineer-brim',(0,-.135,1.66),(.58,.42,.055),'accent','head',.01,'helmet-engineer')
    brick('engineer-lamp',(0,-.244,1.755),(.16,.10,.105),'trim','head',.015,'helmet-engineer')
    brick('engineer-lamp-face',(0,-.301,1.755),(.10,.015,.06),'light','head',.004,'helmet-engineer')
    for s in [-1,1]: brick('engineer-ear'+str(s),(s*.26,.01,1.53),(.09,.17,.17),'rubber','head',.015,'helmet-engineer')
    brick('marine-shell',(0,.055,1.76),(.57,.48,.18),'suit','head',.035,'helmet-marine')
    brick('marine-brow',(0,-.225,1.67),(.56,.15,.10),'accent','head',.018,'helmet-marine')
    brick('marine-visor',(0,-.231,1.535),(.455,.08,.205),'visor','head',.016,'helmet-marine')
    brick('marine-mask',(0,-.18,1.35),(.44,.24,.15),'rubber','head',.024,'helmet-marine')
    for s in [-1,1]:
        brick('marine-cheek'+str(s),(s*.245,-.04,1.455),(.135,.4,.30),'suit','head',.023,'helmet-marine')
        brick('marine-filter'+str(s),(s*.18,-.312,1.365),(.115,.055,.08),'trim','head',.008,'helmet-marine')
    brick('explorer-dome',(0,.03,1.79),(.54,.49,.19),'trim','head',.055,'helmet-explorer')
    brick('explorer-top',(0,.01,1.902),(.30,.34,.065),'accent','head',.017,'helmet-explorer')
    brick('explorer-wide-visor',(0,-.24,1.56),(.50,.09,.30),'visor','head',.03,'helmet-explorer')
    brick('explorer-chin',(0,-.07,1.34),(.55,.47,.115),'trim','head',.025,'helmet-explorer')
    for s in [-1,1]: brick('explorer-cheek'+str(s),(s*.265,.01,1.56),(.10,.43,.33),'trim','head',.025,'helmet-explorer')
    # Layered injection-molded helmet courses, inset gasket, comms modules.
    for slot,half,z,outer in [('standard',.255,1.79,'trim'),('marine',.275,1.80,'suit'),('explorer',.265,1.84,'trim')]:
        tag='helmet-'+slot
        for i in range(3):
            brick(slot+'-crown-course'+str(i),(0,.035,z+i*.028),(.43-i*.10,.39-i*.035,.039),outer,'head',.009,tag)
        for side in [-1,1]:
            brick(slot+'-temple-gasket'+str(side),(side*(half+.012),.025,1.55),(.045,.225,.235),'rubber','head',.012,tag)
            brick(slot+'-comms-shell'+str(side),(side*(half+.043),.04,1.56),(.05,.16,.17),'accent','head',.014,tag)
            brick(slot+'-comms-inset'+str(side),(side*(half+.072),.04,1.56),(.018,.10,.105),'trim','head',.006,tag)
            brick(slot+'-cheek-edge'+str(side),(side*.205,-.245,1.405),(.10,.07,.115),outer,'head',.014,tag)
            brick(slot+'-brow-fastener'+str(side),(side*.215,-.286,1.68),(.027,.023,.027),'rubber','head',.004,tag)
        brick(slot+'-chin-seal',(0,-.269,1.348),(.30,.035,.035),'rubber','head',.006,tag)
    # Paired breast plates read as fitted armor; segmented skirts leave hip flex clear.
    for side,s in [('L',1),('R',-1)]:
        brick('heavy-breast-inset'+side,(s*.122,-.337,1.11),(.21,.026,.125),'suit','spine',.015,'armor-heavy')
        brick('heavy-breast-rim'+side,(s*.12,-.335,1.20),(.21,.035,.033),'trim','spine',.006,'armor-heavy')
        brick('heavy-skirt'+side,(s*.20,-.17,.795),(.12,.13,.17),'accent','pelvis',.021,'armor-heavy')
        brick('heavy-pauldron-cap'+side,(s*.365,-.01,1.346),(.22,.29,.046),'suit',f'upper_arm.{side}',.01,'armor-heavy')
        brick('heavy-greave-inset'+side,(s*.14,-.198,.30),(.13,.028,.15),'suit',f'shin.{side}',.01,'armor-heavy')
    brick('heavy-status',(0,-.343,1.13),(.035,.018,.055),'light','spine',.004,'armor-heavy')
    # Hair is independent from facial brows. Cropped cap and tall asymmetrical crest.
    brick('cropped-cap',(0,.02,1.685),(.445,.37,.09),'hair','head',.018,'hair-cropped')
    for x in [-.17,.17]: brick('cropped-temple'+str(x),(x,.08,1.60),(.11,.22,.13),'hair','head',.009,'hair-cropped')
    brick('crest-base',(0,.02,1.69),(.44,.37,.09),'hair','head',.016,'hair-crest')
    for i in range(4): brick('crest-step'+str(i),(-.045+i*.01,.12-i*.1,1.785+i*.018),(.19,.13,.18),'hair','head',.01,'hair-crest')
    # Twin oxygen bottles are stepped rectangular pressure vessels, with guard frames.
    for s in [-1,1]:
        brick('oxygen-bottle'+str(s),(s*.115,.30,1.05),(.18,.23,.43),'accent','spine',.038,'backpack-oxygen')
        for z in [.9,1.19]: brick('oxygen-band'+str((s,z)),(s*.115,.30,z),(.20,.25,.045),'rubber','spine',.007,'backpack-oxygen')
        brick('oxygen-valve'+str(s),(s*.115,.30,1.295),(.09,.10,.07),'trim','spine',.009,'backpack-oxygen')
    brick('field-pack',(0,.30,1.03),(.43,.25,.48),'suit','spine',.035,'backpack-field')
    brick('field-toproll',(0,.31,1.32),(.44,.24,.15),'accent','spine',.035,'backpack-field')
    brick('field-pocket',(0,.45,.96),(.29,.075,.20),'trim','spine',.02,'backpack-field')


def orient_bone(rig, name, head, tail):
    bone=rig.data.bones[name]
    turn=(bone.tail_local-bone.head_local).rotation_difference(tail-head)
    rotation=turn.to_matrix().to_4x4() @ bone.matrix_local.to_3x3().to_4x4()
    rotation.translation=head
    rig.pose.bones[name].matrix=rotation
    bpy.context.view_layer.update()


def hold_pose(rig, weapon, phase=0, gait=False):
    """Analytic two-link arm solving; baked bones, no runtime IK or gameplay motion."""
    bpy.context.view_layer.update()
    torso=rig.pose.bones['spine'].matrix @ rig.data.bones['spine'].matrix_local.inverted()
    for side in (['R'] if weapon=='Pistol' else ['R','L']):
        upper=rig.data.bones[f'upper_arm.{side}']; fore=rig.data.bones[f'forearm.{side}']
        head=torso @ upper.head_local
        target=Vector((-.15,-.32,1.12)) if weapon=='Pistol' else Vector((-.18,-.18,1.10) if side=='R' else (.07825,-.30535,1.10))
        target.z+=.006*math.sin(phase*2) if gait else .004*math.sin(phase)
        wrist=torso @ target
        direction=wrist-head; distance=direction.length; direction.normalize()
        a=(upper.tail_local-upper.head_local).length; b=(fore.tail_local-fore.head_local).length
        distance=min(a+b-.002,distance)
        cosine=max(-1,min(1,(a*a+distance*distance-b*b)/(2*a*distance)))
        bend=torso.to_3x3() @ Vector((.3 if side=='L' else -.3,.1,-1))
        bend=(bend-direction*bend.dot(direction)).normalized()
        elbow=head+direction*(a*cosine)+bend*(a*math.sqrt(1-cosine*cosine))
        orient_bone(rig,f'upper_arm.{side}',head,elbow)
        orient_bone(rig,f'forearm.{side}',elbow,wrist)
        forward=Vector((0,-1,0)) if weapon=='Pistol' else Vector((.8,-.6,0))
        if side=='L': forward=Vector((-.55,-.83,0))
        forward=torso.to_3x3() @ forward.normalized()
        # Stable palm roll gives external props a reliable forward/up socket basis.
        up=(torso.to_3x3() @ Vector((0,0,1))).normalized()
        across=forward.cross(up).normalized(); normal=across.cross(forward).normalized()
        matrix=Matrix(((across.x,forward.x,normal.x,0),(across.y,forward.y,normal.y,0),(across.z,forward.z,normal.z,0),(0,0,0,1)))
        matrix.translation=wrist
        rig.pose.bones[f'hand.{side}'].matrix=matrix
        bpy.context.view_layer.update()


def build_weapon_fixtures(brick,rig):
    """Small nonfunctional fixtures; reusable external weapon assets attach to sockets."""
    for weapon in ['Pistol','Rifle']:
        for p in rig.pose.bones: p.rotation_mode='XYZ'; p.rotation_euler=(0,0,0); p.location=(0,0,0)
        hold_pose(rig,weapon)
        inverse=(rig.pose.bones['hand.R'].matrix @ rig.data.bones['hand.R'].matrix_local.inverted()).inverted()
        forward=Vector((0,-1,0)) if weapon=='Pistol' else Vector((.8,-.6,0)).normalized()
        base=(Vector((-.15,-.32,1.12)) if weapon=='Pistol' else Vector((-.18,-.18,1.10)))+forward*.055
        def piece(name,along,height,width,length,depth,mat):
            o=brick(weapon+'-'+name,base+forward*along+Vector((0,0,height)),(width,length,depth),mat,'hand.R',.008,'weapon-'+weapon.lower())
            o.rotation_euler.z=math.atan2(forward.x,-forward.y)
            o.matrix_world=inverse @ o.matrix_world
        piece('grip',0,0,.065,.085,.14,'rubber')
        if weapon=='Pistol':
            piece('slide',.075,.085,.085,.28,.085,'trim'); piece('muzzle',.215,.08,.10,.055,.075,'rubber'); piece('sight',.04,.145,.025,.035,.025,'accent')
        else:
            piece('receiver',.085,.075,.12,.32,.14,'suit'); piece('barrel',.35,.095,.075,.25,.065,'rubber'); piece('shroud',.285,.075,.145,.22,.11,'trim'); piece('stock',-.14,.07,.10,.17,.105,'accent'); piece('optic',.09,.185,.085,.13,.08,'rubber'); piece('foregrip',.22,-.025,.07,.07,.12,'rubber')
    for p in rig.pose.bones: p.rotation_euler=(0,0,0); p.location=(0,0,0)
