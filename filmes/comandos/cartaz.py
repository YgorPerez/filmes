from pathlib import Path

from filmes import cartaz

AJUDA = "gera o cartaz HTML da Recomendação gravada numa Sessão, para o T3 Code mostrar"


def configurar(parser):
    parser.add_argument("--sessao", required=True, help="ID da Sessão")
    parser.add_argument("--saida", help="arquivo .html (padrão: cartazes/<sessão>.html ao lado do banco)")


def executar(args, amb):
    gerado = cartaz.gerar(amb, args.sessao)
    destino = Path(args.saida) if args.saida else amb.banco.parent / "cartazes" / f"{args.sessao}.html"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(gerado["html"], encoding="utf-8")
    return {
        "sessao": args.sessao,
        "arquivo": str(destino.resolve()),
        "filmes": gerado["filmes"],
        "avisos": gerado["avisos"],
    }
