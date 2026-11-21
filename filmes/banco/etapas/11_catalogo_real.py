from filmes.catalogo import grafo, imdb, versoes


def carregar(conn, amb):
    if (amb.catalogo / "filmes.csv").is_file():
        return
    dumps = versoes.ler(amb.versoes, amb.catalogo)
    imdb.carregar(conn, amb.catalogo, dumps)
    grafo.carregar(conn, amb.catalogo, dumps)
