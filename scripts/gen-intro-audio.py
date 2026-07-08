#!/usr/bin/env python3
"""Generate the royalty-free Stackime intro sound (owned audio, no licensing).

A 3.4s cue aligned to the splash timeline: a soft tick as the outline
starts drawing (0.3s), an airy noise riser swelling underneath, and a
clean signal "ping" right as the sheen sweeps the letters (~2.35s).

Usage (same venv as gen-intro-video.py):
  /tmp/vgen/bin/python scripts/gen-intro-audio.py

Output: src/assets/video/intro-sound.m4a (AAC, mono, ~40 KB)
"""
import subprocess
import tempfile
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np

SR = 44100
T = 3.4
N = int(SR * T)


def main() -> None:
    t = np.arange(N) / SR

    # airy whoosh: noise through a rising one-pole lowpass, swelling to the sheen
    noise = np.random.default_rng(7).standard_normal(N)
    alpha = np.linspace(0.02, 0.38, N)
    lp = np.empty(N)
    acc = 0.0
    for i in range(N):
        acc += alpha[i] * (noise[i] - acc)
        lp[i] = acc
    swell = np.clip(t / 2.2, 0, 1) ** 2.2 * np.exp(-np.maximum(t - 2.35, 0) * 6)
    whoosh = lp * swell * 0.9

    # sub riser gliding up beneath the whoosh
    riser = np.sin(2 * np.pi * (60 * t + (150 - 60) * t ** 2 / (2 * T))) * swell * 0.25

    # signal ping at the sheen sweep (2.35s) — bell-ish partials, fast decay
    tp = np.maximum(t - 2.35, 0)
    ping = (np.sin(2 * np.pi * 1244 * tp)
            + 0.5 * np.sin(2 * np.pi * 1866 * tp)
            + 0.25 * np.sin(2 * np.pi * 2488 * tp))
    ping *= np.exp(-tp * 5.5) * (t >= 2.35) * 0.7

    # soft tick when the stroke draw begins (0.3s)
    tt = np.maximum(t - 0.3, 0)
    tick = np.sin(2 * np.pi * 880 * tt) * np.exp(-tt * 30) * (t >= 0.3) * 0.25

    mix = whoosh + riser + ping + tick
    mix *= np.clip((T - t) / 0.35, 0, 1)  # tail fade so the cut is clean
    mix = mix / np.max(np.abs(mix)) * 0.72

    out = Path(__file__).resolve().parent.parent / "src" / "assets" / "video" / "intro-sound.m4a"
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        with wave.open(tmp.name, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes((mix * 32767).astype(np.int16).tobytes())
        subprocess.run(
            [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-i", tmp.name,
             "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(out)],
            check=True, capture_output=True,
        )
    print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
