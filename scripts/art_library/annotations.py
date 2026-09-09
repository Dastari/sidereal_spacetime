"""Visually authored reference rectangles, in original source pixels.

This is an inventory, not image recognition. Every source was opened individually.
Repeated rows are explicit layouts observed in the source, not inferred from names.
Keep stable keys when refining rectangles. Byte-identical sources share entries.
"""
import re

ITEMS = []
SOURCE_NOTES = {}
SOURCE = None


def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def source(name, note):
    global SOURCE
    SOURCE = name + ".png"
    SOURCE_NOTES[SOURCE] = note


def item(name, box, category="system", note="", kind="object", family=None):
    key = slug(SOURCE[:-4]) + "--" + slug(name)
    assert not any(a["id"] == key for a in ITEMS), key
    ITEMS.append(dict(id=key, name=name, source=SOURCE, box=list(box),
                      category=category, observation=note, kind=kind,
                      family=family or slug(name)))


def row(names, box, category="system", note="", kind="object", prefix=""):
    names = names.split("|") if isinstance(names, str) else names
    x1, y1, x2, y2 = box
    step = (x2-x1)/len(names)
    for i, name in enumerate(names):
        item(prefix+name, (round(x1+i*step), y1, round(x1+(i+1)*step), y2), category, note, kind)


def grid(rows, box, category="system", note="", kind="object", prefix=""):
    x1, y1, x2, y2 = box
    step = (y2-y1)/len(rows)
    for i, names in enumerate(rows):
        row(names, (x1, round(y1+i*step), x2, round(y1+(i+1)*step)), category, note, kind, prefix)


source("core-construction-blocks", "Six construction primitives; exploded layers, joins and snap graphics. The printed 1 m unit conflicts with the active 2 m construction tile; do not adopt the printed 4 m layer stack as a habitable deck specification.")
row("Hull tile|Floor tile|Wall tile|Corner tile|Roof cap tile|Structural base", (20,180,1430,353), "structure")
for name, box in [("Exploded roof cap",(205,495,439,608)),("Exploded left wall",(196,606,309,723)),("Exploded right wall",(307,588,436,723)),("Exploded floor",(202,699,435,815)),("Exploded structural service base",(200,790,439,947))]: item(name,box,"structure",kind="subassembly")
item("Layer cross section",(492,522,657,889),"structure",kind="assembly")
item("Snap grid preview",(829,513,1095,662),"ui")
row("Straight hull join|Corner join|Open deck join",(823,716,1422,906),"structure",kind="assembly")
row("Modular icon|Reconfigure icon|Expand icon|Repair icon|Durable icon",(421,979,1030,1040),"ui")
item("Voxel unit diagram",(1371,73,1430,134),"ui")

source("internal-components-2", "Dense labeled library: 24 consoles, 12 crew facilities, 12 utility devices, 6 doors, and eight-item structure/engine/weapon/sensor/decor families. Labels distinguish proposed functions, not implemented capabilities.")
grid(["Command console|Navigation console|Engineering console|Medical console|Research console|Security console|Trade cargo console|Communications console", "Hacking terminal|AI core|Drone control|Fabricator|Map table|Crew management console|Power control console|Life support console", "Data archive|Mission board|Galactic market terminal|Scanner console|Door control console|Turret control console|Sensor array console|Status display"], (13,43,742,488), "console")
grid(["Bunk bed|Locker|Table and stools|Sofa", "Shower|Toilet|Sink|Kitchen unit", "Hydroponics bed|Food dispenser|Vending machine|Arcade cabinet"], (771,42,1107,486), "furniture")
grid(["Battery|Capacitor|Generator|Coolant unit", "Oxygen tank|Air filter|Gravity unit|Shield projector", "Fuel processor|Refinery|Teleporter pad|Drone bay"], (1138,44,1524,335))
row("Standard door|Sliding door|Interior airlock|Exterior airlock|Blast door|Force field",(1130,386,1528,492),"door")
grid(["Floor panel|Reinforced floor|Grated floor|Hazard floor","Glass floor|Carpet floor|Hex floor|Exterior deck"],(16,546,398,718),"structure")
row("Straight wall|Window wall|Corner wall|Diagonal wall|Large window wall|Reinforced wall|Utility wall|Wall with pipes",(423,542,866,672),"structure")
grid(["Straight pipe|Corner pipe|T junction pipe|Cross pipe","Wall mount pipes|Vertical pipe|Flexible pipe|Cable tray"],(889,540,1179,718),"pipe")
grid(["Ceiling light|Wall light|Floor light|Strip light","Hanging light|Warning light|Hologram projector|Plant pot"],(1200,540,1528,718),"decor")
grid(["Small thruster|Medium thruster|Large thruster|Maneuvering thruster","VTOL thruster|Ion engine|Warp engine|RCS attitude thruster"],(17,771,375,995),"engine")
grid(["Point defense turret|Laser turret|Railgun turret|Missile pod","Dual cannon|Plasma turret|EMP emitter|Torpedo launcher"],(399,771,762,995),"weapon")
grid(["Short range antenna|Long range dish|Radar array|Satellite uplink","Scanner mast|Sensor dome|Directional antenna|Beacon"],(786,771,1133,995),"sensor")
grid(["Shield generator|Shield node|Cloaking unit|Jump drive","Tractor beam|Salvage arm|Docking port|Cargo clamp"],(1165,771,1526,995))

source("modular-components-computers", "Connection sheet, also stored byte-identically as asteroids-and-mining.png. Closed and exploded versions are reference appearances; distinguish pressure doors, glass and force fields.")
for name,box,cat in [("Door tile",(28,124,155,272),"door"),("Airlock frame",(472,107,604,274),"door"),("Window tile",(894,124,1015,278),"door"),("Corridor connector",(23,350,213,511),"structure"),("Hardpoint connector",(493,348,632,511),"structure"),("Power node",(31,592,158,727),"system"),("Computer console tile",(431,592,578,725),"console"),("Utility channel",(864,590,1086,734),"pipe")]: item(name,box,cat)
for name,box,cat in [("Door upper frame",(204,94,284,154),"structure"),("Door side frames",(170,145,234,259),"structure"),("Door leaf",(223,153,284,271),"door"),("Door control panel",(294,155,324,237),"console"),("Airlock upper seal",(650,111,711,160),"structure"),("Airlock side frames",(609,155,679,266),"structure"),("Pressure door leaf",(671,150,738,269),"door"),("Window upper frame",(1029,104,1101,151),"structure"),("Window glass pane",(1058,157,1107,263),"door"),("Window support frame",(1025,159,1068,261),"structure"),("Corridor roof",(228,345,330,407),"structure"),("Corridor wall left",(232,415,281,489),"structure"),("Corridor wall right",(290,400,340,482),"structure"),("Corridor floor",(236,478,326,517),"structure"),("Hardpoint mount plate",(669,350,737,399),"structure"),("Hardpoint connector core",(665,408,723,484),"structure"),("Hardpoint locking ring",(721,389,771,458),"structure"),("Hardpoint seal",(668,469,741,509),"structure"),("Power core",(201,595,244,625),"system"),("Power housing",(181,624,257,709),"system"),("Power connector plate",(257,624,279,660),"structure"),("Console screen",(614,576,678,641),"console"),("Console core",(592,638,673,688),"system"),("Console data port",(688,616,712,680),"pipe"),("Console floor mount",(602,682,682,723),"structure")]: item(name,box,cat,kind="subassembly")
for name,box in [("Atmosphere pipe",(946,350,1079,407)),("Power conduit",(946,401,1078,455)),("Data cable",(946,452,1078,503)),("Coolant pipe",(949,490,1075,535)),("Pipe elbow",(1242,326,1316,397)),("Pipe tee",(1343,326,1425,398)),("Pipe riser",(1251,432,1283,506)),("Clamp bracket",(1338,442,1423,508))]: item(name,box,"pipe")
item("Utility layer exploded stack",(1251,588,1354,727),"pipe",kind="assembly")
row("Room to corridor join|Corridor to hull join|Module chain join",(24,840,1191,1029),"room",kind="assembly")
for i,name in enumerate(["Module snap","Hull mount","Utility pass-through","Hardpoint socket"]):item(name,(1214,790+i*57,1265,843+i*57),"structure")
item("Standard snap grid diagram",(1253,108,1324,174),"ui")
for i,name in enumerate(["Power port icon","Data port icon","Air port icon","Structural port icon"]):item(name,(1252,190+i*24,1287,216+i*24),"ui")

source("cargo-pods-ore-etc", "Containers have hero designs plus four visible variants each. Resource clusters include separately visible loose chunks. Cargo iconography and tractor/storage examples are cataloged independently.")
families=["Standard cargo crate","Reinforced cargo crate","Refrigerated pod","Vacuum pod","Salvage pod","Cargo pallet","Liquid tank","Cryo tank","Fuel barrel","Gas bundle","Chemical drum","Water container"]
for i,name in enumerate(families):
    c=i%6; y=142 if i<6 else 382; x=20+c*237
    item(name,(x,y,x+174,y+112),"cargo")
    row([name+" variant "+str(n) for n in range(1,5)],(x,y+119,x+228,y+165),"cargo",note="Distinct visible appearance; contents and rarity cannot be established from color alone.",kind="variant")
for i,name in enumerate(["Iron ore","Copper ore","Gold nugget","Rare crystal","Ice","Exotic ore"]):
    x=21+i*119
    item(name+" main cluster",(x,627,x+111,726),"resource")
    # Lower cluster samples are unevenly arranged: preserve each of four visible samples.
    grid([[name+" loose sample 1",name+" loose sample 2"],[name+" loose sample 3",name+" loose sample 4"]],(x,727,x+110,810),"resource",kind="variant")
for i,name in enumerate(["Metal ingot stack","Rare metal bars","Crystal canister","Data core container","Medical supply container","High-value tech crate"]):
    x=738+(i%3)*232;y=626 if i<3 else 773
    item(name,(x,y,x+174,y+74),"cargo")
    row([name+" variant "+str(n) for n in range(1,5)],(x,y+76,x+218,y+113),"cargo",kind="variant")
row("Tractor target lock example|Tractor transport example|Cargo rack storage example",(25,905,707,1028),"cargo",kind="assembly")
row("Raw ore icon|Cargo pods icon|Liquids icon|High-value cargo icon|Salvage icon",(742,924,1427,985),"ui")

source("planets", "Nine stylized planetary families with moons, orbital fragments, ring and cloud treatments. Apparent size is composition, not physical scale. Temperate and ocean variants are distinct despite related palettes.")
for name,box in [("Rocky world",(100,76,400,365)),("Temperate world",(539,73,880,347)),("Desert world",(1007,79,1311,343)),("Ice world",(35,394,373,677)),("Volcanic world",(515,391,829,671)),("Ringed gas giant",(854,388,1442,670)),("Ocean world",(36,701,390,984)),("Toxic world",(516,697,858,983)),("Crystal world",(1001,698,1327,992))]:item(name,box,"planet")
for name,boxes in {"Rocky moon":[(399,108,461,172),(405,263,462,324)],"Temperate moon":[(850,108,924,175),(889,209,937,260)],"Desert moon":[(1295,91,1370,167),(1335,171,1413,249)],"Ice moon":[(356,412,439,496),(392,526,441,576)],"Volcanic moon":[(812,408,888,490),(827,528,873,575)],"Gas giant moon":[(1297,389,1347,442),(1357,514,1409,563),(1292,573,1375,656)],"Ocean moon":[(381,723,455,798),(399,833,455,893)],"Toxic moon":[(837,733,906,806),(853,832,937,917)],"Crystal moon":[(1306,707,1383,786),(1351,866,1417,926)]}.items():
    for i,box in enumerate(boxes):item(name+f" {i+1}",box,"planet",kind="variant")
