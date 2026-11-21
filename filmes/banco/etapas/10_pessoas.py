from filmes.banco import pessoas as fatos
from filmes.dados import pessoas


def carregar(conn, amb):
    for p in pessoas.ler_todas(amb.dados):
        fatos.carregar(conn, p)
