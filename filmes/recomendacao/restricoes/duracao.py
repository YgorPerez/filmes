"""Duração máxima: passa o filme que cabe no tempo pedido.

Filme sem duração no Catálogo sai: não dá para garantir que cabe.
"""

from dataclasses import dataclass

from filmes.erros import ErroFilmes
from filmes.evidencia import Evidencia, regua, texto
from filmes.recomendacao.restricoes import Passa


def configurar(parser):
    parser.add_argument("--duracao-max", type=int, metavar="MIN", help="tempo disponível, em minutos")


def pedido(args):
    if args.duracao_max is None:
        return None
    if args.duracao_max < 1:
        raise ErroFilmes("uso_invalido", "--duracao-max precisa ser 1 minuto ou mais")
    return Duracao(args.duracao_max)


@dataclass(frozen=True)
class Duracao:
    maximo: int
    nome = "duracao"

    def como_json(self):
        return {"maximo_min": self.maximo}

    def avaliar(self, contexto, filmes):
        return {
            filme_id: Passa((self._linha(filme),))
            for filme_id, filme in filmes.items()
            if filme["duracao_min"] is not None and filme["duracao_min"] <= self.maximo
        }

    def _linha(self, filme):
        return Evidencia(
            pessoa=None, filme_id=filme["id"],
            texto=f"duração {texto.duracao(filme['duracao_min'])}, dentro do limite de {texto.duracao(self.maximo)}",
            fonte="IMDb", data=None, forca=regua.forca_metadado_do_pedido(), tipo="metadado",
            fato_id=filme["id"], base=0.0,
        )
