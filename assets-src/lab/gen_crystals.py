# gen_crystals.py — authored 3D assets for /lab.html ("Deep Signal")
# Run headless:
#   /opt/homebrew/bin/blender --background --factory-startup \
#     --python assets-src/lab/gen_crystals.py -- <out_dir>
#
# Writes to <out_dir>:
#   lab-crystals-raw.glb  — 6 faceted shard variants + 1 bevelled hero gem
#                           (scripts/build-3d.mjs draco-compresses this into
#                            src/assets/3d/lab-crystals.glb)
#   lab-matcap.png        — 512² studio-lit crystal matcap baked in Cycles
#                           (toktx turns it into lab-matcap.ktx2)
#
# Deterministic: seeded RNG, fixed sample counts.

import bpy
import bmesh
import math
import random
import sys
from mathutils import Vector

out_dir = sys.argv[sys.argv.index("--") + 1]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# ------------------------------------------------------------------
# crystal shards — convex hulls of points packed in an elongated
# spindle. Few points → big flat facets, which is what reads as
# "crystal" once flat-shaded and matcap-lit.
# ------------------------------------------------------------------
def make_shard(name, seed, n_pts=15, elong=2.6, base_r=0.52, tip=1.30):
    rnd = random.Random(seed)
    pts = []
    for _ in range(n_pts):
        y = rnd.uniform(-1.0, 1.0)
        r = base_r * (1.0 - abs(y) ** 1.7) * rnd.uniform(0.55, 1.0)
        a = rnd.uniform(0.0, math.tau)
        pts.append(Vector((math.cos(a) * r, y * elong * 0.5, math.sin(a) * r)))
    # guaranteed sharp tip + blunt root so every variant reads as a spike
    pts.append(Vector((rnd.uniform(-0.05, 0.05), elong * 0.5 * tip, rnd.uniform(-0.05, 0.05))))
    pts.append(Vector((rnd.uniform(-0.12, 0.12), -elong * 0.5 * rnd.uniform(0.8, 1.0), rnd.uniform(-0.12, 0.12))))

    bm = bmesh.new()
    for p in pts:
        bm.verts.new(p)
    res = bmesh.ops.convex_hull(bm, input=list(bm.verts))
    doomed = {g for g in res["geom_interior"] + res["geom_unused"] if isinstance(g, bmesh.types.BMVert)}
    if doomed:
        bmesh.ops.delete(bm, geom=list(doomed), context="VERTS")

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False  # flat facets
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


shards = [
    make_shard("Shard0", seed=101, n_pts=13, elong=2.9, base_r=0.42, tip=1.45),
    make_shard("Shard1", seed=202, n_pts=16, elong=2.3, base_r=0.58, tip=1.20),
    make_shard("Shard2", seed=303, n_pts=14, elong=3.4, base_r=0.38, tip=1.55),
    make_shard("Shard3", seed=404, n_pts=18, elong=2.0, base_r=0.66, tip=1.15),
    make_shard("Shard4", seed=505, n_pts=15, elong=2.7, base_r=0.48, tip=1.35),
    make_shard("Shard5", seed=606, n_pts=12, elong=3.1, base_r=0.34, tip=1.60),
]

# spread them out so the exported scene is inspectable in a viewer
for i, s in enumerate(shards):
    s.location.x = (i - 2.5) * 1.6


