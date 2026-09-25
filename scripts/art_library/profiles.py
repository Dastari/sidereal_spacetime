"""Explicit design proposals, never runtime item definitions or approved balance.

Dimensions are Blender X width / Y depth or length / Z height in metres.
The rules classify observed names into modeling briefs, not into authority grants.
"""
import copy
import re

PROFILES = {}


def profile(key, dimensions, mass, health, role, steps, sockets=(), stats=None, origin="bottom centre", clearance=0.6):
    PROFILES[key] = dict(dimensions_m=dimensions, dry_mass_kg=mass, health_hp=health,
                         role=role, blender_steps=steps.split(" | "), sockets=list(sockets),
                         proposed_stats=stats or {}, origin=origin, interaction_clearance_m=clearance)


profile("wall", [2,.375,2.5],240,400,"Sealed structural divider; decorative recesses do not perforate the pressure core.",
        "Block a continuous sealed core between jambs at X ±1 m and Z 0–2.5 m. | Build flush jamb courses on a .125–.25 m visible-brick rhythm; give each mating edge one owner. | Add dark inset field, pale raised service plates, small burgundy hatch, vent and narrow cyan strip from the reference. | Keep detail as closed source solids with voxel_priority; use .03125 m samples for the hero wall. | Test two copies at 2 m centres and a corner; collision and pressure topology remain separate from cutaway visibility.",
        ["SOCK_EAST","SOCK_WEST","SOCK_TOP","SOCK_BOTTOM"],{"pressure_seal":True})
profile("floor",[2,2,.25],160,350,"Walkable deck and utility cover.",
        "Create a 2 m square load-bearing slab with its top at deck datum. | Add four inset panels with thin relief seams and a perimeter rim; keep underside service routing separate. | Add reference-specific hazard marks, grating or carpet as replaceable material/geometry layers. | Ensure seams cannot trap a foot collider and adjoining tiles have no doubled faces.",
        ["SOCK_NORTH","SOCK_SOUTH","SOCK_EAST","SOCK_WEST"],{"walkable":True,"load_limit_kg":2000},clearance=0)
profile("roof",[2,2,.25],130,280,"Removable exterior cap sharing the ship frame.",
        "Create a flat sealed core and a stepped perimeter mating the wall kit. | Layer pale armor slabs over indigo structure; inset grille and access hatch, with no duplicate ship decals. | Separate roof visibility group from collision and pressure data. | Capture roof-on overhead and roof-off cutaway using identical ship placement.", ["SOCK_BOTTOM","SOCK_NORTH","SOCK_SOUTH"],{"pressure_seal":True})
profile("hull",[2,2,1],420,700,"Exterior structural or armor section.",
        "Block the reference silhouette on the 2 m assembly grid using a closed pressure core. | Build stepped/chamfered plate courses; use Mirror only where the reference is symmetric. | Layer pale armor, recessed indigo ribs and a separate burgundy service cover. | Model attachment faces and simple collision explicitly; keep names/markings on independent decal nodes.", ["SOCK_NORTH","SOCK_SOUTH","HP_UTILITY_01"],{"armor_resistance_proposal":.25})
profile("corner",[2,2,2.5],320,500,"Compatible structural junction.",
        "Join two wall pressure cores into an L with one shared corner post. | Continue brick courses around the turn; interlock courses instead of overlapping two end jambs. | Keep inner walking clearance and exterior chamfer distinct. | Review inner, outer and neighboring door junctions at both camera poses.", ["SOCK_NORTH","SOCK_EAST","SOCK_TOP","SOCK_BOTTOM"],{"pressure_seal":True})
profile("door",[2,.375,2.5],180,350,"Reachable door with an explicit open/closed collision and sealing state.",
        "Build a 2 m wide frame, 1.25 m clear passage and 2.125 m clear height. | Model each leaf as a separately named closed solid; recess seals behind the visual jamb. | Place handle/control at 1.1 m above floor with reference-colored status strip. | Define leaf slide/hinge pivot, sweep clearance and open/closed clips; never simulate a door by deleting its material. | Sample only supported opaque parts; preserve separate glass or force-field requirements.", ["SOCK_EAST","SOCK_WEST","SOCK_POWER","SOCK_DATA","FX_LIGHT_01"],{"power_use_w":120,"open_time_s":1.2,"pressure_seal":True},clearance=1)
profile("window",[2,.25,2.5],160,220,"Occupied transparent pressure panel; visibility is independent of data authorization.",
        "Build a closed opaque frame using the wall kit datums. | Model the glass pane as a separate closed volume of finite thickness; preserve its material identity. | Author glass/frame interfaces and test oblique views against light/dark backgrounds. | Keep this asset blocked from opaque-only voxel export until optical boundary meshing, transmission preservation and validation pass.", ["SOCK_EAST","SOCK_WEST"],{"pressure_seal":True,"transmission_target":.85})
