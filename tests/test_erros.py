def test_erro_sai_com_codigo_diferente_de_zero_e_json_de_erro(cli):
    codigo, saida = cli.rodar("comando-que-nao-existe")

    assert codigo != 0
    assert set(saida) == {"erro"}
    assert set(saida["erro"]) == {"codigo", "mensagem"}
    assert saida["erro"]["codigo"] == "uso_invalido"


def test_sem_banco_o_erro_pede_reconstruir(cli):
    codigo, saida = cli.rodar("consultar", "SELECT 1")

    assert codigo != 0
    assert saida["erro"]["codigo"] == "banco_ausente"
    assert "reconstruir" in saida["erro"]["mensagem"]


def test_sem_repo_de_dados_configurado_reconstruir_explica_o_que_falta(cli):
    del cli.env["FILMES_DADOS"]

    codigo, saida = cli.rodar("reconstruir")

    assert codigo != 0
    assert saida["erro"]["codigo"] == "config_ausente"
    assert "FILMES_DADOS" in saida["erro"]["mensagem"]
