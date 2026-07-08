#!/usr/bin/env python3
"""Generate the royalty-free Stackime intro clip (owned art, no licensing).

Renders an anime-opening style motion background — horizontal speed-line
rush, drifting glow fields, and an AXON signal pulse sweeping through —
and encodes it to H.264 MP4 for the foreignObject <video> clipped inside
the STACKIME letters on /anime.html (see layouts/anime.njk).

Usage (one-off venv, keeps the system Python clean):
  python3 -m venv /tmp/vgen && /tmp/vgen/bin/pip install pillow imageio imageio-ffmpeg
  /tmp/vgen/bin/python scripts/gen-intro-video.py

Output: src/assets/video/intro-signal.mp4 (1280x288 @ 24fps, ~3.4s)
"""
import math
import random
from pathlib import Path

import imageio.v2 as imageio
from PIL import Image, ImageDraw, ImageFilter

W, H = 1280, 288  # both divisible by 16 → clean macroblocks
FPS = 24
SECONDS = 3.4
FRAMES = int(FPS * SECONDS)  # 81

LIME = (184, 255, 60)
TEAL = (60, 224, 200)
WHITE = (242, 244, 243)

rng = random.Random(818)  # deterministic → reproducible asset

# --- speed lines: the classic anime rush, streaking right → left ---
LINES = []
for _ in range(96):
    color = rng.choices([WHITE, LIME, TEAL], weights=[6, 3, 1])[0]
    LINES.append({
        "y": rng.uniform(6, H - 6),
        "x": rng.uniform(0, W * 2),
        "speed": rng.uniform(26, 78),
        "length": rng.uniform(90, 420),
        "width": rng.choice([1, 1, 2, 2, 3]),
        "alpha": rng.randint(36, 150),
        "color": color,
    })

# --- glow fields: big soft parallax blobs drifting slowly ---
BLOBS = []
for _ in range(6):
    BLOBS.append({
        "y": rng.uniform(30, H - 30),
        "x": rng.uniform(0, W),
        "speed": rng.uniform(1.5, 4.5),
        "r": rng.uniform(60, 130),
        "alpha": rng.randint(26, 48),
        "color": rng.choice([LIME, TEAL]),
    })


def pulse_y(x: float) -> float:
    """AXON logo heartbeat, repeated every 260px: flat — up — deep down — up — flat."""
    base = H * 0.52
    u = (x % 260.0) / 260.0
    if u < 0.35 or u >= 0.70:
        return base
    if u < 0.45:  # rise
        return base - 42 * (u - 0.35) / 0.10
    if u < 0.60:  # plunge through the baseline
        return base - 42 + 84 * (u - 0.45) / 0.15
    return base + 42 - 42 * (u - 0.60) / 0.10  # recover


def draw_frame(i: int) -> Image.Image:
    t = i / (FRAMES - 1)
    frame = Image.new("RGB", (W, H), (0, 0, 0))

    # glow fields (drawn small, blurred once per frame)
    glow = Image.new("RGB", (W // 4, H // 4), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for b in BLOBS:
        x = (b["x"] - i * b["speed"]) % (W + 2 * b["r"]) - b["r"]
        c = tuple(int(v * b["alpha"] / 255) for v in b["color"])
        gd.ellipse([(x - b["r"]) / 4, (b["y"] - b["r"]) / 4, (x + b["r"]) / 4, (b["y"] + b["r"]) / 4], fill=c)
    glow = glow.filter(ImageFilter.GaussianBlur(9)).resize((W, H))
    frame = Image.blend(frame, glow, 0.85)

    d = ImageDraw.Draw(frame, "RGBA")

    # speed lines with a brighter leading head
    for ln in LINES:
        span = W + ln["length"] * 2
        head = span - ((ln["x"] + i * ln["speed"]) % span) - ln["length"]
        tail = head + ln["length"]
        y = ln["y"]
        d.line([(head, y), (tail, y)], fill=(*ln["color"], ln["alpha"]), width=ln["width"])
        d.line([(head, y), (head + 14, y)], fill=(*ln["color"], min(255, ln["alpha"] + 90)), width=ln["width"])

    # signal pulse: faint ahead, bright behind the traveling head
    head_x = -160 + (W + 320) * (t ** 0.9)
    step = 6
    pts = [(x, pulse_y(x)) for x in range(0, W + step, step)]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 > head_x:
            a = 22  # not-yet-traced hint
        else:
            behind = head_x - x0
            a = max(22, int(230 * max(0.0, 1.0 - behind / 520.0)))
        d.line([(x0, y0), (x1, y1)], fill=(*LIME, a), width=2)
    if 0 <= head_x <= W:
        hy = pulse_y(head_x)
        halo = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        hd = ImageDraw.Draw(halo)
        hd.ellipse([head_x - 14, hy - 14, head_x + 14, hy + 14], fill=(*LIME, 110))
        frame.paste(Image.new("RGB", (W, H), (0, 0, 0)), (0, 0), halo.filter(ImageFilter.GaussianBlur(8)).point(lambda a: 0))
        frame = Image.alpha_composite(frame.convert("RGBA"), halo.filter(ImageFilter.GaussianBlur(6))).convert("RGB")
        d = ImageDraw.Draw(frame, "RGBA")
        d.ellipse([head_x - 4, hy - 4, head_x + 4, hy + 4], fill=(*WHITE, 255))

    # vignette bands top/bottom so the letters read as a lit core
    for k in range(40):
        a = int(120 * (1 - k / 40) ** 2)
        d.line([(0, k), (W, k)], fill=(0, 0, 0, a))
        d.line([(0, H - 1 - k), (W, H - 1 - k)], fill=(0, 0, 0, a))

    return frame


def main() -> None:
    out = Path(__file__).resolve().parent.parent / "src" / "assets" / "video" / "intro-signal.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)
    writer = imageio.get_writer(
        str(out), fps=FPS, codec="libx264", quality=7,
        pixelformat="yuv420p", macro_block_size=None,
    )
    try:
        import numpy as np
        for i in range(FRAMES):
            writer.append_data(np.asarray(draw_frame(i)))
    finally:
        writer.close()
    print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB, {FRAMES} frames @ {FPS}fps)")


if __name__ == "__main__":
    main()
