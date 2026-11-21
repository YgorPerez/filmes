from filmes.verificar import verificar

AJUDA = "confere as linhas de Evidência da resposta contra a Recomendação gravada na Sessão"


def configurar(parser):
    parser.add_argument("--sessao", required=True, help="ID da Sessão")
    parser.add_argument("--texto", required=True, help="resposta em Markdown, no formato da skill")


def executar(args, amb):
    invalidas = verificar(amb.dados, args.sessao, args.texto)
    return {"valida": not invalidas, "linhas_invalidas": invalidas}
