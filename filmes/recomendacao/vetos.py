"""Vetos dos Presentes: tiram filmes dos Candidatos antes de qualquer ordenação.

Um Veto a uma entidade tira todo filme ligado a ela por alguma aresta (gênero,
diretor, ator...); um Veto a um filme tira só esse filme. Um Veto a gênero tira
também os filmes dos subgêneros dele, descendo pela P279 do Wikidata
(`subclasses_wikidata`), e os filmes que têm no IMDb o gênero equivalente ao
vetado ou a um desses subgêneros (`filmes.catalogo.generos.WIKIDATA`).

Cada filme tirado conta no primeiro caminho que o pegou, nesta ordem: direto,
subgêneros, gênero do IMDb.
"""

import sqlite3

from filmes.catalogo.generos import WIKIDATA

ABAIXO = """
    WITH RECURSIVE abaixo(item) AS (
        SELECT item FROM subclasses_wikidata WHERE classe = ?
        UNION
        SELECT s.item FROM subclasses_wikidata s JOIN abaixo a ON s.classe = a.item
    )
    SELECT item FROM abaixo
"""


def aplicar(conn: sqlite3.Connection, presentes: list[str], candidatos: dict) -> tuple[dict, list[dict]]:
    """Devolve (Candidatos que sobraram, Vetos que agiram)."""
    if not presentes:
        return candidatos, []
    marcas = ", ".join("?" * len(presentes))
    vetos = conn.execute(
        f"SELECT pessoa, texto, alvo, rotulo FROM vetos WHERE pessoa IN ({marcas}) ORDER BY pessoa, data, fato_id",
        presentes,
    ).fetchall()
    restantes = dict(candidatos)
    agiram = []
    for veto in vetos:
        por_caminho = {}
        tirados = set()
        for caminho, filmes in _caminhos(conn, veto["alvo"]):
            novos = (filmes & candidatos.keys()) - tirados
            por_caminho[caminho] = len(novos)
            tirados |= novos
        for filme_id in tirados:
            restantes.pop(filme_id, None)
        if tirados:
            agiram.append({"pessoa": veto["pessoa"], "texto": veto["texto"], "alvo": veto["alvo"],
                           "rotulo": veto["rotulo"], "filmes_tirados": len(tirados),
                           "por_caminho": por_caminho})
    return restantes, agiram


def _caminhos(conn, alvo):
    yield "direto", {alvo} | _coluna(conn, "SELECT filme_id FROM arestas WHERE entidade_id = ?", [alvo])
    subgeneros = _coluna(conn, ABAIXO, [alvo])
    yield "subgeneros", _filmes_dos_generos(conn, subgeneros)
    imdb = [genero for genero, qid in WIKIDATA.items() if qid in subgeneros | {alvo}]
    yield "genero_imdb", _coluna(conn, f"SELECT filme_id FROM generos_imdb WHERE genero IN ({_marcas(imdb)})", imdb)


def _filmes_dos_generos(conn, generos):
    generos = list(generos)
    return _coluna(conn, f"SELECT filme_id FROM arestas WHERE predicado = 'genero' AND entidade_id IN ({_marcas(generos)})",
                   generos)


def _coluna(conn, sql, parametros):
    return {linha[0] for linha in conn.execute(sql, parametros)}


def _marcas(valores):
    return ", ".join("?" * len(valores))
