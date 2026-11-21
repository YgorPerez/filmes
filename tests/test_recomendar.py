"""Recomendação só para o Dono (Bruno), pelo caminho de conteúdo "mesmo diretor".

Na fixture, Bruno deu Notas altas a três filmes de Helena Prado, a dois de
Otávio Lins e de Rui Tavares (estas há mais de 5 anos), a um de Marta Quintal,
e Notas baixas a dois de Caio Brandão.
"""

CAMPOS_EVIDENCIA = {"pessoa", "texto", "fonte", "data", "forca", "tipo", "fato_id", "contribuicao"}


def _filme(saida, titulo):
    [filme] = [f for f in saida["filmes"] if f["titulo"] == titulo]
    return filme


def _evidencias(filme, tipo):
    return [e for e in filme["evidencias"]["bruno"] if e["tipo"] == tipo]


def test_dono_sozinho_recebe_cinco_filmes_com_evidencias(banco):
    saida = banco.ok("recomendar", "--presentes", "dono")

    assert saida["presentes"] == ["bruno"]
    assert len(saida["filmes"]) == 5
    for filme in saida["filmes"]:
        assert {"id", "titulo", "ano", "duracao_min"} <= set(filme)
        assert list(filme["evidencias"]) == ["bruno"]
        assert filme["evidencias"]["bruno"]
        for evidencia in filme["evidencias"]["bruno"]:
            assert set(evidencia) == CAMPOS_EVIDENCIA
            assert evidencia["pessoa"] == "bruno"
            assert evidencia["forca"] in {"forte", "moderada", "fraca"}


def _todos(banco):
    return banco.ok("recomendar", "--presentes", "dono", "--quantos", "50")


def _metadado(filme):
    [evidencia] = _evidencias(filme, "metadado")
    return evidencia


def test_tres_notas_altas_no_mesmo_diretor_dao_evidencia_forte(banco):
    filme = _filme(_todos(banco), "As Horas Lentas")

    evidencia = _metadado(filme)
    assert evidencia["forca"] == "forte"
    assert "Helena Prado" in evidencia["texto"]
    assert evidencia["fonte"] == "Wikidata"
    assert evidencia["fato_id"]


def test_duas_notas_altas_no_mesmo_diretor_dao_evidencia_moderada(banco):
    filme = _filme(_todos(banco), "Noite de Estreia")

    assert _metadado(filme)["forca"] == "moderada"


def test_uma_nota_alta_no_mesmo_diretor_da_evidencia_fraca(banco):
    filme = _filme(_todos(banco), "Vento Norte")

    assert _metadado(filme)["forca"] == "fraca"


def test_nota_semente_recente_segue_o_valor(banco):
    filme = _filme(_todos(banco), "As Horas Lentas")

    forca_por_texto = {e["texto"]: e["forca"] for e in _evidencias(filme, "nota")}
    assert forca_por_texto == {
        "deu 5 a O Farol de Areia (2012), também de Helena Prado": "forte",
        "deu 4,5 a Maré Baixa (2015), também de Helena Prado": "forte",
        "deu 4 a Cidade de Vidro (2018), também de Helena Prado": "moderada",
    }


def test_nota_semente_com_mais_de_cinco_anos_cai_um_nivel(banco):
    filme = _filme(_todos(banco), "A Volta do Mar")

    por_data = {e["data"]: e["forca"] for e in _evidencias(filme, "nota")}
    assert por_data == {"2019-01-10": "moderada", "2018-07-07": "fraca"}


def test_nota_semente_traz_fonte_data_e_fato(banco):
    filme = _filme(_todos(banco), "Vento Norte")

    [semente] = [e for e in _evidencias(filme, "nota") if "Jardim Suspenso" in e["texto"]]
    assert semente["fonte"] == "Letterboxd do Bruno"
    assert semente["data"] == "2024-05-05"
    assert semente["fato_id"] in [linha[0] for linha in banco.consultar(
        "SELECT fato_id FROM notas WHERE filme_id = 'tt9000301'")]


def test_notas_baixas_no_diretor_pesam_contra(banco):
    saida = _todos(banco)
    filme = _filme(saida, "Explosão Final")

    contra = _evidencias(filme, "nota")
    assert {e["forca"] for e in contra} == {"forte", "moderada"}
    assert all(e["contribuicao"] < 0 for e in contra)
    assert filme["utilidade"]["bruno"] < 0.5
    # Depois dele, só Barulho e Asfalto Quente, a que Bruno deu 1 e 2 (Já visto e semente
    # contra um do outro), e os filmes sem Fato nenhum.
    com_fato = [f["titulo"] for f in saida["filmes"] if not f["so_palpites"]]
    assert set(com_fato[com_fato.index("Explosão Final") + 1:]) == {"Barulho", "Asfalto Quente"}


def test_forca_multiplica_a_contribuicao(banco):
    filme = _filme(_todos(banco), "A Volta do Mar")

    contribuicao = {e["forca"]: e["contribuicao"] for e in _evidencias(filme, "nota")}
    assert contribuicao == {"moderada": 0.6, "fraca": 0.3}


def test_quem_tem_evidencia_mais_forte_vem_antes(banco):
    titulos = [f["titulo"] for f in _todos(banco)["filmes"]]

    assert titulos.index("As Horas Lentas") < titulos.index("Noite de Estreia") < titulos.index("A Volta do Mar") \
        < titulos.index("Vento Norte") < titulos.index("Explosão Final")


def test_filme_com_menos_votos_que_o_minimo_nao_e_candidato(banco):
    titulos = {f["titulo"] for f in _todos(banco)["filmes"]}

    assert "Curta da Madrugada" not in titulos   # 600 votos, de Helena Prado
    assert "As Horas Lentas" in titulos


def test_presente_desconhecido_e_erro(banco):
    codigo, saida = banco.rodar("recomendar", "--presentes", "fulano")

    assert codigo != 0
    assert saida["erro"]["codigo"] == "pessoa_desconhecida"


def test_dono_pode_ser_chamado_pelo_nome_ou_apelido(banco):
    pelo_nome = banco.ok("recomendar", "--presentes", "Bruno")
    pelo_apelido = banco.ok("recomendar", "--presentes", "eu")

    assert pelo_nome["presentes"] == pelo_apelido["presentes"] == ["bruno"]


def test_filme_a_que_a_pessoa_deu_nota_e_ja_visto_e_pesa_contra(banco):
    saida = _todos(banco)
    filme = _filme(saida, "O Farol de Areia")

    [visto] = [e for e in filme["evidencias"]["bruno"] if e["texto"] == "já viu"]
    assert visto == {"pessoa": "bruno", "texto": "já viu", "fonte": "Letterboxd do Bruno", "data": "2025-06-01",
                     "forca": "forte", "tipo": "nota", "fato_id": visto["fato_id"], "contribuicao": -1.0}
    assert visto["fato_id"] in [linha[0] for linha in banco.consultar(
        "SELECT fato_id FROM notas WHERE pessoa = 'bruno' AND filme_id = 'tt9000101'")]
    assert "O Farol de Areia" not in [f["titulo"] for f in banco.ok("recomendar", "--presentes", "dono")["filmes"]]


def test_filme_com_nota_imdb_abaixo_de_7_nunca_vira_candidato(banco):
    # Sombra Morna é de Helena Prado, a diretora preferida de Bruno, mas tem 6,5 no IMDb.
    titulos = {f["titulo"] for f in _todos(banco)["filmes"]}

    assert "Sombra Morna" not in titulos
    assert "As Horas Lentas" in titulos  # 7,4 passa
