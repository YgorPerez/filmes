from filmes.importar import trakt


def carregar(conn, amb):
    trakt.carregar(conn, amb)
