"""
build_creative_vector_icon.py - Generates a creative, mathematically sharp geometric stream icon.
No AI generation - 100% pure anti-aliased geometric vector render.
"""

import math
from PIL import Image, ImageDraw

def render_vector_icon():
    scale = 4
    size = 512 * scale  # 2048x2048 supersampled
    center = size / 2
    
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Base Squircle (Dark Obsidian Slate)
    margin = 80 * scale
    radius = 120 * scale
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        fill=(11, 14, 20, 255)
    )

    # 2. Sleek Emerald Outer Border Accent
    border_width = 12 * scale
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        outline=(16, 185, 129, 230),
        width=border_width
    )

    # 3. Geometric Cyber Aperture / Stream Vortex Rings (6 Interlocking Curved Blades)
    num_blades = 6
    outer_r = 180 * scale
    inner_r = 65 * scale

    for i in range(num_blades):
        angle_start = i * (2 * math.pi / num_blades)
        angle_end = angle_start + (1.2 * math.pi / num_blades)

        # Gradient color shift between Emerald and Electric Teal
        t = i / num_blades
        r_col = int(16 * (1 - t) + 6 * t)
        g_col = int(185 * (1 - t) + 182 * t)
        b_col = int(129 * (1 - t) + 212 * t)

        # Polygon blade points
        p1 = (center + inner_r * math.cos(angle_start), center + inner_r * math.sin(angle_start))
        p2 = (center + outer_r * math.cos(angle_start + 0.4), center + outer_r * math.sin(angle_start + 0.4))
        p3 = (center + outer_r * math.cos(angle_end + 0.4), center + outer_r * math.sin(angle_end + 0.4))
        p4 = (center + (inner_r + 25 * scale) * math.cos(angle_end), center + (inner_r + 25 * scale) * math.sin(angle_end))

        draw.polygon([p1, p2, p3, p4], fill=(r_col, g_col, b_col, 240))

    # 4. Central Glowing Kinetic Pulse Core
    core_r = 45 * scale
    draw.ellipse(
        [center - core_r, center - core_r, center + core_r, center + core_r],
        fill=(255, 255, 255, 255)
    )

    inner_core_r = 28 * scale
    draw.ellipse(
        [center - inner_core_r, center - inner_core_r, center + inner_core_r, center + inner_core_r],
        fill=(16, 185, 129, 255)
    )

    # 5. Downsample with high-quality Lanczos antialiasing to 512x512
    final_512 = img.resize((512, 512), Image.Resampling.LANCZOS)

    # Save PNG and Multi-Size ICO
    final_512.save('any video downloader/svg/icon.png', format='PNG')
    
    icon_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    final_512.save('any video downloader/svg/icon.ico', format='ICO', sizes=icon_sizes)
    print("Sharp geometric vector icon rendered successfully!")

if __name__ == '__main__':
    render_vector_icon()
