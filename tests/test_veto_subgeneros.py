"""Veto a gênero pega os subgêneros (P279 do Wikidata) e o gênero equivalente do IMDb (#48).

Na fixture: comédia romântica (Q9004801) é subclasse de romance (Q1054574) e de
comédia (Q157443); comédia de recasamento (Q9004802) é subclasse de comédia romântica.
"""

ROMANCE = "Q1054574"


def _titulos(saida):
    return [f["titulo"] for f in saida["filmes"]]


def _vetar_romance(banco):
    banco.ok("pessoa", "criar", "Lorenzo", "--slug", "lorenzo")
    banco.ok("pessoa", "vetar", "lorenzo", "não vê romance", "--entidade", ROMANCE)


def test_veto_a_genero_tira_os_subgeneros_do_wikidata(banco):
    _vetar_romance(banco)

    saida = banco.ok("recomendar", "--presentes", "dono", "lorenzo", "--quantos", "80")

    titulos = _titulos(saida)
    assert "Carta de Amor" not in titulos       # romance
    assert "Amor em Paris" not in titulos       # comédia romântica
    assert "Casar de Novo" not in titulos       # comédia de recasamento, subclasse da subclasse
    assert "Dia de Feira" in titulos            # comédia: supergênero da comédia romântica, fica


def test_veto_a_genero_tira_o_genero_equivalente_do_imdb(banco):
    _vetar_romance(banco)

    saida = banco.ok("recomendar", "--presentes", "dono", "lorenzo", "--quantos", "80")

    titulos = _titulos(saida)
    assert "Baile de Formatura" not in titulos  # Romance no IMDb, sem gênero no Wikidata
    assert "Maré Baixa" not in titulos          # Drama e Romance no IMDb


def test_a_resposta_diz_quantos_filmes_sairam_por_cada_caminho(banco):
    _vetar_romance(banco)

    saida = banco.ok("recomendar", "--presentes", "dono", "lorenzo")

    assert saida["vetos"] == [{
        "pessoa": "lorenzo", "texto": "não vê romance", "alvo": ROMANCE, "rotulo": "romance",
        "filmes_tirados": 5,
        "por_caminho": {"direto": 1, "subgeneros": 2, "genero_imdb": 2},
    }]
