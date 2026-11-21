from filmes.banco.reconstrucao import reconstruir

AJUDA = "reconstrói o banco do zero a partir dos dumps fixados e do repo de dados"


def configurar(parser):
    pass


def executar(args, amb):
    return reconstruir(amb)
