"""Candidatos: filmes do Catálogo com votos suficientes.

Vetos e Restrições (#18, #22) tiram filmes daqui, antes de qualquer ordenação.
"""

import sqlite3


def escolher(conn: sqlite3.Connection, pesos: dict) -> dict:
    minimo = pesos["catalogo"]["votos_minimos"]
    linhas = conn.execute("SELECT * FROM filmes WHERE votos >= ? ORDER BY id", (minimo,))
    return {linha["id"]: linha for linha in linhas}