profile("pipe",[.25,2,.25],14,90,"Typed utility conduit with explicit connection ports.",
        "Create a closed tube or stepped conduit body of .25 m nominal diameter. | Match straight, elbow, T or cross topology to the actual crop; make unions and clamps as separate reusable solids. | Align endpoint empties to pipe axes and mark the air/power/data/coolant role from the reference. | Preserve collision and flow ports; crossing decorative pipes do not connect networks implicitly.", ["SOCK_NORTH","SOCK_SOUTH"],{"max_flow_kg_s_proposal":1,"power_capacity_w_proposal":100000})
profile("mount",[1,1,.25],60,240,"Structural attachment adapter; visual attachment never grants control.",
        "Block a square reinforced base and recessed central coupling. | Add stepped locking rim and visible bolts without studs. | Set origin at the mounting plane; place oriented empty for the attached device. | Check connected normals and transform footprint, socket and collision together during rotation/reflection.", ["SOCK_BOTTOM","HP_UTILITY_01"],{"supported_payload_kg":1200},origin="mount plane centre",clearance=0)
profile("console",[1.25,.75,1.25],75,160,"Interactive information/control station with actor-authorized functions.",
        "Block a waist-high pedestal and a sloped instrument deck. | Add a deep screen recess, pale bezel, dark lower cabinet and selective cyan or role-colored display. | Model screen, buttons and any chair separately; screens use a portable baked atlas or native dynamic UI texture. | Put an interaction anchor .6 m in front; route power/data behind the cabinet. | For piloting consoles provide a separate valid seat/control-station placement, not an ownership-based grant.", ["SOCK_POWER","SOCK_DATA","SOCK_INTERACT"],{"power_use_w":250,"interaction_reach_m":1.5})
profile("bed",[1,2.125,.8],65,120,"Single crew rest berth.",
        "Build a pale stepped bed frame at real crew scale with a dark underframe and pullout storage. | Add a separate mattress, block-shaped pillow and colored blanket slab with small bevels and matte fabric. | Match the headboard screen/light as separately attached equipment. | Leave at least .6 m side access; mark sleep pose anchor and collision at the bed, not at pillows.", ["SOCK_SLEEP","SOCK_INTERACT"],{"berths":1})
profile("bunk",[1,2.125,2.25],130,220,"Two stacked crew berths.",
        "Build two bed frames within a 2.25 m high open supporting frame. | Keep the upper bed below the 2.5 m wall cap; reserve head clearance and a ladder/step interaction. | Layer matte blue bedding, pale frames and warm task lights. | Add two separate occupancy/sleep anchors; two beds do not become one character slot.", ["SOCK_SLEEP_LOWER","SOCK_SLEEP_UPPER"],{"berths":2})
profile("chair",[.625,.625,1],12,50,"Seat for crew, consoles or dining.",
        "Set seat top at .5 m and shape the backrest to the visible chunky silhouette. | Add a dark frame, pale casing and matte upholstered inset; keep arms clear of hand poses. | Place seat occupancy origin at the pelvis datum; make pedestal/legs fit the source. | Check seated crew knees, hand reach and access path without granting control automatically.", ["SOCK_SEAT"],{"seats":1})
profile("sofa",[2,.875,.9],65,110,"Crew lounge seating.",
        "Build the dark plinth and low pale rim first. | Add separate rectangular burgundy cushion blocks with restrained bevels; preserve the corner/straight variant seen. | Keep seat top around .45 m and back around .9 m. | Author one seat anchor per usable place and reserve front approach space.", ["SOCK_SEAT_01","SOCK_SEAT_02"],{"seats":2})
profile("table",[1.25,1.25,.75],30,80,"Dining/work table or lower lounge table.",
        "Block a square pale slab with chamfered corners over a central dark pedestal. | Add subtle studs-free panel separation on the top and reference corner fasteners. | Keep cups/plants/other objects separate from the table identity. | Use .75 m dining height or .45 m coffee-table height; test chair and knee clearance.", ["SOCK_TOP"],{"surface_payload_kg":80})
profile("locker",[.75,.625,2],70,160,"Personal or supply storage cabinet.",
        "Create a tall closed cabinet with a dark base and pale modular shell. | Split door, hinges/slide and inset handle into named pieces; use the reference-colored service patch. | Put control/handle near 1.1 m and reserve door-sweep volume. | Describe inventory payload and allowed contents separately from decorative locker cells.", ["SOCK_INTERACT"],{"payload_limit_kg":80,"inventory_grid":[4,6]})
profile("sanitation",[.75,.75,1],45,100,"Crew hygiene or food-service fixture.",
        "Block the reference-specific basin/toilet/shower/kitchen silhouette at crew reach scale. | Keep clean pale shells, dark cavities and small metallic taps distinct. | Separate any shower enclosure, door and transparent panel with supported export paths. | Add typed water/waste/power interfaces and a conservative floor collider; plumbing functionality remains proposed.", ["SOCK_WATER","SOCK_WASTE","SOCK_INTERACT"],{"water_capacity_l_proposal":20})
