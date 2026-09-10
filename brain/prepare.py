"""Download the MaleCNS v1.0 flat-connectome files and pin SHA-256s.

Public GCS bucket, no credentials. Re-running verifies against locks.json;
a mismatch is a hard failure (the brain must be rebuildable bit-for-bit).
Dataset: Janelia Research Campus, CC-BY 4.0, doi:10.1101/2025.10.09.680999.
"""

import hashlib
import json
import sys
import urllib.request
from pathlib import Path

BASE = (
    "https://storage.googleapis.com/flyem-male-cns/v1.0/"
    "connectome-data/flat-connectome/"
)

FILES = {
    "annotations": "body-annotations-male-cns-v1.0-minconf-0.5.feather",
    "neurotransmitters": "body-neurotransmitters-male-cns-v1.0.feather",
    "weights": "connectome-weights-male-cns-v1.0-minconf-0.5.feather",
}

HERE = Path(__file__).parent
DATA = HERE / "data"
LOCKS = HERE / "locks.json"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 22), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(name: str, filename: str) -> Path:
    dest = DATA / filename
    if dest.exists():
        print(f"{name}: already present ({dest.stat().st_size:,} bytes)")
        return dest
    url = BASE + filename
    print(f"{name}: downloading {url}")
    tmp = dest.with_suffix(".part")
    with urllib.request.urlopen(url) as r, open(tmp, "wb") as f:
        total = 0
        while chunk := r.read(1 << 22):
            f.write(chunk)
            total += len(chunk)
            print(f"\r  {total/1e6:,.0f} MB", end="", flush=True)
    print()
    tmp.rename(dest)
    return dest


def main() -> None:
    DATA.mkdir(exist_ok=True)
    locks = json.loads(LOCKS.read_text()) if LOCKS.exists() else {}
    changed = False
    for name, filename in FILES.items():
        path = fetch(name, filename)
        digest = sha256(path)
        if name in locks:
            if locks[name]["sha256"] != digest:
                print(
                    f"FATAL: {name} SHA-256 mismatch\n"
                    f"  locked: {locks[name]['sha256']}\n  actual: {digest}"
                )
                sys.exit(1)
            print(f"{name}: sha256 verified ✓")
        else:
            locks[name] = {
                "file": filename,
                "sha256": digest,
                "bytes": path.stat().st_size,
                "source": BASE + filename,
            }
            changed = True
            print(f"{name}: sha256 pinned {digest[:16]}…")
    if changed:
        LOCKS.write_text(json.dumps(locks, indent=2) + "\n")
        print(f"wrote {LOCKS}")


if __name__ == "__main__":
    main()
