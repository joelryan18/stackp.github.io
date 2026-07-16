# gen_crystals.py — authored 3D assets for /lab.html ("Deep Signal")
# v2 "Crystalline": real quartz-habit crystals + a dual-matcap bake.
# Run headless:
#   /opt/homebrew/bin/blender --background --factory-startup \
#     --python assets-src/lab/gen_crystals.py -- <out_dir>
#
# Writes to <out_dir>:
#   lab-crystals-raw.glb  — 6 crystal variants (4 single quartz spikes +
#                           2 twinned clusters) + 1 bevelled hero gem
#                           (scripts/build-3d.mjs draco-compresses this into
#                            src/assets/3d/lab-crystals.glb)
#   lab-matcap.png        — 512² EXTERIOR studio-ice matcap (Cycles)
#   lab-matcap-int.png    — 512² INTERIOR refraction matcap: the runtime
#                           samples this along refract(v,n) so facets carry
#                           real internal light instead of a flat tint
#                           (toktx turns both into .ktx2)
#
# Deterministic: seeded RNG, fixed sample counts, zero unseeded calls.

import bpy
import bmesh
import math
import random
import sys
from mathutils import Matrix, Vector

out_dir = sys.argv[sys.argv.index("--") + 1]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# ------------------------------------------------------------------
# quartz-habit crystal: an IRREGULAR hexagonal prism (real quartz
# prisms are never regular hexagons) with a slight taper and an
# ASYMMETRIC six-face pyramidal termination (the apex sits off-axis,
# as in natural points). Root is a blunt cap that buries in the wall.
# Local axis: +Y is the growth direction (matches the old shards, so
# the runtime placement quaternions keep working unchanged).
# ------------------------------------------------------------------
def crystal_bmesh(bm, rnd, elong, base_r, tip_len, apex_off, xform):
    jit = [rnd.uniform(0.72, 1.12) for _ in range(6)]          # irregular hexagon
    ang0 = rnd.uniform(0.0, math.tau)
    y_root = -elong * 0.5
    y_neck = elong * 0.5
    taper = rnd.uniform(0.82, 0.94)                            # prism narrows upward
    ring0, ring1 = [], []
    for i in range(6):
        a = ang0 + i * math.tau / 6.0
        cx, cz = math.cos(a), math.sin(a)
        r0 = base_r * jit[i]
        ring0.append(bm.verts.new(xform @ Vector((cx * r0, y_root, cz * r0))))
        ring1.append(bm.verts.new(xform @ Vector((cx * r0 * taper, y_neck, cz * r0 * taper))))
    apex = bm.verts.new(xform @ Vector((apex_off[0], y_neck + tip_len, apex_off[1])))
    bm.faces.new(list(reversed(ring0)))                        # root cap
    for i in range(6):
        j = (i + 1) % 6
        bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i]))  # prism facet
        bm.faces.new((ring1[i], ring1[j], apex))                # termination facet


def make_crystal(name, seed, spikes):
    """spikes: list of (elong, base_r, tip_len, lean_deg, azim_deg, y_shift)"""
    rnd = random.Random(seed)
    bm = bmesh.new()
    for elong, base_r, tip_len, lean, azim, y_shift in spikes:
        apex_off = (rnd.uniform(-0.14, 0.14) * base_r, rnd.uniform(-0.14, 0.14) * base_r)
        rot = Matrix.Rotation(math.radians(azim), 4, "Y") @ Matrix.Rotation(math.radians(lean), 4, "X")
        xform = Matrix.Translation(Vector((0.0, y_shift, 0.0))) @ rot
        crystal_bmesh(bm, rnd, elong, base_r, tip_len, apex_off, xform)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False                                # crisp flat facets
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


# 4 single points of varying habit + 2 twinned clusters (druse reads)
shards = [
    make_crystal("Shard0", 101, [(2.9, 0.40, 1.10, 0, 0, 0)]),                       # long needle
    make_crystal("Shard1", 202, [(2.1, 0.60, 0.80, 0, 0, 0)]),                       # stout prism
    make_crystal("Shard2", 303, [(3.4, 0.34, 1.30, 0, 0, 0)]),                       # hair-fine spike
    make_crystal("Shard3", 404, [(2.5, 0.50, 0.95, 0, 0, 0)]),                       # classic point
    make_crystal("Shard4", 505, [(2.7, 0.46, 1.00, 0, 0, 0),                         # twin: main +
                                 (1.6, 0.30, 0.62, 34, 140, -0.55)]),                #   leaning child
    make_crystal("Shard5", 606, [(2.3, 0.42, 0.85, 0, 0, 0),                         # triplet cluster
                                 (1.4, 0.26, 0.55, 28, 40, -0.45),
                                 (1.1, 0.22, 0.48, 42, 250, -0.62)]),
]

# spread them out so the exported scene is inspectable in a viewer
for i, s in enumerate(shards):
    s.location.x = (i - 2.5) * 1.8


