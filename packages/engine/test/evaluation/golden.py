"""Writes the golden vectors of the evaluation's primitives (`golden/*.jsonl.gz`).

Run with the Python the engine runs on, from the repository root:

    uv run python packages/engine/test/evaluation/golden.py

Same format as `test/compat/golden.py` (tagged values, a header line, fixed
seeds): `Random(seed).sample`, `statistics.mean`, `catalogo/vizinhos.calcular`
and the report's `yaml.safe_dump(..., allow_unicode=True, sort_keys=True)`.
"""

import hashlib
import importlib.util
import random
import statistics
import string
import sys
from array import array
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.path.insert(0, str(ROOT))

from filmes.catalogo.vizinhos import calcular

_spec = importlib.util.spec_from_file_location("compat_golden", HERE.parent / "compat" / "golden.py")
compat = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(compat)
compat.OUT = HERE / "golden"

N = 500


def sample_vectors(r):
    rows = []
    for _ in range(N):
        seed = r.choice([0, 1, 27, r.randint(0, 2**32), r.randint(0, 2**70), -r.randint(1, 1000)])
        n = r.choice([r.randint(0, 30), r.randint(0, 3000), r.randint(3000, 60000)])
        k = r.randint(0, min(n, r.choice([5, 30, 1000, n])))
        g = random.Random(seed)
        picks = g.sample(range(n), k)
        # Long samples go as a digest of their text, to keep the file small.
        out = picks if k <= 20 else hashlib.sha256(",".join(map(str, picks)).encode()).hexdigest()
        rows.append({"seed": str(seed), "n": n, "k": k, "out": out, "after": g.getrandbits(32)})
    return rows


def mean_vectors(r):
    rows = []
    for _ in range(N * 10):
        size = r.randint(1, 6)
        kind = r.random()
        if kind < 0.4:
            values = [r.randint(0, 50) / r.randint(1, 50) for _ in range(size)]
        elif kind < 0.7:
            values = [r.random() for _ in range(size)]
        else:
            values = [compat.finite_float(r) for _ in range(size)]
        try:
            out = compat.tag(statistics.mean(values))
        except Exception as e:  # overflow of a huge sum
            out = {"error": type(e).__name__}
        rows.append({"values": [compat.tag(v) for v in values], "out": out})
    return rows


def neighbor_vectors(r):
    rows = []
    for _ in range(100):
        films = sorted({f"tt{r.randint(1, 999):07d}" for _ in range(r.randint(1, 80))})
        votes = r.randint(0, 800)
        users_max = r.randint(1, 300)
        items = array("i", (r.randrange(len(films)) for _ in range(votes)))
        users = array("i", (r.randint(0, users_max) for _ in range(votes)))
        seeds = None if r.random() < 0.4 else sorted(r.sample(range(len(films)), r.randint(0, len(films))))
        batches = []
        out = list(calcular(films, items, users, sementes=seeds, ao_lote=lambda d, t: batches.append([d, t])))
        rows.append({
            "films": films, "items": list(items), "users": list(users), "seeds": seeds,
            "out": [list(p) for p in out], "batches": batches,
        })
    return rows


WORDS = ["IMDb", "MovieLens ml-32m", "2026-11-20", "notas.csv", "ml-32m/ratings.csv", "yes", "null", "",
         "a: b", "#x", "- y", "https://files.grouplens.org/datasets/movielens/ml-32m.zip", "1e5", "0x1f",
         "12", "1.5", "trailing ", " leading", "it's", "ação", "~", "x #y", "a,b", "[x]", "{y}", "*z", "&w",
         "!t", "%p", "@q", "`r", "'s", "\"u", "?", ":", "-", "---", "...", "=", "<<"]


def any_text(r):
    k = r.random()
    if k < 0.5:
        return r.choice(WORDS)
    if k < 0.8:
        return "".join(r.choice(string.ascii_letters + string.digits + "-_./") for _ in range(r.randint(1, 20)))
    # Long text with spaces, to fold past column 80.
    return " ".join(
        "".join(r.choice(string.ascii_lowercase) for _ in range(r.randint(1, 12))) for _ in range(r.randint(5, 25))
    )


def any_scalar(r):
    k = r.random()
    if k < 0.15:
        return None
    if k < 0.2:
        return r.random() < 0.5
    if k < 0.4:
        return r.randint(-10**6, 10**12)
    if k < 0.6:
        # Never integral: a JavaScript number cannot tell 1.0 from 1.
        x = r.choice([r.random(), r.uniform(-1e6, 1e6), r.random() * 10 ** r.randint(-30, 12)])
        return x if x != int(x) else x + 0.5
    return any_text(r)


def any_tree(r, depth=0):
    k = r.random()
    if depth > 3 or k < 0.3:
        return any_scalar(r)
    if k < 0.45:
        return [any_tree(r, depth + 1) for _ in range(r.randint(0, 4))]
    return {any_key(r): any_tree(r, depth + 1) for _ in range(r.randint(0, 5))}


def any_key(r):
    """A key PyYAML keeps simple: not empty, under 128 characters."""
    key = any_text(r)[:100]
    return key if key else "k"


def yaml_vectors(r):
    rows = []
    for _ in range(N // 2):
        tree = {any_key(r): any_tree(r, 1) for _ in range(r.randint(1, 6))}
        rows.append({"tree": tree, "out": yaml.safe_dump(tree, allow_unicode=True, sort_keys=True)})
    return rows


def main():
    for name, make, seed in [
        ("sample", sample_vectors, 101),
        ("mean", mean_vectors, 102),
        ("neighbors", neighbor_vectors, 103),
        ("report-yaml", yaml_vectors, 104),
    ]:
        compat.write(name, make(random.Random(seed)))


if __name__ == "__main__":
    main()