item("Detached crystal spire",(1326,812,1373,909),"resource")
item("Rocky orbital fragment cluster",(12,169,113,330),"environment",kind="assembly")
item("Planetary rings material study",(867,425,1429,652),"environment",note="Ring region overlaps the planet; reconstruct continuous hidden arc.",kind="context")
item("Temperate cloud shelf",(546,159,617,215),"environment",kind="component")
item("Temperate tree canopy",(626,147,699,205),"decor",kind="component")
item("Desert mesa relief",(1164,90,1267,205),"environment",kind="component")

source("characters-weapons-items", "Ten role archetypes, a base body with orthogonal rig views, four armor tiers and fifteen tools. Role icons and skill pictograms are design references; a costume grants no gameplay permissions.")
roles="Captain|Engineer|Medic|Pilot|Security officer|Heavy marine|Salvage tech|Recon scout|Scientist|Mechanic".split("|")
row(roles,(12,273,1435,504),"character")
row([n+" role icon" for n in roles],(18,174,1435,220),"ui")
skillrows=["Leadership|Systems repair|Treat injuries|Ship control|Security|Heavy firepower|Salvage|Scouting|Research|Fabrication","Diplomacy|Efficiency|Remove status|Evasion|Crowd control|Durability|Resource recovery|Intel gathering|Data analysis|Modifications","Crew morale|Upgrades|Keep crew alive|Precision|Threat detection|Frontline|Field repairs|Stealth|New technology|Resource crafting"]
for r,names in enumerate(skillrows):
    for c,name in enumerate(names.split("|")): item(name+" icon",(20+c*142,517+r*28,47+c*142,544+r*28),"ui")
item("Base crew body",(26,746,147,978),"character")
row("Rig front view|Rig side view|Rig back view",(165,774,421,959),"character",kind="state")
for r,part in enumerate(["Headwear","Chest armor","Shoulder armor","Backpack"]):
    row([tier+" "+part for tier in ["Civilian","Light","Standard","Heavy"]],(475,743+r*62,864,810+r*62),"equipment",kind="variant")
grid(["Pistol|Rifle|Shotgun|Heavy gun|Stun gun","Wrench|Welder|Multi-tool|Medkit|Sample scanner","Data pad|Drone|Grapple|Flashlight|Shield pack"],(1005,714,1429,991),"equipment")
item("Crew roster ship",(883,3,1284,159),"ship",kind="context")

source("more-character-customization", "Front/back crew and exploded attachment pieces; equipment rows; 21 heads, 24 armor pieces, 23 back/belt units, 12 effects, three example loadouts and their equipment thumbnails.")
row("Crew front|Crew back",(74,136,341,379),"character",kind="state")
for name,box in [("Exploded helmet",(480,86,544,144)),("Exploded head",(481,147,535,195)),("Exploded backpack",(533,143,578,203)),("Exploded chest",(468,198,539,251)),("Exploded left shoulder",(439,183,472,221)),("Exploded right shoulder",(546,218,574,247)),("Exploded glove",(442,219,467,253)),("Exploded left gauntlet",(443,267,478,313)),("Exploded right gauntlet",(549,246,579,287)),("Exploded belt",(480,254,536,293)),("Exploded legs",(484,284,534,334)),("Exploded left boot",(461,333,509,382)),("Exploded right boot",(510,333,556,382))]: item(name,box,"equipment",kind="subassembly")
grid(["Utility cutter|Pistol|SMG|Compact carbine|Shotgun|Beam rifle","Rail rifle|Medgun|Repair tool|Shield emitter|Scanner|Baton"],(610,128,1427,398),"equipment")
grid(["Base hair|Short hair|Medium hair|Long hair|Undercut hair|Mohawk hair|Bald head","Open helmet|Closed helmet|Tactical helmet|Hazmat helmet|Pilot helmet|Mining helmet|Security helmet","Clear visor|Tinted visor|HUD visor|Mirrored visor|AR visor|Oxygen mask|Rebreather"],(22,468,519,742),"equipment")
for r,part in enumerate(["Chest plate","Shoulder","Glove","Boot"]):row([color+" "+part for color in ["Pale","Red","Blue","Orange","Green","Charcoal"]],(607,466+r*69,946,535+r*69),"equipment",kind="variant")
for r,part in enumerate(["Backpack","Oxygen pack","Jetpack","Utility belt"]):row([part+" variant "+str(i+1) for i in range(5 if r==2 else 6)],(1057,466+r*70,1427,534+r*70),"equipment",kind="variant")
grid(["Muzzle flash|Laser bolt|Plasma bolt|Healing beam|Scan pulse|Shield bubble","Impact spark|Smoke puff|Thruster glow|Pickup glow|Repair sparks|Teleport effect"],(22,805,654,1027),"vfx")
for i,role in enumerate(["Medic","Engineer","Security"]):
    x=689+i*244;item(role+" loadout",(x+12,837,x+181,1007),"character",kind="variant")
    for r,part in enumerate(["Helmet","Chest","Backpack","Weapon","Tool"]):item(role+" loadout "+part,(x+176,813+r*33,x+221,847+r*33),"equipment",kind="variant")
    row([role+f" palette swatch {n+1}" for n in range(5)],(x+118,980,x+221,1006),"ui",kind="component")

source("character-animations-2", "Ten crew appearances, 26 customization pieces, action key poses, equipment examples, directional views and scale comparison. The printed approximately four voxels is inconsistent with visible fine voxels and human scale: use 1.8 m as a proposed character height. Frames are pose references for a shared 3D rig.")
row("Crew|Engineer|Medic|Security|Pilot|Explorer|Miner|Scientist|Cyborg|Alien",(30,120,853,272),"character")
row([f"Hair head variant {n+1}" for n in range(8)],(964,71,1289,117),"equipment",kind="variant")
row([f"Helmet variant {n+1}" for n in range(8)],(964,125,1289,176),"equipment",kind="variant")
row([f"Backpack variant {n+1}" for n in range(5)],(958,181,1296,229),"equipment",kind="variant")
row([f"Armor suit variant {n+1}" for n in range(5)],(958,237,1296,291),"equipment",kind="variant")
item("Scale astronaut",(1330,79,1445,257),"character",kind="context")
for name,box in [("Idle",(24,345,358,446)),("Walk",(393,345,686,447)),("Run",(752,345,1111,447)),("Shoot",(1130,345,1514,447)),("Aim",(28,499,382,596)),("Melee",(406,494,748,597)),("Pick up interact",(769,500,1114,597)),("Use repair",(1137,498,1513,597))]: row([name+f" key pose {i+1}" for i in range(4)],box,"animation",kind="state")
row("Wave|Point|Cheer|Thumbs up|Sit|Crouch|Hurt|Die",(25,649,693,785),"animation",kind="state")
row("Equipped explorer|Equipped medic|Equipped security|Equipped miner|Equipped scientist",(727,651,1110,778),"character",kind="variant")
row([f"Team lineup member {n+1}" for n in range(7)],(1142,649,1511,776),"character",note="Closely adjacent silhouettes; crop may retain neighboring equipment.",kind="variant")
row("Front|Front-right|Right|Back-right|Back|Back-left|Left|Front-left",(25,832,707,985),"animation",kind="state",prefix="Directional ")

source("weapons-turrets", "Eleven mounted systems shown assembled and exploded. Every separately displayed functional subassembly has a crop; pivots, mount, power and FX sockets must be authored independently of visual parts.")
layouts=[("Point defense turret",(18,125,201,290),(208,86,324,294),["Barrel assembly","Elevation and targeting unit","Rotation base","Power coupling","Hardpoint connector"],[86,138,200,245,266,294]),("Twin autocannon",(490,130,675,292),(676,81,819,293),["Targeting module","Twin barrel housing","Ammo and recoil assembly","Rotation base","Power conduit and connector"],[81,126,190,229,261,293]),("Laser cannon",(994,128,1173,293),(1168,78,1299,293),["Targeting sensor","Emitter housing","Cooling jacket and lens","Power core","Rotation base and hardpoint"],[78,113,172,214,253,293]),("Railgun mount",(14,369,218,536),(219,331,343,538),["Targeting array","Rail barrel","Power coil","Stabilizer frame","Rotation base","Hardpoint"],[331,368,416,449,487,509,538]),("Missile pod",(509,379,679,534),(690,336,816,540),["Pod cover","Missile tubes","Loading frame and controller","Power conduit","Rotation base","Hardpoint"],[336,374,414,454,485,513,540]),("Flak turret",(993,377,1153,540),(1154,331,1298,541),["Barrel cluster","Feed and ammo assembly","Elevation unit","Rotation base","Power conduit","Hardpoint"],[331,365,414,452,481,511,541]),("Sensor dish",(20,599,178,790),(178,594,262,792),["Dish array","Receiver and gimbal","Processing unit","Rotation base","Hardpoint"],[594,651,699,737,766,792]),("Shield emitter",(382,618,517,792),(516,591,609,794),["Shield cap","Field coil","Power core and vents","Support frame","Rotation base","Hardpoint"],[591,624,651,693,736,767,794]),("Tractor projector",(735,617,880,793),(880,596,973,794),["Emitter ring","Field generator and focus lens","Power core","Gimbal frame","Rotation base","Hardpoint"],[596,635,685,713,740,768,794]),("Docking clamp",(1100,634,1242,792),(1240,589,1340,794),["Locking jaws and actuator","Hydraulic unit","Control module","Rotation base","Hardpoint"],[589,660,705,742,770,794]),("Relay beacon",(39,859,144,1022),(205,831,279,1022),["Antenna mast","Communication array","Signal processor","Power core","Stabilizer frame","Hardpoint"],[831,873,914,941,970,994,1022])]
for name,hero,exploded,parts,ys in layouts:
    item(name,hero,"weapon" if name in [a[0] for a in layouts[:6]] else "sensor" if name in ["Sensor dish","Relay beacon"] else "system")
    item(name+" exploded assembly",exploded,"system",kind="assembly")
    for i,part in enumerate(parts):item(name+" - "+part,(exploded[0],ys[i],exploded[2],ys[i+1]),"weapon-part",note="Reference subassembly; align physical interface and motion pivot to the parent assembly.",kind="subassembly")
row("Hull hardpoint socket|Hardpoint adapter plate|Mounted turret example",(438,858,996,980),"structure",kind="assembly")
for i,name in enumerate(["Weapon category icon","Sensor category icon","Utility category icon","Defense category icon"]):item(name,(1104,857+i*44,1151,899+i*44),"ui")

source("more-turrents-missiles-guns", "Sixteen weapon families, four appearance variants each, exploded subparts on selected heroes, nine ammunition families with secondary variants, a payload strip, and six modular component groups. Some sheet labels are malformed: use conservative functional names.")
names=["Point defense turret","Compact laser turret","Twin autocannon","Plasma turret","Railgun mount","Flak cannon","Gauss cannon","Ion blaster","Pulse beam emitter","Missile pod","Torpedo launcher","Swarm rocket rack","Breaching charge pod","Mine layer","Bomb canister","Drone launcher"]
for i,name in enumerate(names):
    r=i//6;c=i%6;x=20+c*236;y=[150,368,581][r]
    item(name,(x,y,x+165,y+111),"weapon")
    row([name+f" variant {n+1}" for n in range(4)],(x,y+117,x+225,y+162),"weapon",kind="variant")
