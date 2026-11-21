"""Sessões: `recomendar` abre a Sessão num arquivo do repo de dados; `sessoes-abertas` lista as sem Feedback.

O arquivo é `sessoes/<data>-<presentes>.md`: frontmatter YAML com data, Presentes,
contexto, Regra, Filme escolhido e Feedback; no corpo, a Recomendação inteira
com todas as Evidências no formato completo de linha.
"""

import yaml


def _ler(caminho):
    texto = caminho.read_text(encoding="utf-8")
    _, frente, corpo = texto.split("---\n", 2)
    return yaml.safe_load(frente), corpo


def test_recomendar_abre_a_sessao_num_arquivo_do_repo_de_dados(banco, dados):
    saida = banco.ok("recomendar", "--presentes", "dono", "iara", "--pedido", "eu e a Iara, algo bom")

    assert saida["sessao"] == {"id": "2026-11-20-iara", "arquivo": "sessoes/2026-11-20-iara.md"}
    frente, _ = _ler(dados / "sessoes" / "2026-11-20-iara.md")
    assert str(frente["data"]) == "2026-11-20"
    assert frente["presentes"] == ["bruno", "iara"]
    assert frente["contexto"] == {"pedido": "eu e a Iara, algo bom", "duracao_max": None, "clima": [],
                                  "restricoes": []}
    assert frente["regra"] == {"nome": "padrao"}
    assert frente["recomendacao"] == [{"posicao": f["posicao"], "id": f["id"], "titulo": f["titulo"]}
                                      for f in saida["filmes"]]
    assert frente["escolhido"] is None
    assert frente["escolhido_na_recomendacao"] is None
    assert frente["feedback"] is None


def test_corpo_da_sessao_guarda_todas_as_evidencias_no_formato_completo(banco, dados):
    banco.ok("recomendar", "--presentes", "dono", "iara", "--quantos", "50")

    _, corpo = _ler(dados / "sessoes" / "2026-11-20-iara.md")
    assert corpo.startswith("## Recomendação\n")
    assert ". As Horas Lentas (2021, 1h44) · tt9000104\n   - Bruno\n" in corpo
    assert (
        "     - Evidência: deu 5 a O Farol de Areia (2012), também de Helena Prado"
        " · Fonte: Letterboxd do Bruno, 2025-06-01 · Força: forte · Tipo: nota\n"
    ) in corpo
    assert (
        "     - Evidência: dirigido por Helena Prado, como 3 filmes a que deu 4 ou mais:"
        " O Farol de Areia (2012), Maré Baixa (2015) e Cidade de Vidro (2018)"
        " · Fonte: Wikidata, 2026-11-20 · Força: forte · Tipo: metadado\n"
    ) in corpo
    assert (
        "     - Evidência: deu 3 a O Farol de Areia (2012), também de Helena Prado"
        " · Fonte: Letterboxd da Iara, 2025-04-12 · Força: fraca · Tipo: nota\n"
    ) in corpo
    assert "Pequenos Milagres (2019, 1h36) · tt9000601 · sem fato que o sustente\n" in corpo
    assert "     - Evidência: sem fato · Força: fraca · Tipo: palpite\n" in corpo


def test_dono_sozinho_da_nome_a_sessao(banco, dados):
    saida = banco.ok("recomendar", "--presentes", "dono")

    assert saida["sessao"]["id"] == "2026-11-20-bruno"
    assert (dados / "sessoes" / "2026-11-20-bruno.md").exists()


def test_novo_pedido_no_mesmo_dia_preserva_a_sessao_pulada(banco, dados):
    primeira = banco.ok("recomendar", "--presentes", "dono", "iara", "--pedido", "primeira Sessão")
    saida = banco.ok("recomendar", "--presentes", "dono", "iara", "--regra", "media", "--pedido", "outra Sessão")

    assert primeira["sessao"]["id"] == "2026-11-20-iara"
    assert saida["sessao"]["id"] == "2026-11-20-iara-2"
    frente, _ = _ler(dados / primeira["sessao"]["arquivo"])
    assert frente["contexto"]["pedido"] == "primeira Sessão"
    assert [s["id"] for s in banco.ok("sessoes-abertas")["sessoes"]] == [
        "2026-11-20-iara-2", "2026-11-20-iara",
    ]


