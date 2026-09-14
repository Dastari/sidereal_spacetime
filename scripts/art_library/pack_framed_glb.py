"""Losslessly package the native framed hull/engine GLBs into shared libraries.

Geometry is copied byte-for-byte: no welding, triangulation, baking, remeshing,
coordinate change or material approximation. Only array indices and binary
offsets are rebased. Identical images/samplers/textures/materials are shared.
Unsupported features fail before writing a package. Original files stay intact.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[2]
LIBRARY = ROOT / 'assets/art-library/framed-wayfarer'
SUPPORTED_EXTENSIONS = {'KHR_materials_emissive_strength'}
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
TEXTURE_SLOTS = ('normalTexture', 'occlusionTexture', 'emissiveTexture')
PBR_TEXTURE_SLOTS = ('baseColorTexture', 'metallicRoughnessTexture')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)


def load_glb(raw):
    require(len(raw) >= 28, 'Truncated GLB')
    require(struct.unpack_from('<4sII', raw) == (b'glTF', 2, len(raw)), 'Invalid GLB header')
    chunks, offset = {}, 12
    while offset < len(raw):
        require(offset+8 <= len(raw), 'Truncated chunk header')
        size, kind = struct.unpack_from('<II', raw, offset)
        offset += 8
        require(kind in (JSON_CHUNK, BIN_CHUNK) and kind not in chunks,
                'Unknown or duplicate GLB chunk')
        require(size % 4 == 0 and offset+size <= len(raw), 'Invalid GLB chunk size')
        chunks[kind] = raw[offset:offset+size]
        offset += size
    require(set(chunks) == {JSON_CHUNK, BIN_CHUNK}, 'Expected JSON and embedded BIN chunks')
    document = json.loads(chunks[JSON_CHUNK])
    canonical(document)  # Reject non-finite numbers anywhere in the JSON.
    binary = chunks[BIN_CHUNK]
    require(len(document.get('buffers', [])) == 1, 'Expected one embedded input buffer')
    buffer = document['buffers'][0]
    require(set(buffer) == {'byteLength'}, 'Unsupported buffer descriptor or external URI')
    require(buffer['byteLength'] <= len(binary) <= buffer['byteLength']+3,
            'Embedded buffer byte length differs')
    return document, binary[:buffer['byteLength']]


def write_glb(document, binary):
    doc = deepcopy(document)
    doc['buffers'] = [{'byteLength': len(binary)}]
    encoded = canonical(doc).encode('utf-8')
    encoded += b' ' * (-len(encoded) % 4)
    padded = bytes(binary) + b'\0' * (-len(binary) % 4)
    size = 12+8+len(encoded)+8+len(padded)
    return (struct.pack('<4sII', b'glTF', 2, size) +
            struct.pack('<II', len(encoded), JSON_CHUNK) + encoded +
            struct.pack('<II', len(padded), BIN_CHUNK) + padded)


def keys(value, allowed, context):
    require(not (set(value)-set(allowed)), context+': unsupported fields '+str(set(value)-set(allowed)))


def validate_supported(doc, binary):
    keys(doc, ('asset','extensionsUsed','extensionsRequired','scene','scenes','nodes',
               'materials','meshes','textures','images','accessors','bufferViews','samplers','buffers'),
         'glTF document (skins, animations and other extensions require explicit support)')
    keys(doc['asset'], ('version','generator','copyright','minVersion','extras'), 'asset')
    require(doc['asset']['version'] == '2.0', 'Unsupported glTF version')
    used = set(doc.get('extensionsUsed', []))
    required = set(doc.get('extensionsRequired', []))
    require(used <= SUPPORTED_EXTENSIONS and required <= used, 'Unsupported glTF extension')
    require(len(doc.get('scenes', [])) == 1 and doc.get('scene', 0) == 0,
            'Only one complete default input scene is supported')
    keys(doc['scenes'][0], ('name','nodes'), 'scene')
    for node in doc.get('nodes', []):
        keys(node, ('name','mesh','children','translation','rotation','scale','matrix','extras'), 'node')
        require(not ('matrix' in node and any(k in node for k in ('translation','rotation','scale'))),
                'Node mixes matrix and TRS')
    for mesh in doc.get('meshes', []):
        keys(mesh, ('name','primitives','extras'), 'mesh (morph targets require explicit support)')
        for primitive in mesh['primitives']:
            keys(primitive, ('attributes','indices','material','mode','extras'), 'primitive')
            require(primitive.get('mode',4) == 4 and 'indices' in primitive, 'Expected indexed triangles')
            require('POSITION' in primitive['attributes'], 'Missing geometry POSITION')
    for accessor in doc.get('accessors', []):
        keys(accessor, ('bufferView','byteOffset','componentType','normalized','count','type','max','min','name','extras'),
             'accessor (sparse accessors require explicit support)')
        require('bufferView' in accessor, 'Expected explicit accessor buffer view')
    for index,view in enumerate(doc.get('bufferViews', [])):
        keys(view, ('buffer','byteOffset','byteLength','byteStride','target','name','extras'), 'buffer view')
        require(view['buffer'] == 0, 'External buffer view')
        view_bytes(doc,binary,index)
    for image in doc.get('images', []):
        keys(image, ('bufferView','mimeType','name','extras'), 'image')
        require('bufferView' in image and image['mimeType'] in ('image/png','image/jpeg'), 'Expected embedded PNG/JPEG')
    for sampler in doc.get('samplers', []):
        keys(sampler, ('magFilter','minFilter','wrapS','wrapT','name','extras'), 'sampler')
    for texture in doc.get('textures', []):
        keys(texture, ('source','sampler','name','extras'), 'texture')
        require('source' in texture, 'Expected explicit texture image')
    for material in doc.get('materials', []):
        keys(material, ('name','extras','pbrMetallicRoughness','normalTexture','occlusionTexture',
                        'emissiveTexture','emissiveFactor','alphaMode','alphaCutoff','doubleSided','extensions'), 'material')
        pbr = material.get('pbrMetallicRoughness', {})
        keys(pbr, ('baseColorFactor','baseColorTexture','metallicFactor','roughnessFactor','metallicRoughnessTexture'), 'PBR')
        for container, slots in ((material,TEXTURE_SLOTS),(pbr,PBR_TEXTURE_SLOTS)):
            for slot in slots:
                if slot in container:
                    keys(container[slot], ('index','texCoord','scale','strength'), 'texture info')
        extensions = material.get('extensions', {})
        require(set(extensions) <= SUPPORTED_EXTENSIONS and set(extensions) <= used,
                'Unsupported or undeclared material extension')
        for value in extensions.values():
            keys(value, ('emissiveStrength',), 'KHR_materials_emissive_strength')
    # Ensure there are no silent unreachable nodes or cycles in the scene.
    node_worlds(doc)


def view_bytes(doc, binary, index):
    require(type(index) is int and 0 <= index < len(doc['bufferViews']), 'Invalid buffer view index')
    view = doc['bufferViews'][index]
    offset, length = view.get('byteOffset', 0),view['byteLength']
    require(type(offset) is int and type(length) is int and offset >= 0 and length > 0,
            'Invalid buffer view range')
    require(offset+length <= len(binary), 'Buffer view overrun')
    return binary[offset:offset+length]


def accessor_bytes(doc, binary, index):
    require(type(index) is int and 0 <= index < len(doc['accessors']), 'Invalid accessor index')
    acc = doc['accessors'][index]
    sizes = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}
    lanes = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
    require(acc['componentType'] in sizes and acc['type'] in lanes, 'Unsupported accessor scalar/matrix layout')
    item_size = sizes[acc['componentType']]*lanes[acc['type']]
    view = doc['bufferViews'][acc['bufferView']]
    stride = view.get('byteStride',item_size)
    offset,count = acc.get('byteOffset',0),acc['count']
    data = view_bytes(doc,binary,acc['bufferView'])
    require(type(count) is int and count > 0 and stride >= item_size and offset >= 0,
            'Invalid accessor layout')
    require(offset+(count-1)*stride+item_size <= len(data), 'Accessor overrun')
    return b''.join(data[offset+i*stride:offset+i*stride+item_size] for i in range(count))


def identity():
    return [[int(i == j) for j in range(4)] for i in range(4)]


def multiply(a,b):
    return [[sum(a[i][k]*b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def node_matrix(node):
    if 'matrix' in node:
        require(len(node['matrix']) == 16, 'Invalid node matrix')
        return [[node['matrix'][j*4+i] for j in range(4)] for i in range(4)]
    x,y,z,w = node.get('rotation',[0,0,0,1])
    sx,sy,sz = node.get('scale',[1,1,1])
    tx,ty,tz = node.get('translation',[0,0,0])
    return [[(1-2*y*y-2*z*z)*sx,(2*x*y-2*z*w)*sy,(2*x*z+2*y*w)*sz,tx],
            [(2*x*y+2*z*w)*sx,(1-2*x*x-2*z*z)*sy,(2*y*z-2*x*w)*sz,ty],
            [(2*x*z-2*y*w)*sx,(2*y*z+2*x*w)*sy,(1-2*x*x-2*y*y)*sz,tz],
            [0,0,0,1]]


def node_worlds(doc):
    worlds = {}
    def visit(index,parent):
        require(type(index) is int and 0 <= index < len(doc['nodes']), 'Invalid node index')
        require(index not in worlds, 'Repeated node or hierarchy cycle')
        node = doc['nodes'][index]
        worlds[index] = multiply(parent,node_matrix(node))
        for child in node.get('children',[]):
            visit(child,worlds[index])
    for root in doc['scenes'][doc.get('scene',0)]['nodes']:
        visit(root,identity())
    require(len(worlds) == len(doc['nodes']), 'Unreachable node would be discarded')
    return worlds


def texture_semantic(doc,binary,index):
    texture = deepcopy(doc['textures'][index])
    image = deepcopy(doc['images'][texture.pop('source')])
    image['payloadSha256'] = digest(view_bytes(doc,binary,image.pop('bufferView')))
    # Byte-identical image aliases may retain the first meaningful name. Name
    # aliases are recorded separately; image data and all other fields match.
    image.pop('name',None)
    texture['sourceImage'] = image
    if 'sampler' in texture:
        texture['sampler'] = doc['samplers'][texture['sampler']]
    return texture


def material_semantic(doc,binary,index):
    material = deepcopy(doc['materials'][index])
    for container,slots in ((material,TEXTURE_SLOTS),
                            (material.get('pbrMetallicRoughness',{}),PBR_TEXTURE_SLOTS)):
        for slot in slots:
            if slot in container:
                info = container[slot]
                info['texture'] = texture_semantic(doc,binary,info.pop('index'))
    return material


class LibraryPacker:
    def __init__(self,component):
        self.component = component
        self.doc = {'asset':{'version':'2.0','generator':'Sidereal lossless native GLB library packer v1'},
                    'scene':0,'scenes':[{'name':'Framed Wayfarer '+component,'nodes':[]}],
                    **{key:[] for key in ('nodes','meshes','accessors','bufferViews','materials','textures','samplers','images')}}
        self.binary = bytearray()
        self.dedup = {key:{} for key in ('images','samplers','textures','materials')}
        self.sources = []
        self.image_aliases = {}
        self.used_extensions,self.required_extensions = set(),set()

    def append_view(self,view,data):
        self.binary.extend(b'\0'*(-len(self.binary)%4))
        record = deepcopy(view)
        record.update(buffer=0,byteOffset=len(self.binary),byteLength=len(data))
        index = len(self.doc['bufferViews'])
        self.doc['bufferViews'].append(record)
        self.binary.extend(data)
        return index

    def intern(self,key,description):
        encoded = canonical(description)
        if encoded not in self.dedup[key]:
            self.dedup[key][encoded] = len(self.doc[key])
            self.doc[key].append(description)
        return self.dedup[key][encoded]

    def add(self,path,model):
        raw = path.read_bytes()
        require(digest(raw) == model['sha256'], 'Source GLB hash differs from native manifest: '+str(path))
        source,binary = load_glb(raw)
        validate_supported(source,binary)
        maps = {key:{} for key in ('bufferViews','images','samplers','textures','materials','accessors','meshes','nodes')}
        self.used_extensions.update(source.get('extensionsUsed',[]))
        self.required_extensions.update(source.get('extensionsRequired',[]))
        image_views = {image['bufferView'] for image in source.get('images',[])}
        accessor_views = {acc['bufferView'] for acc in source.get('accessors',[])}
        require(not image_views & accessor_views, 'Shared geometry/image buffer view requires explicit support')
        for index,view in enumerate(source['bufferViews']):
            if index not in image_views:
                maps['bufferViews'][index] = self.append_view(view,view_bytes(source,binary,index))
        for index,image in enumerate(source.get('images',[])):
            view_index = image['bufferView']
            payload = view_bytes(source,binary,view_index)
            description = deepcopy(image)
            description.pop('bufferView')
            original_name = description.pop('name',None)
            key = canonical({'description':description,'bytes':digest(payload)})
            if key in self.dedup['images']:
                output_image = self.dedup['images'][key]
                output_view = self.doc['images'][output_image]['bufferView']
                # Dedup is an exact-byte operation, not a digest-only promise.
                require(view_bytes(self.doc,self.binary,output_view) == payload, 'Image hash collision')
            else:
                output_view = self.append_view(source['bufferViews'][view_index],payload)
                description['bufferView'] = output_view
                if original_name is not None:
                    description['name'] = original_name
                output_image = len(self.doc['images'])
                self.doc['images'].append(description)
                self.dedup['images'][key] = output_image
            maps['images'][index] = output_image
            maps['bufferViews'][view_index] = output_view
            self.image_aliases.setdefault(output_image,set()).add(original_name or '')
        for index,sampler in enumerate(source.get('samplers',[])):
            maps['samplers'][index] = self.intern('samplers',deepcopy(sampler))
        for index,texture in enumerate(source.get('textures',[])):
            description = deepcopy(texture)
            description['source'] = maps['images'][description['source']]
            if 'sampler' in description:
                description['sampler'] = maps['samplers'][description['sampler']]
            maps['textures'][index] = self.intern('textures',description)
        for index,material in enumerate(source.get('materials',[])):
            description = deepcopy(material)
            for container,slots in ((description,TEXTURE_SLOTS),
                                    (description.get('pbrMetallicRoughness',{}),PBR_TEXTURE_SLOTS)):
                for slot in slots:
                    if slot in container:
                        container[slot]['index'] = maps['textures'][container[slot]['index']]
            # Include names and extras in this exact description, so distinct
            # authored semantic material identities are not collapsed by color.
            maps['materials'][index] = self.intern('materials',description)
        for index,accessor in enumerate(source['accessors']):
            description = deepcopy(accessor)
            description['bufferView'] = maps['bufferViews'][description['bufferView']]
            maps['accessors'][index] = len(self.doc['accessors'])
            self.doc['accessors'].append(description)
        for index,mesh in enumerate(source['meshes']):
            description = deepcopy(mesh)
            for primitive in description['primitives']:
                primitive['attributes'] = {k:maps['accessors'][v] for k,v in primitive['attributes'].items()}
                primitive['indices'] = maps['accessors'][primitive['indices']]
                if 'material' in primitive:
                    primitive['material'] = maps['materials'][primitive['material']]
            maps['meshes'][index] = len(self.doc['meshes'])
            self.doc['meshes'].append(description)
        maps['nodes'] = {i:len(self.doc['nodes'])+i for i in range(len(source['nodes']))}
        for node in source['nodes']:
            description = deepcopy(node)
            if 'children' in description:
                description['children'] = [maps['nodes'][i] for i in description['children']]
            if 'mesh' in description:
                description['mesh'] = maps['meshes'][description['mesh']]
            self.doc['nodes'].append(description)
        self.doc['scenes'][0]['nodes'].extend(maps['nodes'][i] for i in source['scenes'][0]['nodes'])
        self.sources.append({'path':path,'model':model,'raw':raw,'doc':source,'binary':binary,'maps':maps})

    def finish(self):
        if self.used_extensions:
            self.doc['extensionsUsed'] = sorted(self.used_extensions)
        if self.required_extensions:
            self.doc['extensionsRequired'] = sorted(self.required_extensions)
        packed = write_glb(self.doc,self.binary)
        # Reopen the serialized result for parity checks. No in-memory writer
        # assumptions substitute for proving the actual output GLB bytes.
        target,target_binary = load_glb(packed)
        validate_supported(target,target_binary)
        worlds = node_worlds(target)
        checks,models = [],[]
        for item in self.sources:
            source,binary,maps,model = item['doc'],item['binary'],item['maps'],item['model']
            require(item['path'].read_bytes() == item['raw'], 'Source changed during packaging')
            source_worlds = node_worlds(source)
            accessor_checks,mesh_checks = [],[]
            for i,accessor in enumerate(source['accessors']):
                mapped = maps['accessors'][i]
                expected = deepcopy(accessor)
                expected['bufferView'] = maps['bufferViews'][expected['bufferView']]
                require(target['accessors'][mapped] == expected, 'Accessor description changed')
                original_bytes = accessor_bytes(source,binary,i)
                require(original_bytes == accessor_bytes(target,target_binary,mapped), 'Accessor bytes changed')
                require(view_bytes(source,binary,accessor['bufferView']) ==
                        view_bytes(target,target_binary,expected['bufferView']), 'Geometry buffer view changed')
                accessor_checks.append({'sourceIndex':i,'kitIndex':mapped,'bytes':len(original_bytes),
                                        'sha256':digest(original_bytes)})
            # Material comparison expands every texture to exact image bytes,
            # sampler state and texture/UV metadata, independent of new indices.
            for i,material in enumerate(source.get('materials',[])):
                require(material_semantic(source,binary,i) ==
                        material_semantic(target,target_binary,maps['materials'][i]), 'Material semantic changed')
                require(target['materials'][maps['materials'][i]]['name'] == material['name'], 'Material name changed')
            for i,node in enumerate(source['nodes']):
                expected = deepcopy(node)
                if 'children' in expected:
                    expected['children'] = [maps['nodes'][n] for n in expected['children']]
                if 'mesh' in expected:
                    expected['mesh'] = maps['meshes'][expected['mesh']]
                require(target['nodes'][maps['nodes'][i]] == expected, 'Node/hierarchy metadata changed')
                require(worlds[maps['nodes'][i]] == source_worlds[i], 'World node transform changed')
            for i,mesh in enumerate(source['meshes']):
                expected = deepcopy(mesh)
                primitive_checks = []
                for p,primitive in enumerate(expected['primitives']):
                    primitive['attributes'] = {k:maps['accessors'][v] for k,v in primitive['attributes'].items()}
                    primitive['indices'] = maps['accessors'][primitive['indices']]
                    if 'material' in primitive:
                        primitive['material'] = maps['materials'][primitive['material']]
                    original = mesh['primitives'][p]
                    primitive_checks.append({'primitive':p,'indexCount':source['accessors'][original['indices']]['count'],
                                             'indexSha256':digest(accessor_bytes(source,binary,original['indices'])),
                                             'attributeSha256':{k:digest(accessor_bytes(source,binary,v)) for k,v in original['attributes'].items()},
                                             'materialSemanticSha256':digest(canonical(material_semantic(source,binary,original['material'])).encode()) if 'material' in original else None})
                require(target['meshes'][maps['meshes'][i]] == expected, 'Mesh primitive/name changed')
                mesh_checks.append({'name':mesh.get('name'),'sourceIndex':i,'kitIndex':maps['meshes'][i],
                                    'primitiveCount':len(mesh['primitives']),'primitives':primitive_checks})
            prefix = model.get('nodePrefix',model.get('nativeNode'))
            require(bool(prefix), 'Missing original model node selector')
            original_selected = [n for n in source['nodes'] if 'mesh' in n and n.get('name','').startswith(prefix)]
            kit_selected = [n for n in target['nodes'] if 'mesh' in n and n.get('name','').startswith(prefix)]
            require(len(original_selected) == len(source['meshes']) == len(kit_selected), 'Model selector is ambiguous or incomplete in kit')
            slug = model.get('slug',model.get('assetId'))
            source_path = item['path'].resolve()
            recorded_path = source_path.relative_to(ROOT) if source_path.is_relative_to(ROOT) else source_path
            common = {'slug':slug,'sourcePath':str(recorded_path),
                      'sourceSha256':model['sha256'],'nodePrefix':prefix,
                      'kitNodeIndices':list(maps['nodes'].values()),
                      'kitMeshIndices':list(maps['meshes'].values()),
                      'bounds':model['bounds']}
            if 'assetId' in model:
                common['assetId'] = model['assetId']
            models.append(common)
            checks.append({**common,'status':'pass','nodeTransformParity':'exact',
                           'nodeNameAndExtrasParity':'exact','accessorAndBufferViewBytes':'exact',
                           'materialAndTextureSemantics':'exact','meshes':mesh_checks,
                           'accessors':accessor_checks})
        counts = lambda doc: {k:len(doc.get(k,[])) for k in ('meshes','nodes','accessors','materials','textures','samplers','images')}
        before = {k:sum(counts(i['doc'])[k] for i in self.sources) for k in counts(target)}
        validation = {'component':self.component,'status':'pass','kitSha256':digest(packed),
                      'sourceCount':len(self.sources),'before':before,'after':counts(target),
                      'sourceBytes':sum(len(i['raw']) for i in self.sources),'kitBytes':len(packed),
                      'extensionsPreserved':sorted(self.used_extensions),
                      'imageNameAliases':{str(k):sorted(v) for k,v in self.image_aliases.items()},
                      'models':checks}
        return packed,models,validation


def build(hull_revision=2,engine_revision=3,runtime_revision=1):
    require(min(hull_revision,engine_revision,runtime_revision) > 0, 'Revisions must be positive')
    output = LIBRARY/f'runtime-r{runtime_revision:03}'
    require(not output.exists(), 'Preserve existing runtime library revision: '+str(output))
    finished = []
    for component,revision,expected_count in (('hull',hull_revision,16),('engines',engine_revision,6)):
        folder = LIBRARY/f'r{revision:03}'/component
        manifest_path = folder/'models.json'
        manifest_raw = manifest_path.read_bytes()
        manifest = json.loads(manifest_raw)
        require(type(manifest['revision']) is int and manifest['revision'] > 0,
                'Native manifest lacks a declared revision')
        require(len(manifest['models']) == expected_count, 'Native model set is incomplete')
        require(digest((folder/manifest['source']).read_bytes()) == manifest['sourceSha256'], 'Native Blender source hash changed')
        packer = LibraryPacker(component)
        for model in manifest['models']:
            packer.add(folder/model.get('path',model.get('glb','')),model)
        raw,models,validation = packer.finish()
        finished.append({'component':component,'raw':raw,'models':models,'validation':validation,
                         'sourceRevision':revision,'sourceDeclaredRevision':manifest['revision'],
                         'sourceRevisionNote':None if manifest['revision'] == revision else
                         'Original native manifest retained: its declared revision differs from the selected immutable source folder.',
                         'sourceManifest':str(manifest_path.relative_to(ROOT)),
                         'sourceManifestSha256':digest(manifest_raw),'sourceBlendSha256':manifest['sourceSha256']})
    # Both libraries have passed parity before any deliverable is written.
    output.mkdir(parents=True)
    kits = []
    for kit in finished:
        filename = kit['component']+'.glb'
        (output/filename).write_bytes(kit['raw'])
        kits.append({k:v for k,v in kit.items() if k not in ('raw','validation')} |
                    {'path':filename,'sha256':digest(kit['raw']),'bytes':len(kit['raw'])})
    manifest = {'schema':'sidereal.framed-glb-library.v1','revision':runtime_revision,
                'recipeSha256':digest(Path(__file__).read_bytes()),'kits':kits,
                'scope':'Lossless native visual library packaging. Source GLBs and Blender art stay unchanged; no pressure/collision or runtime publication.'}
    validation = {'schema':'sidereal.framed-glb-library-validation.v1','status':'pass',
                  'kits':[kit['validation'] for kit in finished]}
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    (output/'validation.json').write_text(json.dumps(validation,indent=2)+'\n')
    return manifest,validation


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--hull-revision',type=int,default=2)
    parser.add_argument('--engine-revision',type=int,default=3)
    parser.add_argument('--runtime-revision',type=int,default=1)
    args = parser.parse_args()
    manifest,validation = build(args.hull_revision,args.engine_revision,args.runtime_revision)
    print(json.dumps({'status':'pass','revision':manifest['revision'],
                      'kits':[{k:kit[k] for k in ('component','kitSha256','before','after','sourceBytes','kitBytes')} for kit in validation['kits']]},indent=2))
