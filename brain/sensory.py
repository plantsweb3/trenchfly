"""Chart pixels -> photoreceptor drive.

v1 display adapter (engineered, declared): the 320x180 RGB chart is
downsampled and mapped uniformly across R1-R6 axon bodies by linear-sRGB
luminance; R7/R8 get blue/green channel proxies. Column-accurate retinal
mapping (via syn-points optic-lobe columns) is a later checklist item.
"""

import numpy as np
from PIL import Image

R16_GAIN = 9.0
R78_GAIN = 7.0


def _linear(c: np.ndarray) -> np.ndarray:
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def frame_to_drive(
    frame_rgb: np.ndarray, n_r16: int, n_r78: int
) -> tuple[np.ndarray, np.ndarray]:
    """frame_rgb: (180, 320, 3) uint8 -> (drive_r16, drive_r78) currents."""
    img = Image.fromarray(frame_rgb)
    lum_w = int(np.ceil(np.sqrt(n_r16 * 16 / 9)))
    lum_h = int(np.ceil(n_r16 / lum_w))
    small = np.asarray(
        img.resize((lum_w, lum_h), Image.BILINEAR), dtype=np.float32
    )
    lin = _linear(small)
    lum = (
        0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
    ).ravel()[:n_r16]
    drive_r16 = (lum * R16_GAIN).astype(np.float32)

    c_w = int(np.ceil(np.sqrt(n_r78 * 16 / 9)))
    c_h = int(np.ceil(n_r78 / c_w))
    small2 = np.asarray(
        img.resize((c_w, c_h), Image.BILINEAR), dtype=np.float32
    )
    lin2 = _linear(small2)
    bg = (0.5 * lin2[..., 2] + 0.5 * lin2[..., 1]).ravel()[:n_r78]
    drive_r78 = (bg * R78_GAIN).astype(np.float32)
    return drive_r16, drive_r78
