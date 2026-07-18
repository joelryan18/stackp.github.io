# gen_setpieces.py — authored 3D assets for /lab.html v6 ("Deep Signal — The Ruin")
# The shaft is revealed as BUILT: one hand-made stone remnant per chapter.
# Run headless:
#   /opt/homebrew/bin/blender --background --factory-startup \
#     --python assets-src/lab/gen_setpieces.py -- <out_dir>
#
# Writes to <out_dir>:
#   lab-setpieces-raw.glb — five named objects (runtime finds them BY NAME,
#   missing names throw to the no3d fallback):
#     Gate    — broken hexagonal portal: two lathed jamb columns carrying
#               graduation-tick geometry, a fractured lintel (both halves
#               kept, one tumbled off-axis). Local +Z is "through" — the
#               runtime orients +Z along the camera rail so you pass
#               through the frame. Inner clearance r≈3.4.
#     Slab0/1/2 — three sheared strata-slab variants for the descent
#               stair. Sediment banding is carried in VERTEX COLOR R
#               (0 = base rock, 1 = band) so the runtime can lerp bands
#               toward the live chapter climate.
#     Cradle  — three mirrored machined arms rising to hold the core
#               heart, plus a keystone plinth with an empty hex socket.
#               Arm-length parameter 0(root)..1(tip) in VERTEX COLOR R
#               drives the runtime charge-fill light strip.
#     GateFar — the INTACT twin of the Gate (whole lintel, no tumble) —
#               the resurface bookend, silhouetted far overhead.
#
# Reuses the lab crystal matcaps at runtime — no new bake in this pass.
# Deterministic: seeded RNG only, fixed counts.
#
# AXES: geometry is deliberately authored with **Y as up** (three.js
# convention), NOT Blender's Z-up — so the export runs with
# export_yup=False (no axis conversion; the file carries the authored
# coordinates verbatim). With the default export_yup=True the exporter
# maps Blender (x,y,z) → glTF (x,z,−y) and every piece lands on its
# side (the v6 review caught exactly that: gate columns spanning −Z).
# (scripts/build-3d.mjs "labgeo" bundle draco-compresses the glb; the
#  bundle sets matcap:null so steps 1–2 run and step 3 is skipped.)

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
# helpers
# ------------------------------------------------------------------
def add_box(bm, size, at, rot=Matrix.Identity(4)):
    """Box of full extents `size`, centered at `at`, pre-rotated by `rot`."""
    m = Matrix.Translation(Vector(at)) @ rot @ Matrix.Diagonal((size[0], size[1], size[2], 1.0))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


def finish(bm, name, bevel_w=0.03, bevel_angle=30, vcol=None):
    """bm → flat-shaded object with a catch-light bevel. `vcol` optionally
    paints vertex color R from a callable f(world_co) -> 0..1."""
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    if vcol is not None:
        layer = mesh.color_attributes.new(name="Col", type="BYTE_COLOR", domain="CORNER")
        for li, loop in enumerate(mesh.loops):
            v = vcol(mesh.vertices[loop.vertex_index].co)
            layer.data[li].color = (v, v, v, 1.0)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bev = obj.modifiers.new("Bevel", "BEVEL")
    bev.width = bevel_w
    bev.segments = 2
    bev.limit_method = "ANGLE"
    bev.angle_limit = math.radians(bevel_angle)
    return obj


