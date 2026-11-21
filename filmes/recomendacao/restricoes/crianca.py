"""Tem criança: passa o filme cuja faixa é menor ou igual à idade da criança
mais nova. "Tem criança" sem idade vale L.

Cadeia (#15): isAdult do IMDb tira o filme; senão vale a ClassInd; senão a
faixa mais alta entre os outros sistemas convertidos (faixas_etarias); senão o
`Rated` do OMDb, consultado só para os filmes que chegariam ao top 50 e
convertido pela linha da MPA. Sem faixa nenhuma, o filme sai.

A criança não é uma Pessoa e não tem idade guardada: existe só neste pedido.
"""

from dataclasses import dataclass

from filmes.catalogo import classificacao
from filmes.erros import ErroFilmes
from filmes.evidencia import Evidencia, regua
from filmes.recomendacao.restricoes import PENDENTE, SAI, Passa
from filmes.sob_demanda import omdb

IDADE_MAXIMA = 17

# Na falta de ClassInd, empate de faixa entre sistemas fica com o primeiro desta ordem.
_ORDEM_SISTEMAS = [sistema for sistema, _ in classificacao.SISTEMAS.values()]


def configurar(parser):
    parser.add_argument("--crianca", nargs="?", type=int, const=0, metavar="IDADE",
                        help="tem criança; a idade da mais nova (sem idade vale L)")


def pedido(args):
    if args.crianca is None:
        return None
    if not 0 <= args.crianca <= IDADE_MAXIMA:
        raise ErroFilmes("uso_invalido", f"--crianca: idade de 0 a {IDADE_MAXIMA} (sem idade vale L)")
    return Crianca(args.crianca)


@dataclass(frozen=True)
class Crianca:
    idade: int
    nome = "crianca"

    def como_json(self):
        return {"idade": self.idade, "ate_faixa": self._faixa_maxima()}

    def _faixa_maxima(self):
        return [f for f in classificacao.ESCALA if classificacao.idade(f) <= self.idade][-1]

    def avaliar(self, contexto, filmes):
        adultos = {f for (f,) in contexto.conn.execute("SELECT filme_id FROM adultos")}
        faixas = {}
        for linha in contexto.conn.execute("SELECT * FROM faixas_etarias ORDER BY filme_id, fato_id"):
            atual = faixas.get(linha["filme_id"])
            if atual is None or _vence(linha, atual):
                faixas[linha["filme_id"]] = linha

        vereditos = {}
        for filme_id in filmes:
            if filme_id in adultos:
                vereditos[filme_id] = SAI
            elif filme_id in faixas:
                linha = faixas[filme_id]
                vereditos[filme_id] = self._julgar(
                    filme_id, linha["faixa"], linha["sistema"], linha["rotulo"], bool(linha["convertida"]),
                    f"{linha['fonte']} {linha['propriedade']}", linha["data"], linha["fato_id"])
            else:
                vereditos[filme_id] = PENDENTE
        return vereditos

    def resolver(self, contexto, filme, consultar):
        if not consultar:
            return SAI
        resposta = omdb.de(contexto).classificacao(filme["id"])
        if resposta is None:
            return SAI
        convertida = classificacao.converter(classificacao.MPA, resposta.rated)
        if convertida is None:
            return SAI
        sistema, faixa = convertida
        return self._julgar(filme["id"], faixa, sistema, resposta.rated, True,
                            omdb.NOME, resposta.data, resposta.fato_id)

    def _julgar(self, filme_id, faixa, sistema, rotulo, convertida, fonte, data, fato_id):
        if classificacao.idade(faixa) > self.idade:
            return SAI
        # Alguns sistemas já põem o nome no rótulo ("FSK 6"); outros não ("12A" da BBFC).
        rotulo_completo = rotulo if rotulo.startswith(f"{sistema} ") else f"{sistema} {rotulo}"
        de_onde = f"{rotulo_completo} convertida" if convertida else sistema
        return Passa((Evidencia(
            pessoa=None, filme_id=filme_id, texto=f"classificação {faixa} ({de_onde})",
            fonte=fonte, data=data, forca=regua.forca_metadado_do_pedido(), tipo="metadado",
            fato_id=fato_id, base=0.0,
        ),))


def _vence(nova, atual) -> bool:
    """A ClassInd vence qualquer outro sistema; entre os outros, vale a faixa mais alta."""
    nova_classind = nova["propriedade"] == classificacao.CLASSIND
    atual_classind = atual["propriedade"] == classificacao.CLASSIND
    if nova_classind != atual_classind:
        return nova_classind
    if nova["idade"] != atual["idade"]:
        return nova["idade"] > atual["idade"]
    return _ORDEM_SISTEMAS.index(nova["sistema"]) < _ORDEM_SISTEMAS.index(atual["sistema"])