profile("hydroponics",[2,1,1.75],140,180,"Grow tray assembly with finite water and crop contents.",
        "Build two stepped trays on an open pale frame with a dark water reservoir. | Create several leaf-cluster silhouettes from small stepped solids, with no per-leaf runtime entity. | Keep plants reusable and separate from tray ownership and crops. | Add a warm grow-light bar and side cyan console; place water and power ports behind. | Preserve living green variety while keeping the growth area readable at gameplay zoom.", ["SOCK_WATER","SOCK_POWER","SOCK_INTERACT"],{"power_use_w":1200,"water_capacity_l":50,"crop_slots":6})
profile("plant",[.375,.375,.75],4,15,"Decorative potted plant or crop visual.",
        "Build a small square pot with recessed soil. | Arrange broad stepped leaf clusters and varied heights from simple closed solids. | Use matte greens with controlled hue variation, a pale/copper planter and no glow unless the alien reference requires it. | Keep crop yield and watering data separate from the geometry.", ["SOCK_BOTTOM"],{"harvest_yield_kg":None})
profile("light",[.125,.625,.125],2,25,"Visible emitter with bounded optional local illumination.",
        "Model the dark recessed housing and thin pale rim. | Place an emissive opaque inset matching the reference cyan/amber/red source. | Keep emission visible with bloom off; request a real bounded light only when nearby surfaces need illumination. | Glass/diffuser transmission requires the optical path; do not silently sample it as opaque.", ["SOCK_POWER","FX_LIGHT_01"],{"power_use_w":15})
profile("decal",[.5,.012,.75],0,None,"Independent surface graphic, sign, grille motif or insignia study.",
        "Recreate the graphic as native vector/decal art at a controlled texel density. | For a physical sign create a thin beveled plaque and a separate label plane. | Keep text/ship registration independent of repeating hull geometry. | Preserve source wording in evidence; adopt project branding only after owner design review.", [],{"gameplay_effect":None},clearance=0)
profile("crate",[.75,.75,.75],18,100,"Movable cargo container; contents retain independent identity.",
        "Build a closed dark structural box with recessed faces and reinforced pale corner posts. | Add reference-specific orange/burgundy panels, locking bars, tiny status emitters and carrying recesses. | Model lid or door separately and author its hinge/open clearance. | Put origin on the bottom centre and tractor target near centre of mass; define an interior volume without merging contained items.", ["SOCK_INTERACT","FX_TRACTOR_TARGET"],{"payload_limit_kg":120,"inventory_grid":[4,4],"stack_filled":False})
profile("tank",[.75,.75,1.5],55,180,"Sealed finite fluid/gas reservoir with typed contents.",
        "Block a stepped cylindrical or rounded rectangular pressure vessel matching the crop. | Add protective corner cage, cap/valve, fill port and small gauge window. | Separate shell from fluid contents and keep supports within the declared envelope. | Use distinct fuel/water/gas hazard markings; a transparent gauge needs the optical export route.", ["SOCK_FLUID","FX_TRACTOR_TARGET"],{"capacity_l":200,"stack_filled":False,"hazard":"depends on contents"})
profile("resource",[.375,.375,.375],8,30,"Ore, crystal or refined resource visual; species and amount are authored data.",
        "Block an irregular cluster or regular ingot stack according to the crop. | Use asymmetric stepped facets and limited material patches; crystals get a clear growth axis and sharp terminal faces. | Keep mineral colors and emissive exotic veins distinct from base rock. | Create 2–3 LOD silhouettes and preserve one pickup/stack identity, not one item per visible facet.", ["FX_TRACTOR_TARGET"],{"stack_limit_proposal":100,"resource_species":"unconfirmed","unit_value_credits":None})
profile("reactor",[2,4,2],1200,900,"Installed power generator requiring supply and heat handling.",
        "Orient the long axis along Blender Y and create a closed stepped barrel core. | Add concentric pale/dark retaining rings, separate cyan energy inserts and copper coolant loops. | Build a lower support frame and a reachable side maintenance console. | Put power/coolant ports and damage FX sockets on named nodes; keep source solids manifold for sampling. | The luminous core is presentation; generation and fuel balance come from server content.", ["SOCK_POWER","SOCK_COOLANT","SOCK_FUEL","FX_DAMAGE_01"],{"power_generation_w":1000000,"heat_output_w":200000})
profile("battery",[1,1,1],150,250,"Stored electrical energy or capacitor module.",
        "Build a reinforced modular housing around a replaceable cell core. | Match cell count, end caps and colored charge insets from the crop. | Add vent recesses and power terminals with positive socket directions. | Keep capacity, charge and damaged state separate; charged devices do not stack by default.", ["SOCK_POWER"],{"energy_capacity_j":36000000,"max_output_w":100000,"stack_charged":False})
profile("engine",[2,4,2],650,600,"Mounted propulsion device with achieved-thrust visual output.",
        "Orient connection plane forward and exhaust aft; build pressure vessel, stepped nozzle throat and retaining rings. | Add separate service shroud, pale plates, burgundy access band and copper piping. | Place FX_ENGINE_01 on the exhaust axis and mount socket at the supported face. | Model the nozzle cavity with real wall thickness and finite solids; sample at .03125 m for the hero. | Render idle and achieved-thrust plumes; do not infer thrust direction or magnitude from the image at runtime.", ["SOCK_FRONT","SOCK_FUEL","SOCK_POWER","FX_ENGINE_01"],{"max_thrust_n":14000,"power_use_w":20000,"heat_output_w":50000},origin="connection plane centre",clearance=2)
