"""
color_detector.py – Dominant colour detection for detected object regions.
Uses k-means clustering + HSV named colour lookup.
Exports: get_colors_for_detections(), draw_color_swatches(), get_object_colour()
"""

import cv2
import numpy as np

# ── Named colour table (HSV ranges) ──────────────────────────────────────────
COLOUR_RULES = [
    ("Red",    0,   10,  100, 80),
    ("Red",  160,  180,  100, 80),
    ("Orange", 10,  25,  100, 80),
    ("Yellow", 25,  35,  100, 80),
    ("Green",  35,  85,   80, 60),
    ("Cyan",   85, 100,   80, 60),
    ("Blue",  100, 130,   80, 40),
    ("Purple",130, 160,   60, 40),
]

def _hsv_to_name(h: int, s: int, v: int) -> str:
    if v < 40:
        return "Black"
    if s < 30:
        if v > 180: return "White"
        if v > 100: return "Light Gray"
        return "Dark Gray"
    for name, h_lo, h_hi, s_lo, v_lo in COLOUR_RULES:
        if h_lo <= h <= h_hi and s >= s_lo and v >= v_lo:
            return name
    return "Unknown"


def dominant_colour_hsv(bgr_region: np.ndarray, k: int = 3):
    """
    Find dominant colour in a BGR image region using k-means.
    Returns (colour_name: str, hex_colour: str)
    """
    if bgr_region is None or bgr_region.size == 0:
        return "Unknown", "#888888"
    h, w = bgr_region.shape[:2]
    if h < 5 or w < 5:
        return "Unknown", "#888888"

    small  = cv2.resize(bgr_region, (min(w, 60), min(h, 60)))
    pixels = small.reshape(-1, 3).astype(np.float32)
    k      = min(k, len(pixels))

    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, centers = cv2.kmeans(
        pixels, k, None, criteria, 5, cv2.KMEANS_RANDOM_CENTERS
    )

    counts       = np.bincount(labels.flatten())
    dominant_bgr = centers[counts.argmax()].astype(np.uint8)

    bgr_px      = np.uint8([[dominant_bgr]])
    hsv_px      = cv2.cvtColor(bgr_px, cv2.COLOR_BGR2HSV)[0][0]
    hh, ss, vv  = int(hsv_px[0]), int(hsv_px[1]), int(hsv_px[2])

    name      = _hsv_to_name(hh, ss, vv)
    hex_color = "#{:02X}{:02X}{:02X}".format(
        int(dominant_bgr[2]), int(dominant_bgr[1]), int(dominant_bgr[0])
    )
    return name, hex_color


def get_object_colour(img: np.ndarray, bbox: list, object_name: str = "") -> dict:
    """
    Extract colour from a single bounding box region.
    Returns dict: {name, hex, corrected}
    """
    x1, y1, x2, y2 = bbox
    pad    = 4
    region = img[max(0, y1+pad):max(0, y2-pad), max(0, x1+pad):max(0, x2-pad)]

    try:
        name, hex_col = dominant_colour_hsv(region)
    except Exception:
        name, hex_col = "Unknown", "#888888"

    return {"name": name, "hex": hex_col, "corrected": False}


# ── Functions used by app.py ──────────────────────────────────────────────────

def get_colors_for_detections(img: np.ndarray, detections: list) -> list:
    """
    Add colour info to each detection dict.
    Called by app.py after YOLO detection.

    Each detection gets a 'colors' key: list of {name, hex, corrected}
    Also adds a 'color' key with the primary colour for convenience.

    Returns the modified detections list.
    """
    for det in detections:
        bbox   = det.get('bbox', [0, 0, 0, 0])
        name   = det.get('name', '')
        colour = get_object_colour(img, bbox, name)
        det['colors'] = [colour]          # list for compatibility
        det['color']  = colour            # single primary colour
    return detections


def draw_color_swatches(img: np.ndarray, bbox: list, colors: list) -> np.ndarray:
    """
    Draw small colour swatches (filled circles) on the annotated image
    at the top-left corner of each bounding box.

    Returns the modified image.
    """
    if not colors:
        return img

    x1, y1, _, _ = bbox
    for i, c in enumerate(colors[:2]):          # show max 2 swatches
        hex_col = c.get('hex', '#888888').lstrip('#')
        try:
            r = int(hex_col[0:2], 16)
            g = int(hex_col[2:4], 16)
            b = int(hex_col[4:6], 16)
        except Exception:
            r, g, b = 128, 128, 128

        cx = x1 + 10 + i * 22
        cy = y1 + 10
        # Filled circle (BGR order for OpenCV)
        cv2.circle(img, (cx, cy), 8, (b, g, r), -1)
        # White border ring
        cv2.circle(img, (cx, cy), 8, (255, 255, 255), 1)

    return img