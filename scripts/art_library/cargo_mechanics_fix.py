"""r002 preflight mechanical corrections. Executed inside the Blender authoring namespace."""
# Supports stop at receiver base underside; the actual foot recess remains empty.
for o in objects:
 if o.name.startswith(('GEO-corner-load-column','GEO-external-corner-load-post','GEO-upper-stack-crossmember','GEO-stepped-corner-armor')):
  top=o.location.z+o.dimensions.z/2;bottom=o.location.z-o.dimensions.z/2
  if top>h-.034:
   newtop=h-.034;o.dimensions.z=newtop-bottom;o.location.z=(newtop+bottom)/2
   bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.select_set(False)
# Deep connected jambs reach relocated front leaves. Seals meet the backs of the door leaves.
if not hand and not pod and not fluid:
 delta=-.14 if family=='reinforced' else -.045
 for o in objects:
  if o.name.startswith('GEO-door-perimeter-seal'):
   o.location.y+=delta+.004
   if abs(o.location.x)>.001:o.dimensions.x=post*1.1;o.location.x=(1 if o.location.x>0 else -1)*(w/2-post*.55)
   else:o.dimensions.z=.040
 for x in [-w/2+post*.55,w/2-post*.55]:box('connected-deep-side-jamb',(x,-d/2+delta/2+.020,(h+base-.055)/2),(post*1.1,-delta+.010,h-base-.055),dark)
 for z in [base+.016,h-.073]:box('connected-deep-horizontal-jamb',(0,-d/2+delta/2+.020,z),(w,-delta+.010,.040),dark)
 # Flexible meeting seal is attached to the left leaf, not a stationary access obstruction.
 start=len(objects);box('door-meeting-gasket',(0,-d/2+delta+.012,(h+base-.03)/2),(.130,.012,h-base-.10),seal,.001)
 parent_parts(objects[start:],next(p for p,axis,angle in moving_parts if 'DOOR_-1' in p.name))
if hand and not pod and not fluid:
 # A smaller inset lid opens wholly inside the four fixed stacking columns.
 lidpivot=moving_parts[0][0];bpy.context.view_layer.update();world={o:o.matrix_world.copy() for o in lidpivot.children}
 lidpivot.location=(0,d/2-post-.004,h-.030)
 for o,matrix in world.items():o.matrix_world=matrix
 for o in objects:
  if o.name.startswith(('GEO-closed-side-wall','GEO-closed-rear-wall','GEO-closed-front-wall')):
   o.dimensions.z=h-base-.078;o.location.z=(base+h-.078)/2
  if o.name.startswith('GEO-opening-layered-lid'):
   o.dimensions.x=w-2*post-.020;o.dimensions.y=d-2*post-.020
  if o.name.startswith('GEO-lid-shoulder-band'):o.dimensions.y=d-2*post-.026
  if o.name.startswith('GEO-lid-recess-base'):o.dimensions.y=min(o.dimensions.y,d-2*post-.030)
  if o.name.startswith('GEO-rear-hinge-pin'):o.location.y=d/2-post-.004;o.location.z=h-.030
 # Replace old seals with an actual gasket along the inset lid opening.
 for o in list(objects):
  if o.name.startswith('GEO-lid-perimeter-seal'):objects.remove(o);bpy.data.objects.remove(o,do_unlink=True)
 for x in [-w/2+post/2,w/2-post/2]:box('fixed-top-frame',(x,0,h-.098),(post,d,.040),pale)
 for y in [-d/2+post/2,d/2-post/2]:box('fixed-top-frame',(0,y,h-.098),(w,post,.040),pale)
 for x in [-w/2+post+.010,w/2-post-.010]:
  box('lid-support-ledge',(x,0,h-.094),(.035,d-2*post,.032),steel)
  box('inset-lid-gasket',(x,0,h-.073),(.025,d-2*post,.010),seal,.001)
 for y in [-d/2+post+.010,d/2-post-.010]:
  box('lid-support-ledge',(0,y,h-.094),(w-2*post,.035,.032),steel)
  box('inset-lid-gasket',(0,y,h-.073),(w-2*post,.025,.010),seal,.001)
 start=len(objects)
 for x in [-w*.25,w*.25]:box('lid-latch-connecting-bridge',(x,-d/2+post*.5,h-.050),(.044,post+.060,.035),steel)
 if family=='high-value':box('central-lid-lock-bridge',(0,-d/2+post*.5-.025,h-.050),(.065,post+.110,.040),steel)
 parent_parts(objects[start:],lidpivot)
 # Apply changed scale before evaluated bevel/export while preserving authored hierarchy.
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:
  if any(abs(v-1)>1e-6 for v in o.scale):
   o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.select_set(False)
# True 50mm grip clearance from the backing face (was47.5mm).
for o in objects:
 if o.name.startswith('GEO-glove-grip'):o.location.x+=.0025 if o.location.x>0 else -.0025
for o in SOCKETS.objects:
 if o.name.startswith('SOCK_HAND_'):o.location.x+=.0025 if o.location.x>0 else -.0025
