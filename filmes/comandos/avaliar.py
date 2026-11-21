import json
import sys

from filmes.avaliacao import avaliar

AJUDA = "mede recall, cobertura de Evidência e Feedback recente"


def configurar(parser):
    parser.add_argument("--grade", action="store_true", help="testa uma grade de pesos")
    parser.add_argument("--progresso", action="store_true", help="envia progresso em JSON pelo stderr")


def executar(args, amb):
    if args.progresso:
        return avaliar(amb, com_grade=args.grade, progresso=_progresso)
    return avaliar(amb, com_grade=args.grade)


def _progresso(valor, mensagem):
    print(json.dumps({"progresso": valor, "total": 100, "mensagem": mensagem}, ensure_ascii=False),
          file=sys.stderr, flush=True)
