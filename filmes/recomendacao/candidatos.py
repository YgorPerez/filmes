"""Candidatos: filmes do Catálogo com votos suficientes.

Vetos e Restrições (#18, #22) tiram filmes daqui, antes de qualquer ordenação.
"""

import sqlite3
from dataclasses import dataclass


def escolher(conn: sqlite3.Connection, pesos: dict) -> dict:
    minimo = pesos["catalogo"]["votos_minimos"]
    linhas = conn.execute("SELECT * FROM filmes WHERE votos >= ? ORDER BY id", (minimo,))
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
