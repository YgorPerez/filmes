"""Recomendação: Candidatos, sinais por Presente, utilidade e ordem.

    recomendar(conn, amb, presentes, quantos, regra, restricoes, climas) -> dict

Os sinais são módulos em `sinais/`, achados pelo nome. Um sinal de Pessoa
define `sinais(rodada, pessoa) -> Iterable[Evidencia]`; um sinal do filme
(Clima, grupo/sozinho), que não fala de ninguém, define
`sinais_do_filme(rodada) -> Iterable[Evidencia]` com `pessoa=None`. Os dois
devolvem só Evidências de Candidatos da rodada. Acrescentar um sinal não muda
este arquivo.

As Restrições pedidas (`restricoes/`) tiram filmes antes dos sinais; as que
dependem de fonte sob demanda são resolvidas depois da ordem, só no topo dela.
Cada filme que passa traz em `linhas_do_filme` as linhas que dizem por quê.
Os sinais do filme também vão para `linhas_do_filme`, depois das linhas das
Restrições; a soma das contribuições deles é um bônus somado à pontuação da
Regra, que puxa a ordem sem tocar na utilidade de ninguém.

A ordem segue a Regra de escolha (`regra.py`). Cada filme da saída traz a
utilidade e as Evidências de cada Presente, agrupadas pelo slug na ordem dos
Presentes; quem não tem Fato sobre o filme ganha a linha "sem fato".
"""

import importlib
import pkgutil
import sqlite3
from collections import defaultdict
from dataclasses import dataclass

from filmes.ambiente import Ambiente
from filmes.evidencia import sem_fato
from filmes.recomendacao import candidatos, climas as vocabulario_climas, creditos, sinais as pacote_sinais, utilidade, vetos
from filmes.recomendacao.climas import Clima
from filmes.recomendacao.regra import Regra
from filmes.recomendacao.restricoes import Contexto, Filtro


@dataclass(frozen=True)
class Rodada:
    """O que os sinais recebem: o banco, a config, hoje, os Candidatos (id -> linha de
    filmes), os Presentes e os Climas pedidos."""
    conn: sqlite3.Connection
    amb: Ambiente
    candidatos: dict
    presentes: tuple[str, ...] = ()
    climas: tuple[Clima, ...] = ()

    @property
    def em_grupo(self) -> bool:
        return len(self.presentes) > 1

    @property
    def pesos(self) -> dict:
        return self.amb.pesos

    @property
    def hoje(self):
        return self.amb.hoje


def _modulos_de_sinal():
    for info in sorted(pkgutil.iter_modules(pacote_sinais.__path__), key=lambda m: m.name):
        if not info.name.startswith("_"):
            yield importlib.import_module(f"filmes.recomendacao.sinais.{info.name}")


def recomendar(conn: sqlite3.Connection, amb: Ambiente, presentes: list[str], quantos: int,
               regra: Regra = Regra(), restricoes: list = (), climas: list[str] = ()) -> dict:
    # Os Vetos de todos os Presentes valem, seja qual for a Regra de escolha.
    restantes, vetos_que_agiram = vetos.aplicar(conn, presentes, candidatos.escolher(conn, amb.pesos))
    climas_aceitos, avisos_de_clima = vocabulario_climas.resolver(list(climas))
    contexto = Contexto(conn=conn, amb=amb, presentes=presentes, avisos=avisos_de_clima)
    filtro = Filtro(contexto, list(restricoes))
    rodada = Rodada(conn=conn, amb=amb, candidatos=filtro.candidatos(restantes),
                    presentes=tuple(presentes), climas=tuple(climas_aceitos))
    pesos = amb.pesos

    por_filme = defaultdict(list)
    do_filme = defaultdict(list)
    for modulo in _modulos_de_sinal():
        if hasattr(modulo, "sinais"):
            for pessoa in presentes:
                for evidencia in modulo.sinais(rodada, pessoa):
                    por_filme[evidencia.filme_id].append(evidencia)
        if hasattr(modulo, "sinais_do_filme"):
            for evidencia in modulo.sinais_do_filme(rodada):
                do_filme[evidencia.filme_id].append(evidencia)

    # Ordem em três faixas: (0) utilidade conhecida para quem a Regra ouve, pela Regra;
    # (1) Fato sem utilidade conhecida para essa gente, no fim; (2) só palpites, que só
    # aparecem quando faltam Candidatos com Fato. Os sinais do filme somam um bônus que
    # ordena dentro da faixa, sem mudar de faixa; depois, o mais votado antes.
    ordenados = []
    for filme_id, filme in rodada.candidatos.items():
        evidencias = por_filme.get(filme_id, [])
        utilidades = {
            pessoa: utilidade.individual([e for e in evidencias if e.pessoa == pessoa], pesos)
            for pessoa in presentes
        }
        bonus = sum(e.contribuicao(pesos) for e in do_filme.get(filme_id, []))
        pela_regra = regra.chave(utilidades)
        if pela_regra is not None:
            faixa = (0, tuple(-(v + bonus) for v in pela_regra))
        elif any(e.tipo != "palpite" for e in evidencias):
            faixa = (1, (-bonus,))
        else:
            faixa = (2, (-bonus,))
        ordenados.append(((*faixa, -filme["votos"], filme_id), filme, utilidades, evidencias))
    ordenados.sort(key=lambda item: item[0])
    aprovados = filtro.aprovar(ordenados, quantos, pesos["restricoes"]["alcance_sob_demanda"], filme=lambda i: i[1])

    filmes = []
    for posicao, (chave, filme, utilidades, evidencias) in enumerate(aprovados, start=1):
        evidencias = evidencias + [sem_fato(p, filme["id"]) for p, u in utilidades.items() if u is None]
        evidencias = sorted(evidencias, key=lambda e: (-abs(e.contribuicao(pesos)), e.fato_id or ""))
        # Sinais do filme: o mais forte antes; no empate, a ordem dos Climas pedidos.
        do_sinal = sorted(do_filme.get(filme["id"], []), key=lambda e: -abs(e.contribuicao(pesos)))
        filmes.append({
            "posicao": posicao,
            "id": filme["id"],
            "titulo": filme["titulo"],
            "ano": filme["ano"],
            "duracao_min": filme["duracao_min"],
            "so_palpites": chave[0] == 2,
            "utilidade": {p: (round(u, 4) if u is not None else None) for p, u in utilidades.items()},
            "evidencias": {p: [e.como_json(pesos) for e in evidencias if e.pessoa == p] for p in presentes},
            "linhas_do_filme": [e.como_json(pesos) for e in [*filtro.linhas[filme["id"]], *do_sinal]],
        })
    return {
        "presentes": presentes,
        "regra": regra.como_json(),
        "vetos": vetos_que_agiram,
        "climas": [c.nome for c in climas_aceitos],
        "filmes": filmes,
        "restricoes": filtro.como_json(),
        "avisos": contexto.avisos,
        "creditos": creditos.das_fontes(
            e["fonte"] for f in filmes for linhas in (f["linhas_do_filme"], *f["evidencias"].values()) for e in linhas),
    }
