"""Writes the golden vectors the Python-compat tests read (`golden/*.jsonl.gz`).

Run with the Python the engine runs on, from the repository root:

    uv run python packages/engine/test/compat/golden.py

Every value goes out tagged, because JSON loses what the engine must keep:
a float is {"f": repr(x)}, an int is {"i": str(n)}, a string, a bool and
None go as JSON, and a tuple is a list. An expected exception is
{"error": "<class name>"}. The first line of each file is a header with the
Python and Unicode versions. The seeds are fixed, so a rerun on the same
Python writes the same files.
"""

import gzip
import hashlib
import json
import math
import random
import struct
import sys
import unicodedata
from decimal import ROUND_DOWN, Decimal
from pathlib import Path

OUT = Path(__file__).with_name("golden")
N = 10_000


def tag(v):
    if v is None or isinstance(v, (bool, str)):
        return v
    if isinstance(v, int):
        return {"i": str(v)}
    if isinstance(v, float):
        return {"f": repr(v)}
    if isinstance(v, tuple):
        return [tag(x) for x in v]
    raise TypeError(type(v))


def attempt(f, *args):
    try:
        return tag(f(*args))
    except Exception as e:  # the vector records which one
        return {"error": type(e).__name__}


def write(name, rows):
    OUT.mkdir(exist_ok=True)
    header = {"python": sys.version.split()[0], "unicode": unicodedata.unidata_version}
    lines = [json.dumps(header), *(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in rows)]
    # mtime=0 and no file name in the header: the same vectors give the same bytes.
    with open(OUT / f"{name}.jsonl.gz", "wb") as raw, gzip.GzipFile("", "wb", 9, raw, mtime=0) as f:
        f.write(("\n".join(lines) + "\n").encode("utf-8"))


# --- floats ----------------------------------------------------------------

SPECIAL = [
    0.0, -0.0, math.inf, -math.inf, math.nan, 5e-324, -5e-324, 2.2250738585072014e-308,
    1.7976931348623157e308, -1.7976931348623157e308, 2.0**53, 2.0**53 + 2, 2.0**63, 2.0**64,
    1e16, 1e15, 9999999999999998.0, 1e-4, 1e-5, 9.999999999999999e-5, 0.1, 0.2, 0.3, 0.5, 1.5,
    2.5, 0.125, 0.375, 1.25, 1.35, 2.675, 0.799, 0.8, 123456.5, 999999.5, 1e21, 1e22, 1e100, 1e-300,
]


def any_float(r):
    """A float from one of several shapes: decimal-looking, any bit pattern,
    exact binary ties, integers, or one of the special values."""
    k = r.random()
    if k < 0.1:
        return r.choice(SPECIAL)
    if k < 0.3:
        bits = r.getrandbits(64)
        return struct.unpack("<d", struct.pack("<Q", bits))[0]
    if k < 0.5:
        # j / 2^m: x * 10^n lands exactly on .5 for n = m - 1 and odd j.
        m = r.randint(0, 12)
        return r.choice([-1, 1]) * r.randint(0, 10**r.randint(1, 8)) / 2**m
    if k < 0.65:
        return float(r.choice([-1, 1]) * r.randint(0, 10 ** r.randint(1, 20)))
    if k < 0.85:
        # Decimal-looking: the shortest repr has few digits.
        return float(f"{r.choice('-+')}{r.randint(0, 99999)}e{r.randint(-12, 22)}")
    return r.choice([-1, 1]) * r.random() * 10 ** r.randint(-20, 25)


def finite_float(r):
    while True:
        x = any_float(r)
        if math.isfinite(x):
            return x


def any_int(r):
    k = r.random()
    if k < 0.5:
        return r.randint(-1000, 1000)
    if k < 0.8:
        return r.randint(-(2**53), 2**53)
    if k < 0.95:
        return r.choice([-1, 1]) * r.choice([2**62, 2**63 - 1, 2**63, 2**64, 2**70]) + r.randint(-3, 3)
    return r.randint(-(10**30), 10**30)


# --- pySum -------------------------------------------------------------------

