"""Idioma original (P364): só quando pedido, passa o filme que tem o idioma
pedido entre os originais. Filme sem idioma no Catálogo sai.

O pedido vale pelo código ISO ("pt"), pelo nome ("português") ou pelo QID.
"""

from dataclasses import dataclass

from filmes.erros import ErroFilmes
from filmes.evidencia import linha_do_pedido
from filmes.recomendacao.restricoes import Passa


def configurar(parser):
    parser.add_argument("--idioma", metavar="IDIOMA", help='idioma original exigido: "pt", "português" ou o QID')


def pedido(args):
    if args.idioma is None:
        return None
    if not args.idioma.strip():
        raise ErroFilmes("uso_invalido", "--idioma vazio")
    return Idioma(args.idioma.strip())


@dataclass(frozen=True)
class Idioma:
    pedido: str
    nome = "idioma"

    def como_json(self):
        return {"idioma": self.pedido}

    def avaliar(self, contexto, filmes):
        alvo = self.pedido.casefold()
        vereditos = {}
        for linha in contexto.conn.execute("SELECT * FROM idiomas_originais ORDER BY filme_id, fato_id"):
            if linha["filme_id"] not in filmes or linha["filme_id"] in vereditos:
                continue
            if alvo in {(linha["codigo"] or "").casefold(), linha["rotulo"].casefold(), linha["idioma_id"].casefold()}:
                vereditos[linha["filme_id"]] = Passa((linha_do_pedido(
                    linha["filme_id"], f"idioma original {linha['rotulo']}",
                    fonte=f"{linha['fonte']} P364", data=linha["data"], fato_id=linha["fato_id"],
                ),))
        return vereditos
