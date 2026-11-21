"""Tira as arestas de série que apontam para listas, não para séries de filmes."""


def carregar(conn, amb):
    if conn.execute("SELECT 1 FROM series_de_filmes LIMIT 1").fetchone() is None:
        return
    conn.execute("""
        DELETE FROM arestas
        WHERE predicado = 'serie' AND entidade_id NOT IN (SELECT item FROM series_de_filmes)
    """)
