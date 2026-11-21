"""Recomendação: Candidatos, sinais por Presente, utilidade e ordem.

    recomendar(conn, amb, presentes, quantos, regra, restricoes) -> dict

Os sinais são módulos em `sinais/`, achados pelo nome. Cada um define
`sinais(rodada, pessoa) -> Iterable[Evidencia]` e devolve as Evidências que
acha para os Candidatos da rodada. Acrescentar um sinal não muda este arquivo.

As Restrições pedidas (`restricoes/`) tiram filmes antes dos sinais; as que
dependem de fonte sob demanda são resolvidas depois da ordem, só no topo dela.
Cada filme que passa traz em `linhas_do_filme` as linhas que dizem por quê.

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
from filmes.recomendacao import candidatos, creditos, sinais as pacote_sinais, utilidade, vetos
from filmes.recomendacao.regra import Regra
from filmes.recomendacao.restricoes import Contexto, Filtro


@dataclass(frozen=True)
class Rodada:
    """O que os sinais recebem: o banco, a config, hoje e os Candidatos (id -> linha de filmes)."""
    conn: sqlite3.Connection
    amb: Ambiente
    candidatos: dict

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
               regra: Regra = Regra(), restricoes: list = ()) -> dict:
    # Os Vetos de todos os Presentes valem, seja qual for a Regra de escolha.
    restantes, vetos_que_agiram = vetos.aplicar(conn, presentes, candidatos.escolher(conn, amb.pesos))
    contexto = Contexto(conn=conn, amb=amb, presentes=presentes)
    filtro = Filtro(contexto, list(restricoes))
    rodada = Rodada(conn=conn, amb=amb, candidatos=filtro.candidatos(restantes))
    pesos = amb.pesos

    por_filme = defaultdict(list)
    for modulo in _modulos_de_sinal():
        for pessoa in presentes:
            for evidencia in modulo.sinais(rodada, pessoa):
                por_filme[evidencia.filme_id].append(evidencia)

    # Ordem em três faixas: (0) utilidade conhecida para quem a Regra ouve, pela Regra;
    # (1) Fato sem utilidade conhecida para essa gente, no fim; (2) só palpites, que só
    # aparecem quando faltam Candidatos com Fato. Dentro de (1) e (2), o mais votado antes.
    ordenados = []
    for filme_id, filme in rodada.candidatos.items():
        evidencias = por_filme.get(filme_id, [])
        utilidades = {
            pessoa: utilidade.individual([e for e in evidencias if e.pessoa == pessoa], pesos)
            for pessoa in presentes
        }
        pela_regra = regra.chave(utilidades)
        if pela_regra is not None:
            faixa = (0, tuple(-v for v in pela_regra))
        elif any(e.tipo != "palpite" for e in evidencias):
            faixa = (1, ())
        else:
            faixa = (2, ())
        ordenados.append(((*faixa, -filme["votos"], filme_id), filme, utilidades, evidencias))
    ordenados.sort(key=lambda item: item[0])
    aprovados = filtro.aprovar(ordenados, quantos, pesos["restricoes"]["alcance_sob_demanda"], filme=lambda i: i[1])

    filmes = []
    for posicao, (chave, filme, utilidades, evidencias) in enumerate(aprovados, start=1):
        evidencias = evidencias + [sem_fato(p, filme["id"]) for p, u in utilidades.items() if u is None]
        evidencias = sorted(evidencias, key=lambda e: (-abs(e.contribuicao(pesos)), e.fato_id or ""))
        filmes.append({
            "posicao": posicao,
            "id": filme["id"],
            "titulo": filme["titulo"],
            "ano": filme["ano"],
            "duracao_min": filme["duracao_min"],
            "so_palpites": chave[0] == 2,
            "utilidade": {p: (round(u, 4) if u is not None else None) for p, u in utilidades.items()},
            "evidencias": {p: [e.como_json(pesos) for e in evidencias if e.pessoa == p] for p in presentes},
            "linhas_do_filme": [e.como_json(pesos) for e in filtro.linhas[filme["id"]]],
        })
    return {
        "presentes": presentes,
        "regra": regra.como_json(),
        "vetos": vetos_que_agiram,
        "filmes": filmes,
        "restricoes": filtro.como_json(),
        "avisos": contexto.avisos,
        "creditos": creditos.das_fontes(
            e["fonte"] for f in filmes for linhas in (f["linhas_do_filme"], *f["evidencias"].values()) for e in linhas),
    }
