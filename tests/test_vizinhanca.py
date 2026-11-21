"""Vizinhança item-item do MovieLens: "de N pessoas que deram 4+ a X, P% deram 4+ a Y".

Na fixture (tabela `vizinhos`), os filmes de 1001 a 1005 só se ligam às Notas
do Bruno e da Iara pela vizinhança; não têm diretor nem tag. Veja o LEIAME.
"""


def _filme(saida, titulo):
    [filme] = [f for f in saida["filmes"] if f["titulo"] == titulo]
    return filme


def _review(filme, pessoa="bruno"):
    return [e for e in filme["evidencias"][pessoa] if e["tipo"] == "review"]


def _todos(banco, *presentes):
    return banco.ok("recomendar", "--presentes", *(presentes or ("dono",)), "--quantos", "50")


def test_vizinho_com_base_grande_e_proporcao_alta_da_evidencia_forte(banco):
    filme = _filme(_todos(banco), "A Casa das Marés")

    [evidencia] = _review(filme)
    assert evidencia["texto"] == ("deu 5 a O Farol de Areia (2012), e de 3.104 pessoas que deram 4+ a ele, "
                                  "64% deram 4+ a este")
    assert (evidencia["forca"], evidencia["fonte"], evidencia["data"]) == ("forte", "MovieLens ml-32m", "2023-10-13")
    assert evidencia["contribuicao"] == 1.0
    assert evidencia["fato_id"] in [linha[0] for linha in banco.consultar(
        "SELECT fato_id FROM vizinhos WHERE vizinho_id = 'tt9001001'")]


def test_base_e_proporcao_menores_dao_evidencia_moderada_ou_fraca(banco):
    saida = _todos(banco)

    [moderada] = _review(_filme(saida, "Segunda Chamada"))
    [fraca] = _review(_filme(saida, "O Mapa Rasgado"))
    assert (moderada["forca"], moderada["contribuicao"]) == ("moderada", 0.6)
    assert moderada["texto"].endswith("de 100 pessoas que deram 4+ a ele, 40% deram 4+ a este")
    assert (fraca["forca"], fraca["contribuicao"]) == ("fraca", 0.3)


def test_vizinhanca_abaixo_do_piso_nao_vira_evidencia(banco):
    saida = _todos(banco)

    # A Casa das Marés também é vizinha de Cidade de Vidro, mas só 20% de 600; O Mapa
    # Rasgado é vizinho de Ponte Aérea com 80%, mas de uma base de 25 pessoas.
    [casa] = _review(_filme(saida, "A Casa das Marés"))
    [mapa] = _review(_filme(saida, "O Mapa Rasgado"))
    assert "O Farol de Areia" in casa["texto"]
    assert "Maré Baixa" in mapa["texto"]


def test_vizinhanca_nunca_passa_da_forca_da_nota_semente(banco):
    filme = _filme(_todos(banco), "Luz de Inverno")

    # As duas vizinhanças seriam fortes. Rio Abaixo levou 3,5 (semente fraca);
    # Fronteira levou 5 em 2019, há mais de 5 anos (semente moderada).
    forca_por_semente = {e["texto"].split(", e de")[0]: e["forca"] for e in _review(filme)}
    assert forca_por_semente == {"deu 3,5 a Rio Abaixo (2014)": "fraca", "deu 5 a Fronteira (2008)": "moderada"}


def test_nota_contra_nao_e_semente_de_vizinhanca(banco):
    filme = _filme(_todos(banco), "Ruído Branco")

    # Bruno deu 1 a Barulho, e 70% de quem deu 4+ a Barulho deu 4+ a Ruído Branco.
    textos = [e["texto"] for e in _review(filme)]
    assert len(textos) == 1
    assert textos[0].startswith("deu 5 a Fronteira (2008)")


def test_vizinhanca_vale_para_cada_presente_com_as_notas_dela(banco):
    filme = _filme(_todos(banco, "dono", "iara"), "Ruído Branco")

    [da_iara] = _review(filme, "iara")
    assert da_iara["texto"] == "deu 4 a Fronteira (2008), e de 1.000 pessoas que deram 4+ a ele, 42% deram 4+ a este"
    assert da_iara["forca"] == "moderada"


def test_base_da_vizinhanca_e_a_mesma_para_todos_os_vizinhos_da_semente(banco):
    assert banco.consultar(
        "SELECT filme_id FROM vizinhos GROUP BY filme_id HAVING MIN(base) <> MAX(base)"
    ) == []