profile("sensor",[1,1,1.5],90,180,"Sensor, antenna or beacon presentation tied to authorized discovery.",
        "Build a low square mount and a separately pivoted mast/gimbal. | Form the reference dish as stepped concentric segments or antenna as a readable thin mast. | Keep receiver, luminous tip and signal processor separate from the base. | Place scan axis and FX sockets; received contacts and scan range are authority-provided.", ["SOCK_POWER","SOCK_DATA","SOCK_SENSOR_AXIS"],{"power_use_w":1000,"range_m_proposal":5000})
profile("shield",[1.5,1.5,1.5],300,300,"Shield field generator/emitter.",
        "Build a dark power housing and pale protective frame around a cyan core. | Add coil rings or projector dish to match the visible design. | Export the solid device independently of a translucent field mesh/shader. | Author projector direction and impact FX socket; energy and absorbed damage remain validated gameplay.", ["SOCK_POWER","FX_SHIELD"],{"power_use_w":50000,"shield_capacity_hp":500,"recharge_hp_s":20})
profile("tractor",[1.5,2,1.5],280,300,"Tractor projector or cargo handling tool.",
        "Build a ring emitter or articulated cargo jaws according to the reference. | Keep base, gimbal, lens/jaws and actuator as separate moving groups. | Author mount origin, working axis and target beam socket. | Build beam as an optional presentation effect; target mass, reach and transfer permissions are server-validated.", ["SOCK_POWER","FX_TRACTOR_SOURCE"],{"power_use_w":25000,"range_m":100,"max_payload_kg":5000})
profile("machine",[2,2,2],400,400,"Functional machinery whose exact recipe/capability is proposed.",
        "Block the identifiable machine housing, input/output faces and major moving part from the crop. | Add structural frame, service panels and role-colored controls before small pipes. | Separate tools, loading bays and moving pieces so they can animate and be replaced. | Define power/data/input/output sockets and a simple floor collider; reserve .75 m maintenance access. | Do not turn a labeled teleporter/warp/cloak machine into an implemented mechanic without its authority contract.", ["SOCK_POWER","SOCK_DATA","SOCK_INTERACT"],{"power_use_w_proposal":10000,"cycle_s_proposal":10},clearance=.75)
profile("turret",[1.5,2,1.5],220,300,"Ship-mounted weapon requiring valid station, mount, aim and resources.",
        "Block a reinforced square mounting plate with a separate yaw ring. | Add elevation cradle and weapon housing; barrels/emitter extend along the reference firing axis. | Keep barrel, recoil slide, ammo/energy store and targeting sensor separate. | Use short clustered barrels for flak/PD, long paired rails for railguns, cell apertures for missile racks or a lens for beams. | Author HP_WEAPON, yaw/elevation pivots and FX_MUZZLE_01; validate sweep clearance and simple collision.", ["HP_WEAPON_MEDIUM_01","SOCK_POWER","SOCK_DATA","FX_MUZZLE_01"],{"damage_hp_proposal":25,"shots_s":4,"range_m":1000,"magazine_rounds":80,"traverse_rad_s":1.5},origin="mount plane centre",clearance=1)
profile("weapon-part",[.5,1,.5],25,80,"Reusable subassembly of a parent weapon; no standalone firing capability.",
        "Read the parent assembled and exploded crops together to establish the part orientation. | Build only the separated barrel, ring, power pack, gimbal or housing visible in this crop. | Preserve parent interface dimensions, pivot and mounting faces; keep unsupported internal geometry conservative. | Export as a replaceable subassembly; mass is counted once through parent composition and capability comes from a complete valid weapon.", ["SOCK_PARENT"],{"standalone_damage":None},origin="parent interface centre")
profile("ordnance",[.25,1.25,.25],12,10,"Finite ammunition payload with a separate projectile definition.",
        "Orient the long axis to show the useful broad silhouette; build body, tip and tail/nozzle as separate material regions. | Match fins, clustered tubes or mine casing from the reference; preserve distinct size-class silhouettes. | Put forward/collision axis and exhaust FX at named nodes. | Treat warhead damage and guidance as authored data, not as an effect of paint color.", ["FX_ENGINE_01","SOCK_LAUNCH"],{"damage_hp_proposal":120,"speed_m_s":150,"lifetime_s":12,"guidance":"proposed per family"},origin="centre of mass")
profile("character",[.625,.5,1.8],80,100,"Crew/actor appearance on the shared character rig.",
        "Use existing crew source as the 1.79 m body baseline; target 1.8 m and preserve head/hand/socket proportions. | Block a large cubic head, compact torso, short limb segments and clear boots; role-specific clothing stays modular. | Build separate hair, helmet, visor, chest, shoulders, gloves, legs, boots and pack layers. | Skin rigid blocks to the existing rig and match hand/back/head sockets rather than inventing a new skeleton. | Capture idle, walking, seated and both gun grips; animation never writes authoritative movement or equips inventory.", ["SOCK_HAND_R","SOCK_HAND_L","SOCK_BACK","SOCK_HEAD","SOCK_HIP"],{"walk_speed_m_s_proposal":3,"carry_limit_kg":30,"role_bonus":"requires separately approved progression"})
