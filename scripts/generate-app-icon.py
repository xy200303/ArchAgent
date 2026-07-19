from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "build"
OUT_DIR.mkdir(exist_ok=True)

SIZE = 1024
SCALE = 4
CANVAS = SIZE * SCALE


def point(value):
    return int(value * SCALE)


def box(values):
    return tuple(point(value) for value in values)


def rounded_mask(bounds, radius):
    result = Image.new("L", (CANVAS, CANVAS), 0)
    ImageDraw.Draw(result).rounded_rectangle(box(bounds), radius=point(radius), fill=255)
    return result


def vertical_gradient(top, bottom):
    image = Image.new("RGBA", (CANVAS, CANVAS))
    pixels = image.load()
    for y in range(CANVAS):
        mix = y / (CANVAS - 1)
        color = tuple(int(start * (1 - mix) + end * mix) for start, end in zip(top, bottom))
        for x in range(CANVAS):
            pixels[x, y] = (*color, 255)
    return image


canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
outer = (52, 52, 972, 972)
inner = (80, 80, 944, 944)

background = vertical_gradient((35, 27, 95), (10, 91, 126))
canvas.alpha_composite(Image.composite(background, Image.new("RGBA", (CANVAS, CANVAS)), rounded_mask(outer, 226)))

glow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow)
glow_draw.ellipse(box((460, 210, 1060, 810)), fill=(74, 222, 223, 85))
glow = glow.filter(ImageFilter.GaussianBlur(point(115)))
canvas.alpha_composite(Image.composite(glow, Image.new("RGBA", (CANVAS, CANVAS)), rounded_mask(outer, 226)))

draw = ImageDraw.Draw(canvas)
draw.rounded_rectangle(box(outer), radius=point(226), outline=(201, 238, 255, 128), width=point(20))
draw.rounded_rectangle(box(inner), radius=point(196), outline=(171, 219, 242, 62), width=point(5))

# The room outline forms an architectural "A" from two perspective planes.
left_face = [(point(x), point(y)) for x, y in ((210, 720), (452, 272), (512, 330), (512, 794))]
right_face = [(point(x), point(y)) for x, y in ((512, 330), (572, 272), (814, 720), (512, 794))]
draw.polygon(left_face, fill=(224, 248, 255, 255))
draw.polygon(right_face, fill=(103, 225, 231, 255))

# Negative-space doorway makes the mark read as a usable room, not a generic letter.
door = [(point(x), point(y)) for x, y in ((412, 720), (512, 530), (612, 720), (612, 794), (412, 794))]
draw.polygon(door, fill=(31, 67, 133, 255))
draw.line([(point(x), point(y)) for x, y in ((377, 564), (512, 440), (647, 564))], fill=(255, 255, 255, 210), width=point(22), joint="curve")

# Small connected nodes signal the design agent without compromising small-size legibility.
node_line = [(point(x), point(y)) for x, y in ((512, 230), (512, 174), (561, 145))]
draw.line(node_line, fill=(255, 200, 92, 255), width=point(18), joint="curve")
for x, y, radius in ((512, 230, 24), (561, 145, 29)):
    draw.ellipse(box((x - radius, y - radius, x + radius, y + radius)), fill=(255, 200, 92, 255))
    draw.ellipse(box((x - radius + 9, y - radius + 9, x + radius - 9, y + radius - 9)), fill=(255, 245, 210, 255))

# Deliberate blueprint accents give the icon depth while staying quiet.
for start, end in (((184, 804), (294, 804)), ((730, 804), (840, 804))):
    draw.line([(point(x), point(y)) for x, y in (start, end)], fill=(154, 234, 231, 160), width=point(12))

image = canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
png_path = OUT_DIR / "icon.png"
ico_path = OUT_DIR / "icon.ico"
image.save(png_path)
image.save(ico_path, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

print(f"Generated {png_path}")
print(f"Generated {ico_path}")
