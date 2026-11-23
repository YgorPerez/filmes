"""`cartaz responder` (#61): lê o texto colado do cartaz (#60) e grava.

O texto vem no stdin, como o botão Copiar pro chat o monta (formato no docstring
de `filmes/cartaz`). Já vi vira Já visto da Pessoa (com nota, Nota, dividida por
2); estrelas, comentários e acrescentar ficam na versão da Sessão. A resposta
diz se é preciso regerar e o que manter.
"""

from conftest import ler_markdown
from test_cartaz_responde import _cartaz, _estado, _texto


def _sessao(banco, *presentes):
    saida = banco.ok("recomendar", "--presentes", "dono", *presentes)
    return saida, saida["sessao"]["id"]


def _responder(banco, sessao_id, texto):
    return banco.ok("cartaz", "responder", "--sessao", sessao_id, entrada=texto)


def test_ja_vi_com_nota_grava_ja_visto_e_nota_dividida_por_2(banco):
    primeira, sessao_id = _sessao(banco, "iara")
    filme = primeira["filmes"][0]["id"]

    _responder(banco, sessao_id, f"#cartaz {sessao_id} v1\n1 {filme} · já vi: iara=8\n")

    iara = banco.ok("pessoa", "ver", "iara")
    assert [(v["filme"], v["nota"], v["data"]) for v in iara["vistos"]] == [(filme, 4.0, "2026-11-20")]
    assert any(n["filme_id"] == filme and n["nota"] == 4.0 for n in iara["notas"])


def test_ja_vi_todos_vale_para_os_presentes_da_versao_e_o_filme_sai(banco):
    primeira, sessao_id = _sessao(banco, "iara")
    f = primeira["filmes"]

    saida = _responder(banco, sessao_id, f"#cartaz {sessao_id} v1\n2 {f[1]['id']} · já vi: todos\n")

    assert {(v["pessoa"], v["filme"], v["nota"]) for v in saida["vistos"]} == {
        ("bruno", f[1]["id"], None), ("iara", f[1]["id"], None)}
    assert saida["regerar"] is True
    assert saida["saem"] == [{"posicao": 2, "id": f[1]["id"], "titulo": f[1]["titulo"],
                              "motivo": "ja_visto", "pessoas": ["bruno", "iara"]}]
    assert saida["manter"] == [f[0]["id"], *(x["id"] for x in f[2:])]
    assert all(n["filme_id"] != f[1]["id"] for n in banco.ok("pessoa", "ver", "iara")["notas"])


def test_estrelas_comentarios_e_acrescentar_ficam_na_versao_da_sessao(banco, dados):
    primeira, sessao_id = _sessao(banco, "iara")
    f = primeira["filmes"]
    texto = (f"#cartaz {sessao_id} v1\n"
             "acrescentar: chegou a Ana, algo leve\n"
             f"1 {f[0]['id']} · estrelas: 4\n"
             f"3 {f[2]['id']} · estrelas: 2 · comentário: lindo, mas · longo\n")

    saida = _responder(banco, sessao_id, texto)

    frente, _ = ler_markdown(dados / "sessoes" / f"{sessao_id}.md")
    assert frente["respostas"] == [{
        "data": frente["respostas"][0]["data"],
        "acrescentar": "chegou a Ana, algo leve",
        "filmes": [{"posicao": 1, "id": f[0]["id"], "estrelas": 4},
                   {"posicao": 3, "id": f[2]["id"], "estrelas": 2, "comentario": "lindo, mas · longo"}],
    }]
    assert str(frente["respostas"][0]["data"]) == "2026-11-20"
    assert saida["acrescentar"] == "chegou a Ana, algo leve"
    assert saida["comentarios"] == [{"posicao": 3, "id": f[2]["id"], "titulo": f[2]["titulo"],
                                     "comentario": "lindo, mas · longo"}]
    assert saida["regerar"] is True and saida["saem"] == []
    assert saida["manter"] == [x["id"] for x in f]


