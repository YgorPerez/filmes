from filmes import sessao

AJUDA = "lista as Sessões sem Feedback, a mais recente primeiro"


def configurar(parser):
    pass


def executar(args, amb):
    return {"sessoes": sessao.abertas(amb)}
