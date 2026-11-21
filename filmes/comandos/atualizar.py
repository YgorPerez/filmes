import json
import sys

from filmes.catalogo.atualizacao import atualizar

AJUDA = "baixa os dumps do IMDb e do Wikidata e fixa suas versões"


def configurar(parser):
    pass


def executar(args, amb):
    def progresso(feito, total, mensagem):
        print(json.dumps({"progresso": feito, "total": total, "mensagem": mensagem}, ensure_ascii=False),
              file=sys.stderr, flush=True)

    return atualizar(amb, progresso)
