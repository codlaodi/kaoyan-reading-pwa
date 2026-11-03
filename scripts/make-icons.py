#!/usr/bin/env python
"""生成 PWA 图标（192 / 512 / maskable / apple-touch-icon）。

不依赖网络：使用本机中文字体（微软雅黑 / 等线 / Noto），Pillow 绘制。
运行：python scripts/make-icons.py
"""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "content" / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\Deng.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/System/Library/Fonts/PingFang.ttc",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def gradient(size: int) -> Image.Image:
    """深绿 -> 青绿 的线性渐变。"""
    img = Image.new("RGB", (size, size))
    top = (6, 78, 59)
    bottom = (20, 184, 166)
    px = img.load()
    for y in range(size):
        t = y / max(1, size - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        for x in range(size):
            px[x, y] = (r, g, b)
    return img


def draw_icon(size: int, maskable: bool = False, rounded: bool = True) -> Image.Image:
    scale = 4
    s = size * scale
    img = gradient(s).convert("RGBA")

    draw = ImageDraw.Draw(img, "RGBA")

    # 白色圆角卡片；maskable 时整体缩小到安全区（80%）
    pad_ratio = 0.20 if maskable else 0.13
    pad = int(s * pad_ratio)
    card = (pad, pad, s - pad, s - pad)
    radius = int((s - 2 * pad) * (0.24 if rounded else 0.5))
    draw.rounded_rectangle(card, radius=radius, fill=(255, 255, 255, 246))

    # 卡片内：用「阅」字 + 下方短横线做标识
    inner = s - 2 * pad
    font_size = int(inner * (0.52 if maskable else 0.56))
    font = load_font(font_size)
    glyph = "阅"
    bbox = draw.textbbox((0, 0), glyph, font=font)
    gw = bbox[2] - bbox[0]
    gh = bbox[3] - bbox[1]
    tx = pad + (inner - gw) / 2 - bbox[0]
    ty = pad + (inner - gh) / 2 - bbox[1] - int(inner * 0.04)
    draw.text((tx, ty), glyph, font=font, fill=(15, 118, 110, 255))

    # 底部品牌色短横
    bar_w = int(inner * 0.34)
    bar_h = max(3, int(inner * 0.022))
    bar_x = pad + (inner - bar_w) / 2
    bar_y = pad + inner - int(inner * 0.14)
    draw.rounded_rectangle(
        (bar_x, bar_y, bar_x + bar_w, bar_y + bar_h),
        radius=bar_h,
        fill=(20, 184, 166, 255),
    )

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    icons = {
        "icon-192.png": (192, False),
        "icon-512.png": (512, False),
        "icon-maskable-512.png": (512, True),
        "apple-touch-icon.png": (180, False),
        "favicon-32.png": (32, False),
    }
    for name, (size, maskable) in icons.items():
        image = draw_icon(size, maskable=maskable)
        image.save(OUT / name, optimize=True)
        print(f"[ok] public/icons/{name}  ({size}x{size}{' maskable' if maskable else ''})")


if __name__ == "__main__":
    main()