for name,box in [("PD barrel",(121,153,185,184)),("PD rotation piece",(137,187,173,218)),("PD power core",(125,214,177,258)),("Laser emitter",(352,152,422,182)),("Laser gimbal",(357,187,413,224)),("Laser base plate",(360,230,415,257)),("Gauss accelerator",(125,386,183,416)),("Gauss barrel",(123,418,185,462)),("Ion focus lens",(357,369,412,406)),("Ion barrel",(361,408,409,436)),("Ion power unit",(363,437,412,471)),("Torpedo loading mechanism",(1027,417,1084,464)),("Rocket fire control",(1287,413,1335,439)),("Breaching clamp",(117,603,150,646)),("Breaching arming unit",(99,654,149,694)),("Drone feed controller",(790,636,827,674))]:item(name,box,"weapon-part",kind="subassembly")
ammo=[("Interceptor",(928,610,985,704)),("Guided missile",(1027,609,1065,704)),("Guided missile compact",(1067,615,1102,703)),("Heavy torpedo",(1137,609,1180,704)),("Heavy torpedo compact",(1182,626,1215,704)),("Cluster missile",(1242,612,1283,704)),("Cluster missile compact",(1285,616,1318,704)),("EMP missile",(1339,615,1383,705)),("EMP missile orange",(1383,615,1427,705)),("Incendiary rocket",(926,741,975,814)),("Incendiary rocket white",(975,735,1020,814)),("Kinetic slug",(1045,741,1100,814)),("Kinetic slug pale",(1100,741,1143,814)),("Plasma charge violet",(1170,741,1229,814)),("Plasma charge blue",(1229,743,1275,814)),("Proximity mine red",(1290,740,1357,814)),("Proximity mine dark",(1357,738,1428,814))]
for name,box in ammo:item(name,box,"ordnance")
row([f"Payload variant {i+1}" for i in range(14)],(920,834,1429,880),"ordnance",kind="variant")
partgroups=[("Weapon mount",(20,853,156,986),["Small","Medium","Large","Fixed","Gimbal","Heavy"]),("Barrel emitter",(166,852,302,987),["Ballistic","Laser","Plasma","Gauss","Ion","Beam"]),("Missile tube",(313,853,451,986),["Single long","Single box","Twin","Quad","Hex","Pod"]),("Ammo energy",(463,853,598,986),["Ammo drum","Missile magazine","Energy cell","Fuel pod","Compact drum","Energy pack"]),("Support module",(611,851,744,987),["Cooling unit","Recoil block","Targeting pod","Control unit","Power pack","Heavy cooler"]),("Mount adapter",(754,851,891,987),["Small plate","Medium plate","Extension","Angle bracket","Heavy plate","Ring"])]
for name,box,parts in partgroups:grid([[name+" "+p for p in parts[:3]],[name+" "+p for p in parts[3:]]],box,"weapon-part",note="Grid excerpt; verify tiny silhouette against full source before modeling.",kind="subassembly")
row("Ballistic icon|Energy weapon icon|Missile icon|Utility weapon icon|Anti-fighter icon",(915,925,1427,983),"ui")

source("effects-and-weapon-firing", "Thirty-two effect families with separate color, size or temporal samples. Effects are presentation; smoke/debris and beams never determine resource consumption, damage or contacts.")
vfx_rows=[
 ([("Muzzle flash","Small|Medium|Large"),("Tracer round","Standard|Heavy|AP|Incendiary|Plasma"),("Laser bolt","Red|Blue|Green|Purple"),("Plasma bolt","Standard|Charged|Split|Corrupted"),("Beam lance","Standard|Heavy|Focused")], [15,290,587,862,1146,1434],120,193),
 ([("Ion arc","Short|Medium|Large"),("Missile trail","Standard|Heavy|Cluster|Swarm"),("Smoke trail","Light|Medium|Heavy|Burning"),("Contrail","Standard|Afterburn|Ion|Maneuver"),("Thruster glow","Idle|Cruise|Boost|Warp")],[15,280,581,872,1156,1434],272,375),
 ([("Small explosion","A|B|C|D"),("Medium explosion","A|B|C|D"),("Large explosion","A|B|C"),("Fiery blast","A|B|C|D"),("Plasma burst","A|B|C"),("EMP burst","A|B|C")],[16,234,486,733,964,1205,1434],458,535),
 ([("Shield hit splash","A|B|C"),("Shield bubble impact","A|B|C"),("Armor spark hit","A|B|C"),("Ricochet spark","A|B|C"),("Debris burst","A|B|C"),("Shrapnel cloud","A|B|C")],[17,248,480,731,959,1192,1434],603,689),
 ([("Reactor vent flare","Small|Medium|Large"),("Tractor beam","Active"),("Scanning pulse","Active"),("Repair sparks","A|B"),("Healing beam","Active"),("Pickup glow","Green|Blue|Purple|Gold")],[16,248,486,722,950,1180,1434],759,852),
 ([("Warning beacon flash","A|B|C|D"),("Teleport arrival","A|B|C"),("Warp charge","Ship charge|Portal"),("Destruction breakup","Intact|Breaking|Debris")],[16,244,473,699,1040],919,1012)]
for groups,xs,y1,y2 in vfx_rows:
    for i,(family,variants) in enumerate(groups):row([family+" "+v for v in variants.split("|")],(xs[i],y1,xs[i+1]-4,y2),"vfx",kind="state")
for name,box in [("Damage FX icon",(1054,909,1090,945)),("Energy FX icon",(1054,945,1090,979)),("Shield FX icon",(1054,982,1090,1016)),("Utility FX icon",(1241,909,1277,945)),("Environment FX icon",(1241,945,1277,979))]:item(name,box,"ui")

source("ui-elements", "General UI component sheet. Each frame, control, state, icon, notification and example composition is cataloged; typography and interaction should be recreated as native web UI, with 3D item thumbnails separately rendered.")
row("Large window frame|Medium window frame|Small window frame|Minimal window frame",(23,108,518,193),"ui")
row("Standard panel frame|Glow panel frame|Card frame|Hover panel frame",(539,110,981,193),"ui")
row("Information dialog|Success dialog|Warning dialog|Error dialog",(1007,111,1425,192),"ui")
for n,b in [("Window title bar",(25,264,290,297)),("Settings title bar",(299,264,459,297)),("Section header",(26,306,459,336)),("Breadcrumb navigation",(26,339,459,369)),("Primary tab strip",(482,263,972,296)),("Settings tab strip",(482,310,736,344)),("Fleet ship station segmented control",(744,310,972,344))]:item(n,b,"ui")
row("Overview tab|Crew tab|Modules selected tab|Research tab|Map tab",(482,263,972,296),"ui",kind="component")
row("General selected tab|Audio tab|Video tab|Controls tab",(482,310,736,344),"ui",kind="component")
row("Primary button|Secondary button|Success button|Danger button",(995,264,1425,298),"ui")
for n,b in [("Ghost settings button",(994,325,1026,361)),("Ghost add button",(1031,325,1064,361)),("Ghost delete button",(1066,325,1099,361)),("Compact settings button",(1112,321,1160,362)),("Icon diamond button",(1180,321,1213,361)),("Icon download button",(1215,321,1247,361)),("Icon grid button",(1252,321,1285,361)),("Launch button",(1302,324,1424,360)),("Text input",(28,419,153,448)),("Search input",(159,419,288,448)),("Password input",(27,458,154,488)),("Select input",(159,458,288,488)),("Combo box",(28,497,183,528))]:item(n,b,"ui")
for i,n in enumerate(["Unchecked checkbox","Checked checkbox","Disabled checkbox"]):item(n,(310,426+i*28,397,449+i*28),"ui")
for i,n in enumerate(["Radio option A","Selected radio option B","Radio option C","Disabled radio"]):item(n,(407,426+i*25,486,450+i*25),"ui")
for i,n in enumerate(["Off toggle","On toggle","Disabled toggle"]):item(n,(510,418+i*31,584,449+i*31),"ui")
for i,n in enumerate(["Wi-Fi toggle","Autosave toggle","Tutorial toggle"]):item(n,(605,432+i*33,691,465+i*33),"ui")
for n,b in [("Value slider",(716,424,851,457)),("Range slider",(716,466,840,522)),("Rotary knob",(842,429,919,530))]:item(n,b,"ui")
for i,n in enumerate(["General progress bar","Health progress bar","Shield progress bar","Energy progress bar","Experience progress bar"]):item(n,(941,411+i*24,1143,444+i*24),"ui")
row("Quantity stepper|Small quantity stepper",(1173,420,1424,452),"ui")
grid(["Gem counter|Document counter|Credit counter","Cube counter|Shield notification badge|Inventory counter"],(1173,458,1424,539),"ui")
row("Empty inventory slot|Item inventory slot|Stack inventory slot|Rare inventory slot|Equipped inventory slot|Locked inventory slot",(23,592,339,655),"ui")
row("New chip|Popular chip|Rare chip|Epic chip|Legendary chip",(356,590,598,615),"ui")
row("Weapon tag|Module tag|Resource tag|Crew tag",(356,619,598,649),"ui")
row("Online status chip|Offline status chip|Busy status chip|Mission status chip",(356,653,598,683),"ui")
row("Arrow scrollbar|Track scrollbar|Thumb scrollbar|Icon scrollbar",(622,590,744,669),"ui")
item("Horizontal scrollbar",(622,671,744,690),"ui")
for i,n in enumerate(["Module list row","Crew list row","Resource stack list row"]):item(n,(763,585+i*35,972,622+i*35),"ui")
item("Table column header",(993,581,1425,608),"ui")
for i,n in enumerate(["Online weapon table row","Offline shield table row","Online utility table row","Maintenance table row"]):item(n,(993,606+i*21,1425,629+i*21),"ui")
item("Tooltip",(24,748,190,820),"ui")
for i,n in enumerate(["Success toast","Info toast","Warning toast","Error toast"]):item(n,(216,730+i*31,399,762+i*31),"ui")
grid(["Interact key hint|Sprint key hint","Use key hint|Crouch key hint","Reload key hint|Free look key hint","Map key hint|Menu key hint"],(419,735,629,853),"ui",note="Reference binding only; preserve active project TAB view-switch and E use semantics.")
row("Loading arc|Percent spinner|Dot spinner",(680,738,876,817),"ui")
item("Loading progress strip",(682,818,884,842),"ui")
item("Pagination bar",(914,735,1138,769),"ui")
row("Previous page|Page one selected|Page two|Page three|Page four|Page five|Next page",(914,735,1138,769),"ui",kind="component")
item("Page dots",(953,774,1095,792),"ui")
row("Build step|Configure step|Deploy step|Complete step",(916,797,1138,848),"ui")
for n,b in [("Circular minimap",(1160,733,1273,851)),("Coordinate widget",(1277,737,1333,789)),("Signal icon",(1340,732,1388,773)),("Globe icon",(1390,731,1428,774)),("Ship arc gauge",(1309,790,1425,848))]:item(n,b,"ui")
row("Mission card composition|Inventory window composition|Settings composition|Ship status composition",(24,889,1428,1064),"ui",kind="assembly")
item("Mission landscape thumbnail",(30,912,340,968),"environment",kind="context")
item("Mission accept button",(207,1007,341,1047),"ui")
grid(["Crystal inventory icon|Ice cargo icon|Metal plate icon|Gold crate icon","Supply crate icon|Pale cargo icon|Hardpoint icon|Blue cargo icon","Tech crate icon|Steel crate icon|Green crate icon|Purple resource icon"],(487,931,708,1064),"inventory-icon")
row("Ship modules shortcut|Crew shortcut|Cargo shortcut|Map shortcut|Jump shortcut",(1080,1019,1427,1062),"ui")

