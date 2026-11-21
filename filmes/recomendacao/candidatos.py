"""Candidatos: filmes do Catálogo com votos e nota do IMDb suficientes.

Vetos e Restrições (#18, #22) tiram filmes daqui, antes de qualquer ordenação.
"""

import sqlite3
from dataclasses import dataclass


def escolher(conn: sqlite3.Connection, pesos: dict) -> dict:
    minimo = pesos["catalogo"]["votos_minimos"]
    nota = pesos["catalogo"]["nota_imdb_minima"]
    # Filme sem nota no IMDb não sofre o corte de nota; no Catálogo real todos têm.
    linhas = conn.execute(
        "SELECT * FROM filmes WHERE votos >= ? AND (nota_imdb IS NULL OR nota_imdb >= ?) ORDER BY id",
        (minimo, nota),
    )
    return {linha["id"]: linha for linha in linhas}


@dataclass(frozen=True)
class Selecao:
    """Candidatos e ordem por votos, reaproveitados nas rodadas da avaliação."""

    filmes: dict
    populares: tuple[str, ...]

    @classmethod
    def preparar(cls, conn, pesos):
        filmes = escolher(conn, pesos)
        return cls(filmes, tuple(sorted(filmes, key=lambda id_: (-filmes[id_]["votos"], id_))))
