# gen_instrument.py — authored 3D assets for /about.html ("Signal Field v5 — Machined")
# Run headless:
#   /opt/homebrew/bin/blender --background --factory-startup \
#     --python assets-src/about/gen_instrument.py -- <out_dir>
#
# Writes to <out_dir>:
#   about-instrument-raw.glb — machined hero assembly, three named objects:
#     Bezel   — lathe-turned ring (R≈4.1) with a real cut phosphor groove in
#               the outer face and 72 minor / 12 major graduation ticks as
#               actual geometry (v4 faked these with cos() in the shader)
#     GimbalA — outer gimbal ring (R≈2.62) + radial pivot studs on its X axis
#     GimbalB — inner gimbal ring (R≈2.08) + radial pivot studs on its Y axis
#     (runtime nests B inside A and spins them on those axes — honest
#      gyroscope kinematics around the procedural breathing core)
#   about-matcap.png — 512² brushed-steel studio matcap baked in Cycles.
#     The lighting rig encodes the brand palette: warm key + lime kick +
#     cyan rim + faint magenta fill (--ch0/1/2 as physical lights).
#
# Orientation: rings are spun around Blender Y with the profile in the XY
# plane, so after the glTF y-up export they lie in three.js XY with axis Z —
# exactly matching the TorusGeometry the Bezel replaces.
#
# Deterministic: no RNG at all — every dimension is a constant.

import bpy
import bmesh
import math
import sys
from mathutils import Matrix, Vector

out_dir = sys.argv[sys.argv.index("--") + 1]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# ------------------------------------------------------------------
# helpers
# ------------------------------------------------------------------
def spin_profile(bm, profile, steps):
    """Sweep a closed (r, axial) profile around the Y axis."""
    verts = [bm.verts.new((r, y, 0.0)) for (r, y) in profile]
    edges = [bm.edges.new((verts[i], verts[(i + 1) % len(verts)])) for i in range(len(verts))]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 1, 0),
                   angle=math.tau, steps=steps, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)


def add_box(bm, size, at, rot_y=0.0):
    """Axis-aligned box (sx,sy,sz) centered at `at`, then rotated around Y."""
    m = Matrix.Rotation(rot_y, 4, "Y") @ Matrix.Translation(Vector(at)) @ Matrix.Diagonal((*size, 1.0))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


def add_stud(bm, radius, length, at, axis):
    """Radial pivot stud: a small cylinder pointing along the radial `axis`.
    'X' → Blender X (three X); 'Z' → Blender Z (three Y after y-up export).
    The default cone axis is already Z, so only the X case rotates."""
    rot = Matrix.Rotation(math.radians(90), 4, "Y") if axis == "X" else Matrix.Identity(4)
    m = Matrix.Translation(Vector(at)) @ rot @ Matrix.Diagonal((radius, radius, length / 2, 1.0))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=18,
                          radius1=1.0, radius2=1.0, depth=2.0, matrix=m)