source("ui-elements-2", "Targeting and HUD component sheet, with twelve reticles and explicit warning, contact and overlay states. Numeric examples and misleading duplicate Mining labels are retained as reference text, not binding design.")
row("Small reticle|Medium reticle|Heavy reticle|Sniper reticle|Spread reticle|Beam-focus reticle|Missile-lock reticle|Scan reticle|Mining box reticle|Green cross reticle|Repair reticle|Support reticle",(26,108,1427,179),"ui")
row("Enemy bracket|Friendly bracket|Neutral bracket|Objective bracket|Boss target bracket|Offscreen arrow|Soft lock|Hard lock|Incoming missile marker",(30,256,838,334),"ui")
row("Normal hit marker|Critical hit marker|Shield hit marker|Armor hit marker|Healing confirmation|System disable marker|Weak-point marker|Target destroyed marker",(865,256,1425,331),"ui")
row("Objective waypoint|Mission marker|Squad marker|Cargo marker|Salvage marker|Docking marker|Beacon marker|Home base marker|Distress marker|Alert marker",(26,417,652,486),"ui")
row("Circular radar|Cone scanner|Pulse scan overlay|Directional ping|Threat radius|Detection cone|Fog of war edge|Resource scan|Anomaly indicator",(681,417,1425,493),"ui")
for i,n in enumerate(["Hull HUD bar","Shield HUD bar","Power HUD bar","Heat HUD bar","Fuel HUD bar","Oxygen HUD bar"]):item(n,(26,572+i*29,279,603+i*29),"ui")
item("Cargo HUD bar",(26,755,279,786),"ui");item("XP HUD bar",(26,788,279,823),"ui")
row("Speed gauge|Throttle gauge|Ammo missile count widget",(292,572,572,689),"ui")
item("Hull integrity arc",(292,689,498,722),"ui")
row("Credits counter|Fuel cells counter|Alloys counter|Data counter",(292,752,572,821),"ui")
grid(["Low health icon|Low shield icon|Overheating icon|No ammo icon|Jammed icon","EMP icon|Disabled engine icon|Cargo full icon|Radiation icon|Toxic icon","Frozen icon|On fire icon|Hacking icon|Stealth active icon|Scan complete icon"],(590,575,952,817),"ui")
item("Target information panel",(972,573,1425,714),"ui",kind="assembly")
item("Target ship portrait",(995,604,1220,710),"ship",kind="context")
row("Target subsystem panel|Lock progress panel|Intercept vector panel",(972,715,1425,828),"ui")
row("Dogfight HUD composition|Target-lock HUD composition|Navigation HUD composition",(24,878,952,1050),"ui",kind="assembly")
grid(["Shield ring|Selection circle|Area of effect|Danger zone","Tractor target overlay|Hacking hemisphere overlay|Repair overlay|Healing pulse overlay"],(975,879,1425,1050),"ui")

source("ui-elements-3", "Inventory and loot screen. Catalog includes visible item icons, open salvage chest, tooltip, tabs, transfer controls and HUD. Occluded inventory cells behind the tooltip are not invented. Screen values remain mock data.")
item("Inventory loot full composition",(16,84,1654,786),"ui",kind="assembly")
row("Map tab|Ship tab|Inventory tab|Crafting tab|Skills tab|Missions tab|Database tab",(518,21,1146,66),"ui")
row("All items category|Weapons category|Modules category|Resources category|Consumables category|Components category|Quest category",(79,150,833,195),"ui")
item("Inventory weight header",(637,102,890,140),"ui")
item("Inventory search",(35,208,272,246),"ui");item("Rarity sort selector",(340,208,455,245),"ui")
row("Grid view toggle|List view toggle",(486,207,567,246),"ui")
grid(["Medkit|Purple crystal|Iron ore|Gold crate|Pulse rifle|Blue canister|Circuit board|Pale container","Power coupling|Blue crystal|Red salvage crate|Pistol|Long pistol|Power node|Gray container|Orange battery","Cargo module|Blue cell|Reactor core|Small tech crate|Fuel can|Metal plate|Cable coil|Purple crystal stack","Dark power cube|Microprocessor|Small hardpoint|Green crate|Engine cartridge|Red crystals|Data crate|Metal plates"],(34,256,576,608),"inventory-icon")
row([f"Empty slot {i+1}" for i in range(8)],(35,610,578,696),"ui")
item("Pulse cannon tooltip",(584,210,947,659),"ui",kind="assembly")
item("HX-7 pulse cannon",(599,238,691,323),"equipment")
item("Legendary rarity badge",(853,234,936,264),"ui")
for i,n in enumerate(["Tooltip damage bar","Tooltip fire-rate bar","Tooltip range bar","Tooltip energy bar","Tooltip crit bar"]):item(n,(603,339+i*26,931,366+i*26),"ui")
item("Shield penetration affix",(605,473,933,507),"ui");item("Stabilized rounds affix",(605,504,933,535),"ui")
item("Tooltip mass and price",(604,575,812,610),"ui");item("Tooltip compare hint",(829,622,934,653),"ui")
item("Open salvage chest",(1128,160,1468,431),"cargo",note="Open lid, luminous contents and hinge; back face and true internal depth are inferred.")
row("Loot pulse cannon|Quantum core|Shield array|Titanium ingots|Engine schematic",(969,514,1636,625),"inventory-icon")
row("Open crate button|Open ten button|Take all button",(954,659,1639,717),"ui")
row("Transfer inventory button|Transfer cargo button|Dismantle button",(1118,732,1633,769),"ui")
row("Wallet footer|Cargo capacity footer|Inventory mass footer",(37,713,890,779),"ui")
item("Character HUD card",(22,802,300,920),"ui");item("Character HUD portrait",(31,810,101,918),"character",kind="context")
item("Survival HUD panel",(300,810,530,920),"ui")
row("Hotbar pulse cannon|Hotbar pistol|Hotbar supply case|Hotbar medkit|Hotbar energy cell|Hotbar drone|Hotbar power coil|Hotbar core|Hotbar crystals",(538,832,1307,919),"inventory-icon")
item("Radar HUD",(1313,790,1458,920),"ui");item("Radar coordinates legend",(1456,799,1639,901),"ui")
item("Unopened loot badge",(1510,109,1638,139),"ui")

source("ui-elements-4", "Vendor screen with 16 merchandise cards, 20 inventory icons, item comparison, reputation and transaction controls. The realistic portrait is stylistically inconsistent with voxel crew and is a portrait-layout reference only.")
row("Map navigation|Inventory navigation|Ship navigation|Trading navigation|Missions navigation|Star chart navigation|Codex navigation",(447,13,1223,70),"ui")
item("Station kiosk banner",(15,81,1127,226),"ui",kind="assembly")
item("Trading kiosk environment",(250,87,841,224),"environment",kind="context")
item("Vendor H-7 portrait",(975,79,1118,226),"character",note="Realistic armor reference; translate to chunky shared crew proportions rather than changing the character style.")
item("Player trading identity",(1143,84,1354,148),"ui");item("Wallet balance",(1364,85,1650,139),"ui")
item("Faction reputation widget",(1145,154,1486,221),"ui");item("Allied rank badge",(1491,153,1574,224),"ui")
row("Buy tab|Sell tab|Barter tab",(29,247,415,287),"ui")
item("Restock timer",(434,247,549,287),"ui");item("Vendor category selector",(557,247,721,287),"ui")
row("All goods category|Weapons goods category|Ship parts category|Resources goods category|Cargo goods category|Medical goods category|Upgrades goods category",(29,297,678,359),"ui")
item("Vendor filter button",(682,297,722,339),"ui")
grid(["S-76 laser cannon|Ion missile rack|Plasma repeater|Deflector shield","FTL drive MK II|Reactor core|Titanium ingots|Rare elements","Standard cargo crate|Premium cargo crate|Medkit|Crew medbay kit","Armor plating|Engine tuning kit|Weapon overclock|Shield booster"],(29,372,721,888),"inventory-icon")
item("Laser cannon large preview",(798,337,1135,460),"weapon")
item("Item details panel",(750,270,1206,646),"ui",kind="assembly")
item("Autocannon comparison preview",(786,706,918,773),"weapon")
item("Comparison stats panel",(936,675,1196,781),"ui")
item("Price label",(763,799,1007,840),"ui");item("Purchase quantity stepper",(1062,804,1208,840),"ui")
row("Buy purchase button|Add to cart button|Compare button",(756,845,1207,892),"ui")
grid(["Vendor inventory violet crystal|Vendor inventory ice crate|Vendor inventory plate|Vendor inventory gold crate|Vendor inventory bracket","Vendor inventory reinforced crate|Vendor inventory gray pod|Vendor inventory mount|Vendor inventory blue module|Vendor inventory green crate","Vendor inventory medkit|Vendor inventory cylinder|Vendor inventory purple bar|Vendor inventory red cell|Vendor inventory blue cell","Vendor inventory ore|Vendor inventory blue crystal|Vendor inventory purple crystal stack|Vendor inventory chip|Vendor inventory coil"],(1244,306,1642,579),"inventory-icon")
row("Inventory category selector|Inventory price sort",(1241,266,1645,297),"ui")
item("Quick sell toggle",(1240,641,1429,666),"ui");item("Inventory help button",(1618,644,1643,666),"ui")
item("Transaction summary",(1240,677,1646,812),"ui",kind="assembly")
for i,n in enumerate(["Weapon transaction row","Medkit transaction row","Titanium transaction row"]):item(n,(1242,710+i*34,1642,745+i*34),"ui")
item("Clear cart button",(1585,681,1648,708),"ui");item("Confirm purchase button",(1242,847,1643,896),"ui")

