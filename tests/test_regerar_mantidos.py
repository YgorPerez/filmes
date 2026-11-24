"""Regerar mantendo filmes e posições na Sessão (#59, decisão do Dono de 2026-11-23).

`recomendar --sessao ID --manter tt1,tt3` deixa os mantidos no número que tinham
na versão anterior e preenche as vagas com os melhores Candidatos que a Sessão
ainda não mostrou. Cada filme diz se é `novo`; `saidas` diz o que saiu e por quê.
"""

from conftest import ler_markdown
from test_cartaz import arvore
from test_cartaz_responde import _cartaz


def _ids(saida):
    return [f["id"] for f in saida["filmes"]]


def _primeira(banco, *extra):
    primeira = banco.ok("recomendar", "--presentes", "dono", *extra)
    return primeira, primeira["sessao"]["id"]


def test_mantidos_ficam_na_posicao_e_as_vagas_ganham_filmes_que_a_sessao_nao_mostrou(banco):
    primeira, sessao_id = _primeira(banco)
    p = _ids(primeira)

    refeita = banco.ok("recomendar", "--presentes", "dono", "--sessao", sessao_id, "--manter", f"{p[0]},{p[2]},{p[3]}")

    assert len(refeita["filmes"]) == 5
    por_posicao = {f["posicao"]: f for f in refeita["filmes"]}
    assert [por_posicao[n]["id"] for n in (1, 3, 4)] == [p[0], p[2], p[3]]
    assert [por_posicao[n]["novo"] for n in (1, 3, 4)] == [False, False, False]
    vagas = [por_posicao[2], por_posicao[5]]
    assert all(f["novo"] for f in vagas)
    assert not {f["id"] for f in vagas} & set(p)


def test_saidas_dizem_quem_ja_viu_e_o_que_foi_trocado(banco):
    primeira, sessao_id = _primeira(banco)
    f = primeira["filmes"]
    banco.ok("pessoa", "visto", "dono", "--filme", f[1]["id"], "--nota", "8/10")

    refeita = banco.ok("recomendar", "--presentes", "dono", "--sessao", sessao_id, "--manter", f"{f[0]['id']},{f[2]['id']}")

    assert refeita["mantidos"] == [f[0]["id"], f[2]["id"]]
    assert refeita["saidas"] == [
        {"posicao": 2, "id": f[1]["id"], "titulo": f[1]["titulo"], "motivo": "ja_visto", "pessoas": ["bruno"]},
        {"posicao": 4, "id": f[3]["id"], "titulo": f[3]["titulo"], "motivo": "trocado"},
        {"posicao": 5, "id": f[4]["id"], "titulo": f[4]["titulo"], "motivo": "trocado"},
    ]


def test_a_versao_gravada_guarda_novo_mantidos_e_saidas(banco, dados):
    primeira, sessao_id = _primeira(banco)
    p = _ids(primeira)
    refeita = banco.ok("recomendar", "--presentes", "dono", "--sessao", sessao_id, "--manter", p[1])

    frente, _ = ler_markdown(dados / "sessoes" / f"{sessao_id}.md")
    assert frente["recomendacao"] == [{"posicao": f["posicao"], "id": f["id"], "titulo": f["titulo"], "novo": f["novo"]}
                                      for f in refeita["filmes"]]
    assert frente["mantidos"] == [p[1]]
    assert frente["saidas"] == refeita["saidas"]

    terceira = banco.ok("recomendar", "--presentes", "dono", "--sessao", sessao_id)

    frente, _ = ler_markdown(dados / "sessoes" / f"{sessao_id}.md")
    assert frente["mantidos"] == []
    assert frente["versoes"][1]["mantidos"] == [p[1]]
    assert frente["versoes"][1]["saidas"] == refeita["saidas"]
    assert [r["novo"] for r in frente["recomendacao"]] == [f["id"] not in _ids(refeita) for f in terceira["filmes"]]


def test_manter_sem_sessao_e_uso_invalido(banco):
    codigo, saida = banco.rodar("recomendar", "--presentes", "dono", "--manter", "tt9000104")

    assert codigo == 2
    assert saida["erro"]["codigo"] == "uso_invalido"


def test_mantido_fora_da_versao_anterior_fica_de_fora_com_aviso(banco):
    primeira, sessao_id = _primeira(banco)
    fora = "tt9000101"
    assert fora not in _ids(primeira)

    refeita = banco.ok("recomendar", "--presentes", "dono", "--sessao", sessao_id, "--manter", fora)

    assert all(f["novo"] for f in refeita["filmes"])
    assert refeita["mantidos"] == []
    assert any(fora in aviso for aviso in refeita["avisos"])


def test_restricao_nova_tira_o_mantido_que_a_viola_com_aviso(banco):
    primeira, sessao_id = _primeira(banco)
    f = primeira["filmes"]
    assert f[1]["duracao_min"] > 110 >= f[0]["duracao_min"]

    refeita = banco.ok("recomendar", "--presentes", "dono", "--sessao", sessao_id, "--duracao-max", "110",
                       "--manter", f"{f[0]['id']},{f[1]['id']}")

    assert refeita["mantidos"] == [f[0]["id"]]
    assert {"posicao": 2, "id": f[1]["id"], "titulo": f[1]["titulo"], "motivo": "restricao",
            "restricao": "duracao", "rotulo": "até 1h50"} in refeita["saidas"]
    assert any(f[1]["titulo"] in aviso and "mantido" in aviso for aviso in refeita["avisos"])
    assert refeita["filmes"][1]["novo"] and refeita["filmes"][1]["posicao"] == 2


