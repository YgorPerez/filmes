"""Sem Já visto: só quando o Dono pede, sai o filme que algum Presente já viu.

Sem o pedido, o Já visto não tira filme nenhum; só pesa contra (#20).
"""

from dataclasses import dataclass

from filmes.recomendacao.restricoes import Passa


def configurar(parser):
    parser.add_argument("--sem-ja-visto", action="store_true", help="tira os filmes que algum Presente já viu")


def pedido(args):
    return SemJaVisto() if args.sem_ja_visto else None


def rotulo(gravada):
    return "nada repetido"


@dataclass(frozen=True)
class SemJaVisto:
    nome = "sem_ja_visto"

    def como_json(self):
        return {}

    def resultado(self, saidas):
        return {}

    def avaliar(self, contexto, filmes):
        marcas = ", ".join("?" * len(contexto.presentes))
        vistos = {filme_id for (filme_id,) in contexto.conn.execute(
            f"SELECT filme_id FROM ja_vistos WHERE pessoa IN ({marcas})", contexto.presentes)}
        return {filme_id: Passa() for filme_id in filmes if filme_id not in vistos}