source("ui-elements-5", "Character paper doll and stats screen. Equipment thumbnails, attribute and resistance icons, perk controls, inventory and hotbar are separate records. Large realistic detailed armor is translated to the established chunky crew proportions.")
row("Map tab|Journal tab|Character tab|Inventory tab|Ship tab|Crafting tab|Missions tab|Database tab",(432,13,1250,62),"ui")
item("Crew portrait",(32,113,174,250),"character",kind="context")
item("Crew identity and level",(176,108,547,250),"ui");item("Faction identity panel",(31,261,323,382),"ui")
item("Character paper doll",(718,129,904,578),"character",note="Hero illustration exceeds current rig detail; preserve proportions deliberately during recreation.")
for n,b in [("Explorer helmet slot",(570,129,716,208)),("Pathfinder shoulders slot",(570,211,716,285)),("AR-7 primary weapon slot",(570,301,716,409)),("Tech gloves slot",(570,416,716,491)),("Explorer greaves slot",(570,498,716,580)),("Recon visor slot",(909,129,1041,200)),("Orion chest plate slot",(909,205,1041,280)),("Expedition backpack slot",(909,288,1041,364)),("K-11 sidearm slot",(909,371,1041,444)),("Utility belt slot",(909,447,1041,509)),("Jet boots slot",(909,511,1041,580))]:item(n,b,"ui")
for n,b in [("Explorer helmet",(647,140,706,195)),("Pathfinder shoulder pads",(648,225,703,272)),("AR-7 explorer rifle",(589,330,705,388)),("Tech gauntlet",(650,428,703,484)),("Explorer greaves",(646,507,704,571)),("Recon visor",(919,143,973,190)),("Orion chest plate",(919,215,973,271)),("Expedition pack",(920,298,973,355)),("K-11 sidearm",(916,382,986,432)),("Utility belt",(918,455,974,500)),("Jet boots",(918,518,980,571))]:item(n,b,"equipment")
for i,n in enumerate(["Strength","Agility","Intellect","Endurance","Technology"]):item(n+" attribute row",(332,282+i*35,535,316+i*35),"ui")
for i,n in enumerate(["Health","Shield","Energy","Stamina"]):item(n+" core status",(35,410+i*32,316,443+i*32),"ui")
row("Overview stats tab|Combat stats tab|Exploration stats tab|Crafting stats tab|Resistances stats tab",(1065,104,1647,136),"ui")
statrows=[["Health","Shield","Energy","Stamina","Health regeneration","Shield regeneration","Energy regeneration"],["Weapon damage","Critical chance","Critical damage","Ability power","Fire rate","Weapon range","Armor penetration"],["Mining yield","Repair speed","Hacking speed","Move speed","Boost speed","Cargo capacity","Scan range"]]
for c,names in enumerate(statrows):
    for r,n in enumerate(names):item(n+" stat row",(1068+c*194,168+r*36,1247+c*194,204+r*36),"ui")
row("Kinetic resistance|Thermal resistance|Energy resistance|Radiation resistance|EMP resistance|Corrosion resistance",(1067,459,1646,552),"ui")
grid(["Explorer instinct perk|Salvage expertise perk","Efficient systems perk|Adaptive shielding perk","Field engineer perk|Pathfinder perk"],(30,643,555,816),"ui")
item("View skill tree button",(427,609,548,638),"ui")
item("Equipment set bonus panel",(575,599,847,821),"ui",kind="assembly")
row("All items tab|Weapons tab|Armor tab|Consumables tab|Resources tab|Quest tab",(868,625,1462,656),"ui")
grid(["Purple beam weapon|Purple rifle|Gold rail rifle|Green gun|Helmet icon|Armor icon|Backpack icon|Orange crate icon|Broken frame icon|Cross brace icon|Crystal stack icon|Red canister icon","Medkit stack icon|Blue cell icon|Orange cell icon|Green orb icon|Power capsule icon|Purple orb icon|Triangular relic icon|Datapad icon|Blue case icon|Gold crate stack icon|Empty inventory one|Empty inventory two"],(868,662,1648,799),"inventory-icon")
row("Dash action|Missile action|Shield action|Drone action|Heal action|Warp action|Empty action one|Empty action two",(465,855,1058,920),"ui")
row("Canister quickslot|Green orb quickslot",(1084,855,1216,920),"inventory-icon")
item("Sector time footer",(17,876,393,921),"ui")

source("ui-elements-6", "Ship console with a modular frigate preview and overlays. Printed 128 x 32 x 28 m and 128000 kg are concept claims; thrust is even labeled in acceleration units. Treat every number as unvalidated, and retain separate physical and visual-scale proposals.")
row("Ship tab|Overview tab|Bridge tab|Engineering tab|Weapons tab|Cargo tab|Crew tab|Systems tab",(367,35,1308,75),"ui")
item("Ship identity panel",(18,86,344,433),"ui",kind="assembly")
item("Ship portrait",(27,119,334,219),"ship",kind="context")
item("Exploration frigate preview",(374,231,1245,468),"ship")
row("Exterior mode|Systems mode|Hardpoints mode|Interior mode",(573,94,940,126),"ui")
row("3D mode|X-ray mode|Blueprint mode",(1060,94,1250,125),"ui")
for n,b in [("Engine module callout",(400,187,552,229)),("Reactor module callout",(603,171,754,212)),("Cargo module callout",(795,175,945,215)),("Sensor module callout",(1034,175,1189,215)),("Crew module callout",(426,462,579,506)),("Science module callout",(609,467,761,513)),("Hydroponics module callout",(761,468,914,513)),("Bridge module callout",(1088,482,1249,524))]:item(n,b,"ui")
for i,n in enumerate(["Hull","Shield","Reactor","Engines","Sensors","Oxygen","Cargo"]):item(n+" subsystem bar",(27,469+i*25,334,495+i*25),"ui")
grid(["Command crew count|Security crew count","Engineering crew count|Medical crew count","Science crew count|Support crew count"],(27,690,334,794),"ui")
item("Manage crew button",(27,804,335,850),"ui")
item("Hardpoint plan",(483,588,917,748),"ui")
for i,n in enumerate(["Turret hardpoint legend","Missile hardpoint legend","Medium hardpoint legend","Small hardpoint legend"]):item(n,(365,613+i*29,487,641+i*29),"ui")
item("Ship tactical radar",(950,588,1149,752),"ui")
for i,n in enumerate(["Player radar marker","Ally radar marker","Enemy radar marker","Object radar marker","Station radar marker"]):item(n,(1165,593+i*26,1243,621+i*26),"ui")
row("Cargo resources icon|Cargo raw materials icon|Cargo consumables icon|Cargo equipment icon|Cargo artifacts icon",(372,798,809,866),"inventory-icon")
row("Repair kit consumable|Shield cell consumable|Fuel cell consumable|Medkit consumable|Oxygen tank consumable",(835,791,1247,834),"inventory-icon")
item("Manage cargo button",(834,838,1245,870),"ui")
stats="Mass|Dimensions|Maximum thrust|Turn rate|Top speed|Power output|Heat capacity|Jump range|Scan range|Weapon slots|Drone slots|Cargo capacity|Armor rating".split("|")
for i,n in enumerate(stats):item(n+" ship stat",(1280,112+i*20,1644,133+i*20),"ui")
for i,n in enumerate(["Command bridge","Fusion reactor","Deflector shield array","Medical bay","Expanded cargo bay","Hydroponics module","Quad turret mount","Missile rack","Long-range sensor dish"]):item(n+" installed row",(1280,438+i*23,1644,461+i*23),"ui")
item("Reactor load dial",(1524,711,1644,839),"ui")
for i,n in enumerate(["Weapons","Shields","Engines","Systems","Life support"]):item(n+" power allocation",(1280,712+i*26,1519,740+i*26),"ui")
row("View blueprint button|Refit ship button|Repair ship button",(501,882,1171,917),"ui")
item("Launch ship button",(1244,880,1650,917),"ui")

source("modular-spaceship-design", "Exploded layer stack, room, engine, corridor, bridge and expansion examples, with fifteen bottom-row reusable tile illustrations. Preserve assembled geometry and meaningful parts; no separate simulation entity per decorative brick.")
for n,b,c in [("Layer stack roof",(181,111,477,249),"structure"),("Layer stack exterior wall ring",(178,218,481,366),"structure"),("Layer stack interior walls",(188,335,471,464),"structure"),("Layer stack floor",(189,430,479,539),"structure"),("Layer stack utilities",(184,502,478,636),"pipe"),("Layer stack base",(177,610,483,755),"structure"),("Crew room pod exploded",(517,82,760,425),"room"),("Crew room roof",(533,86,746,175),"structure"),("Crew room bed",(566,209,666,279),"furniture"),("Crew room floor",(526,254,751,331),"structure"),("Crew room utility layer",(526,304,754,373),"pipe"),("Crew room base",(522,350,753,422),"structure"),("Engine exploded assembly",(947,77,1154,407),"engine"),("Engine cap",(947,83,1146,198),"engine"),("Engine reactor core",(953,154,1140,259),"system"),("Engine conduit layer",(954,232,1139,313),"pipe"),("Engine housing and nozzle",(951,292,1149,408),"engine"),("Corridor exploded assembly",(1294,82,1492,425),"room"),("Corridor roof",(1298,92,1475,166),"structure"),("Corridor wall set",(1295,148,1493,270),"structure"),("Corridor pipes",(1305,219,1459,270),"pipe"),("Corridor floor",(1300,244,1476,319),"structure"),("Corridor utilities",(1302,292,1471,365),"pipe"),("Corridor base",(1301,347,1476,427),"structure"),("Bridge exploded assembly",(518,492,782,780),"room"),("Bridge roof",(534,493,750,554),"structure"),("Bridge control chairs",(563,576,671,654),"furniture"),("Bridge deck",(526,627,752,697),"structure"),("Bridge utility layer",(526,659,752,733),"pipe"),("Bridge hull base",(527,708,755,772),"structure"),("Bridge cockpit window",(693,714,785,778),"door"),("Expandable closed hull",(952,500,1352,703),"ship"),("Expansion engine",(1341,458,1497,555),"engine"),("Expansion corridor",(1375,564,1566,663),"room"),("Expansion room pod",(1274,642,1441,757),"room")]:item(n,b,c,kind="assembly" if "assembly" in n or "set" in n else "object")
row("Hull tile|Floor tile|Wall tile|Corner tile|Door tile|Window tile|Decor tile|Console tile|Bed tile|Storage tile|Pipe tile|Power node|Airlock tile|Engine nozzle|Hardpoint connector",(191,801,1501,909),"structure")
item("Voxel layer grid icon",(24,715,98,776),"ui");item("Three-axis snap diagram",(1533,802,1639,890),"ui")
for n,b in [("Crew wall screen",(643,167,675,217)),("Crew room plant",(583,171,621,218)),("Crew bedside chest",(651,239,697,285)),("Crew door panel",(685,178,728,261))]:item(n,b,"furniture",kind="component")

