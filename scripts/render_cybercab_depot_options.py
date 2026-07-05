from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "assets" / "depot-marker-options"

GOLD = (238, 181, 34, 255)
PALE_GOLD = (255, 242, 168, 225)
SHADOW = (68, 47, 7, 150)
GLOW = (255, 184, 0, 68)
TEXT = (31, 46, 50, 255)
MUTED = (96, 116, 121, 255)
PANEL = (239, 244, 244, 255)
GRID = (210, 222, 224, 255)


@dataclass(frozen=True)
class Option:
    key: str
    title: str
    font_path: Path
    top_size: int
    bottom_size: int
    top_tracking: int = 0
    bottom_tracking: int = 0
    top_shear: float = 0
    bottom_shear: float = 0
    top_scale_x: float = 1
    bottom_scale_x: float = 1
    note: str = ""


OPTIONS = [
    Option(
        "a_sedgwick",
        "A  Sedgwick Ave Display",
        ROOT / "public/assets/fonts/candidates/SedgwickAveDisplay-Regular.ttf",
        90,
        96,
        top_tracking=-2,
        bottom_tracking=3,
        top_shear=-0.12,
        bottom_shear=-0.1,
        note="graffiti display, readable",
    ),
    Option(
        "b_rock_salt",
        "B  Rock Salt",
        ROOT / "public/assets/fonts/candidates/RockSalt-Regular.ttf",
        62,
        72,
        top_tracking=-4,
        bottom_tracking=-3,
        top_shear=-0.08,
        bottom_shear=-0.1,
        note="scratchy tag energy",
    ),
    Option(
        "c_lacquer",
        "C  Lacquer",
        ROOT / "public/assets/fonts/candidates/Lacquer-Regular.ttf",
        78,
        90,
        top_tracking=-1,
        bottom_tracking=2,
        top_shear=-0.08,
        bottom_shear=-0.08,
        note="angular stencil-graffiti",
    ),
    Option(
        "d_rubik_glitch",
        "D  Rubik Glitch",
        ROOT / "public/assets/fonts/candidates/RubikGlitch-Regular.ttf",
        78,
        90,
        top_tracking=-1,
        bottom_tracking=1,
        top_shear=-0.07,
        bottom_shear=-0.07,
        note="cyber/tech, less graffiti",
    ),
    Option(
        "e_permanent_marker",
        "E  Permanent Marker",
        ROOT / "public/assets/fonts/candidates/PermanentMarker-Regular.ttf",
        78,
        90,
        top_tracking=-2,
        bottom_tracking=1,
        top_shear=-0.1,
        bottom_shear=-0.1,
        note="clean marker, most legible",
    ),
    Option(
        "f_cybertruck_regular",
        "F  Cybertruck Regular",
        ROOT / "public/assets/fonts/cybertruck/Cybertruck-RegularTTF.ttf",
        88,
        102,
        top_tracking=-15,
        bottom_tracking=1,
        note="official-ish baseline",
    ),
    Option(
        "g_road_rage",
        "G  Road Rage",
        ROOT / "public/assets/fonts/candidates/RoadRage-Regular.ttf",
        92,
        106,
        top_tracking=0,
        bottom_tracking=3,
        top_shear=-0.12,
        bottom_shear=-0.14,
        note="sharp handwritten display",
    ),
    Option(
        "h_knewave",
        "H  Knewave",
        ROOT / "public/assets/fonts/candidates/Knewave-Regular.ttf",
        78,
        90,
        top_tracking=-1,
        bottom_tracking=1,
        top_shear=-0.08,
        bottom_shear=-0.08,
        note="bold marker, less childish",
    ),
    Option(
        "i_splash",
        "I  Splash",
        ROOT / "public/assets/fonts/candidates/Splash-Regular.ttf",
        74,
        90,
        top_tracking=-1,
        bottom_tracking=0,
        top_shear=-0.08,
        bottom_shear=-0.12,
        note="wild tag, highest motion",
    ),
    Option(
        "j_metal_mania",
        "J  Metal Mania",
        ROOT / "public/assets/fonts/candidates/MetalMania-Regular.ttf",
        84,
        100,
        top_tracking=0,
        bottom_tracking=2,
        top_shear=-0.07,
        bottom_shear=-0.07,
        note="angular aggressive",
    ),
    Option(
        "k_rubik_dirt",
        "K  Rubik Dirt",
        ROOT / "public/assets/fonts/candidates/RubikDirt-Regular.ttf",
        78,
        92,
        top_tracking=0,
        bottom_tracking=2,
        top_shear=-0.06,
        bottom_shear=-0.06,
        note="distressed tech/grit",
    ),
]


def text_mask(text: str, font: ImageFont.FreeTypeFont, tracking: int) -> Image.Image:
    boxes = [font.getbbox(char) for char in text]
    widths = [right - left for left, _, right, _ in boxes]
    top_pad = max(-top for _, top, _, _ in boxes) + 20
    bottom_pad = max(bottom for _, _, _, bottom in boxes) + 20
    width = sum(widths) + tracking * max(0, len(text) - 1) + 40
    image = Image.new("L", (max(1, width), top_pad + bottom_pad), 0)
    draw = ImageDraw.Draw(image)
    x = 20
    baseline = top_pad
    for char, box, char_width in zip(text, boxes, widths, strict=True):
        left, top, _, _ = box
        draw.text((x - left, baseline + top), char, font=font, fill=255)
        x += char_width + tracking
    return trim(image, 8)


