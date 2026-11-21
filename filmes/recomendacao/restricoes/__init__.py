"""Restrições da Sessão: limites que valem só no pedido de hoje e tiram filmes
antes de qualquer ordenação.

Cada Restrição é um módulo deste pacote, achado pelo nome. O módulo define:

    def configurar(parser)                 # argumentos de `recomendar`
    def pedido(args) -> Restricao | None   # None quando o pedido não traz a Restrição

e a Restrição devolvida tem:

    nome: str                              # chave em "restricoes" no JSON
    def como_json(self) -> dict            # o que foi pedido, para a leitura do pedido
    def avaliar(self, contexto, filmes) -> dict[filme_id, Veredito]
    def resolver(self, contexto, filme, consultar) -> Passa | SAI   # só se avaliar deu PENDENTE

`avaliar` recebe todos os Candidatos (id -> linha de filmes) de uma vez, para
resolver com uma consulta só. Filme que passa leva as linhas do filme
(Evidências com `pessoa` nula) que justificam ter passado. PENDENTE é para a
Restrição que precisa de fonte sob demanda (OMDb, Does the Dog Die): o filme
entra na ordenação e só é resolvido se chegar ao top 50 (`consultar` verdadeiro);
depois disso, `resolver` decide sem consultar.
"""

import importlib
import pkgutil
import sqlite3
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from filmes.ambiente import Ambiente


@dataclass(frozen=True)
class Passa:
    linhas: tuple = ()


SAI = "sai"
PENDENTE = "pendente"


@dataclass
class Contexto:
    """O que uma Restrição pode consultar: o banco, a config, os Presentes e as fontes sob demanda."""
    conn: sqlite3.Connection
    amb: Ambiente
    presentes: list
    avisos: list = field(default_factory=list)
    fontes: dict = field(default_factory=dict)   # clientes sob demanda abertos nesta execução


def _modulos():
    for info in sorted(pkgutil.iter_modules(__path__), key=lambda m: m.name):
        if not info.name.startswith("_"):
            yield importlib.import_module(f"{__name__}.{info.name}")


def configurar(parser):
    for modulo in _modulos():
        modulo.configurar(parser)


def ler(args) -> list:
    return [r for r in (modulo.pedido(args) for modulo in _modulos()) if r is not None]


class Filtro:
    """Aplica as Restrições pedidas: antes da ordenação, e sob demanda depois dela."""

    def __init__(self, contexto: Contexto, restricoes: list):
        self.contexto = contexto
        self.restricoes = restricoes
        self.linhas = defaultdict(list)
        self.pendentes = defaultdict(list)
        self.tirados = Counter()

    def candidatos(self, filmes: dict) -> dict:
        vivos = dict(filmes)
        for restricao in self.restricoes:
            vereditos = restricao.avaliar(self.contexto, vivos)
            for filme_id in list(vivos):
                veredito = vereditos.get(filme_id, SAI)
                if veredito == SAI:
                    del vivos[filme_id]
                    self.tirados[restricao.nome] += 1
                elif veredito == PENDENTE:
                    self.pendentes[filme_id].append(restricao)
                else:
                    self.linhas[filme_id].extend(veredito.linhas)
        return vivos

    def aprovar(self, ordenados: list, quantos: int, alcance: int, filme=lambda item: item) -> list:
        """Os primeiros `quantos` itens da ordem cujo filme passa nas Restrições sob demanda.

        `filme(item)` dá a linha de filmes de cada item. Só os filmes nas `alcance`
        primeiras posições consultam fonte sob demanda; os outros, `resolver` decide sem consultar.
        """
        aprovados = []
        for posicao, item in enumerate(ordenados):
            if len(aprovados) == quantos:
                break
            if self._passa_sob_demanda(filme(item), consultar=posicao < alcance):
                aprovados.append(item)
        return aprovados

    def _passa_sob_demanda(self, filme, consultar) -> bool:
        linhas = []
        for restricao in self.pendentes.get(filme["id"], []):
            veredito = restricao.resolver(self.contexto, filme, consultar)
            if veredito == SAI:
                self.tirados[restricao.nome] += 1
                return False
            linhas.extend(veredito.linhas)
        self.linhas[filme["id"]].extend(linhas)
        return True

    def como_json(self) -> dict:
        return {r.nome: {**r.como_json(), "tirados": self.tirados[r.nome]} for r in self.restricoes}