def test_veto_novo_tira_o_mantido_e_declarado_novo_nao(banco):
    primeira, sessao_id = _primeira(banco)
    f = primeira["filmes"]
    banco.ok("pessoa", "vetar", "dono", "não vejo esse de jeito nenhum", "--filme", f[0]["id"])
    banco.ok("pessoa", "declarar", "dono", "detestei o trailer", "--filme", f[2]["id"], "--reacao", "odeia")

    refeita = banco.ok("recomendar", "--presentes", "dono", "--sessao", sessao_id, "--manter", f"{f[0]['id']},{f[2]['id']}")

    assert refeita["mantidos"] == [f[2]["id"]]
    assert refeita["filmes"][2]["id"] == f[2]["id"]
    assert {"posicao": 1, "id": f[0]["id"], "titulo": f[0]["titulo"], "motivo": "veto",
            "pessoa": "bruno", "texto": "não vejo esse de jeito nenhum"} in refeita["saidas"]
    assert any(f[0]["titulo"] in aviso and "mantido" in aviso for aviso in refeita["avisos"])


def test_refazer_sem_manter_nao_mantem_nada_e_diz_o_que_saiu(banco):
    # Sem o sem repetido (#66), o que não foi visto pode voltar; o Já visto da Sessão sai.
    primeira, sessao_id = _primeira(banco)
    visto = primeira["filmes"][1]
    banco.ok("pessoa", "visto", "dono", "--filme", visto["id"])

    refeita = banco.ok("recomendar", "--presentes", "dono", "--sessao", sessao_id)

    assert refeita["mantidos"] == []
    # O que volta da tela anterior não leva o selo novo; só o que entrou no lugar do visto.
    assert [f["novo"] for f in refeita["filmes"]] == [f["id"] not in _ids(primeira) for f in refeita["filmes"]]
    assert any(f["novo"] for f in refeita["filmes"])
    assert visto["id"] not in _ids(refeita)
    assert {"posicao": 2, "id": visto["id"], "titulo": visto["titulo"], "motivo": "ja_visto",
            "pessoas": ["bruno"]} in refeita["saidas"]


def test_mantido_abaixo_da_nota_minima_sai_com_aviso(banco, dados, tmp_path):
    # Sombra Morna tem nota 6,5 no IMDb: não é Candidato. Uma Sessão de antes da
    # nota mínima a mostrou em 2.
    primeira, sessao_id = _primeira(banco)
    arquivo = dados / "sessoes" / f"{sessao_id}.md"
    trocado = primeira["filmes"][1]
    arquivo.write_text(arquivo.read_text(encoding="utf-8")
                       .replace(f"id: {trocado['id']}", "id: tt9003401")
                       .replace(f"titulo: {trocado['titulo']}", "titulo: Sombra Morna"), encoding="utf-8")

    refeita = banco.ok("recomendar", "--presentes", "dono", "--sessao", sessao_id,
                       "--manter", f"{primeira['filmes'][0]['id']},tt9003401")

    assert "tt9003401" not in _ids(refeita)
    assert refeita["mantidos"] == [primeira["filmes"][0]["id"]]
    assert {"posicao": 2, "id": "tt9003401", "titulo": "Sombra Morna", "motivo": "nota_minima",
            "rotulo": "nota 6,5 no IMDb, abaixo de 7"} in refeita["saidas"]
    assert any("Sombra Morna" in aviso and "mantido" in aviso for aviso in refeita["avisos"])
    saiu = arvore(_cartaz(banco, tmp_path, sessao_id)).um("saiu").texto
    assert "2 Sombra Morna (nota 6,5 no IMDb, abaixo de 7)" in saiu


def test_lista_menor_que_a_posicao_do_mantido_fica_sem_buraco(banco):
    primeira, sessao_id = _primeira(banco)
    p = _ids(primeira)

    refeita = banco.ok("recomendar", "--presentes", "dono", "--sessao", sessao_id, "--quantos", "3",
                       "--manter", f"{p[1]},{p[4]}")

    assert [f["posicao"] for f in refeita["filmes"]] == [1, 2, 3]
    assert [(f["id"], f["novo"]) for f in refeita["filmes"][1:]] == [(p[1], False), (p[4], False)]
    assert refeita["filmes"][0]["novo"]


def test_ja_visto_de_quem_estava_na_versao_anterior_e_saiu_conta_na_saida(banco):
    primeira, sessao_id = _primeira(banco, "iara")
    f = primeira["filmes"]
    banco.ok("cartaz", "responder", "--sessao", sessao_id, entrada=f"#cartaz {sessao_id} v1\n2 {f[1]['id']} · já vi: iara\n")

    refeita = banco.ok("recomendar", "--presentes", "dono", "--sessao", sessao_id, "--manter", f[0]["id"])

    assert {"posicao": 2, "id": f[1]["id"], "titulo": f[1]["titulo"], "motivo": "ja_visto",
            "pessoas": ["iara"]} in refeita["saidas"]
