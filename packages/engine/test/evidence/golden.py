"""Writes the golden vectors of the Evidence and ranking primitives
(`golden/*.jsonl.gz`): the Força ruler, the PT wording, the Regra key and
the individual utility, computed by the Python engine's own modules.

Run with the Python the engine runs on, from the repository root:

    uv run python packages/engine/test/evidence/golden.py

Values are tagged as in `../compat/golden.py`: a float is {"f": repr(x)},
an int is {"i": str(n)}, and an expected exception is {"error": name}.
Força, Tipo, Regra, elo and nível names stay in Portuguese, as Python has
them; the test maps them with the key migration's tables. The seeds are
fixed, so a rerun on the same Python writes the same files.
"""

import datetime as dt
import gzip
import json
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from filmes.evidencia import FORCAS, TIPOS, Evidencia, regua, texto
from filmes.recomendacao import utilidade
from filmes.recomendacao.regra import NOMES, Regra

OUT = Path(__file__).with_name("golden")
N = 10_000
PREDICADOS = ("diretor", "roteiro", "serie", "elenco", "genero", "outro")
NIVEIS = ("nada", "pouco", "normal", "muito")


def tag(v):
    if v is None or isinstance(v, (bool, str)):
        return v
    if isinstance(v, int):
        return {"i": str(v)}
    if isinstance(v, float):
        return {"f": repr(v)}
    if isinstance(v, (tuple, list)):
        return [tag(x) for x in v]
    raise TypeError(type(v))


def attempt(f, *args, **kwargs):
    try:
        return tag(f(*args, **kwargs))
    except Exception as e:  # the vector records which one
        return {"error": type(e).__name__}


def write(name, rows):
    OUT.mkdir(exist_ok=True)
    header = {"python": sys.version.split()[0]}
    lines = [json.dumps(header), *(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in rows)]
    with open(OUT / f"{name}.jsonl.gz", "wb") as raw, gzip.GzipFile("", "wb", 9, raw, mtime=0) as f:
        f.write(("\n".join(lines) + "\n").encode("utf-8"))


# --- dates -------------------------------------------------------------------

LEAP_DAYS = [dt.date(y, 2, 29) for y in range(1988, 2041) if y % 4 == 0 and (y % 100 or y % 400 == 0)]
NEAR_LEAP = [d + dt.timedelta(days=k) for d in LEAP_DAYS for k in (-1, 1)]


def any_today(r):
    k = r.random()
    if k < 0.3:
        return r.choice(LEAP_DAYS)
    if k < 0.45:
        return r.choice(NEAR_LEAP)
    return dt.date(2000, 1, 1) + dt.timedelta(days=r.randint(0, 365 * 40))


def years_back(today, years):
    try:
        return today.replace(year=today.year - years)
    except ValueError:
        return today.replace(year=today.year - years, day=28)


def any_date(r, today):
    """Mostly a day around the 2-year and 5-year edges of `today`."""
    k = r.random()
    if k < 0.7:
        edge = years_back(today, r.choice([2, 5, 2, 5, 1, 3, 4, 6]))
        return (edge + dt.timedelta(days=r.randint(-2, 2))).isoformat()
    if k < 0.97:
        return (today - dt.timedelta(days=r.randint(-400, 365 * 8))).isoformat()
    return r.choice(["2026-02-30", "2026-13-01", "2025-02-29", "", "x", "2026-1-1", "2026-01-01T00:00"])


# --- the ruler ---------------------------------------------------------------

def any_rating(r):
    k = r.random()
    if k < 0.6:
        return r.randint(1, 10) / 2
    if k < 0.75:
        return r.choice([2.4999999999999996, 2.5000000000000004, 2.9999999999999996, 4.499999999999999,
                         3.9999999999999996, 1.9999999999999998, 0.0, -1.0, 6.0, math.nan])
    return r.uniform(0, 5.5)


