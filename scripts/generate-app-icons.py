#!/usr/bin/env python3
"""Regenerate every app-icon asset from the master Trendzo Retailer wordmark.

    python3 scripts/generate-app-icons.py [source.png]

Defaults to store-assets/retailer-logo-source.png. Requires Pillow
(`pip3 install Pillow`).

The source is the brand export: black wordmark on a white canvas, with whatever
padding the design tool baked in (the shipped one is 2000x2000 with the art
filling only 68% x 22% of it). Dropping that straight into an icon slot wastes
most of the icon on empty white, so the art is auto-cropped to its ink bounds
here and re-padded per target. Re-exporting the logo at a different canvas size
therefore needs no changes below.

Writes, all derived from that one crop:
  ios/TrendzoMockup/Images.xcassets/AppIcon.appiconset/icon_1024.png
  android/app/src/main/res/mipmap-*/ic_launcher.png
  android/app/src/main/res/mipmap-*/ic_launcher_round.png
  android/app/src/main/res/mipmap-*/ic_launcher_foreground.png
  store-assets/play-store-icon-512.png
"""

import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

REPO = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = REPO / 'store-assets' / 'retailer-logo-source.png'

WHITE = (255, 255, 255, 255)

# Fraction of the icon's width the wordmark spans.
#
# Square targets (iOS, legacy Android, Play): iOS's squircle and Play's rounded
# corners clip only the corners, so the wordmark is short enough to sit safely
# at 80% - it reads at the same size the Android launcher renders it (see below).
SQUARE_WIDTH_FRAC = 0.80
# Adaptive foreground: of the 108dp canvas only the centre 72dp is guaranteed
# visible, and round masks cut to a 66dp circle. A 3.16:1 lockup at 58% width is
# 63dp wide / 20dp tall -> 66dp diagonal, i.e. exactly inscribed in that circle.
# Rendered inside the 72dp mask this looks like ~88% of the visible icon, which
# is why the square targets above are set to a comparable 80%.
FOREGROUND_WIDTH_FRAC = 0.58

# Android density buckets: legacy launcher px, adaptive foreground px (108dp).
DENSITIES = {
    'mdpi': (48, 108),
    'hdpi': (72, 162),
    'xhdpi': (96, 216),
    'xxhdpi': (144, 324),
    'xxxhdpi': (192, 432),
}


def load_wordmark(path: Path) -> Image.Image:
    """Crop the export to its ink bounds and return it black-on-transparent.

    The art is pure black on pure white, so luminance inverts directly into the
    alpha channel - that keeps the anti-aliased glyph edges instead of the hard,
    fringed cutout a colour-key would leave.
    """
    src = Image.open(path).convert('RGB')
    flat = Image.new('RGB', src.size, (255, 255, 255))
    ink = ImageChops.difference(src, flat).convert('L')
    bbox = ink.point(lambda p: 255 if p > 12 else 0).getbbox()
    if bbox is None:
        raise SystemExit(f'{path}: no artwork found (image is blank white)')

    cropped = src.crop(bbox)
    alpha = ImageChops.invert(cropped.convert('L'))
    mark = Image.new('RGBA', cropped.size, (0, 0, 0, 0))
    mark.putalpha(alpha)
    return mark


def compose(mark: Image.Image, size: int, width_frac: float,
            background) -> Image.Image:
    """Centre the wordmark on a `size` square over `background`.

    `background` is an RGBA fill, or 'circle' for a white disc on transparency
    (Android's ic_launcher_round convention).
    """
    if background == 'circle':
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(canvas).ellipse((0, 0, size - 1, size - 1), fill=WHITE)
    else:
        canvas = Image.new('RGBA', (size, size), background)

    w = max(1, round(size * width_frac))
    h = max(1, round(w * mark.height / mark.width))
    canvas.alpha_composite(
        mark.resize((w, h), Image.LANCZOS),
        ((size - w) // 2, (size - h) // 2),
    )
    return canvas


def save(img: Image.Image, path: Path, *, alpha: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not alpha:
        # App Store rejects an icon with an alpha channel; flatten onto white.
        flat = Image.new('RGB', img.size, (255, 255, 255))
        flat.paste(img, mask=img.split()[3])
        img = flat
    img.save(path)
    print(f'  {path.relative_to(REPO)}  {img.size[0]}x{img.size[1]}')


def main() -> None:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source.exists():
        raise SystemExit(f'source not found: {source}')

    mark = load_wordmark(source)
    print(f'source {source} -> wordmark {mark.width}x{mark.height}'
          f' ({mark.width / mark.height:.2f}:1)\n')

    print('iOS')
    save(compose(mark, 1024, SQUARE_WIDTH_FRAC, WHITE),
         REPO / 'ios/TrendzoMockup/Images.xcassets/AppIcon.appiconset/icon_1024.png',
         alpha=False)

    print('Android')
    res = REPO / 'android/app/src/main/res'
    for bucket, (legacy, adaptive) in DENSITIES.items():
        out = res / f'mipmap-{bucket}'
        save(compose(mark, legacy, SQUARE_WIDTH_FRAC, WHITE),
             out / 'ic_launcher.png', alpha=True)
        save(compose(mark, legacy, SQUARE_WIDTH_FRAC, 'circle'),
             out / 'ic_launcher_round.png', alpha=True)
        # Backdrop comes from @color/ic_launcher_background, so this stays clear.
        save(compose(mark, adaptive, FOREGROUND_WIDTH_FRAC, (0, 0, 0, 0)),
             out / 'ic_launcher_foreground.png', alpha=True)

    print('Play Store')
    save(compose(mark, 512, SQUARE_WIDTH_FRAC, WHITE),
         REPO / 'store-assets/play-store-icon-512.png', alpha=False)


if __name__ == '__main__':
    main()
