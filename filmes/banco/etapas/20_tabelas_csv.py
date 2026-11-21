from filmes.catalogo import tabelas


def carregar(conn, amb):
    tabelas.carregar(conn, amb.catalogo)
