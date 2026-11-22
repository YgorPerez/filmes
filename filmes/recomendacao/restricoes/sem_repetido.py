"""Sem repetido: ao refazer a Recomendação numa Sessão aberta (`--sessao`), sai o
filme que a Sessão já mostrou (#57).

Liga sozinha com `--sessao`: refazer já é pedir outras opções. Conta, em cada
versão da Sessão (a atual e as de `versoes`), os `mostrados` que o cartaz
gravou, ou as 5 primeiras posições quando a versão não tem `mostrados`.
Outras Sessões não contam.
"""

from dataclasses import dataclass

from filmes.recomendacao.restricoes import Passa
from filmes.sessao import arquivo

TOPO = 5


def configurar(parser):
    pass   # sem argumento próprio: vem do --sessao de `recomendar`


def pedido(args):
    sessao_id = getattr(args, "sessao", None)
    return SemRepetido(sessao_id) if sessao_id else None


def rotulo(gravada):
    return "nada que a Sessão já mostrou"


@dataclass(frozen=True)
class SemRepetido:
    sessao: str
    nome = "sem_repetido"

    def como_json(self):
        return {}

    def resultado(self, saidas):
        return {}

    def avaliar(self, contexto, filmes):
        mostrados = ja_mostrados(contexto.amb.dados, self.sessao)
        return {filme_id: Passa() for filme_id in filmes if filme_id not in mostrados}


def ja_mostrados(dados, sessao_id) -> set:
    frente, _ = arquivo.ler(dados, sessao_id)
    ids = set()
    for versao in [*(frente.get("versoes") or []), arquivo.versao_atual(frente)]:
        if versao.get("mostrados"):
            ids |= {m["id"] for m in versao["mostrados"]}
        else:
            ids |= {r["id"] for r in versao.get("recomendacao") or [] if r["posicao"] <= TOPO}
    return ids
