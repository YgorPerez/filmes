import pytest


def test_consultar_devolve_colunas_e_linhas(banco):
    saida = banco.ok("consultar", "SELECT titulo, ano FROM filmes WHERE id = 'tt9000101'")

    assert saida == {"colunas": ["titulo", "ano"], "linhas": [["O Farol de Areia", 2012]]}


@pytest.mark.parametrize("sql", [
    "DELETE FROM filmes",
    "UPDATE filmes SET titulo = 'x'",
    "INSERT INTO pessoas (slug, nome) VALUES ('x', 'X')",
    "DROP TABLE filmes",
    "CREATE TABLE intrusa (x)",
    "ATTACH DATABASE ':memory:' AS outro",
    "PRAGMA writable_schema = ON",
])
def test_consultar_recusa_escrita_e_o_banco_fica_intacto(banco, sql):
    antes = banco.consultar("SELECT count(*) FROM filmes")

    codigo, saida = banco.rodar("consultar", sql)

    assert codigo != 0
    assert saida["erro"]["codigo"] == "somente_leitura"
    assert banco.consultar("SELECT count(*) FROM filmes") == antes


def test_consultar_com_sql_quebrado_e_erro_de_sql(banco):
    codigo, saida = banco.rodar("consultar", "SELEC nada")

    assert codigo != 0
    assert saida["erro"]["codigo"] == "sql_invalido"
