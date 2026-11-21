"""Gatilho: o Dono pede para evitar um tema do Does the Dog Die ("a dog dies").

O filme sai quando o tema tem 3 ou mais votos e mais sim que não. Sem dado
(o site não conhece o filme, não tem o tema, falta a chave, ou o filme está
além do top 50 e não foi consultado), o filme fica, com uma linha de aviso.
O texto do Does the Dog Die vai citado como veio, nunca parafraseado.
"""

from dataclasses import dataclass

from filmes.erros import ErroFilmes
from filmes.evidencia import Evidencia, regua
from filmes.recomendacao.restricoes import PENDENTE, SAI, Passa
from filmes.sob_demanda import ddd

VOTOS_MINIMOS = 3


def configurar(parser):
    parser.add_argument("--gatilho", action="append", metavar="TEMA",
                        help='tema do Does the Dog Die a evitar, ex.: "a dog dies" (repita para mais de um)')


def pedido(args):
    if not args.gatilho:
        return None
    temas = tuple(dict.fromkeys(t.strip() for t in args.gatilho))
    if not all(temas):
        raise ErroFilmes("uso_invalido", "--gatilho vazio")
    return Gatilho(temas)


@dataclass(frozen=True)
class Gatilho:
    temas: tuple
    nome = "gatilho"

    def como_json(self):
        return {"temas": list(self.temas)}

    def avaliar(self, contexto, filmes):
        return {filme_id: PENDENTE for filme_id in filmes}

    def resolver(self, contexto, filme, consultar):
        dados = ddd.de(contexto).temas(filme["id"]) if consultar else None
        linhas = []
        for pedido in self.temas:
            tema = dados.tema(pedido) if dados else None
            if tema is None:
                linhas.append(_sem_informacao(filme["id"], pedido))
            elif tema.sim + tema.nao >= VOTOS_MINIMOS and tema.sim > tema.nao:
                return SAI
            else:
                linhas.append(Evidencia(
                    pessoa=None, filme_id=filme["id"],
                    texto=f'{ddd.NOME}, "{tema.nome}": {tema.sim} sim, {tema.nao} não. {ddd.ATRIBUICAO}',
                    fonte=ddd.NOME, data=dados.data, forca=regua.forca_metadado_do_pedido(), tipo="metadado",
                    fato_id=dados.fato_id, base=0.0,
                ))
        return Passa(tuple(linhas))


def _sem_informacao(filme_id, pedido):
    return Evidencia(
        pessoa=None, filme_id=filme_id, texto=f'sem informação do {ddd.NOME} sobre "{pedido}"',
        fonte=None, data=None, forca=regua.forca_palpite(), tipo="palpite", fato_id=None, base=0.0,
    )
