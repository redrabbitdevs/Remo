#!/usr/bin/env python3
"""Render the Remo app icon (PNG sizes, Windows .ico, Android mipmaps) with Pillow.

Usage: python3 scripts/gen_icons.py
"""
import math
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 1024  # master size


def master(rounded=True):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    grad = Image.new("RGBA", (S, S))
    gd = ImageDraw.Draw(grad)
    a, b = (0x2A, 0xA7, 0xFF), (0x07, 0x57, 0xB5)
    for i in range(2 * S):
        t = i / (2 * S)
        c = tuple(int(a[k] + (b[k] - a[k]) * t) for k in range(3)) + (255,)
        gd.line([(i, 0), (0, i)], fill=c, width=2)
    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    if rounded:
        md.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
    else:
        md.rectangle([0, 0, S, S], fill=255)
    img.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(img)
    cx = cy = S / 2
    r = S * 0.30
    w = int(S * 0.058)
    for k in range(3):
        ang = math.radians(90 + k * 60)
        dx, dy = math.cos(ang) * r, math.sin(ang) * r
        d.line([(cx - dx, cy - dy), (cx + dx, cy + dy)], fill="white", width=w)
        for sgn in (1, -1):
            ex, ey = cx + sgn * dx * 0.72, cy + sgn * dy * 0.72
            for side in (-1, 1):
                ba = ang + (math.pi if sgn < 0 else 0) + side * math.radians(140)
                d.line([(ex, ey), (ex + math.cos(ba) * r * 0.28, ey + math.sin(ba) * r * 0.28)], fill="white", width=int(w * 0.8))
    for k in range(6):
        ang = math.radians(90 + k * 60)
        d.ellipse([cx + math.cos(ang) * r - w / 2, cy + math.sin(ang) * r - w / 2, cx + math.cos(ang) * r + w / 2, cy + math.sin(ang) * r + w / 2], fill="white")
    d.ellipse([cx - w * 0.9, cy - w * 0.9, cx + w * 0.9, cy + w * 0.9], fill="white")
    return img


def save(img, path, size):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(path)


def main():
    rounded = master(True)
    square = master(False)
    web = os.path.join(ROOT, "apps", "web", "public")
    save(rounded, os.path.join(web, "icon-192.png"), 192)
    save(rounded, os.path.join(web, "icon-512.png"), 512)
    desk = os.path.join(ROOT, "apps", "desktop", "build")
    os.makedirs(desk, exist_ok=True)
    save(rounded, os.path.join(desk, "icon.png"), 512)
    rounded.resize((256, 256), Image.LANCZOS).save(os.path.join(desk, "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    res = os.path.join(ROOT, "apps", "mobile", "android", "app", "src", "main", "res")
    if os.path.isdir(res):
        for name, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
            save(rounded, os.path.join(res, f"mipmap-{name}", "ic_launcher.png"), px)
            save(rounded, os.path.join(res, f"mipmap-{name}", "ic_launcher_round.png"), px)
            fg = int(px * 108 / 48)
            save(square, os.path.join(res, f"mipmap-{name}", "ic_launcher_foreground.png"), fg)
        # Splash screens: keep each template's size, dark background + centred icon.
        for dirpath, _dirs, files in os.walk(res):
            if "splash.png" in files:
                path = os.path.join(dirpath, "splash.png")
                w, h = Image.open(path).size
                bg = Image.new("RGBA", (w, h), (0x0E, 0x16, 0x21, 255))
                side = max(48, int(min(w, h) * 0.28))
                ic = rounded.resize((side, side), Image.LANCZOS)
                bg.paste(ic, ((w - side) // 2, (h - side) // 2), ic)
                bg.convert("RGB").save(path)
    print("icons written", file=sys.stderr)


if __name__ == "__main__":
    main()
