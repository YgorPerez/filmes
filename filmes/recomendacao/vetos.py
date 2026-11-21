"""Vetos dos Presentes: tiram filmes dos Candidatos antes de qualquer ordenação.

Um Veto a uma entidade tira todo filme ligado a ela por alguma aresta (gênero,
diretor, ator...); um Veto a um filme tira só esse filme.
"""

import sqlite3


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
        filmes = {veto["alvo"]} | {
            linha[0] for linha in conn.execute("SELECT filme_id FROM arestas WHERE entidade_id = ?", (veto["alvo"],))
        }
        tirados = [f for f in filmes if f in candidatos]
        for filme_id in tirados:
            restantes.pop(filme_id, None)
        if tirados:
            agiram.append({"pessoa": veto["pessoa"], "texto": veto["texto"], "alvo": veto["alvo"],
                           "rotulo": veto["rotulo"], "filmes_tirados": len(tirados)})
    return restantes, agiram