profile("animation",[.625,.5,1.8],None,None,"Pose or directional reference for one reusable skeletal animation.",
        "Reuse the shared crew rig and model; this crop is a key pose, not a new body asset. | Match hip/shoulder angle, foot support, arm gesture and held-item direction. | Interpolate a readable short clip; keep root motion disabled for gameplay locomotion. | Test front, side, rear and fixed-elevation gameplay cameras, including attachment clipping. | Preserve a strip of key frames plus an actual runtime clip capture.", ["SOCK_HAND_R","SOCK_HAND_L"],{"clip_duration_s_proposal":1,"root_motion":False})
profile("handgun",[.16,.375,.25],1.2,60,"One-handed personal weapon with grip and muzzle anchors.",
        "Use the existing equipment builder hand grip (.075 m wide, .155 m tall) as attachment datum. | Build a dark receiver, pale slide, trigger guard, short barrel and restrained colored side plate. | Match distinctive emitter/optic features and keep the barrel broad silhouette visible in the hero view. | Put muzzle and hand socket on named nodes; validate contact with shared glove and aim pose.", ["SOCK_HAND_R","FX_MUZZLE_01"],{"damage_hp_proposal":12,"shots_s":3,"range_m":40,"magazine_rounds":12},origin="grip centre")
profile("rifle",[.2,1,.3],4,90,"Two-handed personal firearm or beam weapon.",
        "Build grip, receiver, stock and forward body around the shared hand datum. | Add the crop's rails, magazine, cooling slots, muzzle and optic with few readable forms. | Distinguish shotgun bore, beam lens and rail pair by silhouette, not just color. | Author muzzle and support-hand anchors, then fit both crew hands in aim/reload poses. | Keep applied scale and reusable material roles; use the existing equipment source/export path.", ["SOCK_HAND_R","SOCK_HAND_L","FX_MUZZLE_01"],{"damage_hp_proposal":20,"shots_s":5,"range_m":100,"magazine_rounds":30},origin="right grip centre")
profile("tool",[.2,.5,.25],2,60,"Handheld interaction tool; repair/heal/scan requires validated capability and resources.",
        "Block a human-grip tool with a strong role-specific working end. | Match the cutter lens, wrench jaws, scanner face, torch nozzle or medgun cartridge visible in the crop. | Keep pale casing, dark grip and role-colored emitters distinct. | Add hand attachment and work/beam socket; capture hand contact and aim pose in the crew rig.", ["SOCK_HAND_R","FX_TOOL"],{"power_use_w_proposal":200,"interaction_range_m":2,"resource_cost_per_use":"proposed by tool family"},origin="grip centre")
profile("equipment",[.5,.3,.5],5,100,"Modular worn equipment with stable actor attachment.",
        "Start from the existing crew body to fit the exact head/chest/back/limb socket. | Build a studless layered shell from the crop with enough joint clearance for animation. | Separate pale armor, indigo gaps, accent patches and small powered elements. | Keep left/right compatibility explicit and preview with different body/helmet combinations. | Armor appearance, oxygen reserve and capability are separate authored fields, never implicit from the mesh.", ["SOCK_EQUIPMENT"],{"equipment_slot":"resolve from item name","armor_bonus_proposal":5,"inventory_stack":1},origin="attachment socket")
profile("room",[6,8,2.5],None,None,"Assembly preset built from independently placed items and structural tiles.",
        "Lay out a 3 by 4 array of current 2 m tiles as a proposed review room. | Build continuous deck and wall interfaces, leaving 1.25 m door clearance and .75 m maintenance paths. | Place each observed bed, console, crate, light and machine as an independently identified instance. | Keep roof, upper walls, lower walls, floor and furniture in semantic visibility groups. | Capture one furnished room, adjacent corridor and full ship in both cameras; compute aggregate mass/stats from approved children without double counting.", ["SOCK_CORRIDOR","SOCK_POWER","SOCK_DATA","SOCK_AIR"],{"mass_policy":"sum installed parts and contents exactly once","crew_capacity":"sum valid berths/seats","atmosphere_volume_m3_proposal":120})
profile("ship",[12,30,5],None,None,"Whole-ship composition; simulation properties compile from installations.",
        "Establish a crew-scale layout and freeze the silhouette before detail. | Assemble shared structural tiles, room presets and independently mounted systems; do not fuse all item identities. | Keep one ship frame and a semantic roof/cutaway hierarchy for both camera modes. | Place actual mounts and thruster axes; derive aggregate mass/inertia/cargo/crew from approved installed definitions. | Author LODs that retain silhouette and emitters; compare top-down and fixed 35.264 degree elevation, without introducing vertical simulation.", ["HP_DOCK_01","SHIP_ORIGIN"],{"crew_capacity_proposal":6,"mass_policy":"compiled from parts and contents","max_speed_m_s_proposal":30},origin="ship frame origin",clearance=2)
