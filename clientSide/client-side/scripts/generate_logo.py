"""One-off logo generator — draws the POS System app icon (gradient badge + shopping-bag
glyph with a checkmark, standing for "point of sale, transaction confirmed") at 512x512
and downsamples it to every size the app needs (favicon.ico multi-res, logo192, logo512).
Not part of the build; run manually if the logo ever needs to be regenerated/tweaked.
"""
from PIL import Image, ImageDraw
import math

SIZE = 512
GRAD_TOP = (129, 140, 248)     # primary-400
GRAD_BOTTOM = (67, 56, 202)    # primary-700
WHITE = (255, 255, 255, 255)

def rounded_rect_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask

def make_badge():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    grad = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 255))
    px = grad.load()
    for y in range(SIZE):
        t = y / (SIZE - 1)
        r = int(GRAD_TOP[0] + (GRAD_BOTTOM[0] - GRAD_TOP[0]) * t)
        g = int(GRAD_TOP[1] + (GRAD_BOTTOM[1] - GRAD_TOP[1]) * t)
        b = int(GRAD_TOP[2] + (GRAD_BOTTOM[2] - GRAD_TOP[2]) * t)
        for x in range(SIZE):
            px[x, y] = (r, g, b, 255)
    mask = rounded_rect_mask(SIZE, radius=int(SIZE * 0.225))
    img.paste(grad, (0, 0), mask)
    return img

def draw_bag(img):
    d = ImageDraw.Draw(img)

    # Handle: a thick white arc "loop" sitting on top of the bag, like a shopping-bag
    # handle — the single most recognizable cue for "bag" at a glance.
    handle_box = [SIZE * 0.34, SIZE * 0.20, SIZE * 0.66, SIZE * 0.46]
    d.arc(handle_box, start=180, end=360, fill=WHITE, width=int(SIZE * 0.045))

    # Body: a trapezoid (narrower at top, wider at bottom) with softly rounded corners —
    # rounding is faked by drawing filled circles at each corner then the straight polygon
    # over/between them, since PIL's polygon has no native corner radius.
    top_l, top_r = SIZE * 0.30, SIZE * 0.70
    bot_l, bot_r = SIZE * 0.20, SIZE * 0.80
    top_y, bot_y = SIZE * 0.40, SIZE * 0.78
    r = SIZE * 0.035

    d.polygon(
        [(top_l, top_y), (top_r, top_y), (bot_r, bot_y), (bot_l, bot_y)],
        fill=WHITE,
    )
    # Corner roundovers
    for cx, cy in [(top_l, top_y), (top_r, top_y), (bot_l, bot_y), (bot_r, bot_y)]:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)
    # Re-flatten the bottom edge (corner circles bow it outward) by re-filling the core
    # rectangle band between the two bottom corners.
    d.polygon(
        [(top_l, top_y), (top_r, top_y), (bot_r, bot_y), (bot_l, bot_y)],
        fill=WHITE,
    )

    # Checkmark cut out of the bag face in the badge's own color — reads as "sale
    # confirmed" (the point-of-sale part of the mark), not just a generic tote icon.
    check_color = (GRAD_BOTTOM[0], GRAD_BOTTOM[1], GRAD_BOTTOM[2], 255)
    cx, cy = SIZE * 0.50, SIZE * 0.585
    pts = [
        (cx - SIZE * 0.10, cy),
        (cx - SIZE * 0.02, cy + SIZE * 0.08),
        (cx + SIZE * 0.13, cy - SIZE * 0.10),
    ]
    d.line(pts, fill=check_color, width=int(SIZE * 0.045), joint="curve")
    # Round the check's line caps.
    cap_r = SIZE * 0.0225
    for px_, py_ in [pts[0], pts[1], pts[2]]:
        d.ellipse([px_ - cap_r, py_ - cap_r, px_ + cap_r, py_ + cap_r], fill=check_color)

    return img

def main():
    badge = make_badge()
    logo = draw_bag(badge)
    logo.save("public/logo512.png")
    logo.resize((192, 192), Image.LANCZOS).save("public/logo192.png")

    ico_sizes = [16, 24, 32, 48, 64]
    ico_frames = [logo.resize((s, s), Image.LANCZOS) for s in ico_sizes]
    ico_frames[0].save(
        "public/favicon.ico", format="ICO", sizes=[(s, s) for s in ico_sizes], append_images=ico_frames[1:]
    )

    logo.resize((32, 32), Image.LANCZOS).save("logo_preview_32.png")
    logo.resize((64, 64), Image.LANCZOS).save("logo_preview_64.png")
    print("done")

if __name__ == "__main__":
    main()