def sum_vectors(r):
    rows = []
    for i in range(N):
        n = r.randint(0, 16)
        k = r.random()
        if k < 0.5:
            items = [any_float(r) for _ in range(n)]
        elif k < 0.7:
            # Cancellation: big values that cancel and small ones in between.
            items = []
            for _ in range(n // 3 + 1):
                big = finite_float(r)
                items += [big, r.random() * 10 ** r.randint(-20, 0), -big]
        elif k < 0.8:
            items = [r.choice([0.1, 0.2, 0.3, 0.7, 1e16, -1e16, 1.0]) for _ in range(n)]
        else:
            # Ints and floats, ints first or anywhere.
            items = [any_int(r) if r.random() < 0.4 else any_float(r) for _ in range(n)]
            if r.random() < 0.5:
                items.sort(key=lambda v: isinstance(v, float))
        start = r.choice([0, 0, 0, 0.0, -0.0, any_int(r), any_float(r)])
        rows.append({"in": tag(tuple(items)), "start": tag(start), "out": attempt(sum, items, start)})
    return rows


# --- rounding and formatting -------------------------------------------------

def round_vectors(r):
    rows = []
    for i in range(N):
        x = any_float(r)
        k = r.random()
        if k < 0.25:
            n = None
        elif k < 0.95:
            n = r.randint(-12, 15)
        else:
            n = r.choice([-400, -309, -308, -22, 22, 50, 323, 324, 400])
        out = attempt(round, x) if n is None else attempt(round, x, n)
        rows.append({"x": tag(x), "n": tag(n), "out": out})
    return rows


def fixed_vectors(r):
    rows = []
    for _ in range(N):
        x = any_float(r)
        n = r.randint(0, 20) if r.random() < 0.95 else r.randint(21, 60)
        rows.append({"x": tag(x), "n": n, "out": format(x, f".{n}f")})
    return rows


def g_vectors(r):
    rows = []
    for _ in range(N):
        x = any_float(r)
        p = None if r.random() < 0.6 else r.randint(0, 20)
        spec = "g" if p is None else f".{p}g"
        rows.append({"x": tag(x), "p": p, "out": format(x, spec)})
    return rows


def thousands_vectors(r):
    rows = []
    for _ in range(N):
        n = any_int(r) if r.random() < 0.7 else r.randint(0, 10**r.randint(0, 12))
        rows.append({"n": tag(n), "out": f"{n:,}".replace(",", ".")})
    return rows


def truncate2(valor):
    """filmes/recomendacao/sinais/_tags.py `_decimal`."""
    return str(Decimal(str(valor)).quantize(Decimal("0.01"), rounding=ROUND_DOWN)).replace(".", ",")


def truncate_vectors(r):
    rows = []
    for _ in range(N):
        k = r.random()
        if k < 0.5:
            x = r.random() * r.choice([1, 1, 10, 1000])
        elif k < 0.6:
            x = r.randint(0, 1000) / 1000
        else:
            x = any_float(r)
        rows.append({"x": tag(x), "out": attempt(truncate2, x)})
    return rows


# --- text --------------------------------------------------------------------

ASSIGNED = [cp for cp in range(0x110000)
            if not 0xD800 <= cp <= 0xDFFF and unicodedata.category(chr(cp)) != "Cn"]
TITLE_CHARS = (
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_.,:;!?&'’‘`\"()[]/"
    "áàâãäåçéèêëíìîïñóòôõöúùûüýÿÁÀÂÃÄÅÇÉÈÊËÍÌÎÏÑÓÒÔÕÖÚÙÛÜÝßæœøłđþðŁĐÆŒØ"
    "ﬁﬂ½²³ªº™©®°€£¥µ·•…–—«»„“”ΣσςΑΒΓδİıǅǈǋẞᾈᾼῌ"
    "日本語中文한국어ЖжЯяЁё̧́  　\U0001F600\U0001F3AC\U0001D400"
)


def random_text(r, n=None):
    n = r.randint(0, 25) if n is None else n
    out = []
    for _ in range(n):
        if r.random() < 0.8:
            out.append(r.choice(TITLE_CHARS))
        else:
            out.append(chr(r.choice(ASSIGNED)))
    return "".join(out)


def ranges(cps):
    """[[first, last], ...] for a sorted list of code points."""
    out = []
    for cp in cps:
        if out and out[-1][1] == cp - 1:
            out[-1][1] = cp
        else:
            out.append([cp, cp])
    return out


def casefold_vectors(r):
    rows = [{"assigned": ranges(ASSIGNED),
             "folds": {str(cp): chr(cp).casefold() for cp in ASSIGNED if chr(cp).casefold() != chr(cp)}}]
    rows += [{"s": s, "out": s.casefold()} for s in (random_text(r) for _ in range(N))]
    return rows


def isalnum_vectors(r):
    rows = [{"assigned": ranges(ASSIGNED), "alnum": ranges([cp for cp in ASSIGNED if chr(cp).isalnum()])}]
    for _ in range(N):
        s = random_text(r, r.randint(0, 3))
        rows.append({"s": s, "out": s.isalnum()})
    return rows


def letterboxd_slug(nome):
    """filmes/importar/zip_letterboxd.py `slug`."""
    import re
    sem_apostrofo = re.sub(r"['’‘`]", "", nome)
    ascii_ = unicodedata.normalize("NFKD", sem_apostrofo).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_.lower()).strip("-")