profile("planet",[200,200,200],None,None,"Celestial visual with independent physical radius, discovery and orbital policy.",
        "Build a grid-aligned stepped globe or port the existing voxel-planets recipe for the desired family. | Layer rock, ocean/land, ice/crater/lava or crystal relief as visible in the crop; retain a coherent sphere silhouette. | Keep atmosphere, cloud shelf, rings and moons separate presentation layers with deterministic seeds. | Author LOD and instance/material budgets; do not create one node per block. | Record physical radius independently of preview radius and keep discovery/coordinates server-derived.", [],{"preview_radius_m":100,"physical_radius_m_proposal":3000000,"landing":"not implemented","resource_distribution":"authoring proposal"},origin="body centre",clearance=0)
profile("environment",[8,8,8],None,None,"Asteroid, wreck or background/landscape study.",
        "Identify whether this is a gameplay rock/wreck or distant scenery before assigning authority. | Build an asymmetric stepped core and crater/fragment silhouette; reserve sparse embedded mineral accents. | Instance a small library with deterministic rotations/scales and two reduced-detail LODs. | Keep simple collision and depletion/material contents separate from GPU detail. | A background plate/nebula is instead a visual layer; it cannot expose undiscovered objects or illuminate cabins implicitly.", [],{"resource_yield_kg":None,"collision":"simple authored hull only for gameplay bodies","world_radius_m":"depends on body definition"},origin="centre of mass",clearance=0)
profile("vfx",None,None,None,"Presentation effect triggered by validated state/events.",
        "Use the crop to define shape, palette, bright core, falloff and timing, not damage. | Author mesh emitters/cones/shock rings in Blender only where useful; use bounded Babylon particles/materials for the animated effect. | Save a transparent frame or sprite sheet plus an animation capture at real gameplay scale. | Define effect anchor, duration, peak radius, particle/light budget and reduced-motion behavior. | Compare on dark space and pale hull with bloom off and on; stop/dispose all emitters with their owning object.", ["FX_ORIGIN"],{"duration_s_proposal":.35,"peak_radius_m_proposal":1,"max_particles_proposal":64,"max_local_lights":1,"gameplay_damage":None},origin="effect anchor",clearance=0)
profile("ui",None,None,None,"Native UI component/state reference; zero physical mass or health.",
        "Recreate the frame, icon and layout using the project's native UI/canvas/vector components; Blender is not the layout authoring tool. | Use dark navy surfaces, thin cyan emphasis and restrained status colors; preserve spacing and readable type instead of baking screenshot text. | For a 3D item/ship portrait, render its linked canonical Blender asset separately on alpha and place it in the UI. | Implement normal, hover, focus, pressed, disabled and error states as applicable; retain actual project keybindings and keyboard focus. | Capture the actual app at 1280x720 and 1920x1080, verify reduced motion and readable color-independent state labels.", [],{"preview_size_css_px":[256,64],"gameplay_values":"bind only to authorized view fields; source numbers are mock data"},origin="screen layout anchor",clearance=0)
profile("inventory-icon",None,None,None,"Inventory thumbnail reference, linked to a physical asset; no independent item balance.",
        "Identify the underlying physical crate/weapon/tool/resource and link its canonical design. | Render that Blender asset orthographically with a shared three-quarter camera and genuine transparent film. | Fit the silhouette into a 128px thumbnail with readable 32px and 64px reductions. | Keep rarity frame, quantity and equipped/locked badges in native UI layers, separate from the object image. | Do not paint gameplay quantities, rarity or invented item names into the model texture.", [],{"icon_size_px":[128,128],"gameplay_stats":"inherited from linked item definition only"},origin="thumbnail canvas centre",clearance=0)


