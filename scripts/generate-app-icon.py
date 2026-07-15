import math
from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "build"
OUT_DIR.mkdir(exist_ok=True)

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

outer = (62, 76, SIZE - 62, SIZE - 62)
inner = (122, 122, SIZE - 122, SIZE - 122)
bg_top = (9, 35, 53)
bg_bottom = (16, 78, 92)
edge = (123, 201, 207, 210)
panel = (12, 44, 59, 235)
grid = (93, 143, 155, 95)
cyan = (68, 217, 217, 255)
mint = (139, 232, 190, 255)
gold = (243, 183, 73, 255)
white = (246, 251, 252, 255)

mask = Image.new("L", (SIZE, SIZE), 0)
mask_draw = ImageDraw.Draw(mask)
mask_draw.rounded_rectangle(outer, radius=218, fill=255)

gradient = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
gradient_pixels = gradient.load()
for y in range(SIZE):
    t = y / (SIZE - 1)
    for x in range(SIZE):
        r = int(bg_top[0] * (1 - t) + bg_bottom[0] * t)
        g = int(bg_top[1] * (1 - t) + bg_bottom[1] * t)
        b = int(bg_top[2] * (1 - t) + bg_bottom[2] * t)
        gradient_pixels[x, y] = (r, g, b, 255)
img.alpha_composite(Image.composite(gradient, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), mask))

draw.rounded_rectangle(outer, radius=218, outline=edge, width=26)
draw.rounded_rectangle(inner, radius=164, fill=panel, outline=(67, 126, 144, 180), width=8)

for offset in range(0, 600, 120):
    x = 216 + offset
    draw.line((x, 214, x, 790), fill=grid, width=3)
    y = 214 + offset
    draw.line((214, y, 810, y), fill=grid, width=3)

bar_specs = [
    (266, 606, 90, 166, cyan),
    (388, 512, 90, 260, mint),
    (510, 432, 90, 340, gold),
    (632, 344, 90, 428, cyan),
]
for x, y, width, height, color in bar_specs:
    draw.rounded_rectangle((x, y, x + width, y + height), radius=30, fill=color)
    draw.rounded_rectangle((x + 18, y + 20, x + width - 18, y + 52), radius=16, fill=(255, 255, 255, 52))

trend = [(250, 500), (367, 468), (482, 382), (606, 410), (740, 292)]
draw.line(trend, fill=white, width=30, joint="curve")
draw.line(trend, fill=(68, 217, 217, 255), width=16, joint="curve")
for x, y in trend:
    draw.ellipse((x - 30, y - 30, x + 30, y + 30), fill=(11, 43, 55, 255), outline=white, width=10)
    draw.ellipse((x - 12, y - 12, x + 12, y + 12), fill=gold)

center = (512, 264)
for angle in (18, 138, 258):
    rad = math.radians(angle)
    end = (center[0] + int(math.cos(rad) * 78), center[1] + int(math.sin(rad) * 78))
    draw.line((center[0], center[1], end[0], end[1]), fill=(139, 232, 190, 190), width=10)
    draw.ellipse((end[0] - 18, end[1] - 18, end[0] + 18, end[1] + 18), fill=mint)
draw.ellipse((center[0] - 32, center[1] - 32, center[0] + 32, center[1] + 32), fill=white)
draw.ellipse((center[0] - 14, center[1] - 14, center[0] + 14, center[1] + 14), fill=cyan)

draw.arc((682, 198, 798, 314), 305, 55, fill=gold, width=14)
draw.arc((226, 736, 342, 852), 125, 235, fill=mint, width=14)

png_path = OUT_DIR / "icon.png"
ico_path = OUT_DIR / "icon.ico"
img.save(png_path)
img.save(ico_path, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

print(f"Generated {png_path}")
print(f"Generated {ico_path}")