def person_slug(nome):
    """filmes/dados/pessoas.py `slug_de`."""
    import re
    sem_acento = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", sem_acento.lower()).strip("-")


def slug_vectors(r):
    every = {str(cp): [letterboxd_slug(chr(cp)), person_slug(chr(cp))] for cp in ASSIGNED
             if letterboxd_slug(chr(cp)) or person_slug(chr(cp))}
    rows = [{"assigned": ranges(ASSIGNED), "nonEmpty": every}]
    for _ in range(N):
        s = random_text(r)
        rows.append({"s": s, "letterboxd": letterboxd_slug(s), "person": person_slug(s)})
    return rows


# --- fact ids and tuples -----------------------------------------------------

def fato_id(tabela, *valores):
    """filmes/banco/__init__.py `fato_id`."""
    conteudo = "\x1f".join("" if v is None else str(v) for v in valores)
    return f"{tabela}:{hashlib.sha1(conteudo.encode()).hexdigest()[:12]}"


def any_part(r):
    k = r.random()
    if k < 0.3:
        return random_text(r, r.randint(0, 10))
    if k < 0.4:
        return f"{r.randint(1990, 2030)}-{r.randint(1, 12):02}-{r.randint(1, 28):02}"
    if k < 0.6:
        return any_int(r)
    if k < 0.85:
        return any_float(r) if r.random() < 0.5 else r.choice([1.0, 2.0, 2.5, 3.0, 4.0, 4.5, 5.0, 7.5, 10.0])
    if k < 0.93:
        return r.choice([True, False])
    return None


def fact_id_vectors(r):
    rows = []
    for _ in range(N):
        table = r.choice(["notas", "reacoes", "ja_visto", "letterboxd", "trakt", "perguntas_abertas"])
        parts = [any_part(r) for _ in range(r.randint(0, 6))]
        rows.append({"table": table, "parts": [tag(p) for p in parts],
                     "str": [str(p) for p in parts], "out": fato_id(table, *parts)})
    return rows


def any_element(r, depth):
    k = r.random()
    if k < 0.3:
        return r.randint(-2, 2)
    if k < 0.5:
        # A new NaN object each time, so no two are the same object.
        return r.choice([-0.0, 0.0, 1.0, 1.5, 2.0, -1.0, math.inf, -math.inf, float("nan")])
    if k < 0.75:
        return r.choice(["", "a", "b", "ab", "é", "￿", "", "\U0001F600", "\U00010000", "B"])
    if k < 0.8:
        return r.choice([True, False])
    if k < 0.85:
        return None
    if k < 0.9:
        return any_int(r) if r.random() < 0.5 else any_float(r)
    return any_tuple(r, depth + 1) if depth < 2 else r.randint(-2, 2)


def any_tuple(r, depth=0):
    return tuple(any_element(r, depth) for _ in range(r.randint(0, 4)))


