"""Restrições da Sessão: duração, idioma, criança, gatilho e "sem Já visto".

Sem Restrição, o Bruno recebe com `--quantos 50` todos os filmes com votos
suficientes, os com Fato antes dos só com palpites (veja o LEIAME da fixture). Cada Restrição tira filmes antes da ordenação e põe, em cada filme
que passou, em `linhas_do_filme`, uma linha (Evidência com `pessoa` nula) dizendo por quê.
"""

from pathlib import Path

from conftest import sem_o_da_capa


def _todos(banco, *restricoes):
    return banco.ok("recomendar", "--presentes", "dono", "--quantos", "100", *restricoes)


def _titulos(saida):
    return [f["titulo"] for f in saida["filmes"]]


def _filme(saida, titulo):
    [filme] = [f for f in saida["filmes"] if f["titulo"] == titulo]
    return filme


def _linhas_do_filme(filme):
    linhas = filme["linhas_do_filme"]
    assert all(e["pessoa"] is None for e in linhas)
    return linhas


def test_duracao_maxima_tira_filmes_mais_longos(banco):
    saida = _todos(banco, "--duracao-max", "100")

    assert all(f["duracao_min"] <= 100 for f in saida["filmes"])
    assert "Maré Baixa" in _titulos(saida)          # 98 min
    assert "A Volta do Mar" in _titulos(saida)      # 100 min, no limite
    assert "As Horas Lentas" not in _titulos(saida)  # 104 min


def test_filme_que_cabe_no_tempo_mostra_a_linha_de_duracao(banco):
    filme = _filme(_todos(banco, "--duracao-max", "100"), "Maré Baixa")

    [linha] = _linhas_do_filme(filme)
    assert linha["texto"] == "duração 1h38, dentro do limite de 1h40"
    assert (linha["fonte"], linha["forca"], linha["tipo"]) == ("IMDb", "forte", "metadado")
    assert linha["fato_id"] == "tt9000102"
    assert linha["contribuicao"] == 0


def test_resposta_repete_as_restricoes_pedidas_e_quantos_filmes_tiraram(banco):
    saida = _todos(banco, "--duracao-max", "100")

    assert saida["restricoes"]["duracao"]["maximo_min"] == 100
    assert saida["restricoes"]["duracao"]["tirados"] > 0


def test_sem_restricao_nao_ha_linha_do_filme(banco):
    saida = _todos(banco)

    assert saida["restricoes"] == {}
    # Sobra só a linha de grupo/sozinho (#21), que toda Sessão tem.
    textos = [linha["texto"] for f in saida["filmes"] for linha in f["linhas_do_filme"]]
    assert all(t.startswith("para ver sozinho:") for t in textos)


def test_duracao_maxima_invalida_e_uso_invalido(banco):
    codigo, saida = banco.rodar("recomendar", "--presentes", "dono", "--duracao-max", "0")

    assert codigo == 2
    assert saida["erro"]["codigo"] == "uso_invalido"


def test_idioma_pedido_passa_so_filmes_com_esse_idioma_original(banco):
    saida = _todos(banco, "--idioma", "pt")

    # Helena Prado filma em português; Jardim Suspenso tem português e espanhol.
    assert set(_titulos(saida)) == {
        "O Farol de Areia", "Maré Baixa", "Cidade de Vidro", "As Horas Lentas", "Sal e Ferrugem",
        "Jardim Suspenso",
    }


def test_idioma_vale_pelo_codigo_pelo_nome_ou_pelo_item_do_wikidata(banco):
    pelo_codigo = _titulos(_todos(banco, "--idioma", "pt"))

    assert _titulos(_todos(banco, "--idioma", "Português")) == pelo_codigo
    assert _titulos(_todos(banco, "--idioma", "Q5146")) == pelo_codigo


def test_filme_no_idioma_pedido_mostra_a_linha_do_idioma(banco):
    filme = _filme(_todos(banco, "--idioma", "pt"), "Jardim Suspenso")

    [linha] = _linhas_do_filme(filme)
    assert linha["texto"] == "idioma original português"
    assert (linha["fonte"], linha["data"], linha["forca"], linha["tipo"]) == \
        ("Wikidata P364", "2026-11-20", "forte", "metadado")
    assert linha["fato_id"] in [l[0] for l in banco.consultar(
        "SELECT fato_id FROM idiomas_originais WHERE filme_id = 'tt9000301' AND codigo = 'pt'")]


