import sqlite3

from filmes.banco import abrir_leitura
from filmes.erros import ErroFilmes

AJUDA = "executa uma consulta SQL só de leitura no banco"

# Só leitura: o banco abre em mode=ro e o autorizador só deixa passar estas ações.
_PERMITIDAS = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE}


def configurar(parser):
    parser.add_argument("sql", help="uma consulta SELECT")


def executar(args, amb):
    conn = abrir_leitura(amb.banco)
    negadas = []

    def autorizador(acao, *_):
        if acao in _PERMITIDAS:
            return sqlite3.SQLITE_OK
        negadas.append(acao)
        return sqlite3.SQLITE_DENY

    conn.set_authorizer(autorizador)
    try:
        cursor = conn.execute(args.sql)
        linhas = [list(linha) for linha in cursor.fetchall()]
    except sqlite3.Error as erro:
        if negadas:
            raise ErroFilmes("somente_leitura", "consultar só aceita leitura (SELECT)")
        raise ErroFilmes("sql_invalido", str(erro))
    finally:
        conn.close()
    colunas = [d[0] for d in cursor.description or []]
    return {"colunas": colunas, "linhas": linhas}