# ------------------------------------------------------------------
# GATE — broken hexagonal portal. Two jamb columns (lathed, hexagonal
# via 6-step spin) rise to y≈4.4; the lintel spans them but is SNAPPED:
# the left half still seats on its jamb, the right half lies tumbled
# at the base. Graduation ticks (real boxes) band each jamb — the
# machined signal, same language as the About bezel.
# Local axes: X = span, Y = up, +Z = through (runtime aims +Z down-rail).
# Inner clearance: jambs at x ±4.2, lintel underside y ≈ 3.5.
# ------------------------------------------------------------------
def make_gate(name, broken=True, seed=41):
    rnd = random.Random(seed)
    bm = bmesh.new()

    def jamb(x_at, tilt_deg):
        prof = [  # (r, y) closed silhouette of one column, r is half-thickness
            (0.62, -0.5), (0.70, -0.30), (0.52, -0.18),   # footing
            (0.46, 3.10), (0.58, 3.26), (0.58, 3.52), (0.0, 3.52), (0.0, -0.5),
        ]
        jb = bmesh.new()
        verts = [jb.verts.new((r, y, 0.0)) for (r, y) in prof]
        edges = [jb.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
        bmesh.ops.spin(jb, geom=verts + edges, cent=(0, 0, 0), axis=(0, 1, 0),
                       angle=math.tau, steps=6, use_duplicate=False)  # hexagonal column
        bmesh.ops.remove_doubles(jb, verts=jb.verts, dist=1e-4)
        # graduation ticks: 9 minor bands on the outer face
        for k in range(9):
            y = 0.35 + k * 0.31
            w = 0.085 if k % 3 else 0.16
            add_box(jb, (0.09, w, 0.09), (0.52, y, 0.0))
        m = (Matrix.Translation(Vector((x_at, 0.0, 0.0)))
             @ Matrix.Rotation(math.radians(tilt_deg), 4, "Z"))
        jb.transform(m)
        tm = bpy.data.meshes.new("tmp")
        jb.to_mesh(tm)
        jb.free()
        bm.from_mesh(tm)
        bpy.data.meshes.remove(tm)

    jamb(-4.2, -1.5 if broken else 0.0)   # left jamb leans a hair when ruined
    jamb(4.2, 2.5 if broken else 0.0)

    # lintel: a hex-profiled beam across the top (full extents 9.6 long)
    lin_rot = Matrix.Rotation(math.radians(90), 4, "Z")  # beam axis along X
    if not broken:
        add_box(bm, (9.6, 0.85, 0.85), (0.0, 3.95, 0.0))
        add_box(bm, (0.5, 0.32, 1.0), (0.0, 4.5, 0.0))  # keystone nub on top
    else:
        # left half still seated (slightly slumped), right half tumbled below
        add_box(bm, (4.6, 0.85, 0.85), (-2.05, 3.86, 0.0),
                Matrix.Rotation(math.radians(-3.0), 4, "Z"))
        add_box(bm, (4.3, 0.82, 0.82), (3.1, -0.05, 1.3),
                Matrix.Rotation(math.radians(14), 4, "Z")
                @ Matrix.Rotation(math.radians(38), 4, "Y"))
        # fracture stubs where the beam snapped
        add_box(bm, (0.5, 0.6, 0.6), (0.25, 3.78, 0.0),
                Matrix.Rotation(math.radians(9), 4, "Y"))
    # vcol R = 0 everywhere: gates are BASE rock, no sediment band.
    # Without a baked COLOR_0 three's missing-attribute default is
    # WHITE (1,1,1) → the stone shader's uBand·vCol term would wash
    # both gates with the full chapter tint.
    return finish(bm, name, bevel_w=0.035, vcol=lambda co: 0.0)


gate = make_gate("Gate", broken=True)
gate_far = make_gate("GateFar", broken=False, seed=42)
gate_far.location.z = -14.0  # park variants apart in the file; runtime re-places


# ------------------------------------------------------------------
# SLABS — three sheared strata variants. Each is a stack of 3 offset
# beds (the shear) with thin proud bands between them; vertex color R
# marks the band beds so the runtime tints them toward the climate.
# Local +Y up, X the long axis. ~2.4 × 0.8 × 1.4 overall.
# ------------------------------------------------------------------
def make_slab(name, seed):
    rnd = random.Random(seed)
    bm = bmesh.new()
    y = 0.0
    band_ys = []
    for bed in range(3):
        h = rnd.uniform(0.16, 0.30)
        shear = rnd.uniform(-0.28, 0.28)
        ln = rnd.uniform(2.0, 2.6)
        add_box(bm, (ln, h, rnd.uniform(1.1, 1.5)), (shear, y + h / 2, rnd.uniform(-0.1, 0.1)),
                Matrix.Rotation(rnd.uniform(-0.06, 0.06), 4, "Y"))
        y += h
        if bed < 2:  # proud sediment band between beds
            bh = 0.05
            add_box(bm, (ln * 0.96, bh, 1.32), (shear * 0.7, y + bh / 2, 0.0))
            band_ys.append(y + bh / 2)
            y += bh
    bands = list(band_ys)
    def vcol(co):
        return 1.0 if any(abs(co.y - by) < 0.045 for by in bands) else 0.0
    return finish(bm, name, bevel_w=0.02, vcol=vcol)


for i in range(3):
    s = make_slab(f"Slab{i}", seed=100 + i)
    s.location.x = -8.0 + i * 3.0
    s.location.z = -7.0


# ------------------------------------------------------------------
# CRADLE — three machined arms (mirrored ×3 around Y) rising from a
# ring base to hold the heart gem (runtime gem sits at local (0, 3.1, 0),
# scale 2.1 ⇒ arms reach r≈2.6 at the grip). A keystone plinth with an
# empty hexagonal socket stands at the base — the v6 memory payoff seats
# a gem fragment into it. Vertex color R = arm-length param 0..1 (root→
# tip) for the runtime charge-fill strip; plinth/base are 0.
# ------------------------------------------------------------------
def make_cradle(name):
    bm = bmesh.new()
    # base ring: 12-step spun washer
    prof = [(2.9, 0.0), (3.5, 0.0), (3.5, 0.35), (3.25, 0.5), (2.9, 0.5)]
    verts = [bm.verts.new((r, y, 0.0)) for (r, y) in prof]
    edges = [bm.edges.new((verts[i], verts[(i + 1) % len(verts)])) for i in range(len(verts))]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 1, 0),
                   angle=math.tau, steps=12, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)

    ARM_Y0, ARM_Y1 = 0.5, 3.0  # vertical run of each arm (vcol ramps over this)
    for k in range(3):
        rot = Matrix.Rotation(k * math.tau / 3, 4, "Y")
        # arm: ONE continuous beam leaning inward (root r=3.1 → grip
        # r≈2.0), tilted about Z so the whole strut reads as a single
        # machined member. add_box rotates about the box's own center,
        # so the ×3 mirror rotates the POSITION too: at = rot @ local.
        run = ARM_Y1 - ARM_Y0
        lean = math.atan2(1.1, run)  # inward travel / vertical run
        arm_len = math.hypot(run, 1.1) + 0.3
        mid = Vector(((3.1 + 2.0) / 2, (ARM_Y0 + ARM_Y1) / 2 + 0.25, 0.0))
        add_box(bm, (0.42, arm_len, 0.34), rot @ mid,
                rot @ Matrix.Rotation(lean, 4, "Z"))
        # grip pad angled toward the gem, overlapping the beam tip
        add_box(bm, (0.55, 0.2, 0.62), rot @ Vector((1.95, ARM_Y1 + 0.32, 0.0)),
                rot @ Matrix.Rotation(math.radians(24), 4, "Z"))
        # graduation ring collar seated over the arm root
        add_box(bm, (0.62, 0.22, 0.56), rot @ Vector((3.05, ARM_Y0 + 0.28, 0.0)),
                rot @ Matrix.Rotation(lean, 4, "Z"))

    # keystone plinth + empty hex socket (an open hex well: 6 wall boxes)
    add_box(bm, (1.0, 0.7, 1.0), (0.0, 0.35, 3.9))
    for k in range(6):
        a = k * math.tau / 6
        rot = Matrix.Rotation(a, 4, "Y")
        wall = (Matrix.Translation(Vector((0.0, 0.85, 3.9)))
                @ rot @ Matrix.Translation(Vector((0.34, 0.0, 0.0))))
        add_box(bm, (0.1, 0.3, 0.42), (0, 0, 0), wall)

    def vcol(co):
        rr = math.hypot(co.x, co.z)
        if rr > 3.6 or co.y < ARM_Y0 or rr < 1.6:  # base ring / plinth / socket
            return 0.0
        return max(0.0, min(1.0, (co.y - ARM_Y0) / (ARM_Y1 - ARM_Y0)))
    return finish(bm, name, bevel_w=0.03, vcol=vcol)


cradle = make_cradle("Cradle")
cradle.location.z = 9.0

# report tri counts
dg = bpy.context.evaluated_depsgraph_get()
for o in [gate, gate_far, cradle] + [bpy.data.objects[f"Slab{i}"] for i in range(3)]:
    ev = o.evaluated_get(dg)
    m = ev.to_mesh()
    m.calc_loop_triangles()
    print(f"[gen_setpieces] {o.name}: {len(m.loop_triangles)} tris")
    ev.to_mesh_clear()

bpy.ops.export_scene.gltf(
    filepath=f"{out_dir}/lab-setpieces-raw.glb",
    export_format="GLB",
    export_apply=True,
    export_yup=False,  # geometry is authored Y-up already — see AXES note up top
)
print(f"[gen_setpieces] wrote {out_dir}/lab-setpieces-raw.glb")
