"""Compile the MaleCNS edge list into a sparse signed weight matrix.

Signs from `consensus_nt` (verified field): acetylcholine excitatory;
GABA, glutamate, histamine inhibitory (coarse fly convention — GluCl,
histaminergic photoreceptors); dopamine/serotonin/octopamine carried in
a separate modulatory matrix (excluded from fast weights in v1);
unclear/missing gets a damped positive fallback, reported in the stats.

Output graph.npz: CSR matrix (float32) over the retained neuron index,
plus bodyId map. Magnitude = contact_count * SYN_SCALE. Fully
vectorized — the 25.6M-edge pass runs in seconds.
"""

import json
from pathlib import Path

import numpy as np
import pyarrow.feather as feather
from scipy import sparse

HERE = Path(__file__).parent
DATA = HERE / "data"
ANNOT = DATA / "body-annotations-male-cns-v1.0-minconf-0.5.feather"
NT = DATA / "body-neurotransmitters-male-cns-v1.0.feather"
WEIGHTS = DATA / "connectome-weights-male-cns-v1.0-minconf-0.5.feather"
OUT = HERE / "graph.npz"
META = HERE / "graph-meta.json"

SYN_SCALE = 0.275
EXC = {"acetylcholine"}
INH = {"gaba", "glutamate", "histamine"}
MOD = {"dopamine", "serotonin", "octopamine"}
FALLBACK_MAG = 0.25


def lookup(sorted_keys: np.ndarray, values: np.ndarray, queries: np.ndarray, default):
    """Vectorized dict lookup via searchsorted."""
    pos = np.searchsorted(sorted_keys, queries)
    pos = np.clip(pos, 0, len(sorted_keys) - 1)
    hit = sorted_keys[pos] == queries
    out = np.full(len(queries), default, dtype=values.dtype)
    out[hit] = values[pos[hit]]
    return out, hit


def main() -> None:
    annot = feather.read_table(ANNOT, columns=["bodyId", "superclass"])
    body = np.asarray(annot["bodyId"].to_numpy(zero_copy_only=False), dtype=np.int64)
    supc = np.asarray(annot["superclass"].to_numpy(zero_copy_only=False))
    retained = np.sort(body[supc != None])  # noqa: E711  (pyarrow nulls -> None)
    n = len(retained)
    print(f"retained neurons: {n:,}")

    nt = feather.read_table(NT, columns=["body", "consensus_nt"])
    nt_body = np.asarray(nt["body"].to_numpy(zero_copy_only=False), dtype=np.int64)
    nt_name = np.asarray(nt["consensus_nt"].to_numpy(zero_copy_only=False))
    # encode nt classes: 1 exc, -1 inh, 2 mod, 0 unknown
    codes = np.zeros(len(nt_name), dtype=np.int8)
    names = [x if x is not None else "" for x in nt_name]
    names = np.array(names)
    codes[np.isin(names, list(EXC))] = 1
    codes[np.isin(names, list(INH))] = -1
    codes[np.isin(names, list(MOD))] = 2
    order = np.argsort(nt_body)
    nt_body_s, codes_s = nt_body[order], codes[order]

    w = feather.read_table(WEIGHTS)
    pre = np.asarray(w["body_pre"].to_numpy(), dtype=np.int64)
    post = np.asarray(w["body_post"].to_numpy(), dtype=np.int64)
    cnt = np.asarray(w["weight"].to_numpy(), dtype=np.float32)
    print(f"edges in release: {len(pre):,}")

    pre_idx = np.searchsorted(retained, pre)
    pre_idx = np.clip(pre_idx, 0, n - 1)
    pre_ok = retained[pre_idx] == pre
    post_idx = np.searchsorted(retained, post)
    post_idx = np.clip(post_idx, 0, n - 1)
    post_ok = retained[post_idx] == post
    keep = pre_ok & post_ok

    pre_i = pre_idx[keep]
    post_i = post_idx[keep]
    mag = cnt[keep] * SYN_SCALE
    pre_codes, _ = lookup(nt_body_s, codes_s, pre[keep], np.int8(0))

    fast = pre_codes != 2
    sign = np.where(
        pre_codes == 1, 1.0, np.where(pre_codes == -1, -1.0, FALLBACK_MAG)
    ).astype(np.float32)
    vals = mag * sign

    W = sparse.csr_matrix(
        (vals[fast], (post_i[fast], pre_i[fast])), shape=(n, n)
    )
    modm = ~fast
    M = sparse.csr_matrix(
        (mag[modm], (post_i[modm], pre_i[modm])), shape=(n, n)
    )
    stats = {
        "edges_total": int(len(pre)),
        "edges_dropped_unretained": int((~keep).sum()),
        "edges_exc": int((pre_codes == 1).sum()),
        "edges_inh": int((pre_codes == -1).sum()),
        "edges_mod": int(modm.sum()),
        "edges_fallback": int((pre_codes == 0).sum()),
    }
    np.savez_compressed(
        OUT,
        w_data=W.data, w_indices=W.indices, w_indptr=W.indptr,
        m_data=M.data, m_indices=M.indices, m_indptr=M.indptr,
        body_ids=retained,
        shape=np.array([n, n]),
    )
    META.write_text(json.dumps(stats, indent=2) + "\n")
    print(f"stats: {stats}")
    print(f"wrote {OUT} and {META}")


if __name__ == "__main__":
    main()