def fresh(v):
    """The same value with new NaN objects. Python's tuple comparison takes
    the same object as equal, even a NaN; the port has no object identity, so
    the vectors never share one."""
    if isinstance(v, float) and math.isnan(v):
        return float("nan")
    if isinstance(v, tuple):
        return tuple(fresh(x) for x in v)
    return v


def similar(r, t):
    """Mostly the same tuple, so that the comparison reaches deep indexes."""
    out = [fresh(x) for x in t]
    for i in range(len(out)):
        if r.random() < 0.3:
            out[i] = any_element(r, 1)
    if r.random() < 0.2:
        out = out[: r.randint(0, len(out))]
    elif r.random() < 0.2:
        out.append(any_element(r, 1))
    return tuple(out)


def compare(a, b):
    return (a > b) - (a < b)


def compare_vectors(r):
    rows = []
    for _ in range(N):
        a = any_tuple(r)
        b = similar(r, a) if r.random() < 0.7 else any_tuple(r)
        rows.append({"a": tag(a), "b": tag(b), "out": attempt(compare, a, b)})
    return rows


# --- text, float() and dates (Pessoa files, #86) -------------------------------

SPACES_AND_BREAKS = " \t\n\r\x0b\x0c\x1c\x1d\x1e\x1f\x85\xa0\u1680\u2000\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"


def spaced_text(r):
    """Random text with whitespace and line breaks around and inside it."""
    edge = lambda: "".join(r.choice(SPACES_AND_BREAKS) for _ in range(r.randint(0, 3)))
    middle = "".join(r.choice(SPACES_AND_BREAKS) if r.random() < 0.2 else c for c in random_text(r))
    return edge() + middle + edge()


def text_vectors(r):
    non_printable = [cp for cp in range(0x110000) if not chr(cp).isprintable()]
    rows = [{"assigned": ranges(ASSIGNED), "space": ranges([cp for cp in ASSIGNED if chr(cp).isspace()]),
             "nonPrintable": ranges(non_printable)}]
    for _ in range(N):
        s = spaced_text(r) if r.random() < 0.7 else r.choice(["", "'", '"', "'\"", "\\", "a'b", 'a"b'] ) + random_text(r)
        rows.append({"s": s, "strip": s.strip(), "lines": s.splitlines(), "repr": repr(s)})
    return rows


FLOAT_CHARS = "0123456789" * 4 + "+-._eE " + "infINFatyNAy" + "\u0663\u0e52\U0001D7D9\u3000\xa0x"


def float_vectors(r):
    edges = ["", " ", "1", " 4 ", "4,5", "4.5", "+4", "-0", "1_0", "1__0", "_1", "1_", "1_.5", "1._5", ".5", "5.",
             ".", "e5", "1e", "1e_5", "1e5", "1E+5", "1e-5_0", "0x10", "+-1", "inf", "-Infinity", "+nan", "NaN",
             "infinit", "nan1", "\u0664,\u0665", "\U0001D7D9", "1\u3000", "\xa01", "\x1c1\x1f", "1\x85", "4/10"]
    rows = [{"s": s, "out": attempt(float, s)} for s in edges]
    for _ in range(N):
        s = "".join(r.choice(FLOAT_CHARS) for _ in range(r.randint(0, 8)))
        rows.append({"s": s, "out": attempt(float, s)})
    return rows


def iso_date(s):
    import datetime as dt
    try:
        dt.date.fromisoformat(s)
    except ValueError:
        return False
    return True


DATE_CHARS = "0123456789" * 5 + "-" * 6 + "W" * 2 + "T: x\xe9"


