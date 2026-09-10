"""Fetch the real skeleton arbors of the 27 monitored neurons and emit a
compact 2D projection for the site's MEASURED FIRING ACTIVITY panel.

Source: MaleCNS v1.0 neuroglancer-precomputed skeletons (public GCS,
CC-BY 4.0). Format per file: uint32 n_vertices, uint32 n_edges, then
n_vertices * 3 float32 positions, then n_edges * 2 uint32 indices.

Output: ../public/arbors.json — per neuron: population group, soma side,
decimated vertex list (normalized int coords) and edge pairs.
"""

from __future__ import annotations

import json
import struct
import urllib.request
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
OUT = HERE.parent / "public" / "arbors.json"
BASE = (
    "https://storage.googleapis.com/flyem-male-cns/v1.0/"
    "segmentation/skeletons-malecns/skeletons-highres-precomputed/"
)

GROUPS = [
    "DNp20",
    "DNpe017",
    "PAM11_a1",
    "PPL101_y1pedc",
    "MBON07",
    "MBON11",
]

MAX_VERTS = 700


def fetch_skeleton(body_id: int) -> tuple[np.ndarray, np.ndarray] | None:
    url = f"{BASE}{body_id}"
    try:
        with urllib.request.urlopen(url) as r:
            raw = r.read()
    except Exception as e:  # noqa: BLE001
        print(f"  {body_id}: fetch failed ({e})")
        return None
    nv, ne = struct.unpack_from("<II", raw, 0)
    verts = np.frombuffer(raw, dtype="<f4", count=nv * 3, offset=8).reshape(
        nv, 3
    )
    edges = np.frombuffer(
        raw, dtype="<u4", count=ne * 2, offset=8 + nv * 12
    ).reshape(ne, 2)
    return verts.copy(), edges.copy()


def decimate(verts: np.ndarray, edges: np.ndarray, max_v: int):
    if len(verts) <= max_v:
        return verts, edges
    stride = int(np.ceil(len(verts) / max_v))
    keep = np.zeros(len(verts), dtype=bool)
    keep[::stride] = True
    remap = np.full(len(verts), -1, dtype=np.int64)
    remap[keep] = np.arange(keep.sum())
    # contract edges through removed vertices by snapping endpoints to the
    # nearest kept vertex index (cheap, fine for a glow render)
    nearest = np.maximum.accumulate(np.where(keep, np.arange(len(verts)), 0))
    e = nearest[edges]
    e = e[e[:, 0] != e[:, 1]]
    e = remap[e]
    e = np.unique(np.sort(e, axis=1), axis=0)
    return verts[keep], e


def main() -> None:
    pops = json.loads((HERE / "populations.json").read_text())["populations"]
    neurons = []
    all_pts = []
    for g in GROUPS:
        for side, ids in pops[g]["bodyIds"].items():
            for body in ids:
                got = fetch_skeleton(int(body))
                if got is None:
                    continue
                verts, edges = decimate(*got, MAX_VERTS)
                neurons.append(
                    {"group": g, "side": side, "body": int(body),
                     "verts": verts, "edges": edges}
                )
                all_pts.append(verts)
                print(f"  {g} {side} {body}: {len(verts)} verts, {len(edges)} edges")

    stack = np.vstack(all_pts)
    lo = stack.min(axis=0)
    hi = stack.max(axis=0)
    span = np.maximum(hi - lo, 1)
    # project to XY (frontal-ish); normalize to a 0-1000 grid
    out = []
    for nrec in neurons:
        v = (nrec["verts"] - lo) / span * 1000.0
        pts = np.round(v[:, :2]).astype(int).tolist()
        out.append(
            {
                "group": nrec["group"],
                "side": nrec["side"],
                "body": nrec["body"],
                "pts": pts,
                "edges": nrec["edges"].astype(int).tolist(),
            }
        )
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"neurons": out}, separators=(",", ":")))
    kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT} ({kb:.0f} KB, {len(out)} arbors)")


if __name__ == "__main__":
    main()
