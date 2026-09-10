"""Select the retained neuron set and named populations from real
MaleCNS v1.0 annotations. Every count printed here is derived from the
downloaded file, never hardcoded — this is the auditable step.

Inclusion policy v1: every body with a non-null `superclass` (annotated
neurons; excludes unannotated fragments).
"""

import json
from pathlib import Path

import pyarrow.feather as feather

HERE = Path(__file__).parent
ANNOT = HERE / "data" / "body-annotations-male-cns-v1.0-minconf-0.5.feather"
OUT = HERE / "populations.json"

# type-level selectors, verified against the raw v1.0 annotation file
POPULATIONS = {
    "DNp20": lambda t, i: t == "DNp20",
    "DNpe017": lambda t, i: t == "DNpe017",
    "PAM11_a1": lambda t, i: t == "PAM11" and "(a1)" in (i or ""),
    "PPL101_y1pedc": lambda t, i: t == "PPL101",
    "MBON07": lambda t, i: t == "MBON07",
    "MBON11": lambda t, i: t == "MBON11",
    "KC": lambda t, i: (t or "").startswith("KC"),
    "R1_R6": lambda t, i: t == "R1-R6",
    "R7_R8": lambda t, i: (t or "").startswith(("R7", "R8")),
}


def main() -> None:
    table = feather.read_table(
        ANNOT, columns=["bodyId", "type", "instance", "superclass", "somaSide"]
    )
    body = table["bodyId"].to_pylist()
    typ = table["type"].to_pylist()
    inst = table["instance"].to_pylist()
    supc = table["superclass"].to_pylist()
    side = table["somaSide"].to_pylist()

    retained = [k for k in range(len(body)) if supc[k] is not None]
    print(f"annotated bodies: {len(body):,}")
    print(f"retained neurons (non-null superclass): {len(retained):,}")

    out = {
        "retained_count": len(retained),
        "retained_policy": "superclass is not null",
        "populations": {},
    }
    for name, pred in POPULATIONS.items():
        ids: dict[str, list[int]] = {}
        by_side: dict[str, int] = {}
        for k in retained:
            if pred(typ[k], inst[k]):
                s = side[k] if side[k] in ("L", "R") else "?"
                ids.setdefault(s, []).append(int(body[k]))
                by_side[s] = by_side.get(s, 0) + 1
        count = sum(by_side.values())
        out["populations"][name] = {
            "count": count,
            "by_side": by_side,
            "bodyIds": ids,
        }
        print(f"{name:16} {count:>6,}  {by_side}")

    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
