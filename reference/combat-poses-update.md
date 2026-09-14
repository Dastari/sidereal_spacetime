TASK: Build a general-purpose procedural character equipment posing and aiming system.

IMPORTANT:
Do not treat this as "make the current rifle animation look a little better."

We need to establish a reusable character/equipment rigging architecture that supports:

- carbines / assault rifles
- long rifles / sniper rifles
- pistols held with two hands
- pistols held one-handed
- torches / flashlights
- handheld scanners
- tools
- future handheld weapons and devices

The character is stylised and blocky, so do not blindly reproduce realistic human animation.

The goal is:

BELIEVABLE SILHOUETTE
+
PHYSICALLY PLAUSIBLE EQUIPMENT PLACEMENT
+
PROCEDURAL AIMING
+
NO WEAPON/BODY INTERSECTION
+
REUSABLE EQUIPMENT POSE PROFILES


============================================================
1. FIRST FIX THE CURRENT RIFLE INTERSECTION PROBLEM
============================================================

The current combat pose allows the rifle to penetrate the character's torso.

This is unacceptable.

A firearm is a rigid object.

It cannot move through:

- chest
- abdomen
- shoulder
- head
- arms

simply because the aim solver wants it to point toward a target.

The current implementation appears to prioritise:

    point gun toward target

without sufficiently enforcing:

    character must physically be able to hold gun there

Change this.

The body must adapt around the weapon.

If the requested aim orientation would cause the rifle to intersect the torso:

- rotate the chest;
- rotate the waist;
- rotate the pelvis;
- move the shoulder;
- reposition the elbows;
- lean the torso;
- turn the lower body;
- slightly translate the weapon outward if anatomically appropriate;

BEFORE allowing the weapon to penetrate the body.

The weapon should NEVER simply pass through the chest.


============================================================
2. ADD CHARACTER COLLISION / CLEARANCE PROXIES FOR POSING
============================================================

Create simple posing clearance volumes for important body regions.

These do NOT need to be gameplay physics colliders.

They are rig/solver helpers.

At minimum define approximate volumes around:

    HeadClearance
    ChestClearance
    AbdomenClearance
    LeftUpperArmClearance
    RightUpperArmClearance

For this blocky character, boxes/capsules approximating the actual silhouette
may work better than anatomically realistic capsules.

Also define a simple weapon clearance representation.

For a rifle this could approximately represent:

    barrel
    receiver
    stock

The procedural pose solver should detect unacceptable penetration.

Do NOT try to solve this using full Blender rigid-body simulation.

Use simple geometric clearance tests and pose constraints.

Small incidental clipping during extreme animation may be tolerated.

Large visible penetration like the current screenshot must not occur.


============================================================
3. RIFLES REQUIRE A SHOULDER CONTACT POINT
============================================================

A shoulder-fired weapon cannot just orbit around the character's hands.

Create a character anchor:

    RightShoulderPocket

and optionally:

    LeftShoulderPocket

This is approximately where the buttstock of a rifle should contact the body.

Every shoulder-fired weapon should contain:

    PrimaryGrip
    SupportGrip
    StockContact
    MuzzleSocket

and where appropriate:

    SightSocket
    ScopeEyeReference

For a normal rifle/carbine:

    StockContact
           ↓
    sits against ShoulderPocket

The stock should visually terminate against the outside/front of the shoulder.

It must NOT continue inside the chest.

This contact should be treated as a strong SOFT constraint.

It can move slightly during extreme aiming, recoil and locomotion,
but it should generally look connected to the shoulder.


============================================================
4. USE THE CORRECT AIM PIVOT FOR LONG GUNS
============================================================

Do NOT rotate a rifle around its geometric centre.

That produces exactly the sort of chest penetration currently visible.

For a shouldered rifle, its effective aiming pivot should be near:

    StockContact / ShoulderPocket

Conceptually:

                    TARGET
                       *
                      /
             muzzle ==>
                    /
    shoulder [STOCK]
                ^
                |
             AIM PIVOT

When pitch/yaw changes, the barrel should sweep around the shoulder region.

The arms, spine and rest of the body then adapt to support that orientation.

Do not rotate the weapon through the character.


============================================================
5. SOLVER PRIORITIES
============================================================

This is an over-constrained problem.

Do not expect every desired relationship to be mathematically exact at every
possible aiming angle.

Use priorities.

For a shoulder rifle, approximately:

HIGHEST PRIORITY

