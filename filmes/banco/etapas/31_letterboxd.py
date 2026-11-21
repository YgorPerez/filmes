import sqlite3

from filmes.importar import letterboxd


def carregar(conn, amb):
    anterior = conn.row_factory
    conn.row_factory = sqlite3.Row
    try:
        letterboxd.carregar(conn, amb)
    finally:
        conn.row_factory = anterior