def test_sem_ja_visto_tira_os_filmes_que_algum_presente_ja_viu(banco):
    vistos = {titulo for (titulo,) in banco.consultar(
        "SELECT titulo FROM filmes JOIN notas ON notas.filme_id = filmes.id WHERE pessoa = 'bruno'")}
    com_vistos = set(_titulos(_todos(banco)))
    saida = _todos(banco, "--sem-ja-visto")

    assert "O Farol de Areia" in vistos & com_vistos
    assert set(_titulos(saida)) == com_vistos - vistos
    assert {"As Horas Lentas", "Sal e Ferrugem", "Vento Norte"} <= set(_titulos(saida))
    assert saida["restricoes"]["sem_ja_visto"]["tirados"] == len(vistos & com_vistos)


# Criança. Na fixture (classificacoes.csv, adultos.csv):
#   L: O Farol de Areia (ClassInd L), Maré Baixa (Kijkwijzer AL; CNC "tous publics" não conta)
#   6: Cidade de Vidro (FSK 6), A Volta do Mar (Medierådet 7), Asfalto Quente (ClassInd 6)
#   12: As Horas Lentas (ClassInd 12, que vence o MPA R), Sal e Ferrugem (MPA PG e BBFC 12A: vale a mais alta),
#       O Último Bonde (CNC -12)
#   14: Rio Abaixo (MPA PG-13).  16: Fronteira (MPA R), Barulho (BBFC 15), Explosão Final (Medierådet 15, FSK 16)
#   sem faixa local: Noite de Estreia (só EIRIN G), Vento Norte, Inverno em Lisboa, Ponte Aérea
#   Jardim Suspenso: isAdult no IMDb
SO_L = {"O Farol de Areia", "Maré Baixa"}
ATE_6 = SO_L | {"Cidade de Vidro", "A Volta do Mar", "Asfalto Quente"}
ATE_12 = ATE_6 | {"As Horas Lentas", "Sal e Ferrugem", "O Último Bonde"}


def test_crianca_de_7_anos_recebe_so_filmes_ate_a_faixa_6(banco):
    assert set(_titulos(_todos(banco, "--crianca", "7"))) == ATE_6


def test_tem_crianca_sem_idade_vale_livre(banco):
    assert set(_titulos(_todos(banco, "--crianca"))) == SO_L


def test_crianca_de_12_anos_recebe_ate_12(banco):
    assert set(_titulos(_todos(banco, "--crianca", "12"))) == ATE_12


def test_crianca_de_17_anos_nao_recebe_filme_adulto_nem_sem_faixa(banco):
    titulos = set(_titulos(_todos(banco, "--crianca", "17")))

    assert "Jardim Suspenso" not in titulos   # isAdult
    assert "Vento Norte" not in titulos       # sem classificação em fonte nenhuma
    assert "Fronteira" in titulos             # 16


def _linha_de_classificacao(saida, titulo):
    [linha] = _linhas_do_filme(_filme(saida, titulo))
    return linha


def test_classind_vale_direto_sem_conversao(banco):
    linha = _linha_de_classificacao(_todos(banco, "--crianca", "12"), "As Horas Lentas")

    assert linha["texto"] == "classificação 12 (ClassInd)"
    assert (linha["fonte"], linha["data"], linha["forca"], linha["tipo"]) == \
        ("Wikidata P3216", "2026-11-20", "forte", "metadado")
    assert linha["fato_id"] in [l[0] for l in banco.consultar(
        "SELECT fato_id FROM classificacoes WHERE filme_id = 'tt9000104' AND propriedade = 'P3216'")]


def test_sem_classind_vale_a_faixa_mais_alta_e_a_linha_diz_que_foi_convertida(banco):
    saida = _todos(banco, "--crianca", "12")

    assert _linha_de_classificacao(saida, "Sal e Ferrugem")["texto"] == "classificação 12 (BBFC 12A convertida)"
    assert _linha_de_classificacao(saida, "Sal e Ferrugem")["fonte"] == "Wikidata P2629"
    assert _linha_de_classificacao(saida, "Maré Baixa")["texto"] == "classificação L (Kijkwijzer AL convertida)"
    assert _linha_de_classificacao(saida, "A Volta do Mar")["texto"] == "classificação 6 (Medierådet 7 convertida)"


def test_rotulo_que_ja_traz_o_nome_do_sistema_nao_o_repete(banco):
    # A FSK escreve "FSK 6".
    linha = _linha_de_classificacao(_todos(banco, "--crianca", "12"), "Cidade de Vidro")

    assert linha["texto"] == "classificação 6 (FSK 6 convertida)"


def test_classificacao_convertida_fica_no_banco_com_a_origem(banco):
    linhas = banco.consultar(
        "SELECT faixa, sistema, rotulo, convertida FROM faixas_etarias WHERE filme_id = 'tt9000105' ORDER BY faixa")

    assert linhas == [["10", "MPA", "PG", 1], ["12", "BBFC", "12A", 1]]


