"""Crédito: o quanto uma Pessoa ficou atrás nas Sessões recentes (issue #8).

Para cada Sessão passada, a diferença é a média das reações dos Presentes ao
Filme escolhido menos a reação dela, tudo de 0 a 1. Contam só as Sessões em
grupo, com Feedback e Filme escolhido, em que ela teve reação e esteve com pelo
menos um dos Presentes de hoje; das que contam, as `janela` mais recentes.
Crédito = máx(0, média das diferenças). Presente sem reação fica fora da média
daquela Sessão. Vetos não entram em conta nenhuma: não custam Crédito.
"""

import sqlite3
from collections import defaultdict
from dataclasses import dataclass

from filmes.evidencia import Evidencia, regua, texto
from filmes.sessao import arquivo


@dataclass(frozen=True)
class Credito:
    valor: float
    origem: dict | None = None   # a Sessão em que ela ficou mais atrás, para a linha de Evidência


def calcular(conn: sqlite3.Connection, presentes: list[str], janela: int) -> dict[str, Credito]:
    sessoes = conn.execute(
        """SELECT s.id, s.data, s.escolhido, f.titulo, f.ano FROM sessoes s LEFT JOIN filmes f ON f.id = s.escolhido
           WHERE s.feedback_em IS NOT NULL AND s.escolhido IS NOT NULL ORDER BY s.id""").fetchall()
    sessoes.sort(key=arquivo.ordem, reverse=True)
    presentes_de = defaultdict(set)
    for linha in conn.execute("SELECT sessao, pessoa FROM sessao_presentes ORDER BY sessao, pessoa"):
        presentes_de[linha["sessao"]].add(linha["pessoa"])
    reacoes_de = defaultdict(dict)
    for linha in conn.execute("SELECT * FROM reacoes ORDER BY sessao, pessoa, fato_id"):
        reacoes_de[linha["sessao"]][linha["pessoa"]] = linha

    creditos = {}
    for pessoa in presentes:
        outros_hoje = set(presentes) - {pessoa}
        diferencas = []
        for s in sessoes:
            ali, reacoes = presentes_de[s["id"]], reacoes_de[s["id"]]
            if pessoa not in reacoes or len(ali) < 2 or not (ali - {pessoa}) & outros_hoje:
                continue
            media = sum(r["valor"] for r in reacoes.values()) / len(reacoes)
            diferencas.append({"diferenca": media - reacoes[pessoa]["valor"], "media": media,
                               "sessao": s, "reacao": reacoes[pessoa]})
            if len(diferencas) == janela:
                break
        valor = max(0.0, sum(d["diferenca"] for d in diferencas) / len(diferencas)) if diferencas else 0.0
        # Entre empates, max fica com a primeira, que é a mais recente.
        origem = max(diferencas, key=lambda d: d["diferenca"]) if valor > 0 else None
        creditos[pessoa] = Credito(valor, origem)
    return creditos


_RELATO = {"gostou": "gostou", "neutro": "achou neutro", "não gostou": "não gostou"}


def linha(pessoa: str, nome: str, credito: Credito, filme_id: str, hoje) -> Evidencia:
    """A linha do filme que subiu por causa do Crédito, citando a Sessão em que a Pessoa ficou mais atrás.
    Não soma na utilidade (contribuição 0): o Crédito age na Regra, não na Evidência."""
    s, r = credito.origem["sessao"], credito.origem["reacao"]
    filme = s["titulo"] or s["escolhido"]
    reacao = f"deu {texto.nota(r['nota'])}" if r["tipo"] == "nota" else _RELATO[r["reacao"]]
    media = texto.nota(round(0.5 + 4.5 * credito.origem["media"], 1))
    return Evidencia(
        pessoa=pessoa, filme_id=filme_id,
        texto=f"na Sessão de {s['data']} ({filme}), {nome} {reacao} e a média dos Presentes foi {media}",
        fonte=r["fonte"], data=r["data"], forca=regua.forca_feedback(r["tipo"], r["nota"], r["data"], hoje),
        tipo=r["tipo"], fato_id=r["fato_id"], base=0.0,
    )