source("modular-spaceship-design-2", "Eight furnished tile studies with exploded furniture and machine components, room assembly, snap system and decor variants. Individual movable objects remain separately identifiable, even inside room presets.")
for n,b,c in [("Crew bed tile",(27,104,269,302),"room"),("Storage crate tile",(384,111,630,314),"room"),("Medbay tile",(734,103,976,314),"room"),("Hydroponics tile",(1082,102,1346,315),"room"),("Lounge tile",(23,453,283,661),"room"),("Table tile",(380,474,570,640),"furniture"),("Reactor module",(678,463,928,651),"system"),("Wall console decor tile",(1059,461,1311,640),"structure"),("Crew room assembled",(23,824,368,1044),"room"),("Crew room exploded",(371,793,645,1037),"room"),("Corner floor snap example",(825,825,992,1027),"structure")]:item(n,b,c,kind="assembly" if c=="room" else "object")
for n,b,c in [("Bed mattress",(27,339,105,384),"furniture"),("Bed frame drawer",(119,300,212,378),"furniture"),("Bed floor mount",(81,372,140,401),"structure"),("Blue blanket panel",(172,354,252,402),"furniture"),("Personal screen",(219,300,255,358),"console"),("Bed wall light",(279,299,313,366),"decor"),("Bed wall panel",(317,319,354,369),"structure"),("Bed storage drawer",(288,367,327,402),"furniture"),("Storage large crate",(472,117,571,248),"cargo"),("Storage medium crate",(386,162,485,273),"cargo"),("Storage small crate",(499,213,579,284),"cargo"),("Storage pale loose crate",(397,337,454,397),"cargo"),("Storage orange loose crate",(514,310,548,349),"cargo"),("Storage large gold loose crate",(598,299,642,347),"cargo"),("Storage blue loose crate",(647,311,698,364),"cargo"),("Storage red loose crate",(454,363,490,403),"cargo"),("Storage narrow blue crate",(486,345,512,385),"cargo"),("Storage tiny magenta crate",(515,378,541,403),"cargo"),("Storage red canister",(647,359,680,401),"cargo"),("Storage floor marking tile",(526,341,632,402),"structure"),("Medical wall tool stand",(740,335,780,397),"furniture"),("Medical IV stand",(780,333,809,399),"furniture"),("Medical bed headrest",(810,336,857,373),"furniture"),("Medical supply case",(820,369,865,405),"cargo"),("Medical bed module",(850,317,960,403),"furniture"),("Medical monitor",(916,306,963,353),"console"),("Medical IV pole",(969,316,998,397),"furniture"),("Medical marker panel",(992,302,1046,356),"decor"),("Medical cabinet",(997,354,1047,402),"furniture"),("Hydro wall panel",(1087,335,1117,394),"structure"),("Hydro potted specimen",(1112,334,1162,400),"decor"),("Hydro large tray",(1162,332,1229,402),"furniture"),("Hydro small tray",(1230,344,1293,402),"furniture"),("Hydro grow light",(1217,298,1279,342),"decor"),("Hydro control screen",(1287,323,1321,364),"console"),("Hydro wall control",(1325,302,1368,361),"console"),("Hydro water unit",(1318,364,1378,401),"system"),("Hydro water pipes",(1364,352,1422,408),"pipe"),("Hydro tall controller",(1390,313,1426,371),"console"),("Lounge plant",(21,674,61,744),"decor"),("Lounge straight sofa",(60,669,128,716),"furniture"),("Lounge corner sofa",(137,665,202,719),"furniture"),("Lounge floor tile",(73,711,167,759),"structure"),("Lounge mug",(208,660,233,690),"decor"),("Lounge snack shelf",(244,660,302,704),"furniture"),("Lounge wall slab",(314,656,351,706),"structure"),("Lounge coffee table",(207,691,279,757),"furniture"),("Lounge side table",(275,705,341,757),"furniture"),("Dining chair one",(378,669,431,742),"furniture"),("Dining table with plant",(443,650,548,758),"furniture"),("Dining table plain",(538,640,624,731),"furniture"),("Dining chair two",(598,677,651,745),"furniture"),("Dining potted plant",(521,712,558,760),"decor"),("Reactor front ring",(673,676,734,754),"system"),("Reactor front shroud",(736,673,803,751),"system"),("Reactor luminous core",(794,650,878,738),"system"),("Reactor rear shroud",(871,638,981,723),"system"),("Reactor coolant line",(846,720,930,760),"pipe"),("Reactor control box",(925,711,984,759),"console"),("Reactor rear connector",(980,699,1028,758),"pipe"),("Reactor small screen",(989,652,1025,697),"console"),("Reactor straight conduit",(792,641,887,666),"pipe"),("Reactor mounting clamp",(795,740,826,762),"structure")]:item(n,b,c,kind="subassembly")
for n,b in [("Green status console",(1060,655,1120,713)),("Blue map screen",(1129,655,1185,713)),("Crew slogan poster",(1192,655,1254,750)),("Planet insignia poster",(1261,655,1320,712)),("Door control strip",(1327,655,1376,715)),("Wall grille",(1380,655,1429,710)),("Utility wall variant one",(1060,718,1120,759)),("Utility wall variant two",(1128,718,1186,759)),("Utility wall variant three",(1259,714,1320,759)),("Medical wall variant",(1329,714,1377,759)),("Wall pipe cluster",(1381,704,1431,759))]:item(n,b,"decor",kind="variant")
item("Universal socket pair",(1015,833,1132,913),"structure");item("Universal small node",(1104,910,1155,959),"structure")
row("Aligned frame cube|Aligned solid cube",(1018,960,1153,1017),"structure")
for i,n in enumerate(["Comfort icon","Storage icon","Medical icon","Hydroponics icon","Engineering icon","Decor icon"]):item(n,(1200,806+i*40,1248,846+i*40),"ui")

source("exploded-spaceship-view", "Full inhabited modular ship exploded into shell, engine bank, rooms, corridors and bridge. Bottom strip includes independent building blocks. Crops of furnished rooms also retain contextual overlapping parts.")
for n,b,c in [("Upper hull shell",(445,17,1399,256),"structure"),("Engine bank",(63,163,365,454),"engine"),("Engineering room",(337,177,658,389),"room"),("Hydroponics room",(665,218,921,387),"room"),("Medbay room",(916,245,1150,424),"room"),("Bridge cockpit",(1216,266,1554,471),"room"),("Crew quarters",(304,365,589,558),"room"),("Lounge room",(585,423,890,624),"room"),("Storage room",(862,472,1124,676),"room"),("Docking airlock room",(1231,458,1494,677),"room"),("Lower hull shell",(260,508,1289,784),"structure"),("Scale captain",(131,584,197,703),"character")]:item(n,b,c,kind="assembly" if c in ["room","structure"] else "object")
for i,b in enumerate([(587,330,679,397),(691,351,881,448),(886,390,1068,489),(1094,428,1231,540),(1120,565,1209,644),(1162,328,1215,398)]):item(f"Corridor connector {i+1}",b,"structure")
row("Engine module miniature|Room pod miniature|Bridge miniature|Corridor miniature|Hull section miniature",(24,800,460,884),"room",kind="context")
row("Utility mast miniature|Utility pedestal miniature|Sensor dish miniature",(459,801,550,883),"system",kind="context")
row("Hull tile|Floor tile|Wall segment|Corner piece|Door|Window|Pipe conduit",(577,799,1105,892),"structure")
item("Snap grid schematic",(1138,808,1212,889),"ui");item("Custom assembled ship",(1343,780,1544,896),"ship")

source("faction-ship-1", "Human Federation explorer: hero frigate, exploded modules, six room closeups, core blocks, connectors and scale drawing. Printed 128 m dimensions disagree with miniature interior cues; preserve the claim separately from proposed modeling scale.")
item("Human exploration frigate",(345,24,1506,300),"ship")
for n,b,c in [("Exploded engine bank",(39,314,245,498),"engine"),("Exploded crew room",(233,375,375,471),"room"),("Exploded science lab",(369,393,507,495),"room"),("Exploded hydroponics habitat",(501,414,653,516),"room"),("Exploded medbay",(645,437,771,539),"room"),("Exploded cargo room",(767,454,899,557),"room"),("Exploded bridge nose",(895,418,1154,590),"room"),("Captain scale figure",(30,626,94,734),"character")]:item(n,b,c)
for i,b in enumerate([(253,307,378,359),(389,331,502,380),(515,336,652,395),(652,345,759,408),(755,366,912,432)]):item(f"Roof module {i+1}",b,"structure")
for i,b in enumerate([(199,479,245,533),(244,481,372,560),(365,508,497,577),(505,533,635,602),(641,555,742,611),(755,575,904,645),(909,582,962,652)]):item(f"Corridor module {i+1}",b,"structure")
grid(["Bridge closeup|Crew quarters closeup","Science lab closeup|Medbay closeup","Cargo bay closeup|Engine block closeup"],(1193,339,1649,780),"room",kind="context")
row("Hull tile|Floor tile|Wall tile|Window tile|Corridor|Door|Utility tile|Hardpoint|Pipe conduit|Roof cap",(21,826,852,911),"structure")
row("Standard connector|Airlock connector|Utility bus|Reinforced joint",(884,826,1286,911),"structure")
item("Ship side scale drawing",(544,684,864,779),"ui");item("Ship end scale drawing",(912,684,1041,779),"ui")

source("faction-ship-2", "Helix Mining Consortium industrial ship with orange panels, gray braces, engine bank, refinery, ore crusher, cargo pod, tractor and articulated drill. Helix mining is source lore, not the current Helix Research theme ID.")
item("Prospector mining ship",(55,27,1457,389),"ship")
for n,b,c in [("Engine pod bank",(45,465,341,705),"engine"),("Refinery pod",(350,462,562,587),"system"),("Ore crusher module",(560,466,705,586),"system"),("Cargo hold module",(714,460,950,587),"cargo"),("Operations cockpit",(983,477,1222,589),"room"),("Tractor beam bay",(409,587,626,713),"system"),("Drilling assembly",(706,589,1249,715),"system"),("Refinery open module",(1275,428,1449,560),"system"),("Ore crusher open module",(1464,429,1648,552),"system"),("Cargo module closeup",(1278,572,1449,716),"cargo")]:item(n,b,c)
row("Standard drill head|Wide-bore drill head|Precision drill head",(1473,604,1647,703),"system")
item("Cargo connector ring",(941,482,980,570),"structure");item("Drill connector ring",(663,603,698,661),"structure")
row("Small cargo pod|Large cargo pod|Ore bin|Refined material container|Fuel tank|Utility corridor|Armor block|Hull section|Docking frame|Small hardpoint|Large hardpoint|Mining arm joint|Exterior pipe|Sensor mast|Antenna sensor|Industrial decorative kit",(17,777,1359,890),"system")
item("Mining snap grid diagram",(1388,786,1471,875),"ui")
item("Mining asteroid upper",(1096,12,1223,124),"environment");item("Mining asteroid right",(1534,119,1669,317),"environment")

source("alien-ship-1", "Aurelian Synod crystalline crescent vessel, five interior families and sixteen independent alien building pieces. Curved interfaces must adapt explicitly to project placement rules; arbitrary rotation and hex-grid claims are unimplemented.")
item("Aurelian prism explorer",(14,106,742,548),"ship")
for n,b,c in [("Alien energy wing",(794,204,947,442),"structure"),("Crystal reactor pod",(1040,203,1198,314),"system"),("Bio lab room",(1132,139,1269,242),"room"),("Stasis chamber bank",(1307,194,1435,272),"system"),("Drone hatchery room",(1013,315,1194,428),"room"),("Synod bridge room",(1191,342,1388,462),"room"),("Psionic crystal dome",(1210,237,1397,356),"system"),("Upper left wing segment",(1040,83,1177,190),"structure"),("Upper right wing segment",(1403,150,1569,279),"structure"),("Lower right wing segment",(1415,274,1631,531),"structure")]:item(n,b,c)
for i,b in enumerate([(980,171,1045,259),(967,278,1035,350),(1386,288,1432,350),(1388,421,1450,499)]):item(f"Alien connector module {i+1}",b,"structure")
row("Crystal reactor interior|Bio lab interior|Synod bridge interior|Stasis chamber interior|Drone hatchery interior",(17,587,1215,759),"room",kind="context")
for n,b in [("Curved connector frame",(1256,598,1401,764)),("Alien standard connector",(1413,578,1517,669)),("Alien open block",(1524,563,1663,679)),("Alien small connector",(1390,679,1502,761))]:item(n,b,"structure")
row("Curved hull tile|Spire hull|Crystal node|Energy conduit|Organic hull|Floor tile|Curved wall|Archway|Hex connector|Ceiling dome|Life pod|Psionic console|Plant vat|Drone bay|Wing connector|Wing tip",(17,800,1414,901),"structure")
item("Alien snap grid diagram",(1434,808,1519,895),"ui")
item("Aurelian crystal insignia",(18,6,133,97),"ui")

