"""Perguntas abertas de gosto (#62): a pergunta que o Claude fez e a Pessoa pulou.

Fica em `perguntas_abertas:` no frontmatter da Pessoa, com o texto, o assunto
(entidade do Catálogo ou grupo de tags, quando houver), a data e quantas vezes
foi pulada. Pulada duas vezes, sai da lista.
"""

import sqlite3

from conftest import ler_markdown

HELENA = "Q9000001"


def test_pergunta_pulada_fica_no_frontmatter_sem_mexer_no_resto(banco, dados):
    arquivo = dados / "pessoas" / "bruno.md"
    frente_antes, corpo_antes = ler_markdown(arquivo)

    saida = banco.ok("pessoa", "pular", "bruno", "o Bruno curte a Helena Prado?", "--entidade", HELENA)

    assert saida["pergunta"]["puladas"] == 1
    assert saida["saiu"] is False
    frente, corpo = ler_markdown(arquivo)
    assert frente["perguntas_abertas"] == [{
        "texto": "o Bruno curte a Helena Prado?", "assunto": HELENA, "rotulo": "Helena Prado",
        "data": "2026-11-20", "puladas": 1,
    }]
    assert {k: v for k, v in frente.items() if k != "perguntas_abertas"} == frente_antes
    assert corpo == corpo_antes


def test_pulada_pela_segunda_vez_sai_da_lista(banco, dados):
    banco.ok("pessoa", "pular", "bruno", "o Bruno curte a Helena Prado?", "--entidade", HELENA)

    # A mesma pergunta, com outras palavras, no dia em que o assunto voltou à tela.
    saida = banco.ok("pessoa", "pular", "bruno", "e a Helena Prado, Bruno?", "--entidade", HELENA,
                     "--data", "2026-11-27")

    assert (saida["pergunta"]["puladas"], saida["pergunta"]["data"], saida["saiu"]) == (2, "2026-11-27", True)
    assert saida["pergunta"]["texto"] == "o Bruno curte a Helena Prado?"
    assert "perguntas_abertas" not in ler_markdown(dados / "pessoas" / "bruno.md")[0]


def test_sem_assunto_a_pergunta_e_a_mesma_pelo_texto(banco, dados):
    banco.ok("pessoa", "pular", "bruno", "Curte filme mudo?")
    banco.ok("pessoa", "pular", "bruno", "o Bruno gosta de filme longo?")

    saida = banco.ok("pessoa", "pular", "bruno", "curte  filme mudo?")

    assert saida["saiu"] is True
    [aberta] = ler_markdown(dados / "pessoas" / "bruno.md")[0]["perguntas_abertas"]
    assert aberta["texto"] == "o Bruno gosta de filme longo?"


def test_lista_as_perguntas_abertas_da_pessoa(banco):
    banco.ok("pessoa", "pular", "bruno", "o Bruno curte a Helena Prado?", "--entidade", HELENA)
    banco.ok("pessoa", "pular", "bruno", "o Bruno topa comédia boba?", "--grupo", "comedia_boba")
    banco.ok("pessoa", "pular", "iara", "a Iara curte filme mudo?")

    saida = banco.ok("pessoa", "perguntas", "bruno")

    assert saida["pessoa"] == "bruno"
    assert [(p["texto"], p["assunto"], p["rotulo"], p["puladas"]) for p in saida["perguntas_abertas"]] == [
        ("o Bruno curte a Helena Prado?", HELENA, "Helena Prado", 1),
        ("o Bruno topa comédia boba?", "comedia_boba", "comédia boba", 1),
    ]
    assert banco.ok("pessoa", "ver", "bruno")["perguntas_abertas"] == saida["perguntas_abertas"]


def test_tirar_a_pergunta_respondida(banco, dados):
    banco.ok("pessoa", "pular", "bruno", "o Bruno curte a Helena Prado?", "--entidade", HELENA)
    fica = banco.ok("pessoa", "pular", "bruno", "Curte filme mudo?")["pergunta"]

    saida = banco.ok("pessoa", "remover", "bruno", "--pergunta", HELENA)

    assert (saida["tipo"], saida["removido"]["assunto"]) == ("pergunta", HELENA)
    assert banco.ok("pessoa", "perguntas", "bruno")["perguntas_abertas"] == [fica]
    banco.ok("pessoa", "remover", "bruno", "--pergunta", fica["fato_id"])
    assert "perguntas_abertas" not in ler_markdown(dados / "pessoas" / "bruno.md")[0]


def test_a_reconstrucao_carrega_as_perguntas_da_fixture(banco):
    # O Quim pulou na fixture uma pergunta sobre a Helena Prado, diretora do Farol de Areia.
    assert banco.consultar("SELECT pessoa, assunto, rotulo, puladas FROM perguntas_abertas") == [
        ["quim", HELENA, "Helena Prado", 1]]

    # A skill acha a pergunta cujo assunto está num filme da tela.
    assert banco.consultar(
        """SELECT DISTINCT p.pessoa, p.texto FROM perguntas_abertas p JOIN arestas a ON a.entidade_id = p.assunto
           WHERE a.filme_id IN ('tt9000101', 'tt9000201')""") == [["quim", "o Quim curte os filmes da Helena Prado?"]]


def test_pular_e_remover_valem_no_banco_sem_reconstruir(banco):
    fato_id = banco.ok("pessoa", "pular", "bruno", "o Bruno topa comédia boba?", "--grupo", "comedia_boba")["pergunta"]["fato_id"]
    assert banco.consultar("SELECT fato_id, pessoa, assunto, puladas FROM perguntas_abertas WHERE pessoa = 'bruno'") == [
        [fato_id, "bruno", "comedia_boba", 1]]

    banco.ok("pessoa", "pular", "bruno", "o Bruno topa comédia boba?", "--grupo", "comedia_boba")
    assert banco.consultar("SELECT count(*) FROM perguntas_abertas WHERE pessoa = 'bruno'") == [[0]]


def test_banco_de_antes_das_perguntas_abertas_aceita_escrita_na_pessoa(banco):
    # Um banco reconstruído antes do #62 não tem a tabela; mudar a Pessoa não pede `reconstruir`.
    caminho = banco.env["FILMES_BANCO"]
    with sqlite3.connect(caminho) as conn:
        conn.execute("DROP TABLE perguntas_abertas")
    conn.close()

    banco.ok("pessoa", "vetar", "bruno", "esse não", "--filme", "tt9000101")
    banco.ok("pessoa", "pular", "bruno", "o Bruno topa comédia boba?", "--grupo", "comedia_boba")

    assert banco.consultar("SELECT pessoa, assunto FROM perguntas_abertas") == [["bruno", "comedia_boba"]]
    assert banco.consultar("SELECT pessoa FROM vetos WHERE alvo = 'tt9000101'") == [["bruno"]]


def test_pulada_de_novo_com_assunto_guarda_o_assunto(banco):
    banco.ok("pessoa", "pular", "bruno", "o Bruno topa comédia boba?")

    saida = banco.ok("pessoa", "pular", "bruno", "o Bruno topa comédia boba?", "--grupo", "comedia_boba")

    assert saida["saiu"] is True
    assert (saida["pergunta"]["assunto"], saida["pergunta"]["puladas"]) == ("comedia_boba", 2)
