"""`recomendar --sessao ID` refaz a Recomendação dentro de uma Sessão aberta (#45).

O arquivo da Sessão continua o mesmo. O frontmatter fica com o pedido e a lista
novos, e `versoes` guarda as versões anteriores, a mais antiga primeiro. O corpo
tem só a Recomendação atual.
"""

from conftest import ler_markdown as _ler


def test_refazer_grava_o_pedido_novo_na_mesma_sessao_e_guarda_a_versao_anterior(banco, dados):
    primeira = banco.ok("recomendar", "--presentes", "dono", "iara", "--quantos", "3", "--pedido", "algo bom")
    refeita = banco.ok("recomendar", "--presentes", "dono", "iara", "--quantos", "3", "--duracao-max", "100",
                       "--pedido", "algo curto", "--sessao", "2026-11-20-iara")

    assert refeita["sessao"] == {"id": "2026-11-20-iara", "arquivo": "sessoes/2026-11-20-iara.md", "versao": 2}
    assert sorted(a.name for a in (dados / "sessoes").iterdir()) == ["2026-11-20-iara.md"]
    frente, corpo = _ler(dados / "sessoes" / "2026-11-20-iara.md")
    assert frente["contexto"]["pedido"] == "algo curto"
    assert frente["contexto"]["duracao_max"] == 100
    assert frente["recomendacao"] == [{"posicao": f["posicao"], "id": f["id"], "titulo": f["titulo"]}
                                      for f in refeita["filmes"]]
    assert frente["versoes"] == [{
        "versao": 1,
        "data": frente["data"],
        "presentes": ["bruno", "iara"],
        "contexto": {"pedido": "algo bom", "duracao_max": None, "clima": [], "restricoes": []},
        "regra": {"nome": "padrao"},
        "recomendacao": [{"posicao": f["posicao"], "id": f["id"], "titulo": f["titulo"]}
                         for f in primeira["filmes"]],
    }]
    assert corpo.count("## Recomendação") == 1


def test_cada_refazer_acrescenta_uma_versao_e_sessoes_abertas_mostra_uma_sessao_so(banco, dados):
    banco.ok("recomendar", "--presentes", "dono", "iara", "--pedido", "algo bom")
    banco.env["FILMES_HOJE"] = "2026-11-21"
    banco.ok("recomendar", "--presentes", "dono", "iara", "--pedido", "algo curto", "--duracao-max", "100",
             "--sessao", "2026-11-20-iara")
    terceira = banco.ok("recomendar", "--presentes", "dono", "iara", "teo", "--pedido", "o Teo chegou",
                        "--sessao", "2026-11-20-iara")

    assert terceira["sessao"]["versao"] == 3
    frente, _ = _ler(dados / "sessoes" / "2026-11-20-iara.md")
    assert str(frente["data"]) == "2026-11-20"
    assert frente["presentes"] == ["bruno", "iara", "teo"]
    assert [(v["versao"], str(v["data"]), v["contexto"]["pedido"]) for v in frente["versoes"]] == [
        (1, "2026-11-20", "algo bom"), (2, "2026-11-21", "algo curto"),
    ]
    [aberta] = banco.ok("sessoes-abertas")["sessoes"]
    assert aberta["id"] == "2026-11-20-iara"
    assert aberta["pedido"] == "o Teo chegou"
    assert aberta["presentes"] == ["bruno", "iara", "teo"]
    assert aberta["versao"] == 3
    assert aberta["recomendacao"] == frente["recomendacao"]


def test_refazer_atualiza_a_lista_que_o_feedback_usa_para_achar_a_posicao(banco):
    banco.ok("recomendar", "--presentes", "dono", "--quantos", "2", "--pedido", "qualquer coisa")
    refeita = banco.ok("recomendar", "--presentes", "dono", "--quantos", "2", "--sem-ja-visto",
                       "--duracao-max", "100", "--sessao", "2026-11-20-bruno")
    segundo = refeita["filmes"][1]["id"]

    saida = banco.ok("feedback", "--sessao", "2026-11-20-bruno", "--filme", segundo, "--nota", "dono=4")

    assert saida["escolhido"]["posicao"] == 2
    assert banco.consultar("SELECT posicao, filme_id FROM sessao_recomendacao ORDER BY posicao") == [
        [f["posicao"], f["id"]] for f in refeita["filmes"]
    ]


def test_sessao_com_feedback_nao_se_refaz(banco, dados):
    banco.ok("recomendar", "--presentes", "dono", "--pedido", "primeira")
    banco.ok("feedback", "--sessao", "2026-11-20-bruno", "--nada")
    antes = (dados / "sessoes" / "2026-11-20-bruno.md").read_text(encoding="utf-8")

    codigo, saida = banco.rodar("recomendar", "--presentes", "dono", "--sessao", "2026-11-20-bruno")

    assert codigo != 0
    assert saida["erro"]["codigo"] == "sessao_fechada"
    assert (dados / "sessoes" / "2026-11-20-bruno.md").read_text(encoding="utf-8") == antes


def test_sessao_que_nao_existe_da_erro_e_nao_abre_outra(banco, dados):
    codigo, saida = banco.rodar("recomendar", "--presentes", "dono", "--sessao", "2026-11-20-bruno")

    assert codigo != 0
    assert saida["erro"]["codigo"] == "sessao_desconhecida"
    assert not list((dados / "sessoes").glob("*.md"))