source("alien-ship-2", "Despite filename this is Riftjack Marauders, a salvaged human raider design. Asymmetry, spikes, chains, patch plates and exposed orange conduit distinguish it. It is not a second alien species.")
item("Riftjack marauder ship",(30,138,838,607),"ship")
for n,b,c in [("Raider engine boosters",(817,120,1090,279),"engine"),("Salvaged shield emitter",(1140,72,1253,163),"system"),("Raider weapon pod",(1397,67,1568,194),"weapon"),("Raider crew bunks room",(894,302,1078,439),"room"),("Stolen cargo hold",(1072,309,1329,473),"room"),("Raider bridge",(1335,291,1645,498),"room"),("Raider hull chain",(815,399,1236,601),"structure"),("Boarding module",(1274,457,1513,602),"room"),("Raider bridge roof turret",(1450,250,1532,328),"weapon"),("Detached raider roof",(1243,163,1407,231),"structure"),("Detached raider side panel",(1304,218,1404,303),"structure"),("Detached corridor frame",(1048,211,1102,285),"structure"),("Raider scale crew",(740,642,822,754),"character")]:item(n,b,c)
row("Salvaged armor closeup|Exposed conduit closeup|Spike detail closeup",(19,639,683,750),"structure",kind="context")
row("Scrap hull|Spiked hull|Reinforced corner|Jury-rig panel|Exposed frame|Chain module|Patch plate",(960,641,1658,768),"structure")
row("Weapon pod miniature|Engine miniature|Shield emitter miniature|Crew bunks miniature|Cargo hold miniature|Bridge miniature|Boarding module miniature",(18,806,751,903),"system",kind="context")
row("Spike ram|Chain launcher|Scrap cannon|Boarding pod|Salvage drone|Jammer array",(789,806,1422,903),"system")
item("Riftjack skull insignia",(29,9,153,146),"ui")

source("fully-complete-constructed-space-ship", "Inhabited cutaway assembly with six rooms, bridge, airlock, crew, furniture, machinery, signs and surrounding space. Scene crops document visible objects; occluded geometry must be reconstructed as a hypothesis.")
item("Inhabited cutaway ship",(34,11,1667,866),"ship",kind="assembly")
scene_items=[("Engineering reactor",(299,126,555,328),"system"),("Engineering console",(466,213,512,310),"console"),("Engineering wall screen",(491,126,541,210),"console"),("Engineering tool panel",(544,141,608,233),"decor"),("Hydroponic tiered trays",(649,165,833,314),"furniture"),("Hydroponics terminal",(815,222,864,309),"console"),("Hydroponics door",(831,159,907,275),"door"),("Medical bed",(957,278,1051,369),"furniture"),("Medical equipment cart",(1084,291,1152,369),"furniture"),("Medical wall supply locker",(931,254,972,349),"furniture"),("Medical cross sign",(1073,259,1125,300),"decor"),("Medical diagnostic monitor",(995,260,1052,286),"console"),("Medical IV equipment",(1106,255,1149,308),"furniture"),("Bridge control chair",(1281,378,1337,439),"furniture"),("Bridge console horseshoe",(1213,339,1432,449),"console"),("Bridge plant",(1208,311,1248,371),"decor"),("Bridge canopy",(1452,319,1663,496),"door"),("Crew bunk beds",(277,322,413,470),"furniture"),("Crew dining table",(357,439,464,522),"furniture"),("Crew wall desk",(404,396,483,447),"furniture"),("Crew rug",(344,424,462,489),"decor"),("Crew poster left",(419,348,459,396),"decor"),("Crew poster right",(464,351,508,417),"decor"),("Lounge red sectional",(620,452,787,548),"furniture"),("Lounge coffee table",(661,514,760,583),"furniture"),("Lounge tall plant",(601,416,661,482),"decor"),("Lounge floor plant",(592,473,638,526),"decor"),("Lounge table plant",(691,500,717,541),"decor"),("Lounge table bottle left",(679,500,700,537),"decor"),("Lounge table bottle right",(711,519,737,557),"decor"),("Lounge vending machine",(838,479,883,536),"furniture"),("Lounge arcade machine",(813,518,865,603),"furniture"),("Lounge crew poster",(780,430,838,513),"decor"),("Storage orange rear crate",(924,489,975,543),"cargo"),("Storage gold stack",(969,519,1027,582),"cargo"),("Storage yellow rear crate",(1042,547,1092,600),"cargo"),("Storage red case",(1090,540,1136,590),"cargo"),("Storage pale stack",(903,539,955,613),"cargo"),("Storage gold front crate",(930,598,985,649),"cargo"),("Storage yellow front crate",(876,588,932,637),"cargo"),("Storage blue front case",(997,615,1047,672),"cargo"),("Storage purple case",(1049,610,1108,669),"cargo"),("Storage dark case",(1074,652,1123,701),"cargo"),("Airlock pressure door",(1201,522,1307,648),"door"),("Airlock service device",(1331,568,1370,640),"system"),("Airlock hazard ramp",(1192,626,1402,721),"structure"),("Captain walking crew",(731,315,775,386),"character"),("Airlock crew",(1175,438,1204,497),"character"),("Roof sensor dish",(457,9,527,96),"sensor"),("Roof turret",(677,72,735,128),"weapon"),("Hull insignia",(193,509,290,569),"decor"),("Hull service poster",(452,621,527,720),"decor"),("Detached background ship",(1489,34,1641,160),"ship"),("Foreground rocky asteroid",(0,648,326,941),"environment"),("Ringed planet limb",(1291,639,1672,930),"planet")]
for n,b,c in scene_items:item(n,b,c,note="Context crop from furnished scene; preserve the subject, infer hidden surfaces conservatively.",kind="context")
for i,b in enumerate([(167,68,370,304),(92,297,267,493),(57,435,193,622)]):item(f"Engine bank nozzle {i+1}",b,"engine",kind="context")
for i,b in enumerate([(1481,178,1595,289),(1437,893,1567,941),(1081,888,1225,941),(511,819,593,887),(373,877,456,941)]):item(f"Rock asteroid {i+1}",b,"environment",kind="variant")

def cockpit_hud(prefix="", before=False):
    scale=2048/1672 if before else 1
    sy=962/941 if before and SOURCE.startswith("3d") else 956/941 if before else 1
    for name,b in [("Ship identity HUD",(15,14,323,104)),("View mode button",(18,111,205,155)),("Menu button",(1514,14,1655,62)),("Connection status",(1491,68,1659,129)),("Flight telemetry",(15,765,324,916)),("Interaction prompt",(1317,816,1657,885)),("Input hints",(1320,885,1656,923))]:
        item(prefix+name,tuple(round(v*(scale if i%2==0 else sy)) for i,v in enumerate(b)),"ui")

source("small-craft-example-3d", "Razor fighter cutaway: one seat, reachable console, rear equipment area, twin engines and swept wings. This is a target concept rather than proof that the shown UI or fighter exists in game.")
item("Razor fighter cutaway",(235,76,1556,768),"ship",kind="assembly")
for n,b,c in [("Razor canopy",(425,377,658,641),"door"),("Razor pilot",(615,377,814,580),"character"),("Razor control console",(535,420,703,628),"console"),("Razor pilot chair",(647,487,741,585),"furniture"),("Rear medkit locker",(843,288,922,407),"furniture"),("Rear wall console",(1004,221,1066,352),"console"),("Rear floor hatch",(929,338,1056,433),"structure"),("Rear compartment doorway",(822,417,917,499),"door"),("Starboard wing",(1073,445,1519,704),"structure"),("Port wing",(724,84,1055,282),"structure"),("Port engine",(1067,90,1318,290),"engine"),("Starboard engine",(1284,215,1532,443),"engine"),("Razor nose panel",(235,536,461,746),"structure"),("Razor wing insignia",(1227,506,1373,618),"decor"),("Razor warm navigation light",(1353,639,1404,671),"decor"),("Razor blue side strip",(366,691,455,744),"decor"),("Razor left asteroid",(0,245,173,443),"environment"),("Razor lower asteroid",(1094,787,1243,941),"environment")]:item(n,b,c,kind="context")
cockpit_hud()

source("small-craft-example-top", "Overhead Razor fighter appearance. Pair with the angled reference; preserve the same geometry and mounting locations across camera modes.")
item("Razor fighter overhead",(417,158,1327,768),"ship",kind="state")
for n,b,c in [("Razor overhead canopy",(484,377,737,554),"door"),("Razor overhead pilot",(631,419,718,501),"character"),("Razor central roof",(872,404,1109,560),"structure"),("Razor port wing roof",(804,161,1143,375),"structure"),("Razor starboard wing roof",(887,561,1137,766),"structure"),("Razor port engine overhead",(1105,308,1256,431),"engine"),("Razor starboard engine overhead",(1105,513,1258,644),"engine"),("Razor nose roof",(417,349,593,544),"structure"),("Razor engine spine vent",(810,417,869,526),"structure"),("Razor upper-left asteroid",(222,169,341,292),"environment"),("Razor left asteroid",(122,592,226,716),"environment"),("Razor upper-right asteroid",(1449,225,1563,345),"environment"),("Razor lower-right asteroid",(1507,712,1650,822),"environment")]:item(n,b,c,kind="context")
cockpit_hud()

source("3d-rpg-after", "Wayfarer target surface refinement: furnished cutaway, continuous floor and low partitions, cockpit, three engines, deck fixtures and HUD. Distinguish this concept from an actual captured runtime revision.")
item("Wayfarer target cutaway",(41,80,1672,858),"ship",kind="assembly")
for n,b,c in [("Wayfarer cockpit canopy",(63,476,226,669),"door"),("Wayfarer pilot seat",(315,498,380,588),"furniture"),("Wayfarer bridge console",(194,438,403,651),"console"),("Wayfarer wall storage",(498,289,612,399),"furniture"),("Wayfarer standing character",(554,384,607,480),"character"),("Wayfarer lounge sofa",(618,326,756,423),"furniture"),("Wayfarer lounge table",(701,361,803,421),"furniture"),("Wayfarer lounge poster",(746,265,801,349),"decor"),("Wayfarer lounge plant",(807,279,839,342),"decor"),("Wayfarer wall shelf",(620,286,711,337),"furniture"),("Wayfarer single bed",(888,278,1019,352),"furniture"),("Wayfarer bunk beds",(1068,181,1202,295),"furniture"),("Wayfarer bedroom terminal",(985,209,1047,285),"console"),("Wayfarer crew door",(844,233,896,324),"door"),("Wayfarer cargo gold crate",(1269,400,1316,453),"cargo"),("Wayfarer cargo orange crate",(1296,444,1348,479),"cargo"),("Wayfarer cargo pale crate",(1386,419,1426,472),"cargo"),("Wayfarer cargo blue crate",(1352,446,1399,484),"cargo"),("Wayfarer hydroponics bed",(1032,472,1168,538),"furniture"),("Wayfarer small planter",(707,534,775,576),"furniture"),("Wayfarer equipment console",(909,495,956,582),"console"),("Wayfarer engineering chair",(867,547,915,598),"furniture"),("Wayfarer port engine",(1263,87,1502,279),"engine"),("Wayfarer center engine",(1405,252,1672,447),"engine"),("Wayfarer near engine",(1470,473,1638,652),"engine"),("Wayfarer partition segment",(871,344,997,445),"structure"),("Wayfarer cyan door header",(990,423,1072,473),"decor"),("Wayfarer center floor grate",(583,500,623,532),"structure"),("Wayfarer exterior red service panel",(658,696,786,823),"structure"),("Wayfarer exterior vent wall",(850,638,942,770),"structure"),("Wayfarer exterior side hatch",(941,654,1029,791),"door"),("Wayfarer exterior slogan panel",(1296,526,1497,700),"decor"),("Wayfarer front nameplate",(100,624,288,747),"decor")]:item(n,b,c,kind="context")
cockpit_hud()