def ruler_vectors(r):
    rows = []
    for _ in range(N):
        fn = r.choice(["forca_nota", "forca_semente", "forca_feedback", "forca_dito", "mais_velha_que",
                       "forca_caminho", "forca_elenco", "forca_elo", "forca_ajustada", "forca_vizinhanca",
                       "forca_tag_movielens", "forca_genoma", "descer", "subir"])
        today = any_today(r)
        if fn == "forca_nota":
            args = [any_rating(r), any_date(r, today), today.isoformat(), r.choice([False, True])]
            out = attempt(regua.forca_nota, args[0], args[1], today, de_feedback=args[3])
        elif fn == "forca_semente":
            args = [r.choice(["nota", "declarado", "relato"]), any_rating(r), any_date(r, today), today.isoformat(),
                    r.choice([False, True])]
            out = attempt(regua.forca_semente, args[0], args[1], args[2], today, de_feedback=args[4])
        elif fn == "forca_feedback":
            args = [r.choice(["nota", "relato"]), any_rating(r), any_date(r, today), today.isoformat()]
            out = attempt(regua.forca_feedback, args[0], args[1], args[2], today)
        elif fn == "forca_dito":
            args = [r.choice(["declarado", "relato"]), r.choice([False, True]), any_date(r, today), today.isoformat()]
            out = attempt(regua.forca_dito, args[0], args[1], args[2], today)
        elif fn == "mais_velha_que":
            args = [any_date(r, today), r.randint(0, 6), today.isoformat()]
            out = attempt(regua._mais_velha_que, args[0], args[1], today)
        elif fn == "forca_caminho":
            args = [r.randint(-2, 6), r.choice(PREDICADOS)]
            out = attempt(regua.forca_caminho, *args)
        elif fn == "forca_elenco":
            args = [r.choice(FORCAS), r.choice([False, True, None])]
            out = attempt(regua.forca_elenco, *args)
        elif fn == "forca_elo":
            args = [r.choice(FORCAS), r.choice(PREDICADOS)]
            out = attempt(regua.forca_elo, *args)
        elif fn == "forca_ajustada":
            args = [r.choice(FORCAS), r.choice(NIVEIS)]
            out = attempt(regua.forca_ajustada, *args)
        elif fn == "forca_vizinhanca":
            base = r.choice([r.randint(0, 40), r.randint(25, 35), r.randint(95, 105), r.randint(495, 505),
                             r.randint(0, 5000)])
            # Around each percentage edge: 25, 40 and 60 % of base.
            edge = r.choice([25, 40, 60]) * base // 100
            ambos = max(0, r.choice([edge - 1, edge, edge + 1, r.randint(0, base or 1)]))
            args = [base, ambos, r.choice(FORCAS)]
            out = attempt(regua.forca_vizinhanca, *args)
        elif fn == "forca_tag_movielens":
            args = [r.randint(-1, 15)]
            out = attempt(regua.forca_tag_movielens, *args)
        elif fn == "forca_genoma":
            args = [r.choice([0.6, 0.8, 0.5999999999999999, 0.7999999999999999, 0.0, 1.0, r.random(), math.nan])]
            out = attempt(regua.forca_genoma, *args)
        else:
            args = [r.choice(FORCAS)]
            out = attempt(getattr(regua, fn), *args)
        rows.append({"fn": fn, "args": tag(args), "out": out})
    return rows


def constant_vectors():
    return [{"fn": fn, "out": getattr(regua, fn)()} for fn in (
        "forca_genero_no_clima", "forca_nota_imdb", "forca_parecido", "forca_metadado_do_pedido", "forca_palpite")] + [
        {"constant": name, "out": tag(getattr(regua, name))} for name in (
            "NOTA_ALTA", "ANOS_FRESCOR", "ANOS_DITO", "FORCA_JA_VISTO", "BASE_MINIMA_VIZINHANCA",
            "PORCENTO_MINIMO_VIZINHANCA")] + [
        {"constant": "TETO_DO_ELO", "out": regua.TETO_DO_ELO}]


# --- wording -----------------------------------------------------------------

TITULOS = ["O Farol de Areia", "Maré Baixa", "", "Straße", "日本語", "A (1999)", "x"]


def wording_vectors(r):
    rows = []
    for _ in range(N):
        fn = r.choice(["nota", "semente", "lista", "filme", "inteiro", "duracao"])
        if fn == "nota":
            args = [r.choice([r.randint(0, 20) / 2, r.random() * 10, r.randint(-5, 5) * 1.0, 1e16, 1e-5, 0.1 + 0.2])]
        elif fn == "semente":
            tipo = r.choice(["nota", "declarado", "relato"])
            valor = r.choice([1.0, 5.0, 1.0, 5.0, 3.0, 4.5]) if tipo != "nota" else r.randint(1, 10) / 2
            args = [tipo, valor, r.choice(TITULOS)]
        elif fn == "lista":
            args = [[r.choice(TITULOS) for _ in range(r.randint(0, 5))]]
        elif fn == "filme":
            args = [r.choice(TITULOS), r.choice([None, 0, 1999, 2026, r.randint(1890, 2030)])]
        elif fn == "inteiro":
            args = [r.choice([r.randint(0, 999), r.randint(0, 10**7), r.randint(-10**6, 0)])]
        else:
            args = [r.choice([r.randint(0, 300), 0, 45, 60, 104, 120, 61, 59, r.randint(-130, 0)])]
        rows.append({"fn": fn, "args": tag(args), "out": attempt(getattr(texto, fn), *args)})
    return rows