def date_vectors(r):
    edges = ["2026-11-20", "20261120", "2026-W47", "2026W47", "2026-W47-5", "2026W475", "20261120xx", "2026-11-2x",
             "2026-1120", "0000-01-01", "2026-W53", "2025-W53", "2020-W53-7", "2026-02-29", "2024-02-29",
             "2026-11-20 ", "2026-W47-8", "2026-W00", "2026-W4", "2026-W475", "2026W475xx", "20261120\xe9", "9999-12-31",
             "9999-W52-7", "0001-W01-1", "0001-01-01", "2026-13-01", "2026-00-10", "2026-11-31", "2026-12-31"]
    rows = [{"s": s, "out": iso_date(s)} for s in edges]
    for _ in range(N):
        if r.random() < 0.5:
            s = "".join(r.choice(DATE_CHARS) for _ in range(r.choice([7, 8, 9, 10, 10, 10])))
        else:
            year = r.choice(["2026", "2020", "0001", "9999", "1999", "2004", "2015"])
            if r.random() < 0.3:
                s = f"{year}{r.choice(['-', ''])}W{r.randint(0, 54):02}" + r.choice(["", f"-{r.randint(0, 8)}", str(r.randint(0, 8))])
            else:
                sep = r.choice(["-", "-", ""])
                s = f"{year}{sep}{r.randint(0, 13):02}{sep}{r.randint(0, 32):02}"
        rows.append({"s": s, "out": iso_date(s)})
    return rows


# --- YAML 1.1 as PyYAML reads and writes it ----------------------------------

def tag_yaml(v):
    """`tag`, plus what YAML adds: a date or a datetime goes as its str(), as the
    port keeps it; a dict as {"m": [[key, value], ...]}."""
    import datetime as dt
    if isinstance(v, (dt.date, dt.datetime)):
        return str(v)
    if isinstance(v, dict):
        return {"m": [[tag_yaml(k), tag_yaml(x)] for k, x in v.items()]}
    if isinstance(v, list):
        return [tag_yaml(x) for x in v]
    if isinstance(v, bytes):
        raise TypeError(type(v))
    return tag(v)


SCALAR_EDGES = [
    "", "~", "null", "Null", "NULL", "nULL", "y", "Y", "n", "N", "yes", "Yes", "YES", "yEs", "no", "No", "ON", "On",
    "on", "off", "Off", "OFF", "True", "TRUE", "true", "tRue", "False", "1", "-1", "+1", "0", "-0", "+0", "00", "09",
    "010", "-010", "0o10", "0x1F", "-0x1f", "0X1F", "0b101", "+0b1", "0b2", "1_000", "1:30", "-1:30:00", "1:60",
    "1:5", "01:30", "190:20:30.15", "1.0", "1.", "-1.", ".5", "-.5", "+.5", "1e3", "1e+3", "1.e3", "1.5e3", "1.5e+3",
    "1.5E-3", "1.0e-05", ".5e+1", ".inf", "-.Inf", "+.INF", ".nan", ".NaN", "-.nan", "NaN", "inf", "2026-11-20",
    "2026-1-5", "2026-01-05", "2026-11-20 10:00:00", "2026-11-20T10:00:00Z", "2026-11-20t10:00:00.5+03",
    "2026-11-20 1:02:03.1234567 -03:30", "2026-11-20T10:00:00 Z", "2026-11-20 10:00:00.000000", "2026-11-20x",
    "2026-11-20T10:00", "1_", "_1", "0_7", "0x_1", "1__0", "12:5", "1,5", "4.5", "0.5", "1_0.5", "1:2.5", "123456789012345678901234567890",
    "0.1", "1e-05", "-", "=", "<<", "abc", "a b", "Q9000001", "tt9000101",
]
SCALAR_CHARS = "0123456789" * 3 + "+-._:" * 2 + "eExXbBoO " + "infaNtrusyl" + "TZ"


def scalar_vectors(r):
    import yaml
    rows = []
    texts = SCALAR_EDGES + ["".join(r.choice(SCALAR_CHARS) for _ in range(r.randint(1, 10))) for _ in range(N)]
    for s in texts:
        try:
            value = yaml.safe_load(f"v: {s}\n")
        except Exception as e:  # the vector records which one
            rows.append({"s": s, "out": {"error": type(e).__name__}})
            continue
        if isinstance(value, dict) and list(value) == ["v"] and not isinstance(value["v"], (dict, list)):
            rows.append({"s": s, "out": tag_yaml(value["v"])})
    return rows


