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
Presentes; quem não tem Fato sobre o filme ganha a linha "sem fato". A linha
de Crédito também vai em `linhas_do_filme` quando o ajuste muda a ordem.
"""

import importlib
import pkgutil
import sqlite3
from collections import defaultdict
from dataclasses import dataclass
from itertools import islice
from typing import NamedTuple

from filmes.ambiente import Ambiente
from filmes.evidencia import sem_fato
from filmes.recomendacao import atribuicoes, cabecalho, candidatos, climas as vocabulario_climas, sinais as pacote_sinais, utilidade, vetos
from filmes.recomendacao.climas import Clima
from filmes.recomendacao.regra import Regra
from filmes.recomendacao.restricoes import Contexto, Restricoes
from filmes.sessao import credito
from filmes.sob_demanda import tmdb


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


class Ordenado(NamedTuple):
    """Um Candidato na ordem: a chave de ordenação e o que a saída mostra dele."""
    chave: tuple
    filme: sqlite3.Row
    utilidades: dict        # Presente -> utilidade, ou None se desconhecida
    evidencias: list        # Evidências dos Presentes sobre o filme


def _modulos_de_sinal():
    for info in sorted(pkgutil.iter_modules(pacote_sinais.__path__), key=lambda m: m.name):
        if not info.name.startswith("_"):
            yield importlib.import_module(f"filmes.recomendacao.sinais.{info.name}")


def recomendar(conn: sqlite3.Connection, amb: Ambiente, presentes: list[str], quantos: int,
               regra: Regra = Regra(), restricoes: list = (), climas: list[str] = (),
               *, selecao: candidatos.Selecao | None = None) -> dict:
    # Os Vetos de todos os Presentes valem, seja qual for a Regra de escolha.
    elegiveis = selecao.filmes if selecao is not None else candidatos.escolher(conn, amb.pesos)
    restantes, vetos_que_agiram = vetos.aplicar(conn, presentes, elegiveis, amb.pesos["vetos_por_tag"])
    climas_aceitos, avisos_de_clima = vocabulario_climas.resolver(list(climas))
    contexto = Contexto(conn=conn, amb=amb, presentes=presentes, avisos=avisos_de_clima)
    pedidas = Restricoes(contexto, list(restricoes))
    rodada = Rodada(conn=conn, amb=amb, candidatos=pedidas.candidatos(restantes),
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

    # Crédito (#20): só na Regra padrão e em grupo. `ajuste` é o fator × Crédito de cada Pessoa.
    creditos_pessoais = credito.calcular(conn, presentes, pesos["credito"]["janela"]) \
        if regra.usa_credito and len(presentes) > 1 else {}
    fator = pesos["credito"]["fator"]
    ajuste = {p: fator * c.valor for p, c in creditos_pessoais.items() if fator and c.valor > 0}

    # Ordem em três faixas: (0) algum Presente tem utilidade conhecida, pela Regra, com
    # 0,5 para quem não tem Fato; (1) Fato só nos sinais do filme; (2) só palpites, que só
    # aparecem quando faltam Candidatos com Fato. Os sinais do filme contam como
    # Fato quando sustentados e somam um bônus à ordem; depois, o mais votado antes.
    ordenados = []
    sem_credito = []
    ids = rodada.candidatos
    if selecao is not None and not ajuste and not pedidas.pendentes:
        # Sem consulta que possa recusar um filme depois de ordenado, os demais
        # palpites não alcançam o topo se já há `quantos` mais votados.
        populares = (filme for filme in selecao.populares if filme in rodada.candidatos)
        ids = por_filme.keys() | do_filme.keys() | set(islice(populares, quantos))
    for filme_id in ids:
        filme = rodada.candidatos[filme_id]
        evidencias = por_filme.get(filme_id, [])
        utilidades = {
            pessoa: utilidade.individual([e for e in evidencias if e.pessoa == pessoa], pesos)
            for pessoa in presentes
        }
        sinais_do_filme = do_filme.get(filme_id, [])
        bonus = sum(e.contribuicao(pesos) for e in sinais_do_filme)
        tem_fato = any(e.tipo != "palpite" and e.conta_como_fato for e in (*evidencias, *sinais_do_filme))
        chave = _chave(regra.chave(utilidades, ajuste), tem_fato, filme, bonus)
        ordenados.append(Ordenado(chave, filme, utilidades, evidencias))
        if ajuste:
            sem_credito.append((_chave(regra.chave(utilidades), tem_fato, filme, bonus), filme_id))
    ordenados.sort(key=lambda item: item.chave)
    aprovados = pedidas.aprovar(ordenados, quantos, pesos["restricoes"]["alcance_sob_demanda"], filme=lambda item: item.filme)
    ids_aprovados = {item.filme["id"] for item in aprovados}
    # Compare as duas ordens com os mesmos vereditos, sem buscar outras respostas sob demanda.
    ordem_sem_credito = [
        filme_id for _, filme_id in sorted(sem_credito)
        if filme_id in ids_aprovados or not pedidas.pendentes.get(filme_id)
    ]
    posicao_sem_credito = {filme_id: i for i, filme_id in enumerate(ordem_sem_credito, start=1)}

    nomes = dict(conn.execute("SELECT slug, nome FROM pessoas")) if ajuste else {}
    filmes = []
    for posicao, (chave, filme, utilidades, evidencias) in enumerate(aprovados, start=1):
        evidencias = evidencias + [sem_fato(p, filme["id"]) for p, u in utilidades.items() if u is None]
        evidencias = sorted(evidencias, key=lambda e: (-abs(e.contribuicao(pesos)), e.fato_id or ""))
        # Sinais do filme: o mais forte antes; no empate, a ordem dos Climas pedidos.
        do_sinal = sorted(do_filme.get(filme["id"], []), key=lambda e: -abs(e.contribuicao(pesos)))
        do_credito = [credito.linha(p, nomes.get(p, p), creditos_pessoais[p], filme["id"], amb.hoje)
                      for p in _subiu_pelo_credito(filme["id"], posicao, posicao_sem_credito, utilidades, ajuste)]
        linhas = [*pedidas.linhas[filme["id"]], *do_sinal, *do_credito]
        filmes.append({
            "posicao": posicao,
            "id": filme["id"],
            "titulo": filme["titulo"],
            "ano": filme["ano"],
            "duracao_min": filme["duracao_min"],
            **cabecalho.do_filme(contexto, filme),
            "cobertura": {
                "com_fato": sum(u is not None for u in utilidades.values()),
                "presentes": len(utilidades),
                "sem_fato": [p for p, u in utilidades.items() if u is None],
            },
            "so_palpites": chave[0] == 2,
            "utilidade": {p: (round(u, 4) if u is not None else None) for p, u in utilidades.items()},
            "evidencias": {p: [e.como_json(pesos) for e in evidencias if e.pessoa == p] for p in presentes},
            "linhas_do_filme": [e.como_json(pesos) for e in linhas],
        })
    return {
        "presentes": presentes,
        "regra": regra.como_json(),
        "credito": {p: round(c.valor, 4) for p, c in creditos_pessoais.items()},
        "vetos": vetos_que_agiram,
        "climas": [c.nome for c in climas_aceitos],
        "filmes": filmes,
        "restricoes": pedidas.como_json(),
        "avisos": contexto.avisos,
        "atribuicoes": atribuicoes.das_fontes([
            *(e["fonte"] for f in filmes for linhas in (f["linhas_do_filme"], *f["evidencias"].values()) for e in linhas),
            *(tmdb.ATRIBUICAO["fonte"] for f in filmes if f["capa"] or f["titulo_pt"]),
        ]),
    }


def _subiu_pelo_credito(filme_id, posicao, posicao_sem_credito, utilidades, ajuste) -> list[str]:
    """Quem tem Crédito e fez este filme subir: o filme ganhou posição com o Crédito, a
    Pessoa tem Fato sobre ele e não é o mínimo da Regra padrão (o filme é dela: com o
    Crédito, os filmes em que ela é o mínimo caíram e este ficou). O mínimo aqui é entre
    quem tem Fato: o 0,5 de quem não tem não conta."""
    if not ajuste or posicao >= posicao_sem_credito[filme_id]:
        return []
    ajustadas = {p: u - ajuste.get(p, 0.0) for p, u in utilidades.items() if u is not None}
    minimo = min(ajustadas.values())
    return [p for p in ajustadas if p in ajuste and ajustadas[p] > minimo]


def _chave(pela_regra, tem_fato, filme, bonus) -> tuple:
    if pela_regra is not None:
        faixa = (0, tuple(-(v + bonus) for v in pela_regra))
    elif tem_fato:
        faixa = (1, (-bonus,))
    else:
        faixa = (2, (-bonus,))
    return (*faixa, -filme["votos"], filme["id"])
