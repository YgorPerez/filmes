"""Restrições da Sessão: duração, idioma, criança, gatilho e "sem Já visto".

Sem Restrição, o Bruno recebe 17 filmes com `--quantos 50` (veja o LEIAME da
fixture). Cada Restrição tira filmes antes da ordenação e põe, em cada filme
que passou, uma linha do filme (Evidência com `pessoa` nula) dizendo por quê.
"""

from pathlib import Path


def _todos(banco, *restricoes):
    return banco.ok("recomendar", "--presentes", "dono", "--quantos", "50", *restricoes)


def _titulos(saida):
    return [f["titulo"] for f in saida["filmes"]]


def _filme(saida, titulo):
    [filme] = [f for f in saida["filmes"] if f["titulo"] == titulo]
    return filme


def _linhas_do_filme(filme):
    return [e for e in filme["evidencias"] if e["pessoa"] is None]


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
    assert all(not _linhas_do_filme(f) for f in saida["filmes"])


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
    com_vistos = _titulos(_todos(banco))
    saida = _todos(banco, "--sem-ja-visto")

    # Bruno deu Nota a O Farol de Areia, Maré Baixa e Cidade de Vidro, entre outros.
    assert "O Farol de Areia" in com_vistos
    assert set(_titulos(saida)) == {
        "As Horas Lentas", "Sal e Ferrugem", "Noite de Estreia", "Vento Norte", "A Volta do Mar", "Explosão Final",
    }
    assert saida["restricoes"]["sem_ja_visto"]["tirados"] == 11


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
    assert "Inverno em Lisboa" not in _titulos(saida)   # Not Rated é sem dado
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
    [aviso] = saida["avisos"]
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
