"""Créditos do elenco: os 3 primeiros atores do title.principals do IMDb e o
nconst de cada ator do Wikidata (P345), para o caminho de conteúdo saber quem é
coadjuvante. Os dois dumps são opcionais no manifesto; sem eles, as tabelas
ficam vazias e a régua do elenco não muda."""

import csv
import gzip

from filmes.catalogo import versoes, wikidata

CATEGORIAS = {"actor", "actress"}
PRIMEIROS = 3


def carregar(conn, pasta, dumps):
    if versoes.PRINCIPAIS in dumps:
        arquivo = pasta / dumps[versoes.PRINCIPAIS]["sha256"] / versoes.PRINCIPAIS
        filmes = {filme for (filme,) in conn.execute("SELECT id FROM filmes")}
        conn.executemany(
            "INSERT INTO elenco_principal_imdb (filme_id, ordem, ator_imdb) VALUES (?, ?, ?)",
            _primeiros(arquivo, filmes),
        )
    for nome, versao in sorted(dumps.items()):
        if nome.startswith("wikidata-atores"):
            conn.executemany(
                "INSERT INTO atores_imdb (item, imdb) VALUES (?, ?) ON CONFLICT DO NOTHING",
                ((wikidata.qid(linha["item"]), linha["valor"]["value"])
                 for linha in wikidata.linhas(pasta / versao["sha256"] / nome)),
            )


def _primeiros(arquivo, filmes):
    """Os 3 primeiros atores ou atrizes de cada filme, pelo `ordering`."""
    atores = {}
    with gzip.open(arquivo, "rt", encoding="utf-8", newline="") as f:
        linhas = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
        cabecalho = next(linhas)
        id_, ordem, pessoa, categoria = (cabecalho.index(c) for c in ("tconst", "ordering", "nconst", "category"))
        for linha in linhas:
            filme = linha[id_]
            if filme in filmes and linha[categoria] in CATEGORIAS:
                atores.setdefault(filme, []).append((int(linha[ordem]), linha[pessoa]))
    for filme, creditos in atores.items():
        for posicao, (_, ator) in enumerate(sorted(creditos)[:PRIMEIROS], start=1):
            yield filme, posicao, ator
