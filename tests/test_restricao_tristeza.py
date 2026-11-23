"""Restrição "nada triste": `recomendar --sem-tristeza`.

Sinais na fixture, todos em filmes sem Nota de ninguém:
- tags.csv: Pequenos Milagres "sad" com 5 usuários, Casa Cheia "sad" com 2,
  Os Inquilinos "massacre" com 2.
- Tag Genome: Deserto Branco "tearjerker" 0,6, A Última Estação "sad" 0,59.
- Wikidata: Fim de Tarde tem tema Holocausto (Q2763), Café Amargo é baseado
  em suicídio (Q10737), Linha Cruzada tem tema futebol.
- Luto (#58): Casa Vazia "grief", Último Verão "tragic loss" e Aliança
  Partida "death of wife", cada um só com essa tag, de 2 usuários.
"""

from conftest import ler_markdown


def _todos(banco, *restricoes):
    return banco.ok("recomendar", "--presentes", "dono", "--quantos", "100", *restricoes)


def _titulos(saida):
    return [f["titulo"] for f in saida["filmes"]]


def test_tag_triste_de_3_ou_mais_usuarios_tira_o_filme(banco):
    assert "Pequenos Milagres" in _titulos(_todos(banco))

    titulos = _titulos(_todos(banco, "--sem-tristeza"))

    assert "Pequenos Milagres" not in titulos
    assert "Casa Cheia" in titulos        # "sad" de só 2 usuários


def test_tag_triste_do_tag_genome_com_relevancia_06_tira_o_filme(banco):
    titulos = _titulos(_todos(banco, "--sem-tristeza"))

    assert "Deserto Branco" not in titulos   # "tearjerker" 0,6, no limite
    assert "A Última Estação" in titulos     # "sad" 0,59


def test_tag_de_tema_pesado_de_2_usuarios_tira_o_filme(banco):
    assert "Os Inquilinos" in _titulos(_todos(banco))

    assert "Os Inquilinos" not in _titulos(_todos(banco, "--sem-tristeza"))


def test_tema_pesado_do_wikidata_tira_o_filme(banco):
    titulos = _titulos(_todos(banco, "--sem-tristeza"))

    assert "Fim de Tarde" not in titulos     # tema Holocausto
    assert "Café Amargo" not in titulos      # baseado em suicídio
    assert "Linha Cruzada" in titulos        # tema futebol


def test_tag_de_luto_conta_como_tema_pesado(banco):
    luto = {"Casa Vazia", "Último Verão", "Aliança Partida"}
    assert luto <= set(_titulos(_todos(banco)))

    assert luto.isdisjoint(_titulos(_todos(banco, "--sem-tristeza")))


def test_resposta_conta_os_tirados_por_sinal(banco):
    sem = _titulos(_todos(banco))
    saida = _todos(banco, "--sem-tristeza")

    tirados = set(sem) - set(_titulos(saida))
    assert tirados == {"Pequenos Milagres", "Deserto Branco", "Os Inquilinos", "Fim de Tarde", "Café Amargo",
                       "Casa Vazia", "Último Verão", "Aliança Partida"}
    assert saida["restricoes"]["sem_tristeza"] == {"por_sinal": {"triste": 2, "tema_pesado": 6}, "tirados": 8}


def test_sem_o_pedido_nada_sai_e_a_restricao_nao_aparece(banco):
    assert "sem_tristeza" not in _todos(banco)["restricoes"]


def _linha(banco, titulo):
    [filme] = [f for f in _todos(banco, "--sem-tristeza")["filmes"] if f["titulo"] == titulo]
    [linha] = [l for l in filme["linhas_do_filme"] if l["texto"].startswith("nada triste:")]
    return linha


def test_filme_que_passa_diz_que_nao_achou_tag_triste(banco):
    linha = _linha(banco, "Casa Cheia")

    assert linha["texto"] == ("nada triste: nenhuma tag de tristeza ou de tema pesado no MovieLens, "
                              "nenhum tema pesado no Wikidata")
    assert (linha["pessoa"], linha["forca"], linha["tipo"]) == (None, "fraca", "palpite")


def test_filme_sem_tag_nenhuma_passa_e_a_linha_avisa(banco):
    linha = _linha(banco, "Linha Cruzada")

    assert linha["texto"] == "nada triste: o filme não tem tags no MovieLens, e o Wikidata não dá tema pesado"


def test_a_sessao_guarda_o_pedido_sem_as_contagens(banco, dados):
    saida = _todos(banco, "--sem-tristeza")

    frente, _ = ler_markdown(dados / saida["sessao"]["arquivo"])
    assert frente["contexto"]["restricoes"] == [{"nome": "sem_tristeza"}]


def test_topo_do_cartaz_le_nada_triste(banco, tmp_path):
    sessao = _todos(banco, "--sem-tristeza", "--clima", "leve")["sessao"]["id"]
    destino = tmp_path / "cartaz.html"
    banco.ok("cartaz", "--sessao", sessao, "--saida", str(destino))

    assert "leve · nada triste" in destino.read_text(encoding="utf-8")