# ------------------------------------------------------------------
# hero gem — a dense golden-angle hull with a bevel pass so every
# edge carries a thin extra facet (edge glints under the matcap).
# ------------------------------------------------------------------
def make_gem(name, seed=777, n_pts=30):
    rnd = random.Random(seed)
    pts = []
    ga = math.pi * (3.0 - math.sqrt(5.0))  # golden angle
    for i in range(n_pts):
        y = 1.0 - (i / (n_pts - 1)) * 2.0
        r = math.sqrt(max(0.0, 1.0 - y * y))
        th = ga * i
        jitter = rnd.uniform(0.88, 1.05)
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
    bev.width = 0.05
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
# matcap bakes — orthographic camera on a unit sphere, Cycles. The
# runtime samples the EXTERIOR map by view-space normal and the
# INTERIOR map by the refracted view vector, so these two renders
# ARE the entire crystal lighting model.
# ------------------------------------------------------------------
def matcap_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1.0, location=(0, 0, 0))
    sphere = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    world = bpy.data.worlds.new("W")
    sc.world = world
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
    sc.camera = cam
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 128
    sc.cycles.use_denoising = True
    sc.render.resolution_x = 512
    sc.render.resolution_y = 512
    sc.render.image_settings.file_format = "PNG"
    return sc, sphere


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


# ---- EXTERIOR: glassy studio ice — broad window reflection band,
#      cold rim, faint brand-lime kick low-left ----
scene, sphere = matcap_scene()
mat = bpy.data.materials.new("MatcapIceExt")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.016, 0.028, 0.056, 1.0)  # deep ice navy
bsdf.inputs["Metallic"].default_value = 0.22
bsdf.inputs["Roughness"].default_value = 0.09                          # glassier than v1

lw = nt.nodes.new("ShaderNodeLayerWeight")
lw.inputs["Blend"].default_value = 0.52
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = 0.30
ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
ramp.color_ramp.elements[1].position = 0.97
ramp.color_ramp.elements[1].color = (0.66, 0.85, 1.0, 1.0)
mid = ramp.color_ramp.elements.new(0.72)
mid.color = (0.09, 0.20, 0.38, 1.0)
nt.links.new(lw.outputs["Facing"], ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], bsdf.inputs["Emission Color"])
bsdf.inputs["Emission Strength"].default_value = 1.35
sphere.data.materials.append(mat)

add_area("Window", (-1.4, 2.2, 2.2), 300, (0.97, 0.99, 1.0), 4.6)   # broad soft window band
add_area("Key", (-2.0, 1.2, 2.6), 140, (1.0, 0.985, 0.94), 1.6)     # warm key accent
add_area("Fill", (1.5, -1.2, 1.8), 60, (0.55, 0.75, 1.0))           # cold fill, bottom-right
add_area("Kick", (2.3, 1.3, 0.6), 130, (0.72, 0.90, 1.0), 1.0)      # icy edge kick, right
add_area("Lime", (-1.8, -1.8, 1.0), 40, (0.72, 1.0, 0.24), 1.4)     # faint brand kick, low-left

scene.render.filepath = f"{out_dir}/lab-matcap.png"
bpy.ops.render.render(write_still=True)
print(f"[gen_crystals] wrote {out_dir}/lab-matcap.png")


# ---- INTERIOR: refraction light — a bright caustic heart that dims
#      to deep glacial blue at grazing angles; noise mottling reads
#      as internal fracture planes catching light ----
scene, sphere = matcap_scene()
mat = bpy.data.materials.new("MatcapIceInt")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1.0)
bsdf.inputs["Roughness"].default_value = 1.0

lw = nt.nodes.new("ShaderNodeLayerWeight")
lw.inputs["Blend"].default_value = 0.42
ramp = nt.nodes.new("ShaderNodeValToRGB")     # INVERTED vs exterior: bright CORE
# NB: Layer Weight "Facing" is 0 facing the camera, 1 at grazing.
ramp.color_ramp.elements[0].position = 0.0
ramp.color_ramp.elements[0].color = (0.085, 0.20, 0.42, 1.0)  # facing → lit glacial heart
ramp.color_ramp.elements[1].position = 0.72
ramp.color_ramp.elements[1].color = (0.003, 0.010, 0.036, 1.0)  # grazing → near-black deep
mid = ramp.color_ramp.elements.new(0.26)
mid.color = (0.028, 0.085, 0.22, 1.0)

noise = nt.nodes.new("ShaderNodeTexNoise")
noise.inputs["Scale"].default_value = 7.0
noise.inputs["Detail"].default_value = 8.0
noise.inputs["Distortion"].default_value = 1.6                # streaked, fracture-plane feel
nramp = nt.nodes.new("ShaderNodeValToRGB")    # caustic mottle mask
nramp.color_ramp.elements[0].position = 0.60
nramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
nramp.color_ramp.elements[1].position = 0.74
nramp.color_ramp.elements[1].color = (0.42, 0.68, 0.95, 1.0)
mixc = nt.nodes.new("ShaderNodeMix")
mixc.data_type = "RGBA"
mixc.blend_type = "ADD"
mixc.inputs["Factor"].default_value = 0.45
nt.links.new(lw.outputs["Facing"], ramp.inputs["Fac"])
nt.links.new(noise.outputs["Fac"], nramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], mixc.inputs["A"])
nt.links.new(nramp.outputs["Color"], mixc.inputs["B"])
nt.links.new(mixc.outputs["Result"], bsdf.inputs["Emission Color"])
bsdf.inputs["Emission Strength"].default_value = 0.9
sphere.data.materials.append(mat)

scene.render.filepath = f"{out_dir}/lab-matcap-int.png"
bpy.ops.render.render(write_still=True)
print(f"[gen_crystals] wrote {out_dir}/lab-matcap-int.png")
