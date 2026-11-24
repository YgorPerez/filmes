"""Writes the golden vectors of the import readers (`golden/*.jsonl.gz`):
Python's `csv.DictReader` (strict, as `zip_letterboxd` reads), `html.unescape`,
`email.utils.parsedate_to_datetime(...).date()` and `bytes.decode("utf-8-sig")`.

Run with the Python the engine runs on, from the repository root:

    uv run python packages/engine/test/imports/golden.py

The first line of each file is a header with the Python version. The seeds
are fixed (20 to 23, after test/compat's), so a rerun writes the same files.
"""

import csv
import email.utils
import gzip
import html
import io
import json
import random
import sys
from html.entities import html5
from pathlib import Path

OUT = Path(__file__).with_name("golden")
N = 5_000


def write(name, rows):
    OUT.mkdir(exist_ok=True)
    lines = [json.dumps({"python": sys.version.split()[0]})]
    lines += [json.dumps(row, ensure_ascii=True) for row in rows]
    data = ("\n".join(lines) + "\n").encode()
    with open(OUT / f"{name}.jsonl.gz", "wb") as f:
        # mtime 0: the same vectors give the same bytes.
        with gzip.GzipFile(fileobj=f, mode="wb", mtime=0) as z:
            z.write(data)


def csv_rows():
    rng = random.Random(20)
    pieces = ["a", "b", "Name", "x y", ",", '"', '""', "\n", "\r", "\r\n", " ", "é", "\x00", "", "1"]
    out = []
    for _ in range(N):
        text = "".join(rng.choice(pieces) for _ in range(rng.randint(0, 14)))
        try:
            reader = csv.DictReader(io.StringIO(text, newline=""), strict=True)
            names = reader.fieldnames
            rows = []
            for row in reader:
                rows.append([reader.line_num, [[k, v] for k, v in row.items() if k is not None]])
            out.append({"text": text, "fieldnames": names, "rows": rows})
        except csv.Error as e:
            out.append({"text": text, "error": str(e)})
    return out


def unescape_rows():
    rng = random.Random(21)
    names = sorted(html5)
    pieces = ["&", ";", "#", "x", "X", "a", " ", "<", "amp", "lt", "9", "0", "12", "128", "ff", "D800", "110000", "zz"]
    out = []
    for _ in range(N):
        parts = []
        for _ in range(rng.randint(0, 8)):
            r = rng.random()
            if r < 0.3:
                parts.append("&" + rng.choice(names))
            elif r < 0.45:
                parts.append("&#" + str(rng.choice([0, 9, 128, 150, 0xD800, 0xFFFE, 0x10FFFF, 0x110000, 65, 0x1F600, 11, 127])))
            else:
                parts.append(rng.choice(pieces))
        text = "".join(parts)
        out.append({"text": text, "unescaped": html.unescape(text)})
    return out


def email_date_rows():
    rng = random.Random(22)
    days = ["Mon,", "Tue", "wed,", "Fri, ", "Sat,", ""]
    dds = ["1", "01", "31", "29", "30", "0", "x", "-3", "15,"]
    mms = ["Jan", "feb", "Mar", "December", "foo", "JUN", "sep"]
    yys = ["2024", "24", "99", "1900", "0", "2023,", "abc", "10000"]
    tms = ["10:00:00", "23:59", "24:00", "12:61", "12.30", "12.30.15", "1:2:3:4", "noon", "12:00:60"]
    tzs = ["+0000", "-0300", "-0000", "GMT", "EST", "+2400", "+9999", "", "Z", "pdt", "+05:30"]
    out = []
    for _ in range(N):
        parts = [rng.choice(days), rng.choice(dds), rng.choice(mms), rng.choice(yys), rng.choice(tms), rng.choice(tzs)]
        if rng.random() < 0.2:
            parts[1], parts[2] = parts[2], parts[1]
        if rng.random() < 0.1:
            parts = [parts[0], f"{parts[1]}-{parts[2]}-{parts[3]}", parts[4], parts[5]]
        if rng.random() < 0.1:
            parts = parts[: rng.randint(0, len(parts))]
        if rng.random() < 0.1:
            parts[-1:] = [parts[-1] + rng.choice(tzs)] if parts else []
        text = " ".join(parts)
        try:
            day = email.utils.parsedate_to_datetime(text).date().isoformat()
        except (TypeError, ValueError):
            day = None
        out.append({"text": text, "day": day})
    return out


def utf8_rows():
    rng = random.Random(23)
    pieces = [b"a", b"\xc3\xa9", b"\xe2\x82\xac", b"\xf0\x9f\x98\x80", b"\xef\xbb\xbf", b"\xff", b"\x80", b"\xc3",
              b"\xe2\x82", b"\xe0\x80", b"\xed\xa0\x80", b"\xf4\x90\x80\x80", b"\xf0\x9f", b"\xc0\xaf", b"("]
    out = []
    for _ in range(N):
        data = b"".join(rng.choice(pieces) for _ in range(rng.randint(0, 6)))
        try:
            out.append({"hex": data.hex(), "text": data.decode("utf-8-sig")})
        except UnicodeDecodeError as e:
            out.append({"hex": data.hex(), "error": str(e)})
    return out


def main():
    write("csv", csv_rows())
    write("html-unescape", unescape_rows())
    write("email-date", email_date_rows())
    write("utf8-sig", utf8_rows())


if __name__ == "__main__":
    main()