1. Weapon remains outside character body.
2. Muzzle points as closely as possible toward requested aim target.
3. Primary hand remains attached correctly to weapon.
4. Rifle stock remains near shoulder pocket.
5. Support hand remains attached to foregrip.

LOWER PRIORITY

6. Ideal elbow pose.
7. Exact default shoulder position.
8. Exact original spine pose.
9. Exact original hip facing.

Therefore:

If the rifle cannot reach the target without moving the torso,
MOVE THE TORSO.

If it cannot reach without turning the hips,
TURN THE HIPS.

If necessary,
TURN THE FEET.

Never solve an impossible target by allowing the rifle to pass through
the character.


============================================================
6. PRIMARY HAND VS SUPPORT HAND
============================================================

Introduce the concept of a PRIMARY hand.

For a right-handed rifle:

    Primary = Right

The primary hand should have greater positional authority because it controls
the pistol grip / trigger area.

The support hand is then solved onto the weapon's support grip using IK.

Conceptually:

    BODY
      ↓
    shoulder/chest pose
      ↓
    primary arm
      ↓
    RIGHT HAND
      ↓
    WEAPON
      ↓
    LeftSupportGrip
      ↓
    LEFT HAND IK

However the weapon may still have a higher-level AimController governing its
final orientation.

Avoid a circular constraint chain such as:

right hand controls weapon
weapon controls left hand
left hand controls torso
torso controls right hand

Design the controller hierarchy explicitly and avoid cyclic dependencies.


============================================================
7. ELBOW CONTROL
============================================================

Create pole controls for both arm IK chains.

For example:

    RightElbowPole
    LeftElbowPole

Do not allow Blender to arbitrarily choose elbow direction.

For a rifle stance:

- dominant elbow generally points somewhat outward/down;
- support elbow generally sits below/outside the weapon;
- elbows should not invert;
- arms should not suddenly flip when crossing an aim angle.

The pole controls themselves can procedurally shift according to aim pitch.

Blender's IK system supports pole targets specifically for controlling this
middle-joint behaviour, so use them appropriately.


============================================================
8. CREATE EQUIPMENT POSE PROFILES
============================================================

Do NOT hardcode "rifle behaviour" directly into the character.

Create reusable EquipmentPoseProfile definitions.

Conceptually:

EquipmentPoseProfile
{
    type

    primaryHand
    secondaryHandMode

    primaryGrip
    secondaryGrip

    shoulderContact
    muzzle

    sightReference

    baseCombatPose

    aimPivotMode

    maxUpperBodyYaw
    maxUpperBodyPitch

    torsoAimContribution
    hipAimContribution

    weaponClearance

    requiresShoulderContact

    requiresEyeAlignment

    locomotionPoseSet
}

Equipment items should declare which profile they use.

Example profiles:

    RIFLE
    LONG_RIFLE
    PISTOL_TWO_HAND
    PISTOL_ONE_HAND
    HANDHELD_DEVICE
    FLASHLIGHT
    TOOL


============================================================
9. STANDARD CARBINE / RIFLE POSE
============================================================

Create a proper rifle-ready base pose.

Desired silhouette:

- weapon drawn into shoulder;
- right hand firmly on pistol grip;
- left hand under/on fore-end;
- barrel slightly below eye height when neutral;
- stock against shoulder;
- chest rotated slightly toward weapon;
- shoulders not perfectly square;
- knees slightly flexed;
- centre of gravity slightly lowered;
- torso slightly forward;
- feet sufficiently separated for stability.

Do not place the rifle directly through the centre line of the chest.

For a right-handed shooter the weapon should naturally occupy the
right shoulder region.

The character should look like they are supporting the rifle's weight.


============================================================
10. LONG RIFLE / SNIPER POSE
============================================================

Long rifles require a different base pose.

Do NOT simply scale the normal rifle stance.

A sniper/precision rifle should:

- have stock firmly positioned at shoulder;
- have longer support-arm extension;
- accommodate the additional weapon length;
- bring the optic toward the character's aiming eye;
- move the head slightly toward/down onto the sight line;
- rotate/lean the torso appropriately;
- maintain believable eye relief.

Add a weapon socket/reference such as:

    SightSocket

and:

    ScopeEyeReference

The goal is approximately:

    aiming eye
        O
        |--- appropriate eye relief ---| scope ======= barrel =====>

The scope should visually be close to the aiming eye.

Do not shove the scope through the character's face.

