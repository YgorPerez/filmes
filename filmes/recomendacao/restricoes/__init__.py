"""Restrições da Sessão: limites que valem só no pedido de hoje e tiram filmes
antes de qualquer ordenação.

Cada Restrição é um módulo deste pacote, com o mesmo nome dela. O módulo define:

    def configurar(parser)                 # argumentos de `recomendar`
    def pedido(args) -> Restricao | None   # None quando o pedido não traz a Restrição
    def rotulo(gravada: dict) -> str       # o pedido como se lê ("nada triste"), a partir
                                           # de {"nome", **como_json()} gravado na Sessão

e a Restrição devolvida tem:

    nome: str                              # chave em "restricoes" no JSON
    def como_json(self) -> dict            # o que foi pedido, para a leitura do pedido
    def resultado(self, saidas) -> dict    # o que a Restrição achou, ao lado de "tirados"
    def avaliar(self, contexto, filmes) -> dict[filme_id, Veredito]
    def resolver(self, contexto, filme, consultar) -> Passa | Sai   # só se avaliar deu PENDENTE

`avaliar` recebe todos os Candidatos (id -> linha de filmes) de uma vez, para
resolver com uma consulta só. Filme que passa leva as linhas do filme
(Evidências com `pessoa` nula) que justificam ter passado. Filme que sai é `SAI`,
ou `Sai(motivo)` quando a Restrição conta as saídas por motivo: `resultado`
recebe essa contagem (Counter motivo -> filmes) e devolve {} quando não usa. PENDENTE é para a
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


@dataclass(frozen=True)
class Sai:
    motivo: str | None = None


SAI = Sai()
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


def rotulo(gravada: dict) -> str:
    """A Restrição gravada na Sessão como se lê; o nome cru se não há módulo com esse nome."""
    nome = str(gravada.get("nome"))
    modulo = next((m for m in _modulos() if m.__name__.rpartition(".")[2] == nome), None)
    return modulo.rotulo(gravada) if modulo else nome


class Restricoes:
    """Aplica as Restrições pedidas: antes da ordenação, e sob demanda depois dela."""

    def __init__(self, contexto: Contexto, restricoes: list):
        self.contexto = contexto
        self.restricoes = restricoes
        self.linhas = defaultdict(list)
        self.pendentes = defaultdict(list)
        self.tirados = Counter()
        self.saidas = defaultdict(Counter)   # nome da Restrição -> motivo -> filmes
        self.tirou = {}                      # filme_id -> a Restrição que o tirou

    def candidatos(self, filmes: dict) -> dict:
        vivos = dict(filmes)
        for restricao in self.restricoes:
            vereditos = restricao.avaliar(self.contexto, vivos)
            for filme_id in list(vivos):
                veredito = vereditos.get(filme_id, SAI)
                if isinstance(veredito, Sai):
                    del vivos[filme_id]
                    self._contar_saida(restricao, veredito, filme_id)
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
            if self.passa_sob_demanda(filme(item), consultar=posicao < alcance):
                aprovados.append(item)
        return aprovados

    def passa_sob_demanda(self, filme, consultar) -> bool:
        linhas = []
        for restricao in self.pendentes.get(filme["id"], []):
            veredito = restricao.resolver(self.contexto, filme, consultar)
            if isinstance(veredito, Sai):
                self._contar_saida(restricao, veredito, filme["id"])
                return False
            linhas.extend(veredito.linhas)
        self.linhas[filme["id"]].extend(linhas)
        return True

    def _contar_saida(self, restricao, veredito: Sai, filme_id) -> None:
        self.tirou[filme_id] = restricao
        self.tirados[restricao.nome] += 1
        if veredito.motivo is not None:
            self.saidas[restricao.nome][veredito.motivo] += 1

    def como_json(self) -> dict:
        return {r.nome: {**r.como_json(), **r.resultado(self.saidas[r.nome]), "tirados": self.tirados[r.nome]}
                for r in self.restricoes}
