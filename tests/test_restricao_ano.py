"""Restrição por ano de lançamento: `--desde ANO` e `--ate ANO`, os dois inclusive.

Anos na fixture (filmes.csv): O Farol de Areia 2012, Maré Baixa 2015, A Volta do Mar 2016,
Cidade de Vidro 2018, As Horas Lentas 2021, Sal e Ferrugem 2023.
"""


def _todos(banco, *restricoes):
    return banco.ok("recomendar", "--presentes", "dono", "--quantos", "50", *restricoes)


def _titulos(saida):
    return [f["titulo"] for f in saida["filmes"]]


def test_desde_tira_os_filmes_lancados_antes_do_ano(banco):
    titulos = _titulos(_todos(banco, "--desde", "2016"))

    assert "A Volta do Mar" in titulos       # 2016, no limite
    assert "As Horas Lentas" in titulos      # 2021
    assert "Maré Baixa" not in titulos       # 2015
    assert "O Farol de Areia" not in titulos  # 2012


def test_ate_tira_os_filmes_lancados_depois_do_ano(banco):
    titulos = _titulos(_todos(banco, "--ate", "2018"))

    assert "Cidade de Vidro" in titulos      # 2018, no limite
    assert "O Farol de Areia" in titulos     # 2012
    assert "As Horas Lentas" not in titulos  # 2021


def test_desde_e_ate_juntos_pedem_o_intervalo(banco):
    saida = _todos(banco, "--desde", "2015", "--ate", "2016")

    assert saida["filmes"]
    assert {banco.consultar(f"SELECT ano FROM filmes WHERE id = '{f['id']}'")[0][0]
            for f in saida["filmes"]} <= {2015, 2016}
    assert {"Maré Baixa", "A Volta do Mar"} <= set(_titulos(saida))


def test_resposta_repete_o_intervalo_e_quantos_filmes_ele_tirou(banco):
    sem = _todos(banco)
    saida = _todos(banco, "--desde", "2016")

    assert saida["restricoes"]["ano"]["desde"] == 2016
    assert saida["restricoes"]["ano"]["ate"] is None
    antes = [f for f in sem["filmes"] if f["titulo"] not in _titulos(saida)]
    assert {"Maré Baixa", "O Farol de Areia"} <= {f["titulo"] for f in antes}
    assert saida["restricoes"]["ano"]["tirados"] == len(antes)


def test_filme_no_intervalo_mostra_a_linha_do_ano(banco):
    [filme] = [f for f in _todos(banco, "--desde", "2015", "--ate", "2016")["filmes"]
               if f["titulo"] == "Maré Baixa"]

    [linha] = [l for l in filme["linhas_do_filme"] if not l["texto"].startswith("para ver sozinho:")]
    assert linha["pessoa"] is None
    assert linha["texto"] == "lançado em 2015, entre 2015 e 2016"
    assert (linha["fonte"], linha["forca"], linha["tipo"]) == ("IMDb", "forte", "metadado")
    assert linha["fato_id"] == "tt9000102"
    assert linha["contribuicao"] == 0


def test_linha_do_ano_diz_o_limite_que_foi_pedido(banco):
    def texto(*pedido):
        [filme] = [f for f in _todos(banco, *pedido)["filmes"] if f["titulo"] == "Maré Baixa"]
        return [l["texto"] for l in filme["linhas_do_filme"] if l["texto"].startswith("lançado")]

    assert texto("--desde", "1990") == ["lançado em 2015, de 1990 em diante"]
    assert texto("--ate", "2015") == ["lançado em 2015, até 2015"]


def test_intervalo_invertido_e_uso_invalido(banco):
    codigo, saida = banco.rodar("recomendar", "--presentes", "dono", "--desde", "2020", "--ate", "2010")

    assert codigo == 2
    assert saida["erro"]["codigo"] == "uso_invalido"


def test_cartaz_le_o_intervalo_no_pedido(banco, tmp_path):
    def leitura(*pedido):
        sessao = banco.ok("recomendar", "--presentes", "dono", *pedido)["sessao"]["id"]
        destino = tmp_path / f"{sessao}.html"
        banco.ok("cartaz", "--sessao", sessao, "--saida", str(destino))
        return destino.read_text(encoding="utf-8")

    assert "nota 7+ no IMDb · de 1990 em diante" in leitura("--desde", "1990")
    assert "nota 7+ no IMDb · até 2015" in leitura("--ate", "2015")
    assert "nota 7+ no IMDb · entre 2012 e 2016" in leitura("--desde", "2012", "--ate", "2016")
