"""Recomendação para vários Presentes e a Regra de escolha.

Na fixture, além do Bruno (veja test_recomendar.py):
- Iara deu 3 a O Farol de Areia (Helena Prado) e 4 a Fronteira (Rui Tavares).
  Isso dá Evidência fraca a favor nos outros filmes de Helena Prado e
  moderada nos outros de Rui Tavares. Sobre O Farol de Areia e Fronteira em si
  ela não tem Fato: a Nota-semente não vale para o próprio filme.
- Teo não tem Nota nenhuma.
"""


def _filme(saida, titulo):
    [filme] = [f for f in saida["filmes"] if f["titulo"] == titulo]
    return filme


def test_evidencias_vem_agrupadas_por_pessoa_na_ordem_dos_presentes(banco):
    saida = banco.ok("recomendar", "--presentes", "dono", "Iara", "--quantos", "50")

    assert saida["presentes"] == ["bruno", "iara"]
    filme = _filme(saida, "As Horas Lentas")
    assert list(filme["evidencias"]) == ["bruno", "iara"]
    assert {e["pessoa"] for e in filme["evidencias"]["bruno"]} == {"bruno"}
    [da_iara] = filme["evidencias"]["iara"]
    assert da_iara["texto"] == "deu 3 a O Farol de Areia (2012), também de Helena Prado"
    assert da_iara["fonte"] == "Letterboxd da Iara"
    assert (da_iara["forca"], da_iara["tipo"], da_iara["contribuicao"]) == ("fraca", "nota", 0.3)


SEM_FATO = {"texto": "sem fato", "fonte": None, "data": None, "forca": "fraca", "tipo": "palpite",
            "fato_id": None, "contribuicao": 0}


def test_presente_sem_fato_sobre_o_filme_tem_utilidade_desconhecida_e_linha_sem_fato(banco):
    saida = banco.ok("recomendar", "--presentes", "dono", "iara", "--quantos", "50")

    filme = _filme(saida, "O Farol de Areia")
    assert filme["utilidade"]["iara"] is None
    assert filme["evidencias"]["iara"] == [{"pessoa": "iara", **SEM_FATO}]


def _titulos(saida):
    return [f["titulo"] for f in saida["filmes"]]


def test_pessoa_sem_nota_nenhuma_fica_fora_do_minimo_e_da_media(banco):
    sozinho = banco.ok("recomendar", "--presentes", "dono", "--quantos", "50")
    com_teo = banco.ok("recomendar", "--presentes", "dono", "teo", "--quantos", "50")

    # Com o Teo a Sessão é em grupo, e o bônus de grupo/sozinho muda de filme
    # (test_clima.py); fora os filmes com esse bônus, a ordem é a mesma.
    com_bonus = {f["titulo"] for saida in (sozinho, com_teo) for f in saida["filmes"] if f["evidencias_do_filme"]}
    assert [t for t in _titulos(com_teo) if t not in com_bonus] == [t for t in _titulos(sozinho) if t not in com_bonus]
    assert ({f["titulo"]: f["utilidade"]["bruno"] for f in com_teo["filmes"]}
            == {f["titulo"]: f["utilidade"]["bruno"] for f in sozinho["filmes"]})
    for filme in com_teo["filmes"]:
        assert filme["utilidade"]["teo"] is None
        assert filme["evidencias"]["teo"] == [{"pessoa": "teo", **SEM_FATO}]


# Bruno ama As Horas Lentas (forte) e Iara gosta pouco (uma Nota 3 no mesmo diretor).
# Inverno em Lisboa agrada os dois na mesma medida, menos do que As Horas Lentas agrada o Bruno.

def test_regra_padrao_poe_antes_o_filme_em_que_ninguem_fica_mal(banco):
    titulos = _titulos(banco.ok("recomendar", "--presentes", "dono", "iara", "--quantos", "50"))

    assert titulos.index("Inverno em Lisboa") < titulos.index("As Horas Lentas")


def test_regra_media_poe_antes_o_filme_de_maior_media(banco):
    saida = banco.ok("recomendar", "--presentes", "dono", "iara", "--regra", "media", "--quantos", "50")

    assert saida["regra"] == {"nome": "media"}
    titulos = _titulos(saida)
    assert titulos.index("As Horas Lentas") < titulos.index("Inverno em Lisboa")


def test_regra_de_fulano_ordena_so_pelo_gosto_dessa_pessoa(banco):
    padrao = _titulos(banco.ok("recomendar", "--presentes", "dono", "iara", "--quantos", "50"))
    do_bruno = banco.ok("recomendar", "--presentes", "dono", "iara", "--regra", "de", "--de", "Bruno",
                        "--quantos", "50")

    assert do_bruno["regra"] == {"nome": "de", "pessoa": "bruno"}
    assert padrao.index("Inverno em Lisboa") < padrao.index("As Horas Lentas")
    titulos = _titulos(do_bruno)
    assert titulos.index("As Horas Lentas") < titulos.index("Inverno em Lisboa")


def test_na_regra_de_fulano_filme_sem_fato_dele_vai_depois_dos_que_tem(banco):
    # Noite de Estreia (Otávio Lins) agrada o Bruno, mas a Iara não tem Fato sobre ele.
    titulos = _titulos(banco.ok("recomendar", "--presentes", "dono", "iara", "--regra", "de", "--de", "iara",
                                "--quantos", "50"))

    assert titulos.index("Inverno em Lisboa") < titulos.index("As Horas Lentas") < titulos.index("Noite de Estreia")


def test_regra_de_quem_nao_esta_entre_os_presentes_e_uso_invalido(banco):
    codigo, saida = banco.rodar("recomendar", "--presentes", "dono", "--regra", "de", "--de", "iara")

    assert codigo == 2
    assert saida["erro"]["codigo"] == "uso_invalido"


def test_regra_de_sem_dizer_de_quem_e_uso_invalido(banco):
    codigo, saida = banco.rodar("recomendar", "--presentes", "dono", "iara", "--regra", "de")

    assert codigo == 2
    assert saida["erro"]["codigo"] == "uso_invalido"


# Lia Moura, Tomás Reis, Beatriz Sá e Jorge Amaral não ligam a nenhuma Nota da fixture:
# os filmes deles são Candidatos só com palpites.
SO_PALPITES = {"Pequenos Milagres", "Casa Cheia", "Deserto Branco", "A Última Estação",
               "Café Amargo", "Linha Cruzada", "Os Inquilinos", "Fim de Tarde"}


def test_filme_so_com_palpites_fica_de_fora_quando_ha_candidatos_com_fato(banco):
    saida = banco.ok("recomendar", "--presentes", "dono", "iara")

    assert not SO_PALPITES & set(_titulos(saida))
    assert not any(f["so_palpites"] for f in saida["filmes"])


def test_filme_so_com_palpites_completa_a_lista_no_fim_marcado(banco):
    saida = banco.ok("recomendar", "--presentes", "dono", "iara", "--quantos", "50")

    marcados = [f for f in saida["filmes"] if f["so_palpites"]]
    assert {f["titulo"] for f in marcados} == SO_PALPITES
    assert saida["filmes"][-len(marcados):] == marcados
    # entre eles, o mais votado primeiro
    assert [f["titulo"] for f in marcados][:2] == ["Pequenos Milagres", "Deserto Branco"]
    for filme in marcados:
        assert filme["utilidade"] == {"bruno": None, "iara": None}
        assert filme["evidencias"] == {"bruno": [{"pessoa": "bruno", **SEM_FATO}],
                                       "iara": [{"pessoa": "iara", **SEM_FATO}]}
