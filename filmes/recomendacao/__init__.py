"""Recomendação: Candidatos, sinais por Presente, utilidade e ordem.

    recomendar(conn, amb, presentes, quantos, regra, climas) -> dict

Os sinais são módulos em `sinais/`, achados pelo nome. Um sinal de Pessoa
define `sinais(rodada, pessoa) -> Iterable[Evidencia]`; um sinal do filme
(Clima, grupo/sozinho), que não fala de ninguém, define
`sinais_do_filme(rodada) -> Iterable[Evidencia]` com `pessoa=None`. Os dois
devolvem só Evidências de Candidatos da rodada. Um módulo pode ainda definir
`CREDITOS = {fonte: frase}`: a frase vai para `creditos` quando uma Evidência
daquela Fonte sai na Recomendação. Acrescentar um sinal não muda este arquivo.

A ordem segue a Regra de escolha (`regra.py`). Cada filme da saída traz a
utilidade e as Evidências de cada Presente, agrupadas pelo slug na ordem dos
Presentes; quem não tem Fato sobre o filme ganha a linha "sem fato". As linhas
do filme vão à parte, em `evidencias_do_filme`, e a soma das contribuições
delas é um bônus somado à pontuação da Regra: puxa a ordem sem tocar na
utilidade de ninguém.
"""

import importlib
import pkgutil
import sqlite3
from collections import defaultdict
from dataclasses import dataclass

from filmes.ambiente import Ambiente
from filmes.evidencia import sem_fato
from filmes.recomendacao import candidatos, climas as vocabulario_climas, sinais as pacote_sinais, utilidade
from filmes.recomendacao.climas import Clima
from filmes.recomendacao.regra import Regra


@dataclass(frozen=True)
class Rodada:
    """O que os sinais recebem: o banco, a config, hoje, os Candidatos (id -> linha de
    filmes) e o Contexto da Sessão (Presentes e Climas pedidos)."""
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
               regra: Regra = Regra(), climas: list[str] = ()) -> dict:
    climas_aceitos, avisos = vocabulario_climas.resolver(list(climas))
    rodada = Rodada(conn=conn, amb=amb, candidatos=candidatos.escolher(conn, amb.pesos),
                    presentes=tuple(presentes), climas=tuple(climas_aceitos))
    pesos = amb.pesos

    por_filme = defaultdict(list)
    do_filme = defaultdict(list)
    creditos_por_fonte = {}
    for modulo in _modulos_de_sinal():
        creditos_por_fonte.update(getattr(modulo, "CREDITOS", {}))
        if hasattr(modulo, "sinais"):
            for pessoa in presentes:
                for evidencia in modulo.sinais(rodada, pessoa):
                    por_filme[evidencia.filme_id].append(evidencia)
        if hasattr(modulo, "sinais_do_filme"):
            for evidencia in modulo.sinais_do_filme(rodada):
                do_filme[evidencia.filme_id].append(evidencia)

    # Ordem em três faixas: (0) utilidade conhecida para quem a Regra ouve, pela Regra;
    # (1) Fato sem utilidade conhecida para essa gente, no fim; (2) só palpites, que só
    # aparecem quando faltam Candidatos com Fato. As linhas do filme somam um bônus que
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

    filmes, fontes = [], set()
    for posicao, (chave, filme, utilidades, evidencias) in enumerate(ordenados[:quantos], start=1):
        evidencias = evidencias + [sem_fato(p, filme["id"]) for p, u in utilidades.items() if u is None]
        evidencias = sorted(evidencias, key=lambda e: (-abs(e.contribuicao(pesos)), e.fato_id or ""))
        # Linhas do filme: a mais forte antes; no empate, a ordem dos Climas pedidos.
        linhas_do_filme = sorted(do_filme.get(filme["id"], []), key=lambda e: -abs(e.contribuicao(pesos)))
        fontes.update(e.fonte for e in evidencias + linhas_do_filme)
        filmes.append({
            "posicao": posicao,
            "id": filme["id"],
            "titulo": filme["titulo"],
            "ano": filme["ano"],
            "duracao_min": filme["duracao_min"],
            "so_palpites": chave[0] == 2,
            "utilidade": {p: (round(u, 4) if u is not None else None) for p, u in utilidades.items()},
            "evidencias": {p: [e.como_json(pesos) for e in evidencias if e.pessoa == p] for p in presentes},
            "evidencias_do_filme": [e.como_json(pesos) for e in linhas_do_filme],
        })
    creditos = [frase for fonte, frase in creditos_por_fonte.items() if fonte in fontes]
    return {"presentes": presentes, "regra": regra.como_json(), "climas": [c.nome for c in climas_aceitos],
            "avisos": avisos, "filmes": filmes, "creditos": creditos}
