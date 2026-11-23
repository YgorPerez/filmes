"""Os Fatos de uma Pessoa no banco, a partir do arquivo dela no repo de dados.

`reconstruir` chama `carregar` para cada Pessoa. Os comandos que escrevem o
arquivo chamam `sincronizar`, que refaz no banco só as linhas daquela Pessoa,
para o que o Dono registrou valer na próxima Recomendação sem reconstruir tudo.
"""

import re
import sqlite3
from pathlib import Path

from filmes.banco import fato_id
from filmes.dados.pessoas import Pessoa
from filmes.erros import ErroFilmes


def carregar(conn: sqlite3.Connection, pessoa: Pessoa) -> None:
    conn.execute(
        "INSERT INTO pessoas (slug, nome, dono) VALUES (?, ?, ?) "
        "ON CONFLICT (slug) DO UPDATE SET nome = excluded.nome, dono = excluded.dono",
        (pessoa.slug, pessoa.nome, int(pessoa.dono)),
    )
    for apelido in sorted(set(pessoa.apelidos)):
        conn.execute("INSERT INTO apelidos (pessoa, apelido) VALUES (?, ?)", (pessoa.slug, apelido))
    for veto in pessoa.vetos:
        conn.execute(
            "INSERT OR IGNORE INTO vetos (fato_id, pessoa, alvo, rotulo, texto, data) VALUES (?, ?, ?, ?, ?, ?)",
            (id_do_veto(pessoa.slug, veto), pessoa.slug, veto.alvo, veto.rotulo, veto.texto, veto.data),
        )
    for ajuste in pessoa.ajustes:
        conn.execute(
            "INSERT INTO ajustes (fato_id, pessoa, elo, nivel, data) VALUES (?, ?, ?, ?, ?)",
            (id_do_ajuste(pessoa.slug, ajuste), pessoa.slug, ajuste.elo, ajuste.nivel, ajuste.data),
        )
    for pergunta in pessoa.perguntas_abertas:
        conn.execute(
            "INSERT INTO perguntas_abertas (fato_id, pessoa, texto, assunto, rotulo, data, puladas) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (id_da_pergunta(pessoa.slug, pergunta), pessoa.slug, pergunta.texto, pergunta.assunto,
             pergunta.rotulo, pergunta.data, pergunta.puladas),
        )
    for tabela, ditos in (("declarados", pessoa.declarados), ("relatos", pessoa.relatos)):
        for dito in ditos:
            id_ = id_do_dito(tabela, pessoa.slug, dito)
            conn.execute(
                f"""INSERT OR IGNORE INTO {tabela} (fato_id, pessoa, data, fonte, especifico, reacao, alvo, rotulo, texto)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (id_, pessoa.slug, dito.data, dito.fonte, int(dito.especifico),
                 dito.reacao, dito.alvo, dito.rotulo, dito.texto),
            )
            nota = nota_declarada(dito)
            if nota is not None:
                conn.execute(
                    "INSERT OR IGNORE INTO notas (fato_id, pessoa, filme_id, nota, data, fonte, tipo) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (id_, pessoa.slug, dito.alvo, nota, dito.data, dito.fonte, tabela[:-1]),
                )

    for visto in pessoa.ja_vistos:
        id_ = id_do_ja_visto(pessoa.slug, visto)
        if visto.nota is None:
            conn.execute(
                "INSERT OR IGNORE INTO ja_visto (fato_id, pessoa, filme_id, tipo, data, fonte) VALUES (?, ?, ?, 'declarado', ?, ?)",
                (id_, pessoa.slug, visto.alvo, visto.data, visto.fonte),
            )
        else:
            # Toda Nota já é Já visto (view ja_vistos): não precisa de linha em ja_visto.
            conn.execute(
                "INSERT OR IGNORE INTO notas (fato_id, pessoa, filme_id, nota, data, fonte, tipo) VALUES (?, ?, ?, ?, ?, ?, 'nota')",
                (id_, pessoa.slug, visto.alvo, visto.nota, visto.data, visto.fonte),
            )


def id_do_veto(slug: str, veto) -> str:
    return fato_id("vetos", slug, veto.alvo, veto.texto, veto.data)


def id_do_ajuste(slug: str, ajuste) -> str:
    return fato_id("ajustes", slug, ajuste.elo, ajuste.nivel, ajuste.data)


def id_da_pergunta(slug: str, pergunta) -> str:
    """Não muda com o contador nem com a data: é a mesma pergunta pulada de novo."""
    return fato_id("perguntas_abertas", slug, pergunta.assunto or pergunta.texto.casefold())


def id_do_ja_visto(slug: str, visto) -> str:
    return fato_id("vistos", slug, visto.data, visto.fonte, visto.alvo, visto.nota)


def nota_declarada(dito) -> float | None:
    """Sobre um filme, "amo" vira Nota 5 e "odeio" vira Nota 1. O resto não vira Nota."""
    if dito.alvo and dito.alvo.startswith("tt"):
        return {"ama": 5.0, "odeia": 1.0}.get(dito.reacao)
    return None


def sincronizar(banco: Path, pessoa: Pessoa) -> bool:
    """Troca as linhas da Pessoa no banco pelas do arquivo. Sem banco, não faz nada e devolve False."""
    if not banco.exists():
        return False
    conn = sqlite3.connect(banco)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        with conn:
            _criar_se_faltar(conn)
            _apagar(conn, pessoa.slug)
            carregar(conn, pessoa)
    except sqlite3.Error as erro:
        raise ErroFilmes("banco_desatualizado",
                         f"o arquivo da Pessoa foi salvo, mas o banco não aceitou a mudança ({erro}): rode `reconstruir`")
    finally:
        conn.close()
    return True


# Tabelas da Pessoa que chegaram depois de bancos já reconstruídos: `sincronizar` as cria
# se faltarem, em vez de exigir `reconstruir` (o arquivo da Pessoa já foi salvo).
_TABELAS_NOVAS = {"perguntas_abertas": "23_perguntas_abertas.sql"}
_ESQUEMA = Path(__file__).resolve().parent / "esquema"


def _criar_se_faltar(conn):
    for tabela, arquivo in _TABELAS_NOVAS.items():
        if not conn.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (tabela,)).fetchone():
            sql = re.sub(r"--[^\n]*", "", (_ESQUEMA / arquivo).read_text(encoding="utf-8"))
            for comando in sql.split(";"):
                if comando.strip():
                    conn.execute(comando)


def _apagar(conn, slug):
    conn.execute("DELETE FROM notas WHERE pessoa = ? AND (fato_id LIKE 'declarados:%' OR fato_id LIKE 'relatos:%'"
                 " OR fato_id LIKE 'vistos:%')", (slug,))
    conn.execute("DELETE FROM ja_visto WHERE pessoa = ? AND fato_id LIKE 'vistos:%'", (slug,))
    conn.execute("DELETE FROM declarados WHERE pessoa = ? AND fato_id LIKE 'declarados:%'", (slug,))
    for tabela in ("vetos", "ajustes", "perguntas_abertas", "relatos", "apelidos"):
        conn.execute(f"DELETE FROM {tabela} WHERE pessoa = ?", (slug,))


def id_do_dito(tabela: str, slug: str, dito) -> str:
    return fato_id(tabela, slug, dito.data, dito.fonte, int(dito.especifico), dito.reacao, dito.alvo, dito.texto)


def rotulo_do_alvo(conn: sqlite3.Connection, alvo: str) -> str:
    """Título do filme ou rótulo da entidade; alvo fora do Catálogo é erro."""
    if alvo.startswith("tt"):
        linha = conn.execute("SELECT titulo FROM filmes WHERE id = ?", (alvo,)).fetchone()
    else:
        linha = conn.execute("SELECT rotulo FROM entidades WHERE id = ?", (alvo,)).fetchone()
    if not linha:
        raise ErroFilmes("alvo_desconhecido", f"'{alvo}' não está no Catálogo")
    return linha[0]


def so_genero(conn: sqlite3.Connection, entidade: str) -> bool:
    """A entidade só aparece como gênero no Catálogo: um Declarado sobre ela é genérico."""
    predicados = {l[0] for l in conn.execute("SELECT DISTINCT predicado FROM arestas WHERE entidade_id = ?", (entidade,))}
    return predicados == {"genero"}
