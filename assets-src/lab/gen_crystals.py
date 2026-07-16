# gen_crystals.py — authored 3D assets for /lab.html ("Deep Signal")
# v3 "Prismatic": HIGH-POLY quartz — beveled facet edges, growth
# striations along the prism faces, stepped multi-face terminations,
# parasite micro-crystals on the cluster shards — plus a low-detail
# LOD1 copy of every shard for far depth bands, and 1024² matcaps.
# Run headless:
#   /opt/homebrew/bin/blender --background --factory-startup \
#     --python assets-src/lab/gen_crystals.py -- <out_dir>
#
# Writes to <out_dir>:
#   lab-crystals-raw.glb  — Shard0..Shard5 (high-poly) + Shard0_LOD1..
#                           Shard5_LOD1 (v2-density far geometry, same
#                           +Y growth axis & silhouette) + hero Gem
#                           (scripts/build-3d.mjs draco-compresses this
#                            into src/assets/3d/lab-crystals.glb)
#   lab-matcap.png        — 1024² EXTERIOR studio-ice matcap (Cycles)
#   lab-matcap-int.png    — 1024² INTERIOR refraction matcap (sampled
#                           along refract(v,n) at runtime; also fed to
#                           the R/G/B dispersion taps)
#
# Deterministic: seeded RNG, fixed sample counts, zero unseeded calls.
# Local +Y is the growth axis on EVERY shard and LOD — the runtime
# placement quaternions depend on it.

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
# HIGH-POLY quartz spike. Real quartz habit: irregular hexagonal
# prism (never a regular hexagon), horizontal growth striations on
# the prism faces, slight taper, and a STEPPED asymmetric six-face
# termination (an intermediate shoulder ring before the off-axis
# apex — natural points nearly always break the taper twice).
# The bevel modifier added per-object turns every hard edge into a
# thin catch-light strip; that is where the high-poly read comes from.
# ------------------------------------------------------------------
N_STRIA = 7  # intermediate striation rings along the prism body


def crystal_bmesh(bm, rnd, elong, base_r, tip_len, apex_off, xform, hi=True):
    jit = [rnd.uniform(0.72, 1.12) for _ in range(6)]          # irregular hexagon
    ang0 = rnd.uniform(0.0, math.tau)
    y_root = -elong * 0.5
    y_neck = elong * 0.5
    taper = rnd.uniform(0.82, 0.94)                            # prism narrows upward
    stria_ph = rnd.uniform(0.0, math.tau)
    stria_amp = rnd.uniform(0.015, 0.035)
    n_rings = (2 + N_STRIA) if hi else 2                       # LOD1 = v2 topology

    rings = []
    for k in range(n_rings):
        t = k / (n_rings - 1)
        y = y_root + (y_neck - y_root) * t
        scale = 1.0 + (taper - 1.0) * t
        if hi and 0 < k < n_rings - 1:
            # growth striation: gentle radial banding + tiny ring wobble
            scale *= 1.0 + stria_amp * math.sin(t * 9.5 + stria_ph)
            y += rnd.uniform(-0.02, 0.02) * elong
        ring = []
        for i in range(6):
            a = ang0 + i * math.tau / 6.0
            r = base_r * jit[i] * scale
            ring.append(bm.verts.new(xform @ Vector((math.cos(a) * r, y, math.sin(a) * r))))
        rings.append(ring)

    bm.faces.new(list(reversed(rings[0])))                     # root cap
    for k in range(n_rings - 1):
        r0, r1 = rings[k], rings[k + 1]
        for i in range(6):
            j = (i + 1) % 6
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))         # prism facet band

    neck = rings[-1]
    if hi:
        # stepped termination: shoulder ring at reduced radius, then apex
        sh_t = rnd.uniform(0.38, 0.52)
        sh_scale = rnd.uniform(0.48, 0.62)
        shoulder = []
        for i in range(6):
            a = ang0 + i * math.tau / 6.0
            r = base_r * jit[i] * taper * sh_scale
            y = y_neck + tip_len * sh_t + rnd.uniform(-0.03, 0.03) * tip_len
            shoulder.append(bm.verts.new(xform @ Vector((
                math.cos(a) * r + apex_off[0] * sh_t,
                y,
                math.sin(a) * r + apex_off[1] * sh_t,
            ))))
        apex = bm.verts.new(xform @ Vector((apex_off[0], y_neck + tip_len, apex_off[1])))
        for i in range(6):
            j = (i + 1) % 6
            bm.faces.new((neck[i], neck[j], shoulder[j], shoulder[i]))
            bm.faces.new((shoulder[i], shoulder[j], apex))
    else:
        apex = bm.verts.new(xform @ Vector((apex_off[0], y_neck + tip_len, apex_off[1])))
        for i in range(6):
            j = (i + 1) % 6
            bm.faces.new((neck[i], neck[j], apex))


def make_crystal(name, seed, spikes, hi=True, bevel_w=0.022):
    """spikes: list of (elong, base_r, tip_len, lean_deg, azim_deg, y_shift)"""
    rnd = random.Random(seed)
    bm = bmesh.new()
    for elong, base_r, tip_len, lean, azim, y_shift in spikes:
        apex_off = (rnd.uniform(-0.14, 0.14) * base_r, rnd.uniform(-0.14, 0.14) * base_r)
        rot = Matrix.Rotation(math.radians(azim), 4, "Y") @ Matrix.Rotation(math.radians(lean), 4, "X")
        xform = Matrix.Translation(Vector((0.0, y_shift, 0.0))) @ rot
        crystal_bmesh(bm, rnd, elong, base_r, tip_len, apex_off, xform, hi=hi)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False                                # crisp flat facets
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if hi:
        bev = obj.modifiers.new("Bevel", "BEVEL")              # edge catch-light strips
        bev.width = bevel_w
        bev.segments = 2
        bev.limit_method = "ANGLE"
        bev.angle_limit = math.radians(28)
    return obj


