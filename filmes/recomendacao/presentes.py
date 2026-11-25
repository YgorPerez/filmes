"""Quem é quem no pedido: slug, nome ou apelido de uma Pessoa, ou "dono"."""

import sqlite3

from filmes.erros import ErroFilmes


def resolver(conn: sqlite3.Connection, nomes: list[str]) -> list[str]:
    slugs = []
    for nome in nomes:
        slug = _resolver_um(conn, nome.strip())
        if slug not in slugs:
            slugs.append(slug)
    return slugs


def _resolver_um(conn, nome):
    if nome.casefold() == "dono":
        linha = conn.execute("SELECT slug FROM pessoas WHERE dono = 1 ORDER BY slug").fetchone()
        if not linha:
            raise ErroFilmes("pessoa_desconhecida", "nenhuma Pessoa tem dono: true no repo de dados")
        return linha["slug"]
    linhas = conn.execute(
        """SELECT slug FROM pessoas WHERE slug = :n COLLATE NOCASE OR nome = :n COLLATE NOCASE
           UNION SELECT pessoa FROM apelidos WHERE apelido = :n COLLATE NOCASE ORDER BY 1""",
        {"n": nome},
    ).fetchall()
    if not linhas:
        raise ErroFilmes("pessoa_desconhecida", f"nenhuma Pessoa se chama '{nome}'")
    if len(linhas) > 1:
        opcoes = ", ".join(sorted(l[0] for l in linhas))
        raise ErroFilmes("pessoa_ambigua", f"'{nome}' pode ser mais de uma Pessoa: {opcoes}")
    return linhas[0][0]