The HEAD should adjust somewhat to the weapon.

The weapon should not simply move arbitrarily upward until the scope happens
to intersect the eye.

Eye alignment should be a soft pose constraint.


============================================================
11. TWO-HANDED PISTOL POSE
============================================================

This needs a completely different profile from rifles.

For a two-handed pistol:

PRIMARY HAND:

    firmly holds pistol grip.

SUPPORT HAND:

    supports/wraps around the primary hand and grip area.

Do NOT search for a nonexistent rifle-style foregrip.

The support hand target should be defined specifically for the pistol.

Create something such as:

    PrimaryGrip
    SupportHandContact
    MuzzleSocket

The pose should resemble a compact two-handed shooting stance:

- both arms forward;
- elbows slightly flexed;
- shoulders engaged;
- weapon roughly centred forward;
- torso can rotate toward aim;
- knees subtly bent;
- stable combat silhouette.

It can be visually inspired by an isosceles / modified fighting stance,
but simplify it for this stylised character.

Do NOT require exact firearm-training realism.


============================================================
12. ONE-HANDED PISTOL POSE
============================================================

Also support:

    PISTOL_ONE_HAND

The firing arm extends toward the target with a slight elbow bend.

The free arm should NOT simply remain frozen in a generic T-pose/idle pose.

Depending upon context it may:

- remain slightly raised near torso;
- balance the stance;
- hold another item;
- participate in locomotion.

Upper torso still contributes to aiming.

At extreme yaw, the character still turns their body.


============================================================
13. FLASHLIGHT / TORCH POSE
============================================================

Create a generic one-handed directed-device pose.

Used for:

- torch
- flashlight
- laser pointer
- some tools

Required item anchors:

    Grip
    DirectionSocket

Character should:

- hold device firmly;
- extend hand forward slightly;
- keep elbow comfortably bent;
- rotate shoulder/chest toward target;
- allow modest independent hand aiming;
- rotate torso when target exceeds comfortable arm range.

The device beam must behave exactly like the firearm laser:

    POINTER
       ↓
    requested target
       ↓
    pose solver
       ↓
    physical device orientation
       ↓
    DirectionSocket
       ↓
    actual beam

The beam must NEVER rotate independently from the physical torch.


============================================================
14. SCANNER / HANDHELD DEVICE POSE
============================================================

Create a HANDHELD_DEVICE / SCANNER stance.

A scanner may naturally be held:

- around chest height;
- slightly in front of body;
- with elbow bent;
- tilted toward whatever is being scanned.

It should feel less aggressive than a weapon stance.

Allow equipment metadata to select variants such as:

    DIRECTED_DEVICE
    VIEW_SCREEN_DEVICE

For a directed scanner:
point its emitter toward target.

For a screen-style scanner:
orient the display so the character appears able to see it.

This architecture should eventually support datapads, repair tools,
detectors, etc.


============================================================
15. AIM OFFSET POSE LIBRARY
============================================================

Do not rely entirely on procedural IK.

Create good authored BASE POSES which procedural aiming modifies.

For every major combat stance, create a neutral forward pose.

Then create/reference useful directional extremes such as:

    Aim Forward
    Aim Up
    Aim Down

    Aim Left
    Aim Right

and useful diagonals:

    Up Left
    Up Right
    Down Left
    Down Right

These should form an AIM SPACE / AIM OFFSET concept.

At runtime the desired yaw/pitch can blend between those poses.

Then arm IK performs the final precise hand placement.

The resulting pipeline should approximately be:

    LOCOMOTION
         +
    EQUIPMENT BASE POSE
         +
    AIM OFFSET
         +
    SPINE / BODY PROCEDURAL ADJUSTMENT
         +
    ARM IK
         +
    CLEARANCE CORRECTION
         =
    FINAL CHARACTER POSE


============================================================
16. COMBAT LOCOMOTION POSES
============================================================

We will eventually need the character to move while maintaining these poses.

Prepare the architecture for:

    combat idle
    combat walk forward
    combat walk backward
    combat strafe left
    combat strafe right

plus:

    turn left in place
    turn right in place

The lower body should remain primarily locomotion-driven.

The upper body continues aiming.

Avoid the appearance of the entire character sliding around as one rigid
statue.


============================================================
17. AIMING UP
============================================================

When aiming upward:

DO NOT:

    merely rotate gun upward through the chest/head.