def test_estrela_nao_vira_fato(banco):
    primeira, sessao_id = _sessao(banco, "iara")
    antes = banco.ok("pessoa", "ver", "dono")

    _responder(banco, sessao_id, f"#cartaz {sessao_id} v1\n1 {primeira['filmes'][0]['id']} · estrelas: 1\n")

    assert banco.ok("pessoa", "ver", "dono") == antes


def test_so_estrelas_ou_comentarios_nao_pedem_regerar(banco):
    primeira, sessao_id = _sessao(banco, "iara")
    f = primeira["filmes"]

    saida = _responder(banco, sessao_id, f"#cartaz {sessao_id} v1\n"
                                         f"1 {f[0]['id']} · estrelas: 5\n2 {f[1]['id']} · comentário: bom\n")

    assert saida["regerar"] is False
    assert saida["saem"] == []
    assert saida["acrescentar"] is None


def test_trocar_tira_o_filme_e_diz_o_motivo(banco):
    primeira, sessao_id = _sessao(banco, "iara")
    f = primeira["filmes"]

    saida = _responder(banco, sessao_id, f"#cartaz {sessao_id} v1\n4 {f[3]['id']} · trocar · estrelas: 1\n")

    assert saida["regerar"] is True
    assert saida["saem"] == [{"posicao": 4, "id": f[3]["id"], "titulo": f[3]["titulo"], "motivo": "trocado"}]
    assert f[3]["id"] not in saida["manter"]


def test_texto_de_versao_velha_vale_pelo_filme_e_ignora_trocar_do_que_saiu(banco, dados):
    primeira, sessao_id = _sessao(banco, "iara")
    v1 = primeira["filmes"]
    segunda = banco.ok("recomendar", "--presentes", "dono", "iara", "--sessao", sessao_id,
                       "--manter", f"{v1[0]['id']},{v1[1]['id']}")
    saiu = next(f for f in v1 if f["id"] not in {x["id"] for x in segunda["filmes"]})
    texto = (f"#cartaz {sessao_id} v1\n"
             f"1 {v1[0]['id']} · trocar\n"
             f"{saiu['posicao']} {saiu['id']} · trocar · estrelas: 3\n")

    saida = _responder(banco, sessao_id, texto)

    assert saida["versao"] == 1 and saida["versao_atual"] == 2
    assert saida["saem"] == [{"posicao": 1, "id": v1[0]["id"], "titulo": v1[0]["titulo"], "motivo": "trocado"}]
    assert saida["manter"] == [f["id"] for f in segunda["filmes"] if f["id"] != v1[0]["id"]]
    assert any(saiu["id"] in aviso and "trocar" in aviso for aviso in saida["avisos"])
    frente, _ = ler_markdown(dados / "sessoes" / f"{sessao_id}.md")
    assert "respostas" not in frente
    assert frente["versoes"][0]["respostas"][0]["filmes"] == [
        {"posicao": saiu["posicao"], "id": saiu["id"], "estrelas": 3}]


def test_respostas_da_versao_atual_vao_junto_quando_a_sessao_e_refeita(banco, dados):
    primeira, sessao_id = _sessao(banco, "iara")
    _responder(banco, sessao_id, f"#cartaz {sessao_id} v1\n1 {primeira['filmes'][0]['id']} · estrelas: 5\n")

    banco.ok("recomendar", "--presentes", "dono", "iara", "--sessao", sessao_id)

    frente, _ = ler_markdown(dados / "sessoes" / f"{sessao_id}.md")
    assert "respostas" not in frente
    assert frente["versoes"][0]["respostas"][0]["filmes"][0]["estrelas"] == 5


