from filmes.sessao import banco


def carregar(conn, amb):
    banco.carregar_todas(conn, amb.dados)
