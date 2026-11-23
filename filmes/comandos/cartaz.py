from pathlib import Path

import sys

from filmes import cartaz, sessao
from filmes.cartaz import responder
from filmes.erros import ErroFilmes

AJUDA = ("gera o cartaz HTML da Recomendação gravada numa Sessão, para o T3 Code mostrar; "
         "`cartaz responder` lê do stdin o texto que o Dono copiou do cartaz e grava")


def configurar(parser):
    parser.add_argument("acao", nargs="?", choices=["responder"],
                        help="responder: lê do stdin o texto do Copiar pro chat, grava Já vistos, Notas, estrelas, "
                             "comentários e acrescentar, e diz se é preciso regerar")
    parser.add_argument("--sessao", required=True, help="ID da Sessão")
    parser.add_argument("--filmes", type=_ids, metavar="TT,TT",
                        help="só estes filmes da Recomendação, na ordem dada; a Sessão aberta guarda a lista como mostrada")
    parser.add_argument("--saida", help="arquivo .html (padrão: cartazes/<sessão>.html ao lado do banco)")


def executar(args, amb):
    if args.acao == "responder":
        if args.filmes is not None or args.saida:
            raise ErroFilmes("uso_invalido", "cartaz responder só leva --sessao; o texto vem no stdin")
        return responder.responder(amb, args.sessao, sys.stdin.read())
    gerado = cartaz.gerar(amb, args.sessao, args.filmes)
    if args.filmes is not None:
        sessao.mostrar(amb, args.sessao, args.filmes)
    destino = Path(args.saida) if args.saida else amb.banco.parent / "cartazes" / f"{args.sessao}.html"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(gerado["html"], encoding="utf-8")
    return {
        "sessao": args.sessao,
        "arquivo": str(destino.resolve()),
        "filmes": gerado["filmes"],
        "avisos": gerado["avisos"],
    }


def _ids(valor: str) -> list[str]:
    return [parte.strip() for parte in valor.split(",") if parte.strip()]
