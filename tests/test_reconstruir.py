def test_reconstruir_carrega_o_catalogo_da_fixture(cli):
    cli.ok("reconstruir")

    [[filmes]] = cli.consultar("SELECT count(*) FROM filmes")
    assert filmes == 27


def test_reconstruir_carrega_o_dono_do_repo_de_dados(cli):
    cli.ok("reconstruir")

    assert cli.consultar("SELECT slug, nome FROM pessoas WHERE dono = 1") == [["bruno", "Bruno"]]


def _conteudo(cli):
    tabelas = [t for [t] in cli.consultar("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")]
    return {t: sorted(cli.consultar(f'SELECT * FROM "{t}"'), key=repr) for t in tabelas}


def test_reconstruir_duas_vezes_da_o_mesmo_banco(cli):
    cli.ok("reconstruir")
    primeiro = _conteudo(cli)

    cli.ok("reconstruir")

    assert _conteudo(cli) == primeiro
    assert primeiro["filmes"] and primeiro["notas"] and primeiro["arestas"]


def test_fato_mantem_o_mesmo_id_entre_reconstrucoes(cli):
    sql = "SELECT fato_id FROM notas WHERE filme_id = 'tt9000101'"
    cli.ok("reconstruir")
    antes = cli.consultar(sql)

    cli.ok("reconstruir")

    assert cli.consultar(sql) == antes