# --- Evidence, utility and Regra ---------------------------------------------

def any_weight(r):
    return r.choice([0.0, 0.3, 0.6, 1.0, 1.5, r.random() * 2, -0.5])


def any_pesos(r):
    return {
        "forca": {"multiplicador": {"forte": any_weight(r), "moderada": any_weight(r), "fraca": any_weight(r),
                                    "palpite": r.choice([0.0, 0.0, any_weight(r)])}},
        "utilidade": {"k": r.choice([1.0, 0.5, 2.0, r.random() * 3, 400.0]), "evidencias_maximas": r.randint(0, 7)},
    }


def any_evidencia(r):
    tipo = r.choice(TIPOS)
    base = r.choice([1.0, -1.0, 0.5, -0.5, 0.0, 0.1, 0.2, 0.7, r.uniform(-2, 2), r.uniform(-1, 1)])
    return Evidencia(
        pessoa=r.choice(["bruno", None]), filme_id="tt9000101", texto="x", fonte=r.choice(["Letterboxd", None]),
        data=r.choice(["2025-06-01", None]), forca=r.choice(FORCAS), tipo=tipo,
        fato_id=r.choice(["notas:abc", None]), base=base, ja_visto=r.random() < 0.15,
        conta_como_fato=r.random() < 0.9)


def evidencia_json(e):
    """What the contribution and the utility read; the rest is text."""
    return {"forca": e.forca, "tipo": e.tipo, "base": tag(e.base), "ja_visto": e.ja_visto}


def pesos_json(pesos):
    return {"forca": {"multiplicador": {k: tag(v) for k, v in pesos["forca"]["multiplicador"].items()}},
            "utilidade": {"k": tag(pesos["utilidade"]["k"]),
                          "evidencias_maximas": tag(pesos["utilidade"]["evidencias_maximas"])}}


def utility_vectors(r):
    rows = []
    for _ in range(N):
        pesos = any_pesos(r)
        evidencias = [any_evidencia(r) for _ in range(r.randint(0, 12))]
        rows.append({
            "pesos": pesos_json(pesos),
            "evidencias": [evidencia_json(e) for e in evidencias],
            "contribuicoes": [tag(e.contribuicao(pesos)) for e in evidencias],
            "json": [tag(e.como_json(pesos)["contribuicao"]) for e in evidencias],
            "out": attempt(utilidade.individual, evidencias, pesos),
        })
    return rows


def any_utility(r):
    return r.choice([None, None, 0.5, 0.0, 1.0, 0.1, 0.2, 0.3, r.random(), r.random()])


def rule_vectors(r):
    rows = []
    pessoas = ["bruno", "rosa", "teo", "iara"]
    for _ in range(N):
        presentes = r.sample(pessoas, r.randint(1, 4))
        utilidades = {p: any_utility(r) for p in presentes}
        ajuste = None if r.random() < 0.3 else {p: r.choice([0.0, 0.05, 0.1, r.random() / 4])
                                                  for p in presentes if r.random() < 0.6}
        nome = r.choice(NOMES)
        pessoa = (r.choice(presentes) if r.random() < 0.95 else "quim") if nome == "de" else None
        regra = Regra(nome, pessoa)
        rows.append({
            "nome": nome, "pessoa": pessoa,
            "utilidades": [[p, tag(u)] for p, u in utilidades.items()],
            "ajuste": None if ajuste is None else [[p, tag(a)] for p, a in ajuste.items()],
            "usa_credito": regra.usa_credito,
            "json": regra.como_json(),
            "out": attempt(regra.chave, utilidades, ajuste),
        })
    return rows


def main():
    for name, make in [
        ("ruler", lambda: ruler_vectors(random.Random(21)) + constant_vectors()),
        ("wording", lambda: wording_vectors(random.Random(22))),
        ("utility", lambda: utility_vectors(random.Random(23))),
        ("rule", lambda: rule_vectors(random.Random(24))),
    ]:
        write(name, make())


if __name__ == "__main__":
    main()