source("3d-rpg-before", "Historical prototype baseline, visibly flat surfaces, simple furniture and overbright cyan. Preserve as comparison evidence, not a final-look target. Ship is clipped at right image edge.")
item("Wayfarer prototype cutaway",(419,148,2048,954),"ship",note="Historical baseline; target is paired after image.",kind="baseline")
for n,b,c in [("Prototype stepped bow",(420,527,882,955),"structure"),("Prototype bridge console",(768,510,974,733),"console"),("Prototype crew",(836,407,907,527),"character"),("Prototype sofa",(924,350,1131,483),"furniture"),("Prototype single bed",(1177,329,1329,412),"furniture"),("Prototype bunk",(1371,245,1537,356),"furniture"),("Prototype left partition",(980,486,1106,575),"structure"),("Prototype wall fixture",(696,377,803,486),"structure"),("Prototype hydroponics",(1450,548,1533,596),"furniture"),("Prototype front service wall",(869,636,1474,954),"structure"),("Prototype far engine",(1575,148,1828,299),"engine"),("Prototype middle engine",(1732,275,1929,413),"engine"),("Prototype near engine",(1860,339,2048,507),"engine")]:item(n,b,c,kind="baseline")
cockpit_hud(before=True)

source("top-down-before", "Historical overhead prototype, useful for silhouette and before/after comparison only. No final visual approval is inferred from the filename.")
item("Wayfarer prototype overhead",(775,233,1358,795),"ship",kind="baseline")
for n,b in [("Prototype roof skin",(817,265,1282,710)),("Prototype port engine",(1220,565,1358,674)),("Prototype center engine",(1184,641,1268,719)),("Prototype starboard engine",(1116,670,1231,795))]:item(n,b,"structure" if "roof" in n else "engine",kind="baseline")
cockpit_hud(before=True)

source("top-down-after", "Overhead target Wayfarer: plate layers, red access covers, vents, canopy, markings and three engines. Match to the same ship in cutaway, and do not derive current speed stats from mock HUD values.")
item("Wayfarer target overhead",(484,157,1235,793),"ship",kind="state")
for n,b,c in [("Wayfarer canopy overhead",(494,176,645,311),"door"),("Wayfarer forward roof",(589,193,750,369),"structure"),("Wayfarer center roof emblem",(779,358,978,551),"decor"),("Wayfarer forward access plate",(656,385,744,464),"structure"),("Wayfarer mid access plate",(851,325,931,401),"structure"),("Wayfarer rear access plate",(901,597,1007,687),"structure"),("Wayfarer front vent",(544,317,594,369),"structure"),("Wayfarer rear roof vent",(1015,571,1084,642),"structure"),("Wayfarer port engine overhead",(1099,556,1236,680),"engine"),("Wayfarer middle engine overhead",(1058,651,1129,713),"engine"),("Wayfarer starboard engine overhead",(1004,670,1142,793),"engine"),("Wayfarer upper-right asteroid",(1338,317,1415,390),"environment"),("Wayfarer lower-right asteroid",(1462,641,1555,737),"environment"),("Wayfarer left asteroid",(31,517,153,645),"environment"),("Wayfarer lower asteroid",(513,844,602,916),"environment")]:item(n,b,c,kind="context")
cockpit_hud()

source("in-game-ui-interface-example-1", "Combat composition with five ships, station/asteroid structures, projectiles, explosions, contact HUD, action bar and tactical map. VFX and label placement are not authoritative sensor data.")
for n,b,c in [("Player explorer frigate",(510,425,724,532),"ship"),("Helix support drone",(279,306,431,410),"ship"),("Riftjack scavenger",(782,122,924,241),"ship"),("Riftjack locked marauder",(954,322,1238,436),"ship"),("Aurelian combat ship",(1394,480,1672,672),"ship"),("Asteroid station",(0,368,461,735),"environment"),("Upper floating wreck",(1071,58,1150,148),"environment"),("Right asteroid outpost",(1545,279,1672,423),"environment"),("Foreground explosion",(927,452,1060,557),"vfx"),("Blue shield arc",(526,404,626,448),"vfx"),("Red laser projectile",(918,235,972,289),"vfx"),("Blue energy projectile",(729,398,804,435),"vfx"),("Guided missile one",(821,423,908,463),"ordnance"),("Guided missile two",(814,493,891,527),"ordnance"),("Alien beam lance",(754,511,1418,744),"vfx")]:item(n,b,c,kind="context")
for i,b in enumerate([(372,31,546,218),(512,0,642,71),(1195,0,1310,94),(1199,158,1309,247),(1421,244,1561,399),(729,268,848,385),(896,509,1006,606),(986,645,1129,737),(1239,578,1327,667),(636,620,735,710),(389,510,462,610),(273,428,359,511),(0,215,108,378),(158,618,237,709),(1519,439,1578,486),(1450,604,1533,662)]):item(f"Combat asteroid {i+1}",b,"environment",kind="variant")
for i,b in enumerate([(682,12,733,62),(632,62,670,101),(549,146,599,195),(237,260,282,306),(563,214,587,243),(944,523,998,573),(1043,501,1087,551),(1072,548,1128,588),(518,649,566,697),(569,646,633,696),(446,604,479,647),(300,217,324,249),(1323,16,1387,64),(1314,443,1355,475),(937,611,963,651)]):item(f"Combat salvage fragment {i+1}",b,"environment",note="Small ambiguous wreck fragment; exact equipment function unknown.",kind="variant")
for n,b in [("Objective tracker",(18,86,349,194)),("Locked target panel",(1352,73,1662,231)),("Enemy scavenger nameplate",(746,66,928,116)),("Enemy marauder nameplate",(1005,256,1204,310)),("Helix drone nameplate",(307,255,434,304)),("Alien nameplate",(1438,425,1629,479)),("Player health shield bars",(543,379,657,411)),("Ship status card",(13,731,456,896)),("Tactical map",(1271,657,1662,897)),("Ammunition supplies widget",(990,752,1251,886))]:item(n,b,"ui")
row("Turret action|Missile action|Repair action|Drone action|Boost action",(466,771,947,855),"ui")
item("Player ship blueprint icon",(25,752,178,886),"ui")
item("Enemy target thumbnail",(1361,104,1472,216),"ship",kind="context")

# Graphic language is part of the collection too. Recurring branding is a source
# design study, never an automatic instruction to ship the source's product name.
for name in list(SOURCE_NOTES):
    SOURCE=name
    if name not in ["internal-components-2.png","3d-rpg-before.png","3d-rpg-after.png","top-down-before.png","top-down-after.png","small-craft-example-3d.png","small-craft-example-top.png","fully-complete-constructed-space-ship.png","in-game-ui-interface-example-1.png","character-animations-2.png","alien-ship-1.png","alien-ship-2.png"]:
        item("Source identity wordmark",(14,2,421,67),"ui",note="Source branding study. Owner approval required before adopting names or insignia.",kind="context")

# Additional loose subjects resolved during magnified contact-sheet review.
SOURCE="cargo-pods-ore-etc.png"
for name,boxes in {
    "Iron ore": [(93,758,124,786)],
    "Copper ore": [(167,784,199,812),(195,755,245,805)],
    "Gold nugget": [(287,780,321,812),(308,754,336,789),(338,765,360,795)],
    "Ice": [(518,781,550,813),(550,761,590,806)],
}.items():
    for i,box in enumerate(boxes):item(name+f" loose sample {i+5}",box,"resource",kind="variant")
SOURCE="more-turrents-missiles-guns.png"
item("Barrel emitter compact orange",(211,858,251,891),"weapon-part",note="Separate short emitter between the two upper barrels; exact weapon class unconfirmed.",kind="subassembly")
item("Missile tube compact single",(354,941,403,981),"weapon-part",kind="subassembly")
item("Ammo energy feed case",(498,904,549,953),"weapon-part",kind="subassembly")
item("Mount adapter upright coupler",(845,899,885,944),"weapon-part",kind="subassembly")
SOURCE="characters-weapons-items.png"
for i,name in enumerate(["Head equipment legend icon","Chest equipment legend icon","Shoulder equipment legend icon","Backpack equipment legend icon"]):
    item(name,(870,761+i*61,904,797+i*61),"ui")
SOURCE="ui-elements-5.png"
item("Empty inventory three",(1592,732,1651,795),"ui",kind="state")
item("Inventory sort button",(1547,601,1649,632),"ui")
item("Crew XP progress bar",(38,549,307,576),"ui")
SOURCE="ui-elements-3.png"
for i in range(4):item(f"Partially occluded empty slot {i+9}",(580+i*73,661,649+i*73,696),"ui",note="Only the lower portion below the tooltip is visible. Do not infer the hidden cell contents.",kind="context")
for n,b in [("Previous navigation Q hint",(466,22,503,61)),("Next navigation E hint",(1167,22,1204,61)),("Previous category Q hint",(32,154,65,191)),("Next category T hint",(862,154,895,191)),("Inventory drag instruction",(602,620,722,651)),("Loot chest glow",(1150,239,1418,354)),("Menu TAB hint",(1533,899,1638,927))]:item(n,b,"vfx" if "glow" in n else "ui",kind="component")

# Later owner-supplied counterpart; source registration does not invent crop coverage.
SOURCE_NOTES['characters-weapons-items-female.png'] = 'Female crew counterpart: ten role columns with hair/armor variations, base rig, four armor tiers and weapon/tool loadout examples. Source was visually inspected; no crop mapping, geometry quality, gameplay ratings or final art approval is inferred.'

# 2026-09-09 detailed character-fidelity review: the counterpart was opened in
# full. It repeats this measured layout, while role headgear/hair are variants.
SOURCE='characters-weapons-items-female.png'
SOURCE_NOTES[SOURCE] = 'Detailed female counterpart review: all ten characters use exposed faces, directional stepped hair and role-specific open comms/headgear; the four lower armor-tier helmets are separate closed options. The roster, role/skill icons, base rig, tier parts and fifteen tools retain explicit appearance crops. Back/underside geometry remains inferred. No gender-specific gameplay bonus or automatic helmet swap is implied.'
for a in [dict(a) for a in ITEMS if a['source']=='characters-weapons-items.png']:
    item(a['name'],a['box'],a['category'],note=('Female reference variant. Exposed face, independently fitted headgear and hair; compare the actual source before reusing a male assembly.' if a['category']=='character' else 'Corresponding item/UI appearance in the female reference sheet; preserve this crop even where the underlying design is shared.'),kind=a['kind'],family=a['family'])
for name,box in [('Medic open comms detail',(299,300,350,372)),('Medic swept fringe and ponytail',(289,272,382,401)),('Female medic armor detail',(298,365,381,493))]:
    item(name,box,'character',kind='subassembly',note='Focused detail crop from the visible female medic. Parts are partially occluded; complete surface design needs fit review.')
# Existing registered vehicle source, inspected during additive catalog maintenance.
# Its separate vehicle author owns detailed crop mapping; keep that boundary explicit.
SOURCE_NOTES['buggy-1-mockup.png'] = 'Dock buggy concept with three-quarter, top, side/interior and rear views, separate standard cargo container, seated driver and cargo/maintenance/crew-transit/module/dock icons. Registered source only here; detailed vehicle crop mapping and model work belong to the separate vehicle queue.'
