"""Renders the POS System app icon (favicon.ico + PWA logo192/logo512) to match
src/components/Logo.jsx exactly: no background badge, just the line-art mark itself
(POS-terminal outline + checkmark + receipt line), strokes filled with the app's
indigo->violet brand gradient. Cropped to the same viewBox="20 8 60 70" region the SVG
component uses, so the on-screen mark and the favicon/app icon match pixel-for-pixel in
proportions. Not part of the build; run manually if the design ever changes.
"""
from PIL import Image, ImageDraw

WORK = 500  # supersampled working canvas (scale 5x of the original 100-unit design space)
SCALE = WORK / 100
GRAD_START = (79, 70, 229)   # #4f46e5, top-left
GRAD_END = (129, 140, 248)   # #818cf8, bottom-right

# Same crop window as Logo.jsx's viewBox="20 8 60 70" — tight around the mark, not the
# full 0-100 badge space it was originally designed in.
CROP = (20, 8, 80, 78)


def s(v):
    return v * SCALE


def make_gradient(size):
    grad = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    px = grad.load()
    denom = 2 * (size - 1)
    for y in range(size):
        for x in range(size):
            t = (x + y) / denom
            r = int(GRAD_START[0] + (GRAD_END[0] - GRAD_START[0]) * t)
            g = int(GRAD_START[1] + (GRAD_END[1] - GRAD_START[1]) * t)
            b = int(GRAD_START[2] + (GRAD_END[2] - GRAD_START[2]) * t)
            px[x, y] = (r, g, b, 255)
    return grad


def make_stroke_mask(size):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)

    d.rounded_rectangle(
        [s(26), s(24), s(26) + s(48), s(24) + s(40)], radius=s(8), outline=255, width=round(s(5))
    )
    d.rounded_rectangle(
        [s(34), s(14), s(34) + s(32), s(14) + s(14)], radius=s(6), outline=255, width=round(s(5))
    )
    d.line([(s(38), s(46)), (s(47), s(55)), (s(64), s(38))], fill=255, width=round(s(6)), joint="curve")
    cap_r = s(6) / 2
    for px_, py_ in [(s(38), s(46)), (s(47), s(55)), (s(64), s(38))]:
        d.ellipse([px_ - cap_r, py_ - cap_r, px_ + cap_r, py_ + cap_r], fill=255)

    d.line([(s(26), s(72)), (s(74), s(72))], fill=255, width=round(s(5)))
    cap_r2 = s(5) / 2
    for px_, py_ in [(s(26), s(72)), (s(74), s(72))]:
        d.ellipse([px_ - cap_r2, py_ - cap_r2, px_ + cap_r2, py_ + cap_r2], fill=255)

    return mask


def render(target_size):
    grad = make_gradient(WORK)
    mask = make_stroke_mask(WORK)
    icon = Image.new("RGBA", (WORK, WORK), (0, 0, 0, 0))
    icon.paste(grad, (0, 0), mask)

    crop_px = tuple(round(v * SCALE) for v in CROP)
    icon = icon.crop(crop_px)  # tight around the mark, matches Logo.jsx's viewBox

    # Fit into a square canvas the same way SVG's default preserveAspectRatio="xMidYMid
    # meet" would: scale by the constraining dimension, center on the other axis.
    w, h = icon.size
    scale = target_size / max(w, h)
    icon = icon.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    canvas = Image.new("RGBA", (target_size, target_size), (0, 0, 0, 0))
    canvas.paste(icon, ((target_size - icon.width) // 2, (target_size - icon.height) // 2), icon)
    return canvas


def main():
    logo512 = render(512)
    logo512.save("public/logo512.png")
    render(192).save("public/logo192.png")

    ico_sizes = [16, 24, 32, 48, 64]
    ico_frames = [render(sz) for sz in ico_sizes]
    ico_frames[0].save(
        "public/favicon.ico", format="ICO", sizes=[(sz, sz) for sz in ico_sizes], append_images=ico_frames[1:]
    )

    render(32).save("logo_preview_32.png")
    render(96).save("logo_preview_96.png")
    print("done")


if __name__ == "__main__":
    main()
