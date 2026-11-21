"""Dumps da GroupLens que alimentam os Sinais de Review."""

import csv
import json
from collections import defaultdict
from io import TextIOWrapper
from zipfile import ZipFile

from filmes.banco import fato_id
from filmes.catalogo.versoes import GENOMA, MOVIELENS

FONTES = {
    MOVIELENS: (
        "MovieLens ml-32m", "2023-10-13",
        "https://files.grouplens.org/datasets/movielens/ml-32m.zip",
    ),
    GENOMA: (
        "Tag Genome 2021", "2021-12-30",
        "https://files.grouplens.org/datasets/tag-genome-2021/genome_2021.zip",
    ),
}
MEMBROS = {
    MOVIELENS: ("ml-32m/links.csv", "ml-32m/ratings.csv", "ml-32m/tags.csv"),
    GENOMA: ("movie_dataset_public_final/raw/metadata.json", "movie_dataset_public_final/scores/glmer.csv"),
}


def validar_zip(arquivo):
    with ZipFile(arquivo) as dump:
        for membro in MEMBROS[arquivo.name]:
            with dump.open(membro) as fluxo:
                while fluxo.read(1024 * 1024):
                    pass


def carregar(conn, catalogo, dumps):
    if MOVIELENS not in dumps:
        return
    from filmes.catalogo.vizinhos import vizinhos

    versao = dumps[MOVIELENS]
    with ZipFile(catalogo / versao["sha256"] / MOVIELENS) as dump:
        links, notas, tags = MEMBROS[MOVIELENS]
        mapa = dict(_links(dump, links))
        fonte_e_data = (versao["fonte"], versao["data"])
        conn.executemany("INSERT INTO vizinhos VALUES (?, ?, ?, ?, ?, ?, ?)",
                         _fatos("vizinhos", vizinhos(_csv(dump, notas), mapa), fonte_e_data))
        conn.executemany("INSERT INTO tags_movielens VALUES (?, ?, ?, ?, ?, ?)",
                         _fatos("tags_movielens", _tags(_csv(dump, tags), mapa), fonte_e_data))
    _carregar_genoma(conn, catalogo, dumps[GENOMA])


def _carregar_genoma(conn, catalogo, versao):
    metadata, escores = MEMBROS[GENOMA]
    with ZipFile(catalogo / versao["sha256"] / GENOMA) as dump:
        with dump.open(metadata) as fluxo:
            mapa = {
                str(linha["item_id"]): imdb
                for linha in map(json.loads, fluxo)
                if (imdb := _imdb(linha.get("imdbId")))
            }
        fonte_e_data = (versao["fonte"], versao["data"])
        conn.executemany("""
            INSERT INTO genoma VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(filme_id, tag) DO UPDATE SET
                fato_id = excluded.fato_id, relevancia = excluded.relevancia
            WHERE excluded.relevancia > genoma.relevancia
        """, (
            (id_, filme, tag, float(escore), fonte, data)
            for id_, filme, tag, escore, fonte, data in
            _fatos("genoma", _genoma(_csv(dump, escores), mapa), fonte_e_data)
        ))


def _csv(dump, membro):
    with dump.open(membro) as fluxo, TextIOWrapper(fluxo, encoding="utf-8", newline="") as texto:
        yield from csv.DictReader(texto)


def _imdb(valor):
    return f"tt{valor}" if valor and valor.isdecimal() else None


def _links(dump, membro):
    for linha in _csv(dump, membro):
        imdb = _imdb(linha["imdbId"])
        if imdb:
            yield linha["movieId"], imdb


def _tags(linhas, mapa):
    usuarios = defaultdict(set)
    for linha in linhas:
        filme = mapa.get(linha["movieId"])
        tag = linha["tag"].strip().lower()
        if filme and tag:
            usuarios[filme, tag].add(int(linha["userId"]))
    for (filme, tag), ids in sorted(usuarios.items()):
        yield filme, tag, len(ids)


def _genoma(linhas, mapa):
    for linha in linhas:
        filme = mapa.get(linha["item_id"])
        tag = linha["tag"].strip().lower()
        if filme and tag:
            yield filme, tag, linha["score"]


def _fatos(tabela, linhas, fonte_e_data):
    for linha in linhas:
        valores = linha + fonte_e_data
        yield fato_id(tabela, *valores), *valores
