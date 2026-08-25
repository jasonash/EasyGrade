#!/usr/bin/env python3
"""Generate every icon asset from docs/app_icon/icon.png.

Outputs (all committed):
  build/icon.png            1024x1024 full-bleed, used by electron-builder for Windows (ico is generated)
  build/icon.icns           macOS icon set; the art sits in an 824 px box on a 1024 canvas per Apple's template
  build/icons/NxN.png       Linux sizes
  resources/icon.png        512x512 full-bleed, shipped as an extra resource for runtime use (splash screen)
  build/dmg-background.png  540x380 DMG window background, plus @2x at 1080x760

Run from the project root: python3 scripts/make-icons.py
Requires Pillow (pip install pillow) and macOS iconutil for the .icns.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "docs" / "app_icon" / "icon.png"
BUILD = ROOT / "build"
RESOURCES = ROOT / "resources"

# Apple's icon template: a 1024 canvas with the rounded square filling 824 px.
MAC_CANVAS = 1024
MAC_ART = 824
LINUX_SIZES = [16, 32, 48, 64, 128, 256, 512]
ICONSET = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
]

BACKGROUND = (20, 23, 28)  # DARK_BACKGROUND in src/main/index.ts
BACKGROUND_END = (30, 35, 48)
ACCENT = (139, 148, 232)  # the icon's periwinkle
TEXT = (238, 240, 245)


def load_square_source() -> Image.Image:
    """Center the (nearly square) source on a transparent square canvas."""
    src = Image.open(SOURCE).convert("RGBA")
    side = max(src.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(src, ((side - src.width) // 2, (side - src.height) // 2), src)
    return canvas


def full_bleed(square: Image.Image, size: int) -> Image.Image:
    return square.resize((size, size), Image.LANCZOS)


def mac_icon(square: Image.Image, size: int) -> Image.Image:
    """Art inset per Apple's template so it sits level with other Dock icons."""
    art = round(size * MAC_ART / MAC_CANVAS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    resized = square.resize((art, art), Image.LANCZOS)
    offset = (size - art) // 2
    canvas.paste(resized, (offset, offset), resized)
    return canvas


def write_icns(square: Image.Image) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        iconset = Path(tmp) / "icon.iconset"
        iconset.mkdir()
        for name, size in ICONSET:
            mac_icon(square, size).save(iconset / name)
        subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(BUILD / "icon.icns")], check=True)


def font(size: int) -> ImageFont.FreeTypeFont:
    for candidate in ["/System/Library/Fonts/HelveticaNeue.ttc", "/System/Library/Fonts/Helvetica.ttc"]:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default(size)  # type: ignore[return-value]


def dmg_background(square: Image.Image, scale: int) -> Image.Image:
    """Dark gradient, app name, and an arrow between the two DMG slots (130,220) and (410,220)."""
    w, h = 540 * scale, 380 * scale
    img = Image.new("RGB", (w, h), BACKGROUND)
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        color = tuple(round(a + (b - a) * t) for a, b in zip(BACKGROUND, BACKGROUND_END))
        for x in range(w):
            px[x, y] = color

    draw = ImageDraw.Draw(img)
    title = "EASYGRADE"
    title_font = font(34 * scale)
    tw = draw.textlength(title, font=title_font)
    draw.text(((w - tw) / 2, 52 * scale), title, font=title_font, fill=TEXT)
    sub = "Drag to Applications to install"
    sub_font = font(13 * scale)
    sw = draw.textlength(sub, font=sub_font)
    draw.text(((w - sw) / 2, 100 * scale), sub, font=sub_font, fill=tuple(round(c * 0.7) for c in TEXT))

    # Arrow between the icon slot and the Applications slot (slots are 128 px wide, centered on x=130 and x=410).
    y = 220 * scale
    x0, x1 = 215 * scale, 325 * scale
    width = 4 * scale
    draw.line([(x0, y), (x1, y)], fill=ACCENT, width=width)
    head = 16 * scale
    draw.polygon([(x1 + 2 * scale, y), (x1 - head, y - head * 0.7), (x1 - head, y + head * 0.7)], fill=ACCENT)
    return img


def main() -> None:
    BUILD.mkdir(exist_ok=True)
    (BUILD / "icons").mkdir(exist_ok=True)
    RESOURCES.mkdir(exist_ok=True)
    square = load_square_source()

    full_bleed(square, 1024).save(BUILD / "icon.png")
    full_bleed(square, 512).save(RESOURCES / "icon.png")
    for size in LINUX_SIZES:
        full_bleed(square, size).save(BUILD / "icons" / f"{size}x{size}.png")
    write_icns(square)

    dmg_background(square, 2).save(BUILD / "dmg-background@2x.png")
    dmg_background(square, 2).resize((540, 380), Image.LANCZOS).save(BUILD / "dmg-background.png")

    print("wrote", ", ".join(str(p.relative_to(ROOT)) for p in [BUILD / "icon.png", BUILD / "icon.icns", BUILD / "icons", RESOURCES / "icon.png", BUILD / "dmg-background.png"]))
    if shutil.which("iconutil") is None:
        print("warning: iconutil not found, icon.icns was not written")


if __name__ == "__main__":
    main()