def classify(a):
    c=a["category"]; n=a["name"].lower()
    if c in ("ui","inventory-icon","animation","character","planet","vfx","environment","weapon-part"):
        return c
    if a["kind"]=="assembly" and c=="room": return "room"
    if c=="ship":return "ship"
    if c=="resource":return "resource"
    if c=="room":return "room"
    if c=="ordnance":return "ordnance"
    if c=="equipment":
        if any(x in n for x in ["rifle","carbine","shotgun","smg","heavy gun"]):return "rifle"
        if any(x in n for x in ["pistol","handgun","sidearm","stun gun"]):return "handgun"
        if any(x in n for x in ["cutter","medgun","repair tool","scanner","baton","wrench","welder","multi-tool","grapple","flashlight","data pad"]):return "tool"
        if "medkit" in n:return "crate"
        return "equipment"
    rules=[("window",["window","canopy","glass","force field"]),("bunk",["bunk"]),("bed",["bed","mattress","blanket","headrest"]),("chair",["chair","stool","seat"]),("sofa",["sofa","sectional"]),("hydroponics",["hydroponic","grow tray","hydro large tray","hydro small tray"]),("plant",["plant","leaf","potted"]),("table",["table"]),("console",["console","terminal","screen","monitor","display","control panel"]),("light",["light","lamp","emissive","cyan strip"]),("decal",["poster","insignia","sign","nameplate","emblem","slogan","rug"]),("locker",["locker","cabinet","drawer","vending","dispenser","arcade"]),("sanitation",["toilet","sink","shower","kitchen"]),("door",["door","airlock","hatch"]),("reactor",["reactor"]),("engine",["engine","thruster","nozzle","rcs","exhaust"]),("tank",["tank","gas bundle","fuel barrel","chemical drum","water container"]),("crate",["crate","cargo pod","cargo module","cargo hold","container","case","canister","pallet"]),("resource",["ingot","crystal","ore chunk","nugget"]),("battery",["battery","capacitor","power node","power core","energy cell"]),("shield",["shield"]),("tractor",["tractor","clamp","salvage arm"]),("sensor",["sensor","antenna","beacon","radar","dish","scanner mast"]),("turret",["turret","cannon","railgun","missile pod","missile rack","torpedo launcher","gauss","flak","blaster","beam emitter","weapon pod"]),("pipe",["pipe","conduit","cable","utility layer","utilities","riser"]),("mount",["hardpoint","mount","connector","coupling","socket","joint","adapter"]),("floor",["floor","deck","grate"]),("roof",["roof","ceiling"]),("corner",["corner"]),("wall",["wall","partition"]),("hull",["hull","armor block","wing","spike","patch plate","frame cube","solid cube"])]
    for p,words in rules:
        if any(word in n for word in words):return p
    if c=="structure":return "hull"
    if c=="decor":return "decal"
    if c=="cargo":return "crate"
    if c=="weapon":return "turret"
    if c=="pipe":return "pipe"
    if c=="engine":return "engine"
    if c=="sensor":return "sensor"
    if c=="console":return "console"
    return "machine"


def proposal(a):
    key=classify(a); p=copy.deepcopy(PROFILES[key]);p["profile"]=key
    n=a["name"].lower()
    if key=="table" and ("coffee" in n or "lounge" in n):p["dimensions_m"][2]=.45
    if key=="ship":
        if "razor" in n:p["dimensions_m"]=[8,12,3];p["proposed_stats"]["crew_capacity_proposal"]=1
        if "wayfarer" in n:p["dimensions_m"]=[10.8,22.8,3.5];p["scale_basis"]="Cabin fixture footprint from packages/content/src/flight.ts; external drives extend bounds. Render bounds must be measured."
        if "frigate" in n or a["source"]=="faction-ship-1.png":
            p["dimensions_m"]=[32,128,28];p["scale_basis"]="Concept sheet claim, NOT validated against visible rooms/crew. Requires explicit proportion study before modeling."
        if "mining" in n or "prospector" in n:p["dimensions_m"]=[28,80,16]
        if "aurelian" in n:p["dimensions_m"]=[60,70,18]
    if key=="equipment":
        for word,dim,mass,slot in [("head",[.5,.45,.5],0,"head"),("hair",[.5,.45,.25],0,"hair"),("helmet",[.56,.5,.55],3,"head"),("headwear",[.56,.5,.3],1,"head"),("visor",[.48,.08,.2],.5,"visor"),("chest",[.6,.4,.5],7,"torso"),("shoulder",[.25,.3,.25],1.5,"shoulders"),("glove",[.16,.18,.22],.5,"hands"),("boot",[.2,.35,.3],1,"feet"),("belt",[.55,.35,.125],1,"belt"),("leg",[.5,.35,.65],5,"legs"),("pack",[.5,.3,.65],6,"back")]:
            if word in n:p["dimensions_m"]=dim;p["dry_mass_kg"]=mass;p["proposed_stats"]["equipment_slot"]=slot;break
    if key=="vfx":
        if "large explosion" in n:p["proposed_stats"].update(peak_radius_m_proposal=12,duration_s_proposal=1.5,max_particles_proposal=128)
        if any(w in n for w in ["beam","trail","thruster"]):p["proposed_stats"]["duration_s_proposal"]="while authorized source active; bounded lifetime"
    p["status"]="proposal-unapproved"
    p["confidence"]="low; artistic inference, not a measurement"
    p.setdefault("scale_basis","Crew reference height 1.8 m, active 2 m construction tile, reach/clearance and functional role. Source perspective cannot establish true depth.")
    p["balance_basis"]="Initial design discussion values in explicit units, not tested balance or live content. Refine per asset and obtain owner approval. Do not derive mass from render triangles or automatically publish these fields."
    return p


def style(a):
    s=a["source"];n=a["name"].lower()
    if s=="alien-ship-2.png" or "riftjack" in n:return "raider"
    if s=="alien-ship-1.png" or "aurelian" in n:return "crystalline-alien"
    if s=="faction-ship-2.png" or "helix" in n:return "industrial-mining"
    if a["category"] in ["ui","inventory-icon"]:return "interface"
    if a["kind"]=="baseline":return "historical-baseline"
    if a["category"] in ["planet","environment","resource"]:return "stepped-environment"
    return "pale-studless"


