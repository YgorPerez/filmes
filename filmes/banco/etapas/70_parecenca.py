"""Pré-cálculo da parecença: média de cada tag no genoma, raridade de cada tag do
MovieLens e a norma do vetor de tags de cada filme (esquema em 51_parecenca.sql)."""

import math


def carregar(conn, amb):
    conn.create_function("ln", 1, math.log, deterministic=True)
    conn.create_function("ln1p", 1, math.log1p, deterministic=True)
    conn.execute("""
        INSERT INTO tags_no_catalogo (fonte, tag, valor)
        SELECT 'genoma', tag, sum(relevancia) * 1.0 / (SELECT count(DISTINCT filme_id) FROM genoma)
        FROM genoma GROUP BY tag""")
    conn.execute("""
        INSERT INTO tags_no_catalogo (fonte, tag, valor)
        SELECT 'tags_movielens', tag, ln((SELECT count(DISTINCT filme_id) FROM tags_movielens) * 1.0 / count(*))
        FROM tags_movielens GROUP BY tag""")
    normas = {}
    for filme_id, usuarios, raridade in conn.execute("""
            SELECT t.filme_id, t.usuarios, r.valor FROM tags_movielens t
            JOIN tags_no_catalogo r ON r.fonte = 'tags_movielens' AND r.tag = t.tag"""):
        normas[filme_id] = normas.get(filme_id, 0.0) + (math.log1p(usuarios) * raridade) ** 2
    conn.executemany("INSERT INTO normas_tags_movielens (filme_id, norma) VALUES (?, ?)",
                     ((f, math.sqrt(q)) for f, q in normas.items()))
