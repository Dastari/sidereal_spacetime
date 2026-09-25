"""Baked contact-aware leg poses. No runtime IK or root-motion authority."""
import bpy, math
from mathutils import Vector
from build_crew_variants import orient_bone

def pose_legs(rig, gait, phase):
    bpy.context.view_layer.update()
    pelvis = rig.pose.bones['pelvis'].matrix @ rig.data.bones['pelvis'].matrix_local.inverted()
    for side,offset in [('L',0),('R',math.pi)]:
        t=((phase+offset)/math.tau)%1
        foot_y=0.; lift=0.
        if gait in ['Walk','Sprint']:
            sprint=gait=='Sprint'; stance=.48 if sprint else .60; stride=.235 if sprint else .17
            if t<stance:
                foot_y=-stride+2*stride*t/stance
            else:
                recovery=(t-stance)/(1-stance)
                foot_y=stride*math.cos(math.pi*recovery)
                lift=(.19 if sprint else .105)*math.sin(math.pi*recovery)**1.25
        elif gait=='Seated': foot_y=-.30
        upper=rig.data.bones[f'thigh.{side}']; lower=rig.data.bones[f'shin.{side}']
        hip=pelvis @ upper.head_local
        ankle=Vector((upper.head_local.x,foot_y,.15+lift))
        direction=ankle-hip; distance=direction.length; direction.normalize()
        a=upper.length; b=lower.length; distance=min(a+b-.001,max(abs(a-b)+.001,distance))
        # Both knees hinge forward (-Y), with independent recovery and contact.
        bend=Vector((0,-1,0)); bend=(bend-direction*bend.dot(direction)).normalized()
        cosine=max(-1,min(1,(a*a+distance*distance-b*b)/(2*a*distance)))
        knee=hip+direction*(a*cosine)+bend*(a*math.sqrt(1-cosine*cosine))
        reachable_ankle=hip+direction*distance
        orient_bone(rig,f'thigh.{side}',hip,knee)
        orient_bone(rig,f'shin.{side}',knee,reachable_ankle)
        # Flat soles during support; slight toe-up recovery clears the deck.
        toe=Vector((0,-.18,-.07))
        if lift>0:
            angle=.14*math.sin(math.pi*(t-(.48 if gait=='Sprint' else .60))/(1-(.48 if gait=='Sprint' else .60)))
            toe=Vector((0,-.18*math.cos(angle),-.07+.18*math.sin(angle)))
        orient_bone(rig,f'foot.{side}',reachable_ankle,reachable_ankle+toe)
