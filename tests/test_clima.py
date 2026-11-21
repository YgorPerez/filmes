"""Clima do pedido e sinal de grupo ou sozinho: linhas do filme, sem Pessoa.

O vocabulário de Climas está em config/climas.toml e o de grupo/sozinho em
config/grupo_sozinho.toml. Na fixture, os filmes 1101 a 1110 têm tags do
MovieLens, escores do Tag Genome e gêneros (tabelas `tags_movielens`, `genoma`,
`arestas`); todos têm a mesma Evidência fraca do Bruno e da Iara, por
vizinhança de O Farol de Areia, e por isso empatam no gosto. Veja o LEIAME.
"""


def _filme(saida, titulo):
    [filme] = [f for f in saida["filmes"] if f["titulo"] == titulo]
    return filme


def _recomendar(banco, *args, presentes=("dono",)):
    return banco.ok("recomendar", "--presentes", *presentes, "--quantos", "50", *args)


def test_clima_pedido_ganha_linha_do_filme_com_a_tag_que_o_sustenta(banco):
    filme = _filme(_recomendar(banco, "--clima", "leve"), "Dia de Feira")

    [linha] = filme["linhas_do_filme"]
    assert linha == {
        "pessoa": None,
        "texto": 'Clima leve: 14 usuários do MovieLens marcaram o filme com a tag "feel-good"',
        "fonte": "MovieLens ml-32m",
        "data": "2023-10-13",
        "forca": "forte",
        "tipo": "review",
        "fato_id": linha["fato_id"],
        "contribuicao": 0.1,
    }
    assert linha["fato_id"] in [l[0] for l in banco.consultar(
        "SELECT fato_id FROM tags_movielens WHERE filme_id = 'tt9001101'")]


def _titulos(saida):
    return [f["titulo"] for f in saida["filmes"]]


def test_clima_puxa_o_filme_para_cima_sem_tirar_nenhum(banco):
    # Dia de Feira e Outro Dia Qualquer empatam no gosto do Bruno; o segundo tem mais votos.
    sem_clima = _titulos(_recomendar(banco))
    leve = _titulos(_recomendar(banco, "--clima", "leve"))

    assert sem_clima.index("Outro Dia Qualquer") < sem_clima.index("Dia de Feira")
    assert leve.index("Dia de Feira") < leve.index("Outro Dia Qualquer")
    assert sorted(leve) == sorted(sem_clima)


def test_sem_clima_pedido_nao_ha_linha_de_clima(banco):
    saida = _recomendar(banco)

    assert saida["climas"] == []
    assert not any(l["texto"].startswith("Clima") for f in saida["filmes"] for l in f["linhas_do_filme"])


def _linhas(saida, titulo):
    return [(l["texto"], l["forca"], l["tipo"]) for l in _filme(saida, titulo)["linhas_do_filme"]]


def test_forca_da_linha_de_clima_segue_a_regua_de_review(banco):
    saida = _recomendar(banco, "--clima", "leve")

    assert _linhas(saida, "Tarde de Domingo") == [
        ('Clima leve: 5 usuários do MovieLens marcaram o filme com a tag "feel-good"', "moderada", "review")]
    # Só 2 usuários deram "feel-good" a Bolo de Fubá: vale o Tag Genome, no máximo moderada.
    assert _linhas(saida, "Bolo de Fubá") == [
        ('Clima leve: relevância 0,85 da tag "feel-good" para o filme no Tag Genome', "moderada", "review")]
    # Pipa no Céu: 0,70 em "feel-good" é fraca; 0,50 em "feel good movie" fica fora.
    assert _linhas(saida, "Pipa no Céu") == [
        ('Clima leve: relevância 0,7 da tag "feel-good" para o filme no Tag Genome', "fraca", "review")]


def test_numero_de_usuarios_no_limite_da_regua_ja_vale_a_forca(banco):
    saida = _recomendar(banco, "--clima", "leve")

    assert _linhas(saida, "Quermesse") == [
        ('Clima leve: 10 usuários do MovieLens marcaram o filme com a tag "feel-good"', "forte", "review")]
    assert _linhas(saida, "Piquenique") == [
        ('Clima leve: 3 usuários do MovieLens marcaram o filme com a tag "feel-good"', "moderada", "review")]


def test_limiar_de_relevancia_do_genoma_aparece_sem_arredondamento(banco):
    saida = _recomendar(banco, "--clima", "tenso")

    assert _linhas(saida, "Dia de Feira") == [
        ('Clima tenso: relevância 0,8 da tag "suspense" para o filme no Tag Genome', "moderada", "review")]
    assert _linhas(saida, "Bolo de Fubá") == [
        ('Clima tenso: relevância 0,799 da tag "suspense" para o filme no Tag Genome', "fraca", "review")]
    assert _linhas(saida, "Carnaval de Rua") == [
        ('Clima tenso: relevância 0,6 da tag "suspense" para o filme no Tag Genome', "fraca", "review")]
    assert _linhas(saida, "Outro Dia Qualquer") == []