Instead:

    barrel rises
        ↓
    hands rise
        ↓
    elbows reposition
        ↓
    shoulders open
        ↓
    upper spine extends backward slightly
        ↓
    torso may lean backward
        ↓
    pelvis/knees compensate for balance

At extreme upward angles the whole character should visibly participate.


============================================================
18. AIMING DOWN
============================================================

Likewise when aiming downward:

    weapon lowers
        ↓
    elbows adjust
        ↓
    shoulders roll/rotate
        ↓
    chest bends forward
        ↓
    waist contributes
        ↓
    knees/hips may contribute slightly

Do not allow the stock/receiver to disappear inside the torso.


============================================================
19. HORIZONTAL AIMING / BODY CATCH-UP
============================================================

Small yaw:

    arms + shoulders + spine

Medium yaw:

    arms + shoulders + spine + waist

Large yaw:

    hips/root/feet rotate toward target

The shorter and chunkier this character's limbs are,
the MORE IMPORTANT whole-body rotation becomes.

Do not try to extract human-scale arm flexibility from limbs that physically
do not have enough reach.


============================================================
20. TURN-IN-PLACE
============================================================

Implement a turn-in-place threshold.

Conceptually:

    0° ───────── 45° ───── 65°+
        upper body      body turns

Use smooth ranges rather than an abrupt switch.

For example:

0–40 degrees:
mostly torso

40–60 degrees:
torso approaching limit + pelvis begins following

60+ degrees:
strong body/root rotation

As the feet catch up:

    torsoYawOffset → returns toward centre

Avoid sudden snapping.


============================================================
21. AIM TARGET VS ACTUAL SHOT
============================================================

This distinction is ABSOLUTE.

The cursor provides:

    DesiredAimTarget

It does NOT directly provide:

    BulletDirection

Solve:

    DesiredAimTarget
        ↓
    character pose
        ↓
    weapon transform
        ↓
    MuzzleSocket transform

ONLY THEN calculate:

    shotOrigin = MuzzleSocket.worldPosition

    shotDirection = MuzzleSocket.worldForward

    hit = raycast(shotOrigin, shotDirection)

Therefore while the character is physically rotating toward a suddenly moved
cursor, the barrel/laser may temporarily lag behind the cursor.

THAT IS CORRECT.

The character cannot fire sideways through their own chest merely because
the mouse moved there.


============================================================
22. WEAPON METADATA / SOCKET STANDARD
============================================================

Create a standard socket convention for equipment.

Potential generic sockets:

    Grip.Primary
    Grip.Secondary

    Contact.Shoulder

    Aim.Muzzle
    Aim.Direction

    Sight.Primary
    Sight.EyeReference

    Interaction.Contact

Not every item uses every socket.

Examples:

CARBINE

    PrimaryGrip
    SecondaryGrip
    ShoulderContact
    Muzzle
    Sight

SNIPER

    PrimaryGrip
    SecondaryGrip
    ShoulderContact
    Muzzle
    ScopeSight
    EyeReference

PISTOL

    PrimaryGrip
    SupportHandContact
    Muzzle
    Sight

FLASHLIGHT

    PrimaryGrip
    Direction

SCANNER

    PrimaryGrip
    Direction
    optional DisplayReference


============================================================
23. DIFFERENT-SIZED WEAPONS MUST NOT REQUIRE NEW CHARACTER ANIMATIONS
============================================================

Do not author one completely unique animation for every gun.

Use:

    shared POSE PROFILE
           +
    per-item SOCKET LOCATIONS
           +
    IK

For example:

Carbine A and Carbine B both use:

    RIFLE profile

but their:

    PrimaryGrip
    SecondaryGrip
    ShoulderContact
    Muzzle

are positioned according to their individual geometry.

This lets the same character convincingly hold differently sized weapons.


============================================================
24. AUTHORED ANIMATIONS WE SHOULD SUPPORT
============================================================

Prepare the character rig/pose architecture so we can create/use:

    Equip
    Unequip

    CombatIdle

    WalkForwardAim
    WalkBackwardAim
    StrafeLeftAim
    StrafeRightAim

    TurnInPlaceLeft
    TurnInPlaceRight

    Fire
    Recoil
    Recover

    Reload

    LowerWeapon
    RaiseWeapon

    Sprint / weapon lowered if appropriate

    UseScanner
    UseTool

    FlashlightIdle

These should be layered wherever possible rather than creating every possible
combination as a unique animation.


============================================================
25. RECOIL MUST BUILD ON THE SAME SYSTEM
============================================================