def design_family(a):
    """Shared production families; appearances/variants retain independent evidence.

    Families are NOT a claim that all geometries are interchangeable. Family signoff
    must name the exact deliverable/variant manifest; approval is never propagated
    to other families by category. Ambiguous mappings are recorded for review.
    """
    p=classify(a); n=a["name"].lower()
    if p=="ui":
        for k,words in [("reticles",["reticle","bracket","lock","hit marker","offscreen"]),("icons",["icon","marker","insignia","wordmark","badge","waypoint"]),("buttons",["button","shortcut","action"]),("tabs",["tab","navigation","category"]),("inputs",["input","select","toggle","checkbox","radio","slider","knob","stepper","filter","sort"]),("bars-gauges",["bar","gauge","progress","dial","load","telemetry"]),("lists-tables",["row","stat","attribute","legend"]),("inventory-slots",["slot"]),("radar-map",["radar","map","scan","fog","ping","cone"]),("feedback",["toast","tooltip","hint","dialog"]),("frames-panels",["panel","frame","composition","widget","card","header","footer"])]:
            if any(w in n for w in words):return "ui."+k
        return "ui.miscellaneous"
    if p=="inventory-icon":return "ui.item-thumbnails"
    if p=="animation":
        action=re.sub(r" key pose \d+$","",n)
        if action.startswith("directional "):action="directional-review"
        return "crew.animation."+re.sub(r"[^a-z0-9]+","-",action)
    if p=="vfx":
        families=["muzzle flash","tracer round","laser bolt","plasma bolt","beam lance","ion arc","missile trail","smoke trail","contrail","thruster glow","small explosion","medium explosion","large explosion","fiery blast","plasma burst","emp burst","shield hit splash","shield bubble impact","armor spark hit","ricochet spark","debris burst","shrapnel cloud","reactor vent flare","tractor beam","scanning pulse","repair sparks","healing beam","pickup glow","warning beacon flash","teleport arrival","warp charge","destruction breakup"]
        match=next((f for f in families if f in n),re.sub(r" (a|b|c|d|active|standard)$","",n))
        return "vfx."+re.sub(r"[^a-z0-9]+","-",match)
    if p=="planet":
        match=next((f for f in ["rocky","temperate","desert","ice","volcanic","gas giant","ocean","toxic","crystal"] if f in n),"unspecified")
        return "environment.planet."+match.replace(" ","-")
    if p=="character":return "crew."+("alien" if "alien" in n else "cyborg" if "cyborg" in n else "base-and-outfits")
    if p=="equipment":
        match=next((f for f in ["helmet","headwear","hair","head","visor","mask","rebreather","chest","shoulder","glove","gauntlet","boot","belt","legs","armor","jetpack","oxygen pack","backpack","shield pack"] if f in n),"attachments")
        return "crew.equipment."+match.replace(" ","-")
    if p=="ship":
        match=next((f for f in ["razor","wayfarer","aurelian","riftjack","prospector","helix"] if f in n),"exploration-frigate")
        return "ship."+match
    if p=="environment":return "environment."+("background" if any(w in n for w in ["landscape","kiosk","cloud","ring","relief"]) else "wreckage" if any(w in n for w in ["wreck","fragment","salvage"]) else "asteroids")
    if p=="room":
        match=next((f for f in ["bridge","crew","engineering","hydroponics","medbay","medical","lounge","cargo","storage","science","airlock","stasis","hatchery","bio lab","corridor"] if f in n),"assembly")
        return style(a)+".room."+match.replace(" ","-")
    # Distinct functional weapon, cargo, machine and material families retain their
    # own design queues. Color/size and pose variations remain listed appearances.
    refinements={"turret":["point defense","autocannon","laser","railgun","flak","plasma","gauss","ion","pulse beam","missile","torpedo","rocket","breaching","mine","bomb","drone","scrap","chain"],"ordnance":["interceptor","guided","heavy torpedo","cluster","emp","incendiary","kinetic","plasma","proximity","payload"],"crate":["reinforced","refrigerated","vacuum","salvage","medical","medkit","data","tech","pallet","cargo","supply"],"tank":["liquid","cryo","fuel","gas","chemical","water","oxygen"],"resource":["iron","copper","gold","crystal","ice","exotic","ingot","metal"],"machine":["gravity","coolant","air filter","fuel processor","refinery","teleport","drone","cloaking","jump","warp","crusher","drill","fabricator","ai core","stasis","jammer"],"tool":["cutter","scanner","wrench","welder","medgun","repair","baton","grapple","flashlight","data pad","multi-tool"],"rifle":["shotgun","beam","rail","carbine","smg","rifle"],"window":["glass floor","canopy","force field","large window","window"],"door":["exterior airlock","interior airlock","airlock","blast","sliding","door","hatch"],"floor":["reinforced","grate","hazard","carpet","hex","exterior","floor"],"engine":["rcs","maneuver","vtol","warp","ion","small","medium","large","engine"],"sensor":["beacon","dish","dome","mast","antenna","scanner","radar"],"pipe":["elbow","corner","t junction","cross","flexible","vertical","riser","tray","air","power","data","coolant"]}
    suffix=next((f for f in refinements.get(p,[]) if f in n),"standard")
    return style(a)+"."+p+"."+suffix.replace(" ","-")
