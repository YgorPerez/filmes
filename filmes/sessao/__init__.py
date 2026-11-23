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
    """Grava a Sessão de uma Recomendação, ainda sem Feedback, e devolve {id, arquivo, versao}."""
    with escrita(amb) as conn:
        nomes = dict(conn.execute("SELECT slug, nome FROM pessoas"))
        dono = {slug for (slug,) in conn.execute("SELECT slug FROM pessoas WHERE dono = 1")}
        presentes = recomendacao["presentes"]
        partes = [p for p in presentes if p not in dono] or presentes
        sessao_id = arquivo.novo_id(amb.dados, amb.hoje, partes)
        frente = {
            "data": amb.hoje,
            "dono": next(iter(dono), None),
            **_campos_da_recomendacao(recomendacao, contexto),
            "escolhido": None,
            "escolhido_na_recomendacao": None,
            "feedback": None,
        }
        banco.carregar(conn, sessao_id, frente)
        arquivo.escrever(amb.dados, sessao_id, frente, arquivo.corpo(recomendacao, nomes))
    return {"id": sessao_id, "arquivo": arquivo.relativo(sessao_id), "versao": 1}


def refazer(amb: Ambiente, sessao_id: str, recomendacao: dict, contexto: dict) -> dict:
    """Troca a Recomendação de uma Sessão aberta pela nova, no mesmo arquivo.

    A versão que sai vai para o fim de `versoes` (ver `arquivo.versao_atual`); o
    corpo passa a ter só a Recomendação nova. O ID não muda, mesmo que mudem os
    Presentes. Devolve {id, arquivo, versao}."""
    with escrita(amb) as conn:
        frente = conferir_aberta(amb, sessao_id)
        nomes = dict(conn.execute("SELECT slug, nome FROM pessoas"))
        versoes = [*(frente.get("versoes") or []), arquivo.versao_atual(frente)]
        for campo in ("mostrados", "mantidos", "saidas", "respostas"):
            frente.pop(campo, None)
        frente.update(_campos_da_recomendacao(recomendacao, contexto), refeita_em=amb.hoje, versoes=versoes)
        banco.carregar(conn, sessao_id, frente)
        arquivo.escrever(amb.dados, sessao_id, frente, arquivo.corpo(recomendacao, nomes))
    return {"id": sessao_id, "arquivo": arquivo.relativo(sessao_id), "versao": len(versoes) + 1}


def mostrar(amb: Ambiente, sessao_id: str, mostrados: list[str]) -> None:
    """Grava em `mostrados` os filmes que o Dono viu, na ordem da tela. Sessão com
    Feedback fica como está: a posição do Filme escolhido já foi registrada."""
    with escrita(amb):
        frente, corpo = arquivo.ler(amb.dados, sessao_id)
        if not arquivo.aberta(frente):
            return
        titulos = {r["id"]: r["titulo"] for r in frente.get("recomendacao") or []}
        frente["mostrados"] = [{"posicao": posicao, "id": filme, "titulo": titulos.get(filme)}
                               for posicao, filme in enumerate(mostrados, start=1)]
        arquivo.escrever(amb.dados, sessao_id, frente, corpo)


def conferir_aberta(amb: Ambiente, sessao_id: str) -> dict:
    """O frontmatter da Sessão, ou erro se ela não existe ou já tem Feedback."""
    frente, _ = arquivo.ler(amb.dados, sessao_id)
    if not arquivo.aberta(frente):
        raise ErroFilmes("sessao_fechada", f"a Sessão {sessao_id} já tem Feedback; recomende sem --sessao para abrir outra")
    return frente


def _campos_da_recomendacao(recomendacao: dict, contexto: dict) -> dict:
    """Os campos do frontmatter que mudam quando a Recomendação é refeita."""
    campos = {
        "presentes": recomendacao["presentes"],
        "contexto": contexto,
        "regra": recomendacao["regra"],
        "recomendacao": [{"posicao": f["posicao"], "id": f["id"], "titulo": f["titulo"],
                          **({"novo": f["novo"]} if "novo" in f else {})}
                         for f in recomendacao["filmes"]],
    }
    # Regerar mantendo (#59): o que ficou e o que saiu, com o motivo.
    for campo in ("mantidos", "saidas"):
        if campo in recomendacao:
            campos[campo] = recomendacao[campo]
    return campos


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
                "versao": arquivo.versao_atual(frente)["versao"],
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