Later firing recoil should modify:

    weapon
    hands
    shoulders
    chest

as a short additive animation.

After recoil, IK should return the hands and weapon to the procedural
aim solution.

Do not make recoil permanently break hand alignment.


============================================================
26. TRANSITIONS MATTER
============================================================

Do not instantly pop between:

    idle
    combat rifle
    pistol
    scanner
    torch

Blend between equipment pose profiles.

When equipping an item:

    locomotion continues
        ↓
    upper-body stance blends
        ↓
    hands acquire grip targets
        ↓
    IK influence increases
        ↓
    item reaches active pose

Likewise reverse this during unequip.


============================================================
27. BLENDER IMPLEMENTATION
============================================================

Use the existing Blender armature where practical.

Use appropriate:

- IK arm chains;
- IK targets;
- pole targets;
- rotation limits;
- controller bones;
- Copy Rotation / Copy Transforms where suitable;
- custom helper bones that do not deform the mesh.

Keep controller bones separate from deformation/export bones where needed.

Avoid cyclic dependencies.

Keep the runtime implementation in mind.

Blender can be used to determine:

- correct pose geometry;
- grip locations;
- joint limits;
- controller relationships;
- base poses;
- animation clips;

but anything required dynamically in the actual game must either:

A. export as skeletal animation/bone data

or

B. be reproducible by the runtime procedural animation system.


============================================================
28. RESEARCH EXISTING STANDARD PRACTICES
============================================================

Do not invent this architecture blindly.

Before implementing, research established character animation techniques for:

- two-bone arm IK;
- hand IK for weapon grips;
- weapon grip sockets;
- additive aim offsets / aim spaces;
- turn-in-place;
- upper-body/lower-body animation layering;
- shoulder-fired weapon posing;
- handgun two-handed poses;
- sniper scope/eye alignment;
- procedural weapon aiming;
- IK/FK blending.

Useful public technical references include:

- Blender inverse kinematics / pole-target documentation;
- Unreal Engine Aim Offset documentation;
- Unreal Engine Two Bone IK documentation;
- Unreal Engine Hand IK Retargeting documentation;
- publicly documented third-person weapon-animation techniques.

These are references for ARCHITECTURE AND TECHNIQUE.

Do not copy proprietary art or animation data.

Adapt the concepts to this game's Blender-based character pipeline.


============================================================
29. BUILD A TEST / VALIDATION SCENE
============================================================

Create a pose-testing environment where the character can be tested with:

    normal rifle
    long/sniper rifle
    pistol
    flashlight
    scanner

For each item allow target movement through:

YAW:

    0
    ±20
    ±45
    ±70
    ±90
    ±135

PITCH:

    0
    ±20
    ±40
    ±60

Test combinations of yaw + pitch.

At every test pose check:

    Are both hands correctly positioned?

    Is the weapon outside the torso?

    Is the stock against the shoulder when applicable?

    Is the scope near the eye when applicable?

    Are elbows bending sensibly?

    Is the head being penetrated?

    Is the muzzle genuinely pointing in the reported direction?

    Is the muzzle unobstructed by the character?

    Does the silhouette look intentional?

    Has the body rotated when the upper body's useful range was exhausted?


============================================================
30. DEBUG VIEW
============================================================

Provide a debug rig view showing:

    desired target

    desired aim direction

    weapon aim pivot

    primary grip

    secondary grip

    shoulder contact

    sight socket

    muzzle socket

    actual muzzle forward

    left/right IK targets

    elbow poles

    torso clearance volume

    head clearance volume

    upper-body yaw

    upper-body pitch

    body facing

    turn-in-place threshold

This should make pose failures obvious.


============================================================
31. VISUAL QUALITY BAR
============================================================

The final test should NOT be:

    "Does the laser point at the cursor?"

The test is:

    "Does this look like a small stylised character physically manipulating
     this object in order to point it at the cursor?"

A successful rifle pose should clearly communicate:

    shoulder supports stock
    +
    dominant hand controls weapon
    +
    support hand supports barrel
    +
    chest supports the action
    +
    hips provide additional rotation
    +
    feet provide the final orientation

A successful pistol pose should clearly communicate:

    hands support weapon
    +
    arms support hands
    +
    shoulders support arms
    +
    torso supports shoulders

The entire body participates.

Never allow an impossible arm pose, body penetration, or independently
steerable beam simply because that makes the mathematical aim target easier
to reach.