def test_sessoes_abertas_lista_as_sessoes_sem_feedback_a_mais_recente_primeiro(banco):
    assert banco.ok("sessoes-abertas") == {"sessoes": []}

    banco.env["FILMES_HOJE"] = "2026-11-19"
    banco.ok("recomendar", "--presentes", "dono", "iara", "--quantos", "2", "--pedido", "eu e a Iara")
    banco.env["FILMES_HOJE"] = "2026-11-20"
    banco.ok("recomendar", "--presentes", "dono")

    saida = banco.ok("sessoes-abertas")
    assert [s["id"] for s in saida["sessoes"]] == ["2026-11-20-bruno", "2026-11-19-iara"]
    assert saida["sessoes"][1] == {
        "id": "2026-11-19-iara",
        "arquivo": "sessoes/2026-11-19-iara.md",
        "data": "2026-11-19",
        "presentes": ["bruno", "iara"],
        "pedido": "eu e a Iara",
        "recomendacao": [{"posicao": 1, "id": "tt9000101", "titulo": "O Farol de Areia"},
                         {"posicao": 2, "id": "tt9000203", "titulo": "Noite de Estreia"}],
    }


def _conteudo(cli):
    tabelas = [t for [t] in cli.consultar("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")]
    return {t: sorted(cli.consultar(f'SELECT * FROM "{t}"'), key=repr) for t in tabelas}


def test_reconstruir_tira_dos_arquivos_de_sessao_os_mesmos_fatos_que_o_feedback_gravou(banco):
    aberta = banco.ok("recomendar", "--presentes", "dono", "iara")["sessao"]["id"]
    banco.ok("feedback", "--sessao", aberta, "--filme", "Vento Norte", "--nota", "dono=4", "--relato", "iara=neutro")
    banco.env["FILMES_HOJE"] = "2026-11-21"
    banco.ok("recomendar", "--presentes", "dono", "teo")
    depois_do_feedback = _conteudo(banco)

    banco.ok("reconstruir")

    assert _conteudo(banco) == depois_do_feedback
    assert depois_do_feedback["reacoes"] and depois_do_feedback["ja_visto"] and len(depois_do_feedback["sessoes"]) == 2


def test_reconstruir_e_registrar_feedback_numa_sessao_no_formato_do_prototipo(banco, dados):
    sessao = "2026-11-20-iara"
    pasta = dados / "sessoes"
    pasta.mkdir()
    (pasta / f"{sessao}.md").write_text(
        "---\ndata: 2026-11-20\npresentes: [bruno, iara]\n"
        "regra: media-sem-miseria-com-justica\n---\n\n"
        "## Recomendação\n\n1. Vento Norte (tt9000302)\n",
        encoding="utf-8",
    )

    banco.ok("reconstruir")
    saida = banco.ok("feedback", "--sessao", sessao, "--filme", "tt9000302", "--nota", "dono=4")
    assert saida["escolhido"]["posicao"] == 1


def test_sessao_guarda_as_restricoes_e_as_linhas_do_filme(banco, dados):
    saida = banco.ok("recomendar", "--presentes", "dono", "--pedido", "duas horas sem repetir",
                     "--duracao-max", "120", "--sem-ja-visto")

    frente, corpo = _ler(dados / saida["sessao"]["arquivo"])
    assert frente["contexto"] == {
        "pedido": "duas horas sem repetir", "duracao_max": 120, "clima": [],
        "restricoes": [{"nome": "sem_ja_visto"}],
    }
    assert " · Fonte: IMDb · Força: forte · Tipo: metadado" in corpo


def test_sessao_guarda_o_clima_aceito_e_sua_evidencia(banco, dados):
    saida = banco.ok("recomendar", "--presentes", "dono", "iara", "--clima", "Leve", "épico", "--quantos", "50")

    frente, corpo = _ler(dados / saida["sessao"]["arquivo"])
    assert frente["contexto"]["clima"] == ["leve"]
    filme = next(f for f in saida["filmes"] if f["titulo"] == "Dia de Feira")
    [evidencia] = [e for e in filme["linhas_do_filme"] if e["texto"].startswith("Clima leve")]
    assert f"Evidência: {evidencia['texto']} · Fonte: MovieLens ml-32m" in corpo
