#!/usr/bin/env python3
"""Generate Android and iOS BatFIN icons/splashes from public/LOGO.png."""

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
LOGO_PATH = ROOT / "public" / "LOGO.png"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
IOS_ASSETS = ROOT / "ios" / "App" / "App" / "Assets.xcassets"
SOURCE_ASSETS = ROOT / "mobile-assets"

OFF_WHITE = (249, 249, 247, 255)
FOREST = (11, 59, 46, 255)


def contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = image.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    return copy


def place_center(canvas: Image.Image, image: Image.Image) -> None:
    x = (canvas.width - image.width) // 2
    y = (canvas.height - image.height) // 2
    canvas.alpha_composite(image, (x, y))


def crop_mark(logo: Image.Image) -> Image.Image:
    candidate = logo.crop((0, 0, min(520, logo.width), logo.height))
    alpha = candidate.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise RuntimeError("The BatFIN logo contains no visible pixels")
    return candidate.crop(bbox)


def square_icon(mark: Image.Image, size: int, *, round_icon: bool = False) -> Image.Image:
    if round_icon:
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(canvas)
        draw.ellipse((0, 0, size - 1, size - 1), fill=OFF_WHITE)
    else:
        canvas = Image.new("RGBA", (size, size), OFF_WHITE)

    rendered = contain(mark, (int(size * 0.72), int(size * 0.72)))
    place_center(canvas, rendered)
    return canvas


def adaptive_foreground(mark: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rendered = contain(mark, (int(size * 0.54), int(size * 0.54)))
    place_center(canvas, rendered)
    return canvas


def splash_image(logo: Image.Image, width: int, height: int) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), FOREST)
    max_logo_width = min(int(width * 0.68), int(height * 1.15))
    rendered = contain(logo, (max_logo_width, int(max_logo_width / 3.8)))

    pad_x = max(18, int(rendered.width * 0.08))
    pad_y = max(14, int(rendered.height * 0.32))
    plaque_width = rendered.width + pad_x * 2
    plaque_height = rendered.height + pad_y * 2
    plaque = Image.new("RGBA", (plaque_width, plaque_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(plaque)
    radius = max(16, int(plaque_height * 0.22))
    draw.rounded_rectangle(
        (0, 0, plaque_width - 1, plaque_height - 1),
        radius=radius,
        fill=(255, 255, 255, 245),
    )
    plaque.alpha_composite(rendered, (pad_x, pad_y))
    place_center(canvas, plaque)
    return canvas


def save_rgb(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    background = Image.new("RGB", image.size, FOREST[:3])
    if image.mode == "RGBA":
        background.paste(image, mask=image.getchannel("A"))
    else:
        background.paste(image)
    background.save(path, optimize=True)


def main() -> None:
    logo = Image.open(LOGO_PATH).convert("RGBA")
    mark = crop_mark(logo)
    SOURCE_ASSETS.mkdir(parents=True, exist_ok=True)

    square_icon(mark, 1024).convert("RGB").save(
        SOURCE_ASSETS / "icon.png", optimize=True
    )
    save_rgb(splash_image(logo, 2732, 2732), SOURCE_ASSETS / "splash.png")

    densities = {
        "mdpi": (48, 108),
        "hdpi": (72, 162),
        "xhdpi": (96, 216),
        "xxhdpi": (144, 324),
        "xxxhdpi": (192, 432),
    }
    for density, (icon_size, foreground_size) in densities.items():
        directory = ANDROID_RES / f"mipmap-{density}"
        square_icon(mark, icon_size).save(directory / "ic_launcher.png", optimize=True)
        square_icon(mark, icon_size, round_icon=True).save(
            directory / "ic_launcher_round.png", optimize=True
        )
        adaptive_foreground(mark, foreground_size).save(
            directory / "ic_launcher_foreground.png", optimize=True
        )

    splash_paths = {
        "drawable/splash.png": (480, 320),
        "drawable-land-mdpi/splash.png": (480, 320),
        "drawable-land-hdpi/splash.png": (800, 480),
        "drawable-land-xhdpi/splash.png": (1280, 720),
        "drawable-land-xxhdpi/splash.png": (1600, 960),
        "drawable-land-xxxhdpi/splash.png": (1920, 1280),
        "drawable-port-mdpi/splash.png": (320, 480),
        "drawable-port-hdpi/splash.png": (480, 800),
        "drawable-port-xhdpi/splash.png": (720, 1280),
        "drawable-port-xxhdpi/splash.png": (960, 1600),
        "drawable-port-xxxhdpi/splash.png": (1280, 1920),
    }
    for relative, dimensions in splash_paths.items():
        save_rgb(splash_image(logo, *dimensions), ANDROID_RES / relative)

    ios_icon = square_icon(mark, 1024).convert("RGB")
    ios_icon.save(
        IOS_ASSETS / "AppIcon.appiconset" / "AppIcon-512@2x.png", optimize=True
    )
    ios_splash = splash_image(logo, 2732, 2732)
    for filename in (
        "splash-2732x2732.png",
        "splash-2732x2732-1.png",
        "splash-2732x2732-2.png",
    ):
        save_rgb(ios_splash, IOS_ASSETS / "Splash.imageset" / filename)

    background_file = ANDROID_RES / "values" / "ic_launcher_background.xml"
    background_file.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources>\n'
        '    <color name="ic_launcher_background">#F9F9F7</color>\n'
        '</resources>\n',
        encoding="utf-8",
    )

    print("Generated BatFIN Android and iOS assets from public/LOGO.png")


if __name__ == "__main__":
    main()
