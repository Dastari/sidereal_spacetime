"""Original modular roof guns; supplied to Blender via MCP, +Y is bore axis."""
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.name='Sidereal turrets'
ATLAS_WIDTH_M=24.0
for name,size in [('light',1),('twin',1),('heavy',2)]:
    for part in ['base','barrel','preview']:
        begin(name+'_'+part,'roof',size=(size,size))
        if part!='barrel':
            cylinder('Foot flange',0,0,.08,.74*size,.16,'seam',16)
            cylinder('Bearing surround',0,0,.17,.68*size,.12,'edge',16)
            cylinder('Bearing race',0,0,.25,.59*size,.08,'dark',16)
            for x in [-.48,.48]:
                for y in [-.48,.48]: cylinder('Mount bolt',x*size,y*size,.3,.04*size,.04,'light',8)
        if part!='base':
            box('Armored receiver',0,-.12*size,.4,.94*size,.96*size,.25,'steel',.10)
            box('Receiver crown',0,-.15*size,.55,.70*size,.72*size,.05,'panel',.07)
            for x in ([-.24,.24] if name=='twin' else [0]):
                box('Barrel shadow',x*size,.58*size,.38,.22*size,.67*size,.18,'seam',.02)
                box('Bore sleeve',x*size,.55*size,.5,.14*size,.63*size,.10,'edge',.015)
                for y in [.32,.43,.54]:box('Cooling fin',x*size,y*size,.58,.23*size,.045*size,.045,'dark',0)
                box('Muzzle brake',x*size,.84*size,.6,.24*size,.16*size,.15,'panel',.02)
                box('Muzzle aperture',x*size,.90*size,.69,.13*size,.035*size,.02,'void',0)
            for x in [-.36,.36]:
                box('Recoil housing',x*size,-.13*size,.62,.12*size,.65*size,.10,'dark',.02)
                box('Ready light',x*size,-.37*size,.69,.065*size,.12*size,.02,'cyan',0)
            box('Receiver stripe',0,-.36*size,.60,.32*size,.055*size,.02,'amber',0)
ATLAS_HEIGHT_M=PACK['y']+PACK['row_height']
bpy.ops.object.camera_add(location=(ATLAS_WIDTH_M/2,-ATLAS_HEIGHT_M/2,50))
camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=max(ATLAS_WIDTH_M,ATLAS_HEIGHT_M);scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=1
scene.cycles.pixel_filter_type='BOX';scene.cycles.filter_width=1.0;scene.cycles.use_denoising=False
scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=round(ATLAS_WIDTH_M*64);scene.render.resolution_y=round(ATLAS_HEIGHT_M*64);scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
bpy.ops.wm.save_as_mainfile(filepath=OUTPUT+'/turrets.blend')
print('TURRET_MANIFEST='+json.dumps({'tiles':TILES,'source_atlas_px':[scene.render.resolution_x,scene.render.resolution_y]}))