# spike recipes — IDENTICAL params to v2 so silhouettes, placement and
# birth choreography read the same; parasite micro-crystals appended
# on the cluster habits (Shard3 gets one, Shard4/5 get two).
SPIKES = {
    "Shard0": [(2.9, 0.40, 1.10, 0, 0, 0)],                    # long needle
    "Shard1": [(2.1, 0.60, 0.80, 0, 0, 0)],                    # stout prism
    "Shard2": [(3.4, 0.34, 1.30, 0, 0, 0)],                    # hair-fine spike
    "Shard3": [(2.5, 0.50, 0.95, 0, 0, 0),                     # classic point +
               (0.7, 0.14, 0.30, 52, 205, -0.85)],             #   parasite
    "Shard4": [(2.7, 0.46, 1.00, 0, 0, 0),                     # twin: main +
               (1.6, 0.30, 0.62, 34, 140, -0.55),              #   leaning child
               (0.6, 0.12, 0.26, 60, 320, -0.95)],             #   parasite
    "Shard5": [(2.3, 0.42, 0.85, 0, 0, 0),                     # triplet cluster
               (1.4, 0.26, 0.55, 28, 40, -0.45),
               (1.1, 0.22, 0.48, 42, 250, -0.62),
               (0.55, 0.11, 0.24, 66, 155, -0.80)],            #   parasite
}
SEEDS = {"Shard0": 101, "Shard1": 202, "Shard2": 303,
         "Shard3": 404, "Shard4": 505, "Shard5": 606}

shards = []
for i, name in enumerate(sorted(SPIKES)):
    hi = make_crystal(name, SEEDS[name], SPIKES[name], hi=True)
    lo = make_crystal(name + "_LOD1", SEEDS[name], SPIKES[name], hi=False)
    hi.location.x = (i - 2.5) * 1.8
    lo.location.x = (i - 2.5) * 1.8
    lo.location.z = 3.0
    shards += [hi, lo]


# ------------------------------------------------------------------
# hero gem — a DENSE golden-angle hull (v3: 90 pts, was 30) with a
# multi-segment bevel so every edge carries a soft glint strip.
# ------------------------------------------------------------------
def make_gem(name, seed=777, n_pts=90):
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
    bev.width = 0.035
    bev.segments = 3
    bev.limit_method = "ANGLE"
    bev.angle_limit = math.radians(12)
    return obj


gem = make_gem("Gem")
gem.location.y = 3.2

# report post-modifier triangle counts (build sanity: hi-poly targets)
dg = bpy.context.evaluated_depsgraph_get()
for o in shards + [gem]:
    ev = o.evaluated_get(dg)
    m = ev.to_mesh()
    m.calc_loop_triangles()
    print(f"[gen_crystals] {o.name}: {len(m.loop_triangles)} tris")
    ev.to_mesh_clear()

bpy.ops.export_scene.gltf(
    filepath=f"{out_dir}/lab-crystals-raw.glb",
    export_format="GLB",
    export_apply=True,   # bake all bevel modifiers
    export_yup=True,
)
print(f"[gen_crystals] wrote {out_dir}/lab-crystals-raw.glb")


# ------------------------------------------------------------------
# matcap bakes — orthographic camera on a unit sphere, Cycles. The
# runtime samples the EXTERIOR map by view-space normal and the
# INTERIOR map by the refracted view vector, so these two renders
# ARE the entire crystal lighting model. v3: 1024² / 256 samples —
# at 512 the fine bevel strips alias.
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
    sc.cycles.samples = 256
    sc.cycles.use_denoising = True
    sc.render.resolution_x = 1024
    sc.render.resolution_y = 1024
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
#      cold rim, faint brand-lime kick low-left, and (v3) a thin
#      bright halo ring that the new bevel strips catch as glints ----
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
# v3 halo ring: 8 slim strips around the equator — thin bright arcs the
# bevel strips sweep through as instances rotate past the camera
# low energy: mc is squared in the runtime shader, so even faint strips
# read — anything stronger tips the whole body toward washed pastel
for hi in range(8):
    a = hi * math.tau / 8.0
    add_area(f"Halo{hi}", (2.6 * math.cos(a), 2.6 * math.sin(a), 0.9),
             7, (0.88, 0.96, 1.0), 0.22)

scene.render.filepath = f"{out_dir}/lab-matcap.png"
bpy.ops.render.render(write_still=True)
print(f"[gen_crystals] wrote {out_dir}/lab-matcap.png")


# ---- INTERIOR: refraction light — a bright caustic heart that dims
#      to deep glacial blue at grazing angles; noise mottling reads
#      as internal fracture planes catching light. v3: finer fracture
#      (scale 10 / detail 12) — heart brightness is UNCHANGED from v2
#      (emission 0.9 / ADD 0.45 / ramp 0.60→0.74: three v2 bake
#      iterations found the ACES+bloom blow-out ceiling; do not raise).
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
noise.inputs["Scale"].default_value = 10.0
noise.inputs["Detail"].default_value = 12.0
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
nt.links.new(nramp.outputs["Color"], mixc.inputs["B"])
nt.links.new(ramp.outputs["Color"], mixc.inputs["A"])
nt.links.new(mixc.outputs["Result"], bsdf.inputs["Emission Color"])
bsdf.inputs["Emission Strength"].default_value = 0.9
sphere.data.materials.append(mat)

scene.render.filepath = f"{out_dir}/lab-matcap-int.png"
bpy.ops.render.render(write_still=True)
print(f"[gen_crystals] wrote {out_dir}/lab-matcap-int.png")
