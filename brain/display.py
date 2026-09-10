"""Exact 320x180 market input. Neutral trace avoids encoding a price rule in color.

OHLC candles come only from decoded pool swaps. Quote-only input is labeled as
such; quotes are not exchange trades or fabricated bid/ask spreads.
"""
from __future__ import annotations
import numpy as np
from PIL import Image, ImageDraw
W, H = 320, 180


def market_frame(symbol: str, history: list[float], bid=None, ask=None, *, context: dict | None = None) -> np.ndarray:
    # Legacy positional bid/ask are ignored intentionally; old calibration callers
    # remain compatible without displaying invented order-book prices.
    context = context or {}
    im = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(im)
    for x in range(12, 310, 30):
        d.line((x, 34, x, 153), fill=(242, 245, 242))
    for y in range(38, 154, 24):
        d.line((10, y, 308, y), fill=(242, 245, 242))
    d.rectangle((0, 0, W - 1, 27), fill=(12, 16, 5))
    d.text((9, 8), "PRICE / ETH", fill=(204, 245, 61))
    d.text((150, 9), "Robinhood Chain", fill=(154, 168, 126))
    candles = context.get("candles", [])[-60:]
    candles = [c for c in candles if all(np.isfinite(c.get(k, np.nan)) and c[k] > 0 for k in ("open", "high", "low", "close"))]
    vals = np.asarray(history[-100:], dtype=float)
    vals = vals[np.isfinite(vals) & (vals > 0)]
    if candles:
        lo = min(c["low"] for c in candles)
        hi = max(c["high"] for c in candles)
        span = max(hi - lo, abs(lo) * .002, 1e-12)
        y = lambda v: 148 - (v - lo) / (span * 1.1) * 107
        step = 288 / max(len(candles), 1)
        for i, c in enumerate(candles):
            x = 15 + (i + .5) * step
            d.line((x, y(c["high"]), x, y(c["low"])), fill=(26, 62, 46))
            top, bottom = sorted((y(c["open"]), y(c["close"])))
            d.rectangle((x - max(1, step*.28), top, x + max(1, step*.28), max(top+1,bottom)), outline=(26,62,46), fill=(255,255,255) if c["close"] >= c["open"] else (26,62,46))
    elif len(vals) > 1:
        lo = float(vals.min()); span = max(float(vals.max()) - lo, abs(lo) * .002, 1e-12)
        pts = [(12 + i * 294 / (len(vals)-1), 148 - (v-lo)/(span*1.1)*107) for i,v in enumerate(vals)]
        d.line(pts, fill=(26, 62, 46), width=2)
    source = "POOL SWAPS / 1m" if candles else "QUOTES / NOT TRADES"
    d.text((9, 158), source, fill=(28,46,34))
    volume = context.get("volumeEth5m")
    volume_text = f"5m vol {volume:.5g} ETH" if isinstance(volume,(int,float)) and np.isfinite(volume) else "5m volume unavailable"
    d.text((9, 170), volume_text, fill=(28,46,34))
    return np.asarray(im, dtype=np.uint8)
