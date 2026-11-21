"""Ano de lançamento: passa o filme lançado entre `--desde` e `--ate`, os dois inclusive.

Filme sem ano no Catálogo sai: não dá para garantir que está no intervalo.
"""

from dataclasses import dataclass

from filmes.erros import ErroFilmes
from filmes.evidencia import linha_do_pedido
from filmes.recomendacao.restricoes import Passa


def configurar(parser):
    parser.add_argument("--desde", type=int, metavar="ANO", help="só filmes lançados nesse ano ou depois")
    parser.add_argument("--ate", type=int, metavar="ANO", help="só filmes lançados nesse ano ou antes")


def pedido(args):
    if args.desde is None and args.ate is None:
        return None
    if args.desde is not None and args.ate is not None and args.desde > args.ate:
        raise ErroFilmes("uso_invalido", f"--desde {args.desde} depois de --ate {args.ate}")
    return Ano(args.desde, args.ate)


def rotulo(gravada):
    return intervalo(gravada.get("desde"), gravada.get("ate"))


@dataclass(frozen=True)
class Ano:
    desde: int | None
    ate: int | None
    nome = "ano"

    def como_json(self):
        return {"desde": self.desde, "ate": self.ate}

    def resultado(self, saidas):
        return {}

    def avaliar(self, contexto, filmes):
        return {
            filme_id: Passa((self._linha(filme),))
            for filme_id, filme in filmes.items()
            if filme["ano"] is not None and self._dentro(filme["ano"])
        }

    def _dentro(self, ano):
        return (self.desde is None or ano >= self.desde) and (self.ate is None or ano <= self.ate)

    def _linha(self, filme):
        return linha_do_pedido(
            filme["id"], f"lançado em {filme['ano']}, {intervalo(self.desde, self.ate)}",
            fonte="IMDb", data=filme["data_imdb"], fato_id=filme["id"],
        )


def intervalo(desde, ate) -> str:
    """O intervalo pedido como se lê: "de 1990 em diante", "até 2015", "entre 2012 e 2016"."""
    if ate is None:
        return f"de {desde} em diante"
    if desde is None:
        return f"até {ate}"
    return f"entre {desde} e {ate}"
