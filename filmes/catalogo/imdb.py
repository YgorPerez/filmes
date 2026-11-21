"""Filmes com 100+ votos nos TSVs publicados pelo IMDb."""

import csv
import gzip

from filmes.banco import fato_id
from filmes.catalogo.versoes import IMDB

VOTOS_MINIMOS = 100


def carregar(conn, pasta, dumps):
    nome_filmes, nome_notas = IMDB
    filmes, notas = dumps[nome_filmes], dumps[nome_notas]
    notas_por_id = _notas(pasta / notas["sha256"] / nome_notas)
    arquivo = pasta / filmes["sha256"] / nome_filmes
    adultos = []
    conn.executemany(
        """INSERT INTO filmes (id, titulo, ano, duracao_min, votos, nota_imdb, data_imdb, data_votos_imdb)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        _filmes(arquivo, notas_por_id, adultos, filmes["data"], notas["data"]),
    )
    conn.executemany("INSERT INTO adultos (fato_id, filme_id, fonte, data) VALUES (?, ?, ?, ?)", adultos)


def _notas(arquivo):
    notas = {}
    with gzip.open(arquivo, "rt", encoding="utf-8", newline="") as f:
        linhas = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
        cabecalho = next(linhas)
        id_, nota, votos = (cabecalho.index(c) for c in ("tconst", "averageRating", "numVotes"))
        for linha in linhas:
            quantidade = int(linha[votos])
            if quantidade >= VOTOS_MINIMOS:
                notas[linha[id_]] = (float(linha[nota]), quantidade)
    return notas


def _filmes(arquivo, notas, adultos, data, data_notas):
    with gzip.open(arquivo, "rt", encoding="utf-8", newline="") as f:
        linhas = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
        cabecalho = next(linhas)
        id_, tipo, titulo, adulto, ano, duracao = (cabecalho.index(c) for c in (
            "tconst", "titleType", "primaryTitle", "isAdult", "startYear", "runtimeMinutes",
        ))
        for linha in linhas:
            filme = linha[id_]
            if linha[tipo] != "movie" or filme not in notas:
                continue
            if linha[adulto] == "1":
                valores = (filme, "IMDb", data)
                adultos.append((fato_id("adultos", *valores), *valores))
                continue
            if linha[adulto] != "0":
                raise ValueError(f"isAdult inesperado no IMDb para {filme}: {linha[adulto]!r}")
            nota, votos = notas[filme]
            yield (filme, linha[titulo], _inteiro(linha[ano]), _inteiro(linha[duracao]), votos, nota, data, data_notas)


def _inteiro(valor):
    return None if valor == r"\N" else int(valor)
