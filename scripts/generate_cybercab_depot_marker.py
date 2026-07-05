from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
WORDMARK_PATH = ROOT / "public" / "assets" / "source" / "tesla-cybercab-wordmark.jpeg"
DEPOT_FONT_PATH = ROOT / "public" / "assets" / "fonts" / "candidates" / "RubikGlitch-Regular.ttf"
OUTPUT_PATH = ROOT / "public" / "assets" / "cybercab-depot-marker.png"

GOLD = (232, 176, 34, 255)
PALE_GOLD = (255, 239, 170, 220)
SHADOW = (75, 53, 7, 120)
GLOW = (255, 188, 0, 58)


def trim(image: Image.Image, padding: int) -> Image.Image:
    alpha = image.getchannel("A") if image.mode == "RGBA" else image
    bbox = alpha.getbbox()
    if not bbox:
        return image

    return image.crop((
        max(0, bbox[0] - padding),
        max(0, bbox[1] - padding),
        min(image.width, bbox[2] + padding),
        min(image.height, bbox[3] + padding),
    ))


def tint(mask: Image.Image, color: tuple[int, int, int, int]) -> Image.Image:
    layer = Image.new("RGBA", mask.size, color)
    layer.putalpha(ImageChops.multiply(mask, Image.new("L", mask.size, color[3])))
    return layer


def official_cybercab_wordmark(target_width: int) -> Image.Image:
    if not WORDMARK_PATH.exists():
        raise FileNotFoundError(f"Missing official Cybercab source image: {WORDMARK_PATH}")

    source = Image.open(WORDMARK_PATH).convert("L")
    mask = source.point(lambda value: 255 if value < 190 else 0)
    mask = trim(mask, padding=4)
    scale = target_width / mask.width
    mask = mask.resize((target_width, round(mask.height * scale)), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (mask.width + 20, mask.height + 20), (0, 0, 0, 0))
    glow_mask = Image.new("L", canvas.size, 0)
    glow_mask.paste(mask, (10, 10), mask)
    for radius, color in ((3, GLOW), (1, PALE_GOLD)):
        canvas.alpha_composite(tint(glow_mask.filter(ImageFilter.GaussianBlur(radius)), color))

    canvas.alpha_composite(tint(mask, GOLD), (10, 10))
    return trim(canvas, padding=3)


def tracked_text_mask(text: str, font: ImageFont.FreeTypeFont, tracking: int) -> Image.Image:
    boxes = [font.getbbox(character) for character in text]
    widths = [right - left for left, _, right, _ in boxes]
    ascender = max(-top for _, top, _, _ in boxes) + 18
    descender = max(bottom for _, _, _, bottom in boxes) + 18
    image = Image.new("L", (sum(widths) + tracking * (len(text) - 1) + 36, ascender + descender), 0)
    draw = ImageDraw.Draw(image)

    x = 18
    for character, box, width in zip(text, boxes, widths, strict=True):
        left, top, _, _ = box
        draw.text((x - left, ascender + top), character, font=font, fill=255)
        x += width + tracking

    return trim(image, padding=4)


def depot_label() -> Image.Image:
    if not DEPOT_FONT_PATH.exists():
        raise FileNotFoundError(f"Missing DEPOT font: {DEPOT_FONT_PATH}")

    font = ImageFont.truetype(str(DEPOT_FONT_PATH), 49)
    mask = tracked_text_mask("DEPOT", font, tracking=4)
    mask = trim(mask.filter(ImageFilter.MinFilter(3)), padding=4)

    canvas = Image.new("RGBA", (mask.width + 16, mask.height + 16), (0, 0, 0, 0))
    canvas.alpha_composite(tint(mask.filter(ImageFilter.GaussianBlur(1.5)), GLOW), (8, 8))
    canvas.alpha_composite(tint(mask.filter(ImageFilter.GaussianBlur(0.8)), SHADOW), (8, 8))
    canvas.alpha_composite(tint(mask, GOLD), (5, 5))
    canvas.alpha_composite(tint(mask.filter(ImageFilter.GaussianBlur(0.25)), PALE_GOLD), (4, 4))
    return trim(canvas, padding=4)


def render_marker() -> None:
    wordmark = official_cybercab_wordmark(target_width=300)
    depot = depot_label()

    width = max(wordmark.width, depot.width) + 28
    height = wordmark.height + depot.height + 12
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    canvas.alpha_composite(wordmark, ((width - wordmark.width) // 2, 0))
    canvas.alpha_composite(depot, ((width - depot.width) // 2, wordmark.height - 3))

    marker = trim(canvas, padding=8)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    marker.save(OUTPUT_PATH)
    print(
        f"Wrote {OUTPUT_PATH} ({marker.width}x{marker.height}) "
        f"from {WORDMARK_PATH.name} + {DEPOT_FONT_PATH.name}",
    )


if __name__ == "__main__":
    render_marker()