def test_texto_com_conversa_em_volta_e_lido_da_linha_do_cartaz(banco):
    primeira, sessao_id = _sessao(banco, "iara")
    f = primeira["filmes"]

    saida = _responder(banco, sessao_id, f"olha só o que marquei:\n\n#cartaz {sessao_id} v1\n"
                                         f"2 {f[1]['id']} · trocar\n\nvaleu!\n3 {f[2]['id']} · trocar\n")

    assert [s["id"] for s in saida["saem"]] == [f[1]["id"]]


def test_sessao_errada_ou_texto_que_nao_e_de_cartaz_e_uso_invalido(banco):
    _, sessao_id = _sessao(banco, "iara")

    for texto in ("oi, tudo bem?\n", "#cartaz 2026-01-01-outra v1\n", f"#cartaz {sessao_id} v9\n"):
        codigo, saida = banco.rodar("cartaz", "responder", "--sessao", sessao_id, entrada=texto)
        assert codigo == 2, saida
        assert saida["erro"]["codigo"] == "uso_invalido"
    codigo, saida = banco.rodar("cartaz", "responder", "--sessao", "nao-existe", entrada="#cartaz nao-existe v1\n")
    assert codigo == 2 and saida["erro"]["codigo"] == "uso_invalido"


def test_ja_vi_de_quem_nao_estava_e_erro_e_nada_e_gravado(banco, dados):
    primeira, sessao_id = _sessao(banco, "iara")
    antes = (dados / "pessoas" / "iara.md").read_text()

    codigo, saida = banco.rodar("cartaz", "responder", "--sessao", sessao_id, entrada=(
        f"#cartaz {sessao_id} v1\n1 {primeira['filmes'][0]['id']} · já vi: iara\n"
        f"2 {primeira['filmes'][1]['id']} · já vi: teo\n"))

    assert codigo == 2, saida
    assert (dados / "pessoas" / "iara.md").read_text() == antes


def test_de_ponta_a_ponta_o_texto_que_o_cartaz_copia_e_o_que_o_responder_le(banco, tmp_path):
    primeira, sessao_id = _sessao(banco, "iara")
    f = primeira["filmes"]
    html = _cartaz(banco, tmp_path, sessao_id)
    texto = _texto(html, _estado(sessao_id, 1, ["bruno", "iara"], acrescentar="algo\n leve", filmes=[
        {"posicao": 1, "id": f[0]["id"], "jaVi": ["iara"], "nota": 9, "estrelas": 3},
        {"posicao": 2, "id": f[1]["id"], "jaVi": ["bruno", "iara"]},
        {"posicao": 3, "id": f[2]["id"], "trocar": True, "comentario": "já cansei · de drama"},
        {"posicao": 4, "id": f[3]["id"], "estrelas": 5},
        {"posicao": 5, "id": f[4]["id"]},
    ]))

    saida = _responder(banco, sessao_id, texto)

    assert {(v["pessoa"], v["filme"], v["nota"]) for v in saida["vistos"]} == {
        ("iara", f[0]["id"], 4.5), ("bruno", f[1]["id"], None), ("iara", f[1]["id"], None)}
    assert [(s["id"], s["motivo"]) for s in saida["saem"]] == [
        (f[0]["id"], "ja_visto"), (f[1]["id"], "ja_visto"), (f[2]["id"], "trocado")]
    assert saida["manter"] == [f[3]["id"], f[4]["id"]]
    assert saida["acrescentar"] == "algo leve"
    assert [c["comentario"] for c in saida["comentarios"]] == ["já cansei · de drama"]
    assert [(e["id"], e["estrelas"]) for e in saida["estrelas"]] == [(f[0]["id"], 3), (f[3]["id"], 5)]
    assert saida["regerar"] is True and saida["avisos"] == []

    refeita = banco.ok("recomendar", "--presentes", "dono", "iara", "--sessao", sessao_id,
                       "--manter", ",".join(saida["manter"]))
    assert [(s["id"], s["motivo"]) for s in refeita["saidas"]] == [(s["id"], s["motivo"]) for s in saida["saem"]]