def test_idade_de_crianca_invalida_e_uso_invalido(banco):
    codigo, saida = banco.rodar("recomendar", "--presentes", "dono", "--crianca", "18")

    assert codigo == 2
    assert saida["erro"]["codigo"] == "uso_invalido"


# Fontes sob demanda. As respostas gravadas ficam em tests/fixture/gravacoes/<fonte>/<tconst>.json;
# arquivo ausente é "não achei". OMDb: Vento Norte PG, Noite de Estreia PG-13, Inverno em Lisboa
# Not Rated, Jardim Suspenso G (mas é isAdult), Ponte Aérea sem registro.
GRAVACOES = Path(__file__).resolve().parent / "fixture" / "gravacoes"
PESOS = Path(__file__).resolve().parents[1] / "config" / "pesos.toml"


def _com_omdb(banco):
    banco.env.update(FILMES_OMDB_CHAVE="chave-de-teste", FILMES_GRAVACOES=str(GRAVACOES))
    return banco


def _sem_rede(banco, tmp_path):
    """Nem chave nem gravações: só o cache responde."""
    banco.env.pop("FILMES_OMDB_CHAVE", None)
    banco.env.pop("FILMES_DDD_CHAVE", None)
    banco.env["FILMES_GRAVACOES"] = str(tmp_path / "sem-gravacoes")
    return banco


def test_sem_faixa_local_vale_o_rated_do_omdb_convertido_pela_mpa(banco):
    saida = _todos(_com_omdb(banco), "--crianca", "10")

    assert "Vento Norte" in _titulos(saida)
    linha = _linha_de_classificacao(saida, "Vento Norte")
    assert linha["texto"] == "classificação 10 (MPA PG convertida)"
    assert (linha["fonte"], linha["data"], linha["fato_id"]) == ("OMDb", "2026-11-20", "omdb:tt9000302")
    assert "Noite de Estreia" not in _titulos(saida)    # PG-13 vira 14
    assert "Inverno em Lisboa" not in _titulos(saida)   # Not Rated é sem informação
    assert "Ponte Aérea" not in _titulos(saida)         # o OMDb não conhece


def test_rated_do_omdb_tambem_passa_faixas_mais_altas(banco):
    assert "Noite de Estreia" in _titulos(_todos(_com_omdb(banco), "--crianca", "14"))


def test_filme_adulto_sai_sem_consultar_o_omdb(banco):
    assert "Jardim Suspenso" not in _titulos(_todos(_com_omdb(banco), "--crianca", "17"))


def test_sem_chave_do_omdb_filme_sem_faixa_local_sai_com_aviso(banco):
    banco.env["FILMES_GRAVACOES"] = str(GRAVACOES)
    saida = _todos(banco, "--crianca", "10")

    assert "Vento Norte" not in _titulos(saida)
    assert set(_titulos(saida)) == ATE_6
    [aviso] = sem_o_da_capa(saida["avisos"])
    assert "OMDb" in aviso and "FILMES_OMDB_CHAVE" in aviso


def test_resposta_do_omdb_fica_em_cache_por_30_dias(banco, tmp_path):
    _todos(_com_omdb(banco), "--crianca", "10")
    _sem_rede(banco, tmp_path)

    do_cache = _todos(banco, "--crianca", "10")
    assert _linha_de_classificacao(do_cache, "Vento Norte")["data"] == "2026-11-20"

    banco.env["FILMES_HOJE"] = "2026-12-19"
    assert "Vento Norte" in _titulos(_todos(banco, "--crianca", "10"))
    banco.env["FILMES_HOJE"] = "2026-12-20"
    assert "Vento Norte" not in _titulos(_todos(banco, "--crianca", "10"))


def test_cache_sobrevive_a_reconstrucao(banco, tmp_path):
    _todos(_com_omdb(banco), "--crianca", "10")
    banco.ok("reconstruir")
    _sem_rede(banco, tmp_path)

    assert "Vento Norte" in _titulos(_todos(banco, "--crianca", "10"))


def test_so_os_filmes_que_chegariam_ao_top_50_consultam_o_omdb(banco, tmp_path):
    # Com criança de 10, Vento Norte é o 6º da ordem; com alcance 3 ele não é consultado e sai.
    pesos = tmp_path / "pesos.toml"
    pesos.write_text(PESOS.read_text().replace("alcance_sob_demanda = 50", "alcance_sob_demanda = 3"))
    _com_omdb(banco).env["FILMES_PESOS"] = str(pesos)

    assert "Vento Norte" not in _titulos(_todos(banco, "--crianca", "10"))


