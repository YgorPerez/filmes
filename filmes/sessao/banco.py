"""A cópia das Sessões no banco, derivada dos arquivos.

Reconstruir carrega todas as Sessões. Recomendar e feedback atualizam os Fatos
da Sessão que vão gravar.
"""

import sqlite3
from pathlib import Path

from filmes.sessao import arquivo, fatos


def carregar_todas(conn: sqlite3.Connection, repo: Path) -> None:
    for sessao_id in arquivo.ids(repo):
        frente, _ = arquivo.ler(repo, sessao_id)
        carregar(conn, sessao_id, frente)


def carregar(conn: sqlite3.Connection, sessao_id: str, frente: dict) -> None:
    _apagar(conn, sessao_id)
    regra = frente["regra"] or {}
    feedback = frente.get("feedback") or {}
    conn.execute(
        """INSERT INTO sessoes (id, data, regra, regra_pessoa, pedido, escolhido, escolhido_na_recomendacao, feedback_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (sessao_id, str(frente["data"]), regra.get("nome", "padrao"), regra.get("pessoa"),
         (frente.get("contexto") or {}).get("pedido"), frente.get("escolhido"),
         frente.get("escolhido_na_recomendacao"),
         str(feedback["registrado_em"]) if feedback else None),
    )
    for pessoa in frente["presentes"]:
        conn.execute("INSERT INTO sessao_presentes (sessao, pessoa) VALUES (?, ?)", (sessao_id, pessoa))
    for item in frente.get("recomendacao") or []:
        conn.execute("INSERT INTO sessao_recomendacao (sessao, posicao, filme_id) VALUES (?, ?, ?)",
                     (sessao_id, item["posicao"], item["id"]))
    for r in fatos.reacoes(sessao_id, frente):
        conn.execute(
            """INSERT INTO reacoes (fato_id, sessao, pessoa, filme_id, tipo, nota, reacao, repassada, valor, data, fonte)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (r.fato_id, r.sessao, r.pessoa, r.filme_id, r.tipo, r.nota, r.reacao, int(r.repassada), r.valor,
             r.data, r.fonte),
        )
        if r.tipo == "nota":
            conn.execute("INSERT INTO notas (fato_id, pessoa, filme_id, nota, data, fonte, sessao) VALUES (?, ?, ?, ?, ?, ?, ?)",
                         (r.fato_id, r.pessoa, r.filme_id, r.nota, r.data, r.fonte, r.sessao))
    dono = {slug for (slug,) in conn.execute("SELECT slug FROM pessoas WHERE dono = 1")}
    for c in fatos.comentarios(sessao_id, frente, dono):
        conn.execute(
            """INSERT INTO declarados (fato_id, pessoa, data, fonte, especifico, reacao, alvo, rotulo, texto, sessao)
               VALUES (?, ?, ?, ?, 1, ?, ?, (SELECT titulo FROM filmes WHERE id = ?), ?, ?)""",
            (c.fato_id, c.pessoa, c.data, c.fonte, c.reacao, c.filme_id, c.filme_id, c.texto, c.sessao))
    for v in fatos.ja_vistos(sessao_id, frente, dono):
        conn.execute("INSERT INTO ja_visto (fato_id, pessoa, filme_id, tipo, data, fonte, sessao) VALUES (?, ?, ?, ?, ?, ?, ?)",
                     (v.fato_id, v.pessoa, v.filme_id, v.tipo, v.data, v.fonte, v.sessao))


def _apagar(conn, sessao_id):
    for tabela in ("notas", "ja_visto", "reacoes", "declarados", "sessao_presentes", "sessao_recomendacao"):
        conn.execute(f"DELETE FROM {tabela} WHERE sessao = ?", (sessao_id,))
    conn.execute("DELETE FROM sessoes WHERE id = ?", (sessao_id,))
