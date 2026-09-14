"""Shared molded-polymer finishes for the existing ship study's presentation surfaces.

Palette/occupancy IDs are immutable content; this maps those IDs to exported PBR
roles without changing occupied cells, vertex colors, geometry or optical roles.
"""
POLYMER_ROLES = {
    'light': {'name':'MAT-light-hull-polymer','roughness':.30,'coat':.08},
    'mid': {'name':'MAT-mid-hull-polymer','roughness':.34,'coat':.08},
    'dark': {'name':'MAT-dark-structural-polymer','roughness':.39,'coat':.06},
    'accent': {'name':'MAT-painted-accent-polymer','roughness':.26,'coat':.10},
}

def create_polymer(surface, role):
    spec=POLYMER_ROLES[role]
    mat=surface(spec['name'],0,spec['roughness'],False)
    shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['IOR'].default_value=1.46
    shader.inputs['Coat Weight'].default_value=spec['coat']
    shader.inputs['Coat Roughness'].default_value=.20
    mat['material_role']='molded-polymer-'+role
    return mat

SHIP_STRUCTURE_LAYERS={'deck','walls','armor','partitions','roof','markings','cutaway-port','cutaway-starboard','cutaway-aft','cutaway-bow'}

def legacy_surface_slot(palette_id):
    if palette_id in (17,18,36,38):return 8
    if palette_id==37:return 9
    if palette_id==7:return 1
    if palette_id==31:return 4
    if palette_id==34:return 5
    if palette_id==35:return 7
    if palette_id in (6,21):return 6
    if palette_id in (23,24,32):return 3
    if palette_id in (3,9,10,30):return 2
    return 0

def ship_surface_slot(palette_id, semantic_layer='walls', assembly=False):
    if assembly or semantic_layer not in SHIP_STRUCTURE_LAYERS:
        return legacy_surface_slot(palette_id)
    # Existing explicit surface roles retain their stable material slots.
    if palette_id in (17,18,36,38):return 8
    if palette_id==37:return 9
    if palette_id==7:return 1
    if palette_id==31:return 4
    if palette_id==34:return 5
    if palette_id==35:return 7
    if palette_id in (6,21):return 6
    if palette_id in (23,24,32):return 3
    if palette_id in (9,10,30):return 2
    # Ceramic-colored trim is dielectric, not exposed metal.
    if palette_id in (3,4,14,19,25,26,27):return 10
    if palette_id in (1,8,12,13,28,29,33):return 11
    if palette_id in (5,11,15,16,20,22,39):return 12
    return 13

def preserve_polymer_ior(glb_path):
    """Blender omits IOR on opaque materials; retain authored1.46 explicitly in glTF.

    Khronos IOR is independent of transmission. Binary mesh/texture data stay exact.
    """
    import json,struct
    raw=glb_path.read_bytes();length=struct.unpack_from('<I',raw,12)[0]
    document=json.loads(raw[20:20+length]);changed=False
    for material in document.get('materials',[]):
        if material.get('name') in [role['name'] for role in POLYMER_ROLES.values()]:
            material.setdefault('extensions',{})['KHR_materials_ior']={'ior':1.46};changed=True
    if not changed:return
    used=document.setdefault('extensionsUsed',[])
    if 'KHR_materials_ior' not in used:used.append('KHR_materials_ior')
    payload=json.dumps(document,separators=(',',':')).encode();payload+=b' '*((-len(payload))%4)
    tail=raw[20+length:]
    glb_path.write_bytes(struct.pack('<III',0x46546c67,2,20+len(payload)+len(tail))+struct.pack('<II',len(payload),0x4e4f534a)+payload+tail)
