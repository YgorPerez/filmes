"""Recomendação: Candidatos, sinais por Presente, utilidade e ordem.

    recomendar(conn, amb, presentes, quantos) -> dict

Os sinais são módulos em `sinais/`, achados pelo nome. Cada um define
`sinais(rodada, pessoa) -> Iterable[Evidencia]` e devolve as Evidências que
acha para os Candidatos da rodada. Acrescentar um sinal não muda este arquivo.
"""

import importlib
import pkgutil
import sqlite3
from collections import defaultdict
from dataclasses import dataclass

from filmes.ambiente import Ambiente
from filmes.recomendacao import candidatos, sinais as pacote_sinais, utilidade, vetos


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


def recomendar(conn: sqlite3.Connection, amb: Ambiente, presentes: list[str], quantos: int) -> dict:
    restantes, vetos_que_agiram = vetos.aplicar(conn, presentes, candidatos.escolher(conn, amb.pesos))
    rodada = Rodada(conn=conn, amb=amb, candidatos=restantes)
    pesos = amb.pesos

    por_filme = defaultdict(list)
    for modulo in _modulos_de_sinal():
        for pessoa in presentes:
            for evidencia in modulo.sinais(rodada, pessoa):
                por_filme[evidencia.filme_id].append(evidencia)

    ordenados = []
    for filme_id, evidencias in por_filme.items():
        utilidades = {
            pessoa: utilidade.individual([e for e in evidencias if e.pessoa == pessoa], pesos)
            for pessoa in presentes
        }
        conhecidas = [u for u in utilidades.values() if u is not None]
        if not conhecidas:
            continue  # filme só com palpites: ticket #19
        filme = rodada.candidatos[filme_id]
        chave = (-min(conhecidas), -sum(conhecidas) / len(conhecidas), -filme["votos"], filme_id)
        ordenados.append((chave, filme, utilidades, evidencias))
    ordenados.sort(key=lambda item: item[0])

    filmes = []
    for posicao, (_, filme, utilidades, evidencias) in enumerate(ordenados[:quantos], start=1):
        evidencias = sorted(evidencias, key=lambda e: (-abs(e.contribuicao(pesos)), e.fato_id or ""))
        filmes.append({
            "posicao": posicao,
            "id": filme["id"],
            "titulo": filme["titulo"],
            "ano": filme["ano"],
            "duracao_min": filme["duracao_min"],
            "utilidade": {p: (round(u, 4) if u is not None else None) for p, u in utilidades.items()},
            "evidencias": [e.como_json(pesos) for e in evidencias],
        })
    return {"presentes": presentes, "vetos": vetos_que_agiram, "filmes": filmes, "creditos": []}