def test_genero_do_clima_vale_como_metadado_fraco(banco):
    saida = _recomendar(banco, "--clima", "pra rir")

    [linha] = _filme(saida, "Carnaval de Rua")["linhas_do_filme"]
    assert (linha["texto"], linha["fonte"], linha["forca"], linha["tipo"]) == (
        "Clima pra rir: do gênero comédia cinematográfica", "Wikidata", "fraca", "metadado")


def test_cada_clima_pedido_da_uma_linha_so_a_mais_forte(banco):
    # Dia de Feira tem "feel-good" (14), "funny" (12) e é comédia, que está nos dois Climas.
    saida = _recomendar(banco, "--clima", "leve", "pra rir")

    assert saida["climas"] == ["leve", "pra rir"]
    assert _linhas(saida, "Dia de Feira") == [
        ('Clima leve: 14 usuários do MovieLens marcaram o filme com a tag "feel-good"', "forte", "review"),
        ('Clima pra rir: 12 usuários do MovieLens marcaram o filme com a tag "funny"', "forte", "review"),
    ]


def test_clima_fora_do_vocabulario_fica_de_fora_com_aviso(banco):
    saida = _recomendar(banco, "--clima", "Leve", "épico")

    assert saida["climas"] == ["leve"]
    [aviso] = saida["avisos"]
    assert "'épico' não está no vocabulário" in aviso
    assert "pra rir" in aviso   # o aviso lista o vocabulário
    assert _linhas(saida, "Dia de Feira")[0][0].startswith("Clima leve:")


def test_clima_vale_sem_acento_e_sem_maiuscula(banco):
    saida = _recomendar(banco, "--clima", "ACAO", "Pra-Rir")

    assert saida["climas"] == ["ação", "pra rir"]
    assert saida["avisos"] == []


def test_linha_do_tag_genome_poe_a_atribuicao_na_saida(banco):
    com_genoma = _recomendar(banco, "--clima", "leve")
    sem_genoma = _recomendar(banco)

    [credito] = [c for c in com_genoma["atribuicoes"] if c["fonte"] == "Tag Genome"]
    assert "Tag Genome 2021, de Kotkov, Maslov e Neovius" in credito["texto"]
    assert "CC BY-NC 3.0" in credito["texto"]
    assert not [c for c in sem_genoma["atribuicoes"] if c["fonte"] == "Tag Genome"]


# Sessão Maldita tem "so bad it's good" (12 usuários); Silêncio no Lago tem "meditative" (12)
# e relevância 0,90 de "slow" no genome. Nenhum Clima pedido.

def test_sessao_sozinha_da_bonus_ao_filme_bom_sozinho(banco):
    saida = _recomendar(banco)

    assert _linhas(saida, "Silêncio no Lago") == [
        ('para ver sozinho: 12 usuários do MovieLens marcaram o filme com a tag "meditative"', "forte", "review")]
    assert _linhas(saida, "Sessão Maldita") == []
    titulos = _titulos(saida)
    assert titulos.index("Silêncio no Lago") < titulos.index("Outro Dia Qualquer") < titulos.index("Sessão Maldita")


def test_sessao_em_grupo_da_bonus_ao_filme_bom_em_grupo(banco):
    saida = _recomendar(banco, presentes=("dono", "iara"))

    [linha] = _filme(saida, "Sessão Maldita")["linhas_do_filme"]
    assert linha["texto"] == 'para ver em grupo: 12 usuários do MovieLens marcaram o filme com a tag "so bad it\'s good"'
    assert (linha["pessoa"], linha["forca"], linha["contribuicao"]) == (None, "forte", 0.05)
    assert _linhas(saida, "Silêncio no Lago") == []
    titulos = _titulos(saida)
    assert titulos.index("Sessão Maldita") < titulos.index("Outro Dia Qualquer") < titulos.index("Silêncio no Lago")


def test_clima_sustenta_o_filme_mesmo_sem_fato_sobre_o_presente(banco):
    # Teo não tem Nota, mas Dia de Feira tem Fato sobre o Clima.
    saida = _recomendar(banco, "--clima", "leve", presentes=("teo",))

    primeiro = saida["filmes"][0]
    assert primeiro["titulo"] == "Dia de Feira"
    assert primeiro["so_palpites"] is False
    assert primeiro["utilidade"] == {"teo": None}
    assert primeiro["evidencias"]["teo"][0]["texto"] == "sem fato"
    assert _filme(saida, "Outro Dia Qualquer")["so_palpites"] is True
