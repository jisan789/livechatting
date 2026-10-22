"""
Generate high-fidelity PWA icons for LiveChat.
Produces crisp standard, maskable, apple-touch, and favicon assets matching the brand palette.
"""
from PIL import Image, ImageDraw
import math

def draw_rounded_rect(draw, bbox, radius, fill):
    draw.rounded_rectangle(bbox, radius=radius, fill=fill)

def create_master_icon(size=1024, maskable=False):
    # RGBA image
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Gradient colors: #8B5CF6 (139, 92, 246) -> #6D28D9 (109, 40, 217)
    c_start = (139, 92, 246)
    c_end = (109, 40, 217)

    # Background shape:
    # If maskable, full bleed square with gradient (safe zone will contain graphic inside 80% circle)
    # If standard, smooth rounded squircle (corner radius ~22.5%)
    corner_r = int(size * 0.22) if not maskable else 0
    bg_box = (0, 0, size, size)

    # Render gradient
    grad_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    grad_draw = ImageDraw.Draw(grad_img)
    for y in range(size):
        t = y / (size - 1)
        r = int(c_start[0] + (c_end[0] - c_start[0]) * t)
        g = int(c_start[1] + (c_end[1] - c_start[1]) * t)
        b = int(c_start[2] + (c_end[2] - c_start[2]) * t)
        grad_draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    # Mask for rounded corners if not maskable
    if not maskable:
        mask = Image.new('L', (size, size), 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.rounded_rectangle(bg_box, radius=corner_r, fill=255)
        img.paste(grad_img, (0, 0), mask)
    else:
        img.paste(grad_img, (0, 0))

    draw = ImageDraw.Draw(img)

    # Subtle inner specular glow along top rim
    if not maskable:
        rim_y = int(size * 0.05)
        rim_h = int(size * 0.40)
        # Soft glossy curved reflection
        gloss = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        gloss_draw = ImageDraw.Draw(gloss)
        gloss_draw.ellipse(
            [int(size * 0.1), -int(size * 0.2), int(size * 0.9), int(size * 0.45)],
            fill=(255, 255, 255, 28)
        )
        img = Image.alpha_composite(img, gloss)
        draw = ImageDraw.Draw(img)

    # Safe bounds for chat bubble symbol
    # For maskable, safe zone is 80% circle (diameter = 0.8 * size)
    # For standard, scale can be 0.65
    scale_factor = 0.52 if maskable else 0.58
    center_x = size / 2
    center_y = size / 2

    symbol_w = size * scale_factor
    symbol_h = size * scale_factor

    # Let's draw a sleek modern chat bubble with tail and dots
    # Main bubble circle:
    b_cx = center_x
    b_cy = center_y - (size * 0.02)
    radius = symbol_w * 0.46

    # Shadow for the bubble
    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_offset = int(size * 0.02)
    s_draw.ellipse(
        [b_cx - radius, b_cy - radius + s_offset, b_cx + radius, b_cy + radius + s_offset],
        fill=(0, 0, 0, 45)
    )
    img = Image.alpha_composite(img, shadow)
    draw = ImageDraw.Draw(img)

    # White bubble body
    draw.ellipse(
        [b_cx - radius, b_cy - radius, b_cx + radius, b_cy + radius],
        fill=(255, 255, 255, 255)
    )

    # Chat bubble tail (bottom left)
    tail_poly = [
        (b_cx - radius * 0.72, b_cy + radius * 0.55),
        (b_cx - radius * 1.05, b_cy + radius * 1.08),
        (b_cx - radius * 0.22, b_cy + radius * 0.88),
    ]
    draw.polygon(tail_poly, fill=(255, 255, 255, 255))
    # Smooth circle at tail tip
    draw.ellipse(
        [b_cx - radius * 1.09, b_cy + radius * 1.02, b_cx - radius * 0.97, b_cy + radius * 1.14],
        fill=(255, 255, 255, 255)
    )

    # Inside chat bubble: 3 sleek purple dots (chat typing indication)
    dot_r = radius * 0.15
    dot_spacing = radius * 0.38
    dot_y = b_cy
    dot_colors = [
        (139, 92, 246, 255),  # Left
        (124, 58, 237, 255),  # Center
        (109, 40, 217, 255),  # Right
    ]

    for i, dx in enumerate([-dot_spacing, 0, dot_spacing]):
        dot_x = b_cx + dx
        draw.ellipse(
            [dot_x - dot_r, dot_y - dot_r, dot_x + dot_r, dot_y + dot_r],
            fill=dot_colors[i]
        )

    return img

def main():
    print("Generating standard 512x512...")
    icon_512 = create_master_icon(size=1024, maskable=False).resize((512, 512), Image.Resampling.LANCZOS)
    icon_512.save("static/icons/icon-512.png", "PNG", optimize=True)

    print("Generating maskable 512x512...")
    icon_512_mask = create_master_icon(size=1024, maskable=True).resize((512, 512), Image.Resampling.LANCZOS)
    icon_512_mask.save("static/icons/icon-512-maskable.png", "PNG", optimize=True)

    print("Generating 192x192...")
    icon_192 = icon_512.resize((192, 192), Image.Resampling.LANCZOS)
    icon_192.save("static/icons/icon-192.png", "PNG", optimize=True)

    print("Generating maskable 192x192...")
    icon_192_mask = icon_512_mask.resize((192, 192), Image.Resampling.LANCZOS)
    icon_192_mask.save("static/icons/icon-192-maskable.png", "PNG", optimize=True)

    print("Generating apple-touch-icon 180x180...")
    apple_icon = create_master_icon(size=1024, maskable=True).resize((180, 180), Image.Resampling.LANCZOS)
    apple_icon.save("static/icons/apple-touch-icon.png", "PNG", optimize=True)

    print("Generating favicon 32x32 & 16x16...")
    fav_32 = icon_512.resize((32, 32), Image.Resampling.LANCZOS)
    fav_32.save("static/icons/favicon-32.png", "PNG", optimize=True)
    fav_16 = icon_512.resize((16, 16), Image.Resampling.LANCZOS)
    fav_16.save("static/icons/favicon-16.png", "PNG", optimize=True)

    # Save favicon.ico
    fav_32.save("favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    fav_32.save("static/favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])

    print("All PWA icons successfully generated!")

if __name__ == "__main__":
    main()