# Gatilho. Does the Dog Die gravado, tema "a dog dies":
#   As Horas Lentas 12 sim, 2 não; A Volta do Mar 3 sim, 2 não          -> saem
#   Sal e Ferrugem 1 sim, 14 não; Cidade de Vidro 2 sim, 0 não (poucos votos);
#   Noite de Estreia 3 sim, 3 não (empate)                               -> passam
#   O Farol de Areia (só tem "there are jump scares"), Maré Baixa (sem registro): sem informação
CAO = ("--gatilho", "a dog dies")


def _com_ddd(banco):
    banco.env.update(FILMES_DDD_CHAVE="chave-de-teste", FILMES_GRAVACOES=str(GRAVACOES))
    return banco


def test_gatilho_tira_filme_com_3_ou_mais_votos_e_mais_sim_que_nao(banco):
    titulos = _titulos(_todos(_com_ddd(banco), *CAO))

    assert "As Horas Lentas" not in titulos
    assert "A Volta do Mar" not in titulos
    assert {"Sal e Ferrugem", "Cidade de Vidro", "Noite de Estreia"} <= set(titulos)


def test_linha_de_gatilho_cita_o_does_the_dog_die_literalmente(banco):
    filme = _filme(_todos(_com_ddd(banco), *CAO), "Sal e Ferrugem")

    [linha] = _linhas_do_filme(filme)
    assert linha["texto"] == 'Does the Dog Die, "a dog dies": 1 sim, 14 não. Powered by DoesTheDogDie.com'
    assert (linha["fonte"], linha["data"], linha["forca"], linha["tipo"], linha["fato_id"]) == \
        ("Does the Dog Die", "2026-11-20", "forte", "metadado", "ddd:tt9000105")


def test_sem_informacao_do_does_the_dog_die_o_filme_fica_com_aviso(banco):
    saida = _todos(_com_ddd(banco), *CAO)

    for titulo in ("O Farol de Areia", "Maré Baixa"):
        [linha] = _linhas_do_filme(_filme(saida, titulo))
        assert linha["texto"] == 'sem informação do Does the Dog Die sobre "a dog dies"'
        assert (linha["tipo"], linha["forca"], linha["fato_id"]) == ("palpite", "fraca", None)


def test_cada_gatilho_pedido_vale_por_si(banco):
    saida = _todos(_com_ddd(banco), *CAO, "--gatilho", "there are jump scares")

    assert "Sal e Ferrugem" not in _titulos(saida)       # 8 sim, 1 não em jump scares
    assert len(_linhas_do_filme(_filme(saida, "O Farol de Areia"))) == 2


def test_sem_chave_do_does_the_dog_die_ninguem_sai_e_todos_ficam_com_aviso(banco):
    banco.env["FILMES_GRAVACOES"] = str(GRAVACOES)
    saida = _todos(banco, *CAO)

    assert "As Horas Lentas" in _titulos(saida)
    assert all(_linhas_do_filme(f)[0]["tipo"] == "palpite" for f in saida["filmes"])
    [aviso] = sem_o_da_capa(saida["avisos"])
    assert "Does the Dog Die" in aviso and "FILMES_DDD_CHAVE" in aviso


def test_depois_do_top_50_o_does_the_dog_die_nao_e_consultado(banco, tmp_path):
    # A Volta do Mar é o 7º da ordem: com alcance 3, fica sem informação em vez de sair.
    pesos = tmp_path / "pesos.toml"
    pesos.write_text(PESOS.read_text().replace("alcance_sob_demanda = 50", "alcance_sob_demanda = 3"))
    _com_ddd(banco).env["FILMES_PESOS"] = str(pesos)

    filme = _filme(_todos(banco, *CAO), "A Volta do Mar")
    assert _linhas_do_filme(filme)[0]["tipo"] == "palpite"


IMDB = {"fonte": "IMDb", "texto": "Information courtesy of IMDb (https://www.imdb.com). Used with permission."}
DDD = {"fonte": "Does the Dog Die", "texto": "Powered by DoesTheDogDie.com"}


def test_atribuicoes_trazem_sempre_o_imdb(banco):
    assert _todos(banco)["atribuicoes"] == [IMDB]


def test_atribuicoes_trazem_o_does_the_dog_die_quando_o_dado_dele_aparece(banco):
    assert _todos(_com_ddd(banco), *CAO)["atribuicoes"] == [IMDB, DDD]


def test_sem_informacao_do_does_the_dog_die_nao_ha_credito_dele(banco):
    banco.env["FILMES_GRAVACOES"] = str(GRAVACOES)   # sem chave: só linhas de aviso

    assert _todos(banco, *CAO)["atribuicoes"] == [IMDB]
