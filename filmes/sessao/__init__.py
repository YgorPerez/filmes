"""Sessões e Feedback: abrir a Sessão no pedido, fechar com o Feedback, Crédito (#20).

O arquivo `sessoes/<id>.md` do repo de dados é a verdade (`arquivo.py`). O banco
guarda uma cópia derivada (`banco.py`): reconstruir carrega todas as Sessões, e
quem grava um arquivo recarrega aquela Sessão no banco na mesma hora, para a
próxima Recomendação já ver os Fatos novos sem reconstruir.
"""

import sqlite3
from contextlib import contextmanager

from filmes.ambiente import Ambiente
from filmes.erros import ErroFilmes
from filmes.sessao import arquivo, banco


def abrir(amb: Ambiente, recomendacao: dict, contexto: dict) -> dict:
    """Grava a Sessão de uma Recomendação, ainda sem Feedback, e devolve {id, arquivo}."""
    with escrita(amb) as conn:
        nomes = dict(conn.execute("SELECT slug, nome FROM pessoas"))
        dono = {slug for (slug,) in conn.execute("SELECT slug FROM pessoas WHERE dono = 1")}
        presentes = recomendacao["presentes"]
        partes = [p for p in presentes if p not in dono] or presentes
        sessao_id = arquivo.novo_id(amb.dados, amb.hoje, partes)
        frente = {
            "data": amb.hoje,
            "presentes": presentes,
            "contexto": contexto,
            "regra": recomendacao["regra"],
            "escolhido": None,
            "escolhido_na_recomendacao": None,
            "feedback": None,
            "recomendacao": [{"posicao": f["posicao"], "id": f["id"], "titulo": f["titulo"]}
                             for f in recomendacao["filmes"]],
        }
        banco.carregar(conn, sessao_id, frente)
        arquivo.escrever(amb.dados, sessao_id, frente, arquivo.corpo(recomendacao, nomes))
    return {"id": sessao_id, "arquivo": arquivo.relativo(sessao_id)}


def abertas(amb: Ambiente) -> list[dict]:
    """As Sessões sem Feedback, a mais recente primeiro. Lê só os arquivos."""
    lista = []
    for sessao_id in arquivo.ids(amb.dados):
        frente, _ = arquivo.ler(amb.dados, sessao_id)
        if arquivo.aberta(frente):
            lista.append({
                "id": sessao_id,
                "arquivo": arquivo.relativo(sessao_id),
                "data": str(frente["data"]),
                "presentes": frente["presentes"],
                "pedido": (frente.get("contexto") or {}).get("pedido"),
                "recomendacao": frente.get("recomendacao") or [],
            })
    return sorted(lista, key=arquivo.ordem, reverse=True)


@contextmanager
def escrita(amb: Ambiente):
    """O banco aberto para escrita, numa transação."""
    if not amb.banco.exists():
        raise ErroFilmes("banco_ausente", f"banco não encontrado em {amb.banco}: rode `python -m filmes reconstruir`")
    conn = sqlite3.connect(amb.banco)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        with conn:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
    finally:
        conn.close()
