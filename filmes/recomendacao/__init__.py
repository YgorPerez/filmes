"""Recomendação: Candidatos, sinais por Presente, utilidade e ordem.

    recomendar(conn, amb, presentes, quantos, regra) -> dict

Os sinais são módulos em `sinais/`, achados pelo nome. Cada um define
`sinais(rodada, pessoa) -> Iterable[Evidencia]` e devolve as Evidências que
acha para os Candidatos da rodada. Acrescentar um sinal não muda este arquivo.

A ordem segue a Regra de escolha (`regra.py`). Cada filme da saída traz a
utilidade e as Evidências de cada Presente, agrupadas pelo slug na ordem dos
Presentes; quem não tem Fato sobre o filme ganha a linha "sem fato". As linhas
do filme, que não são de um Presente só (hoje, a de Crédito), vão em `do_filme`.
"""

import importlib
import pkgutil
import sqlite3
from collections import defaultdict
from dataclasses import dataclass

from filmes.ambiente import Ambiente
from filmes.evidencia import sem_fato
from filmes.recomendacao import candidatos, sinais as pacote_sinais, utilidade
from filmes.recomendacao.regra import Regra
from filmes.sessao import credito


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
               regra: Regra = Regra()) -> dict:
    rodada = Rodada(conn=conn, amb=amb, candidatos=candidatos.escolher(conn, amb.pesos))
    pesos = amb.pesos

    por_filme = defaultdict(list)
    for modulo in _modulos_de_sinal():
        for pessoa in presentes:
            for evidencia in modulo.sinais(rodada, pessoa):
                por_filme[evidencia.filme_id].append(evidencia)

    # Crédito (#20): só na Regra padrão e em grupo. `ajuste` é o fator × Crédito de cada Pessoa.
    creditos = credito.calcular(conn, presentes, pesos["credito"]["janela"]) \
        if regra.usa_credito and len(presentes) > 1 else {}
    ajuste = {p: pesos["credito"]["fator"] * c.valor for p, c in creditos.items() if c.valor > 0}

    # Ordem em três faixas: (0) utilidade conhecida para quem a Regra ouve, pela Regra;
    # (1) Fato sem utilidade conhecida para essa gente, no fim; (2) só palpites, que só
    # aparecem quando faltam Candidatos com Fato. Dentro de (1) e (2), o mais votado antes.
    ordenados = []
    sem_credito = []
    for filme_id, filme in rodada.candidatos.items():
        evidencias = por_filme.get(filme_id, [])
        utilidades = {
            pessoa: utilidade.individual([e for e in evidencias if e.pessoa == pessoa], pesos)
            for pessoa in presentes
        }
        chave = _chave(regra.chave(utilidades, ajuste), evidencias, filme)
        ordenados.append((chave, filme, utilidades, evidencias))
        if ajuste:
            sem_credito.append((_chave(regra.chave(utilidades), evidencias, filme), filme_id))
    ordenados.sort(key=lambda item: item[0])
    posicao_sem_credito = {filme_id: i for i, (_, filme_id) in enumerate(sorted(sem_credito))}

    nomes = dict(conn.execute("SELECT slug, nome FROM pessoas")) if ajuste else {}
    filmes = []
    for posicao, (chave, filme, utilidades, evidencias) in enumerate(ordenados[:quantos], start=1):
        evidencias = evidencias + [sem_fato(p, filme["id"]) for p, u in utilidades.items() if u is None]
        evidencias = sorted(evidencias, key=lambda e: (-abs(e.contribuicao(pesos)), e.fato_id or ""))
        do_filme = [credito.linha(p, nomes.get(p, p), creditos[p], filme["id"], amb.hoje)
                    for p in _subiu_pelo_credito(filme["id"], posicao, posicao_sem_credito, utilidades, ajuste)]
        filmes.append({
            "posicao": posicao,
            "id": filme["id"],
            "titulo": filme["titulo"],
            "ano": filme["ano"],
            "duracao_min": filme["duracao_min"],
            "so_palpites": chave[0] == 2,
            "utilidade": {p: (round(u, 4) if u is not None else None) for p, u in utilidades.items()},
            "evidencias": {p: [e.como_json(pesos) for e in evidencias if e.pessoa == p] for p in presentes},
            "do_filme": [e.como_json(pesos) for e in do_filme],
        })
    return {"presentes": presentes, "regra": regra.como_json(),
            "credito": {p: round(c.valor, 4) for p, c in creditos.items()},
            "filmes": filmes, "creditos": []}


def _subiu_pelo_credito(filme_id, posicao, posicao_sem_credito, utilidades, ajuste) -> list[str]:
    """Quem tem Crédito e fez este filme subir: o filme ganhou posição com o Crédito, a
    Pessoa tem Fato sobre ele e não é o mínimo da Regra padrão (o filme é dela: com o
    Crédito, os filmes em que ela é o mínimo caíram e este ficou)."""
    if not ajuste or posicao - 1 >= posicao_sem_credito[filme_id]:
        return []
    ajustadas = {p: u - ajuste.get(p, 0.0) for p, u in utilidades.items() if u is not None}
    minimo = min(ajustadas.values())
    return [p for p in ajustadas if p in ajuste and ajustadas[p] > minimo]


def _chave(pela_regra, evidencias, filme) -> tuple:
    if pela_regra is not None:
        faixa = (0, tuple(-v for v in pela_regra))
    elif any(e.tipo != "palpite" for e in evidencias):
        faixa = (1, ())
    else:
        faixa = (2, ())
    return (*faixa, -filme["votos"], filme["id"])