# ------------------------------------------------------------------
# hero gem — a dense hull with a bevel pass so every edge carries a
# thin extra facet (edge glints under the matcap).
# ------------------------------------------------------------------
def make_gem(name, seed=777, n_pts=26):
    rnd = random.Random(seed)
    pts = []
    ga = math.pi * (3.0 - math.sqrt(5.0))  # golden angle
    for i in range(n_pts):
        y = 1.0 - (i / (n_pts - 1)) * 2.0
        r = math.sqrt(max(0.0, 1.0 - y * y))
        th = ga * i
        jitter = rnd.uniform(0.86, 1.06)
        pts.append(Vector((
            math.cos(th) * r * jitter,
            y * 1.18 * jitter,   # slightly elongated vertically — heart-like
            math.sin(th) * r * jitter,
        )))
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(p)
    res = bmesh.ops.convex_hull(bm, input=list(bm.verts))
    doomed = {g for g in res["geom_interior"] + res["geom_unused"] if isinstance(g, bmesh.types.BMVert)}
    if doomed:
        bmesh.ops.delete(bm, geom=list(doomed), context="VERTS")
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    bev = obj.modifiers.new("Bevel", "BEVEL")
    bev.width = 0.045
    bev.segments = 1
    bev.limit_method = "ANGLE"
    bev.angle_limit = math.radians(12)
    return obj


gem = make_gem("Gem")
gem.location.y = 3.2

bpy.ops.export_scene.gltf(
    filepath=f"{out_dir}/lab-crystals-raw.glb",
    export_format="GLB",
    export_apply=True,   # bake the gem's bevel modifier
    export_yup=True,
)
print(f"[gen_crystals] wrote {out_dir}/lab-crystals-raw.glb")


# ------------------------------------------------------------------
# matcap bake — orthographic camera on a unit sphere, studio-lit in
# Cycles. The runtime samples this by view-space normal, so whatever
# is baked here IS the crystal lighting model.
# ------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1.0, location=(0, 0, 0))
sphere = bpy.context.active_object
bpy.ops.object.shade_smooth()

mat = bpy.data.materials.new("MatcapCrystal")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.020, 0.034, 0.062, 1.0)  # deep ice navy
bsdf.inputs["Metallic"].default_value = 0.35
bsdf.inputs["Roughness"].default_value = 0.16

# fresnel ice-rim: facing → ramp → emission (dark core, bright cold edge)
lw = nt.nodes.new("ShaderNodeLayerWeight")
lw.inputs["Blend"].default_value = 0.52
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = 0.28
ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
ramp.color_ramp.elements[1].position = 0.96
ramp.color_ramp.elements[1].color = (0.62, 0.82, 1.0, 1.0)
mid = ramp.color_ramp.elements.new(0.70)
mid.color = (0.10, 0.22, 0.40, 1.0)
nt.links.new(lw.outputs["Facing"], ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], bsdf.inputs["Emission Color"])
bsdf.inputs["Emission Strength"].default_value = 1.55
sphere.data.materials.append(mat)


def add_area(name, loc, energy, color, size=2.2):
    light = bpy.data.lights.new(name, "AREA")
    light.energy = energy
    light.color = color
    light.size = size
    obj = bpy.data.objects.new(name, light)
    obj.location = loc
    # aim at origin
    d = Vector(loc)
    obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    bpy.context.collection.objects.link(obj)
    return obj


add_area("Key", (-1.7, 1.9, 2.4), 320, (1.0, 0.985, 0.94))       # warm white key, top-left
add_area("Fill", (1.5, -1.2, 1.8), 70, (0.55, 0.75, 1.0))        # cold fill, bottom-right
add_area("Kick", (2.2, 1.4, 0.6), 110, (0.72, 0.88, 1.0), 1.2)   # icy edge kick, right

world = bpy.data.worlds.new("W")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.004, 0.006, 0.012, 1.0)
bg.inputs["Strength"].default_value = 1.0

cam_data = bpy.data.cameras.new("Cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = 2.02
cam = bpy.data.objects.new("Cam", cam_data)
cam.location = (0, 0, 3.0)  # default camera looks down -Z
bpy.context.collection.objects.link(cam)
scene.camera = cam

scene.render.engine = "CYCLES"
scene.cycles.samples = 96
scene.cycles.use_denoising = True
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = f"{out_dir}/lab-matcap.png"
bpy.ops.render.render(write_still=True)
print(f"[gen_crystals] wrote {out_dir}/lab-matcap.png")
