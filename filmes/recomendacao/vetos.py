"""Vetos dos Presentes: tiram filmes dos Candidatos antes de qualquer ordenação.

Um Veto a uma entidade tira todo filme ligado a ela por alguma aresta (gênero,
diretor, ator...); um Veto a um filme tira só esse filme. Um Veto a gênero tira
também os filmes dos subgêneros dele, descendo pela P279 do Wikidata
(`subclasses_wikidata`), e os filmes que têm no IMDb o gênero equivalente ao
vetado ou a um desses subgêneros (`filmes.catalogo.generos.WIKIDATA`).

Um Veto a um grupo de tags (`config/vetos_por_tag.toml`, alvo é a chave do
grupo, como "comedia_boba") tira o filme que tem um dos gêneros do IMDb do grupo
e uma das tags dele com o mínimo de [vetos_por_tag] da config, no Tag Genome
ou no tags.csv do MovieLens. Esse caminho se chama "tags".

Cada filme tirado conta no primeiro caminho que o pegou, nesta ordem: direto,
subgêneros, gênero do IMDb.
"""

import sqlite3

from filmes.ambiente import RAIZ, ler_toml
from filmes.catalogo.generos import WIKIDATA
from filmes.erros import ErroFilmes

GRUPOS = RAIZ / "config" / "vetos_por_tag.toml"


def grupos() -> dict:
    """Chave do grupo -> {rotulo, generos_imdb, tags}."""
    return ler_toml(GRUPOS)


def e_grupo(alvo: str) -> bool:
    """Alvo de Veto que não é filme (tt...) nem entidade (Q...) é a chave de um grupo de tags."""
    return not (alvo.startswith("tt") or alvo.startswith("Q"))

ABAIXO = """
    WITH RECURSIVE abaixo(item) AS (
        SELECT item FROM subclasses_wikidata WHERE classe = ?
        UNION
        SELECT s.item FROM subclasses_wikidata s JOIN abaixo a ON s.classe = a.item
    )
    SELECT item FROM abaixo
"""


def aplicar(conn: sqlite3.Connection, presentes: list[str], candidatos: dict,
            minimos: dict) -> tuple[dict, list[dict]]:
    """Devolve (Candidatos que sobraram, Vetos que agiram). `minimos` é [vetos_por_tag] da config."""
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
        caminhos = _do_grupo(conn, veto["alvo"], minimos) if e_grupo(veto["alvo"]) else _caminhos(conn, veto["alvo"])
        for caminho, filmes in caminhos:
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


def _do_grupo(conn, chave, minimos):
    grupo = grupos().get(chave)
    if grupo is None:
        raise ErroFilmes("config_invalida", f"Veto ao grupo '{chave}', que não está em config/vetos_por_tag.toml")
    tags = [t.lower() for t in grupo["tags"]]
    marcados = _coluna(conn, f"SELECT filme_id FROM genoma WHERE relevancia >= ? AND tag IN ({_marcas(tags)})",
                       [minimos["relevancia_minima"], *tags])
    marcados |= _coluna(conn, f"SELECT filme_id FROM tags_movielens WHERE usuarios >= ? AND tag IN ({_marcas(tags)})",
                        [minimos["usuarios_minimos"], *tags])
    generos = list(grupo.get("generos_imdb", []))
    if generos:
        marcados &= _coluna(conn, f"SELECT filme_id FROM generos_imdb WHERE genero IN ({_marcas(generos)})", generos)
    yield "tags", marcados


def _filmes_dos_generos(conn, generos):
    generos = list(generos)
    return _coluna(conn, f"SELECT filme_id FROM arestas WHERE predicado = 'genero' AND entidade_id IN ({_marcas(generos)})",
                   generos)


def _coluna(conn, sql, parametros):
    return {linha[0] for linha in conn.execute(sql, parametros)}


def _marcas(valores):
    return ", ".join("?" * len(valores))
