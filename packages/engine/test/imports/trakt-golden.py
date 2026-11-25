"""Writes the golden vectors of the Trakt reader (`golden/*.jsonl.gz`): the
instant of an item (`datetime.fromisoformat`, to UTC, `isoformat`) and the
rows of one JSON file of the export (`json.loads` of the bytes and the
checks of `zip_trakt._linhas`), named after its date field.

Run with the Python the engine runs on, from the repository root:

    uv run python packages/engine/test/imports/trakt-golden.py

Seeds 24 and 25 (after golden.py's), so a rerun writes the same files.
"""

import base64
import datetime as dt
import importlib
import json
import random
import sys
from pathlib import Path

sys.path[:0] = [str(Path(__file__).parent), str(Path(__file__).parents[4])]
write = importlib.import_module("golden").write
ErroFilmes = importlib.import_module("filmes.erros").ErroFilmes
zip_trakt = importlib.import_module("filmes.importar.zip_trakt")

N = 5_000


def instant(text):
    try:
        value = dt.datetime.fromisoformat(text)
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt.UTC)
        return value.astimezone(dt.UTC).isoformat(timespec="microseconds")
    except (ValueError, OverflowError):
        return None


def random_instant(rng):
    year = rng.choice(["2025"] * 6 + ["0001", "9999", "0000", "1999", "2024"])
    sep = rng.choice(["-", ""])
    if rng.random() < 0.15:
        date = year + sep + "W" + rng.choice(["01", "06", "52", "53", "00", "54"])
        if rng.random() < 0.6:
            date += sep + rng.choice("01789")
    else:
        date = year + sep + rng.choice(["01", "02", "12"] * 3 + ["13", "00"]) + sep + rng.choice(["01", "28", "29", "31"] * 3 + ["32", "00"])
    text = date
    if rng.random() < 0.85:
        text += rng.choice(["T"] * 8 + [" ", "é", "\ud800", "x", "1", "-", "€", "😀"])
        colon = rng.choice([":", "", ":"])
        clock = [rng.choice(["00", "19", "23"] * 4 + ["24", "9", "1x"])]
        for _ in range(rng.randint(0, 2)):
            clock.append(rng.choice(["00", "30", "59"] * 3 + ["60"]))
        text += colon.join(clock)
        if rng.random() < 0.5:
            text += rng.choice([".", ",", ""]) + "".join(rng.choice("0123456789") for _ in range(rng.randint(0, 9)))
        if rng.random() < 0.7:
            zone = rng.choice(["Z"] * 10 + ["-03:00"] * 5 + ["+", "-", "Zx", "+00:00", "-00:00", "+01", "+0130", "-03:00", "+23:59:59.999999", "+24:00", "+01:30:00.5", "+1", "+01:", "Z\x00"])
            text += zone
    for _ in range(rng.choice([0] * 7 + [1, 2])):
        at = rng.randint(0, len(text))
        piece = rng.choice(["", "\x00", "Z", ":", ".", "5", "-", "+", "é", " "])
        if rng.random() < 0.5:
            text = text[:at] + piece + text[at + 1:]
        else:
            text = text[:at] + piece + text[at:]
    return text


def instant_rows():
    rng = random.Random(24)
    return [{"text": t, "instant": instant(t)} for t in (random_instant(rng) for _ in range(N))]


def random_value(rng, depth=0):
    choices = ["null", "true", "false", "0", "5", "9", "10", "11", "-1", "5.0", "1e1", "603", '"603"', '"0603"',
               '"tt9000101"', '"tt12x"', '"movie"', '"show"', '"episode"', '"2025-02-03T19:00:00.000Z"',
               '"2025-02-03"', "NaN", "Infinity", "-Infinity", "123456789012345678901234567890", '"x"']
    if depth < 2 and rng.random() < 0.3:
        return random_object(rng, depth + 1)
    if depth < 2 and rng.random() < 0.1:
        return "[" + ",".join(random_value(rng, depth + 1) for _ in range(rng.randint(0, 2))) + "]"
    return rng.choice(choices)


KEYS = ["type", "movie", "ids", "imdb", "tmdb", "trakt", "title", "rating", "rated_at", "watched_at",
        "last_watched_at", "show"]


def random_object(rng, depth):
    pairs = [f'"{rng.choice(KEYS)}": {random_value(rng, depth)}' for _ in range(rng.randint(0, 5))]
    return "{" + ", ".join(pairs) + "}"


def trakt_item(rng):
    field = rng.choice(["rated_at", "watched_at", "last_watched_at"])
    ids = {}
    for key, values in (("imdb", ["tt9000101", None, 7, "tt", "tt1\n"]), ("tmdb", [9001, "9001", 9001.0, 0, -3, True, [1], None]),
                        ("trakt", [24, 24.0, "24", None, True, 10**30])):
        if rng.random() < 0.8:
            ids[key] = rng.choice(values)
    movie = {"title": rng.choice(["O Farol", None, 3, "Maré"]), "ids": rng.choice([ids, ids, None, []])}
    item = {"type": rng.choice(["movie", "movie", None, "episode", 0]), "movie": rng.choice([movie, movie, None, "x"])}
    if rng.random() < 0.1:
        del item["movie"]
    if rng.random() < 0.1:
        del item["type"]
    item[field] = rng.choice(["2025-02-03T19:00:00.000Z", "2025-02-03T19:00:00", "2025-02-03", None, 5, "ontem",
                              "2025-02-03T22:00:00-03:00"])
    if rng.random() < 0.9:
        item["rating"] = rng.choice([1, 9, 10, 0, 11, 5.0, "9", True, None])
    return field, item


def document(rng):
    """A JSON file's bytes and the date field the reader is asked for."""
    if rng.random() < 0.35:
        field = rng.choice(["rated_at", "watched_at", "last_watched_at"])
        text = random_value(rng) if rng.random() < 0.2 else "[" + ", ".join(
            random_object(rng, 0) if rng.random() < 0.8 else random_value(rng) for _ in range(rng.randint(0, 3))) + "]"
        if rng.random() < 0.15:
            at = rng.randint(0, len(text))
            text = text[:at] + rng.choice(["", ",", "]", "\x01", "\\u00e9", "\\x", '"']) + text[at + 1:]
    else:
        items = [trakt_item(rng) for _ in range(rng.randint(1, 3))]
        field = items[0][0]
        text = json.dumps([i for _, i in items], ensure_ascii=rng.random() < 0.5)
    encoding = rng.choice(["utf-8"] * 8 + ["utf-8-sig", "utf-16", "utf-16-le", "utf-32", "latin-1"])
    return text.encode(encoding, "surrogatepass"), field


FILES = {"rated_at": "ratings.json", "watched_at": "history.json", "last_watched_at": "watched-movies.json"}


def rows_of(content, field):
    try:
        rows = list(zip_trakt._linhas(content, FILES[field], field))
    except ErroFilmes as e:
        return {"error": e.mensagem}
    return {"rows": [{"name": r.filme.nome, "imdb": r.filme.imdb, "tmdb": r.filme.tmdb,
                      "trakt": None if r.filme.trakt is None else str(r.filme.trakt),
                      "instant": r.instante, "rating": r.nota} for r in rows]}


def json_rows():
    rng = random.Random(25)
    out = []
    for _ in range(N):
        content, field = document(rng)
        out.append({"bytes": base64.b64encode(content).decode(), "field": field} | rows_of(content, field))
    return out


def main():
    write("iso-instant", instant_rows())
    write("trakt-json", json_rows())


if __name__ == "__main__":
    main()