def finish(name, bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True  # EdgeSplit below re-sharpens machined edges
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    es = obj.modifiers.new("EdgeSplit", "EDGE_SPLIT")
    es.split_angle = math.radians(30)
    return obj


# ------------------------------------------------------------------
# Bezel — lathe profile. Outer face carries a real V-groove at axial 0
# (the runtime phosphor sweep rides IN this groove) and the two flat
# faces carry raised graduation ticks as actual metal.
#   (r, axial) profile, closed loop:
# ------------------------------------------------------------------
BEZEL_PROFILE = [
    (3.94, -0.050), (3.94, 0.050),           # inner wall
    (4.00, 0.085), (4.17, 0.085),            # top face (tick land)
    (4.24, 0.050), (4.26, 0.018),            # outer chamfer → outer face
    (4.215, 0.000),                          # ← the cut phosphor groove
    (4.26, -0.018), (4.24, -0.050),          # outer face → chamfer
    (4.17, -0.085), (4.00, -0.085),          # bottom face (tick land)
]

bm = bmesh.new()
spin_profile(bm, BEZEL_PROFILE, steps=192)

# graduations: 72 minor / 12 major, mirrored on both flat faces
for i in range(72):
    a = i / 72 * math.tau
    major = (i % 6 == 0)
    r0, r1 = ((3.96, 4.19) if major else (4.00, 4.13))
    w = 0.032 if major else 0.020
    h = 0.022 if major else 0.014
    rm = (r0 + r1) / 2
    for side in (1, -1):
        add_box(bm, ((r1 - r0), h, w), (rm, side * (0.085 + h / 2), 0.0), rot_y=a)

bezel = finish("Bezel", bm)


# ------------------------------------------------------------------
# Gimbals — two nested rings with rounded-rect profiles + pivot studs.
# GimbalA pivots (runtime) on X → studs on the X axis.
# GimbalB pivots (runtime) on Y (three) → studs on Blender Z, which the
# y-up export maps to three Y.
# ------------------------------------------------------------------
def gimbal_profile(r_in, r_out, half_h, cham):
    return [
        (r_in, -half_h + cham), (r_in, half_h - cham),
        (r_in + cham, half_h), (r_out - cham, half_h),
        (r_out, half_h - cham), (r_out, -half_h + cham),
        (r_out - cham, -half_h), (r_in + cham, -half_h),
    ]

bm = bmesh.new()
spin_profile(bm, gimbal_profile(2.56, 2.68, 0.048, 0.020), steps=160)
add_stud(bm, 0.055, 0.11, (2.715, 0.0, 0.0), "X")
add_stud(bm, 0.055, 0.11, (-2.715, 0.0, 0.0), "X")
gim_a = finish("GimbalA", bm)

bm = bmesh.new()
spin_profile(bm, gimbal_profile(2.02, 2.14, 0.040, 0.016), steps=144)
add_stud(bm, 0.048, 0.10, (0.0, 0.0, 2.175), "Z")   # Blender Z → three Y
add_stud(bm, 0.048, 0.10, (0.0, 0.0, -2.175), "Z")
gim_b = finish("GimbalB", bm)


bpy.ops.export_scene.gltf(
    filepath=f"{out_dir}/about-instrument-raw.glb",
    export_format="GLB",
    export_apply=True,   # bake the EdgeSplit modifiers
    export_yup=True,
)
print(f"[gen_instrument] wrote {out_dir}/about-instrument-raw.glb")


# ------------------------------------------------------------------
# matcap bake — brushed dark steel in the page's navy room. The rig IS
# the brand: warm key top-left, lime kick low-left (--ch0), cyan rim
# right (--ch2), faint magenta fill low-right (--ch1). The runtime
# samples this by view-space normal, so this bake is the entire
# lighting model of the machined hero.
# ------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1.0, location=(0, 0, 0))
sphere = bpy.context.active_object
bpy.ops.object.shade_smooth()

mat = bpy.data.materials.new("MatcapSteel")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.028, 0.032, 0.042, 1.0)  # dark graphite
bsdf.inputs["Metallic"].default_value = 0.92
bsdf.inputs["Roughness"].default_value = 0.26
if "Anisotropic" in bsdf.inputs:  # brushed-metal streak in the highlights
    bsdf.inputs["Anisotropic"].default_value = 0.7

# cool fresnel rim: facing → ramp → emission (dark core, cold steel edge)
lw = nt.nodes.new("ShaderNodeLayerWeight")
lw.inputs["Blend"].default_value = 0.50
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = 0.30
ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
ramp.color_ramp.elements[1].position = 0.97
ramp.color_ramp.elements[1].color = (0.55, 0.75, 1.0, 1.0)
mid = ramp.color_ramp.elements.new(0.72)
mid.color = (0.05, 0.09, 0.16, 1.0)
nt.links.new(lw.outputs["Facing"], ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], bsdf.inputs["Emission Color"])
bsdf.inputs["Emission Strength"].default_value = 0.9
sphere.data.materials.append(mat)


def add_area(name, loc, energy, color, size=2.2):
    light = bpy.data.lights.new(name, "AREA")
    light.energy = energy
    light.color = color
    light.size = size
    obj = bpy.data.objects.new(name, light)
    obj.location = loc
    d = Vector(loc)
    obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    bpy.context.collection.objects.link(obj)
    return obj


add_area("Key", (-1.6, 1.8, 2.3), 340, (1.0, 0.96, 0.90), 2.4)    # warm key, top-left
add_area("RimCyan", (2.3, 0.9, 0.9), 130, (0.45, 0.75, 1.0), 1.1) # --ch2 rim, right
add_area("KickLime", (-1.3, -1.6, 1.4), 45, (0.72, 1.0, 0.40), 1.6)  # --ch0 kick, low-left
add_area("FillMag", (1.2, -1.9, 1.1), 26, (1.0, 0.35, 0.65), 2.0)    # --ch1 fill, low-right

world = bpy.data.worlds.new("W")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.004, 0.005, 0.010, 1.0)
bg.inputs["Strength"].default_value = 1.0

cam_data = bpy.data.cameras.new("Cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = 2.02
cam = bpy.data.objects.new("Cam", cam_data)
cam.location = (0, 0, 3.0)
bpy.context.collection.objects.link(cam)
scene.camera = cam

scene.render.engine = "CYCLES"
scene.cycles.samples = 96
scene.cycles.use_denoising = True
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = f"{out_dir}/about-matcap.png"
bpy.ops.render.render(write_still=True)
print(f"[gen_instrument] wrote {out_dir}/about-matcap.png")
