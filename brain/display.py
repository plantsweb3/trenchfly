"""Render a price history into the 320x180 RGB chart the fly sees.

Light background (photoreceptors are tonically active; the price line
is the dark moving edge that generates transients), dark header with
ticker text, green/red line by trend — the same display adapter the
site's SENSORY INPUT panel shows.
"""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

W, H = 320, 180


def market_frame(symbol: str, history: list[float], bid: float, ask: float) -> np.ndarray:
    im = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(im)
    # grid
    for x in range(12, 310, 30):
        d.line((x, 34, x, 160), fill=(242, 245, 242))
    for y in range(38, 162, 24):
        d.line((10, y, 308, y), fill=(242, 245, 242))
    # header
    d.rectangle((0, 0, W - 1, 27), fill=(12, 16, 5))
    d.text((9, 8), f"{symbol}/ETH", fill=(204, 245, 61))
    d.text((150, 9), "Robinhood Chain", fill=(154, 168, 126))

    vals = np.asarray(history[-100:], dtype=float)
    if len(vals) > 1:
        lo = float(vals.min())
        span = max(float(vals.max()) - lo, lo * 0.002)
        up = vals[-1] >= vals[0]
        color = (0, 200, 5) if up else (255, 80, 0)
        pts = [
            (12 + i * 294 / (len(vals) - 1), 153 - (v - lo) / (span * 1.24) * 109)
            for i, v in enumerate(vals)
        ]
        d.line(pts, fill=color, width=2)
    d.text((9, 165), f"BID {bid:.6g}  ASK {ask:.6g}"[:52], fill=(28, 46, 34))
    return np.asarray(im, dtype=np.uint8)