def trim(image: Image.Image, pad: int) -> Image.Image:
    bbox = image.getbbox()
    if bbox is None:
        return image
    return image.crop((
        max(0, bbox[0] - pad),
        max(0, bbox[1] - pad),
        min(image.width, bbox[2] + pad),
        min(image.height, bbox[3] + pad),
    ))


def shear(mask: Image.Image, amount: float) -> Image.Image:
    if amount == 0:
        return mask
    extra = int(abs(amount) * mask.height) + 8
    width = mask.width + extra
    if amount < 0:
        data = (1, amount, extra, 0, 1, 0)
    else:
        data = (1, amount, 0, 0, 1, 0)
    return trim(mask.transform((width, mask.height), Image.Transform.AFFINE, data, resample=Image.Resampling.BICUBIC), 8)


def scale_x(mask: Image.Image, factor: float) -> Image.Image:
    if factor == 1:
        return mask
    width = max(1, round(mask.width * factor))
    return mask.resize((width, mask.height), Image.Resampling.LANCZOS)


def tint(mask: Image.Image, color: tuple[int, int, int, int]) -> Image.Image:
    image = Image.new("RGBA", mask.size, color)
    image.putalpha(ImageChops.multiply(mask, Image.new("L", mask.size, color[3])))
    return image


def paste(canvas: Image.Image, mask: Image.Image, xy: tuple[int, int], color: tuple[int, int, int, int]) -> None:
    canvas.alpha_composite(tint(mask, color), xy)


def render_option(option: Option) -> Image.Image:
    top_font = ImageFont.truetype(str(option.font_path), option.top_size)
    bottom_font = ImageFont.truetype(str(option.font_path), option.bottom_size)
    top = scale_x(shear(text_mask("CYBERCAB", top_font, option.top_tracking), option.top_shear), option.top_scale_x)
    bottom = scale_x(shear(text_mask("DEPOT", bottom_font, option.bottom_tracking), option.bottom_shear), option.bottom_scale_x)

    width = max(top.width, bottom.width) + 34
    height = top.height + bottom.height - 8
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    top_xy = (12, 0)
    bottom_xy = (10, top.height - 18)
    combined = Image.new("L", canvas.size, 0)
    combined.paste(top, top_xy, top)
    combined.paste(bottom, bottom_xy, bottom)

    for radius in (3, 1):
        canvas.alpha_composite(tint(combined.filter(ImageFilter.GaussianBlur(radius)), GLOW), (0, 0))
    paste(canvas, top, (top_xy[0] + 3, top_xy[1] + 4), SHADOW)
    paste(canvas, bottom, (bottom_xy[0] + 3, bottom_xy[1] + 4), SHADOW)
    paste(canvas, top, top_xy, GOLD)
    paste(canvas, bottom, bottom_xy, GOLD)
    paste(canvas, top.filter(ImageFilter.GaussianBlur(0.35)), (top_xy[0] - 1, top_xy[1] - 1), PALE_GOLD)
    paste(canvas, bottom.filter(ImageFilter.GaussianBlur(0.35)), (bottom_xy[0] - 1, bottom_xy[1] - 1), PALE_GOLD)
    return trim(canvas, 8)


def make_contact_sheet(rendered: list[tuple[Option, Image.Image]], columns = 2) -> Image.Image:
    cell_w = 430
    cell_h = 250
    rows = (len(rendered) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * cell_w, rows * cell_h), PANEL)
    draw = ImageDraw.Draw(sheet)
    title_font = ImageFont.truetype("arial.ttf", 18)
    note_font = ImageFont.truetype("arial.ttf", 13)
    for index, (option, image) in enumerate(rendered):
        col = index % columns
        row = index // columns
        x0 = col * cell_w
        y0 = row * cell_h
        draw.rectangle((x0, y0, x0 + cell_w - 1, y0 + cell_h - 1), outline=GRID, width=1)
        draw.text((x0 + 18, y0 + 14), option.title, fill=TEXT, font=title_font)
        draw.text((x0 + 18, y0 + 38), option.note, fill=MUTED, font=note_font)
        scale = min(1.0, 350 / image.width, 135 / image.height)
        preview = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
        px = x0 + (cell_w - preview.width) // 2
        py = y0 + 78 + (130 - preview.height) // 2
        sheet.alpha_composite(preview, (px, py))
    return sheet.convert("RGB")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rendered: list[tuple[Option, Image.Image]] = []
    for option in OPTIONS:
        image = render_option(option)
        image.save(OUT_DIR / f"{option.key}.png")
        rendered.append((option, image))
    make_contact_sheet(rendered).save(OUT_DIR / "contact-sheet.png", quality=95)
    shortlist = [item for item in rendered if item[0].key in {
        "b_rock_salt",
        "g_road_rage",
        "i_splash",
        "j_metal_mania",
        "k_rubik_dirt",
        "f_cybertruck_regular",
    }]
    make_contact_sheet(shortlist).save(OUT_DIR / "shortlist.png", quality=95)
    print(f"Wrote {len(rendered)} options to {OUT_DIR}")


if __name__ == "__main__":
    main()