def any_yaml_scalar(r):
    k = r.random()
    if k < 0.45:
        return random_text(r, r.randint(0, 40)) if r.random() < 0.7 else spaced_text(r)
    if k < 0.55:
        return r.choice(SCALAR_EDGES)
    if k < 0.65:
        return f"{r.randint(1990, 2030)}-{r.randint(1, 12):02}-{r.randint(1, 28):02}"
    if k < 0.75:
        return any_int(r)
    if k < 0.88:
        return any_float(r)
    if k < 0.95:
        return r.choice([True, False])
    return None


def any_yaml_tree(r, depth=0):
    k = r.random()
    if depth < 3 and k < 0.25:
        return [any_yaml_tree(r, depth + 1) for _ in range(r.randint(0, 4))]
    if depth < 3 and k < 0.5:
        keys = [random_text(r, r.randint(1, 8)) if r.random() < 0.6 else r.choice(SCALAR_EDGES) for _ in range(r.randint(0, 4))]
        return {key: any_yaml_tree(r, depth + 1) for key in keys}
    return any_yaml_scalar(r)


def dump_vectors(r):
    """Frontmatter as `filmes/dados/markdown.py` writes it, and the value PyYAML reads back."""
    import yaml
    rows = []
    while len(rows) < N // 4:
        tree = {random_text(r, r.randint(1, 8)): any_yaml_tree(r, 1) for _ in range(r.randint(1, 5))}
        text = yaml.safe_dump(tree, allow_unicode=True, sort_keys=False, default_flow_style=None)
        rows.append({"yaml": text, "value": tag_yaml(yaml.safe_load(text))})
    return rows


def strip_vectors(r):
    space = [cp for cp in ASSIGNED if chr(cp).isspace()]
    rows = [{"space": ranges(space)}]
    for _ in range(N):
        pad = lambda: "".join(chr(r.choice(space)) if r.random() < 0.7 else r.choice(" \ufeff\u200b") for _ in range(r.randint(0, 3)))
        s = pad() + random_text(r, r.randint(0, 6)) + pad()
        rows.append({"s": s, "out": s.strip()})
    return rows


# --- exp --------------------------------------------------------------------

EXP_EDGES = [
    0.0, -0.0, 5e-324, -5e-324, 1e-300, 2.0**-54, -(2.0**-54), 2.0**-53, 1e-17, 1.0, -1.0, 0.5, 512.0,
    -512.0, 511.9999999999999, 709.782712893384, 709.7827128933841, 709.79, 710.0, -708.3964185322641,
    -708.4, -720.0, -745.1332191019411, -745.1332191019412, -746.0, 1024.0, -1024.0, 1e308,
    math.inf, -math.inf, math.nan,
]


def exp_vectors(r):
    rows = [{"x": tag(x), "out": attempt(math.exp, x)} for x in EXP_EDGES]
    for _ in range(N * 2):
        k = r.random()
        if k < 0.3:
            x = r.uniform(-50, 50)
        elif k < 0.5:
            x = r.uniform(-1, 1) * 10 ** r.randint(-20, 0)
        elif k < 0.75:
            x = r.uniform(-746, 710)
        elif k < 0.9:
            x = r.uniform(-746, -700)
        else:
            x = any_float(r)
        rows.append({"x": tag(x), "out": attempt(math.exp, x)})
    return rows


def main():
    for name, make, seed in [
        ("py-sum", sum_vectors, 1),
        ("py-round", round_vectors, 2),
        ("py-fixed", fixed_vectors, 3),
        ("py-format-g", g_vectors, 4),
        ("thousands-dot", thousands_vectors, 5),
        ("truncate2", truncate_vectors, 6),
        ("casefold", casefold_vectors, 7),
        ("isalnum", isalnum_vectors, 8),
        ("slug", slug_vectors, 9),
        ("fact-id", fact_id_vectors, 10),
        ("compare-tuple", compare_vectors, 11),
        ("exp", exp_vectors, 12),
        ("strip", strip_vectors, 13),
        ("py-text", text_vectors, 14),
        ("py-float", float_vectors, 15),
        ("iso-date", date_vectors, 16),
        ("yaml-scalar", scalar_vectors, 17),
        ("yaml-dump", dump_vectors, 18),
    ]:
        write(name, make(random.Random(seed)))


if __name__ == "__main__":
    main()
