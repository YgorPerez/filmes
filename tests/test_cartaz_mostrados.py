"""Cartaz só com os filmes mostrados (#44): `cartaz --sessao ID --filmes tt...,tt...`.

O Claude pede mais Candidatos do que mostra e escolhe quais vão para a tela. O
cartaz traz só esses, na ordem dada, numerados de 1 em diante, e a Sessão guarda
a lista em `mostrados` para o Feedback achar a posição do Filme escolhido nela.
"""

from conftest import ler_markdown as _ler
from test_cartaz import arvore


def _cartaz(banco, tmp_path, sessao_id, *filmes):
    destino = tmp_path / "cartaz.html"
    saida = banco.ok("cartaz", "--sessao", sessao_id, "--filmes", ",".join(filmes), "--saida", str(destino))
    return saida, destino.read_text(encoding="utf-8")


def test_cartaz_com_filmes_traz_so_esses_na_ordem_dada(banco, tmp_path):
    sessao = banco.ok("recomendar", "--presentes", "dono", "iara")
    quarto, segundo = sessao["filmes"][3], sessao["filmes"][1]

    saida, html = _cartaz(banco, tmp_path, sessao["sessao"]["id"], quarto["id"], segundo["id"])

    assert saida["filmes"] == 2
    cards = list(arvore(html).um("cartaz").todos("card"))
    assert [c.um(tag="h2").texto for c in cards] == [f"1{quarto['titulo']}", f"2{segundo['titulo']}"]


def test_a_sessao_guarda_os_mostrados_e_o_feedback_a_posicao_do_escolhido_neles(banco, dados, tmp_path):
    sessao = banco.ok("recomendar", "--presentes", "dono", "iara")
    sessao_id = sessao["sessao"]["id"]
    quarto, segundo = sessao["filmes"][3], sessao["filmes"][1]
    _cartaz(banco, tmp_path, sessao_id, quarto["id"], segundo["id"])

    frente, _ = _ler(dados / "sessoes" / f"{sessao_id}.md")
    assert frente["mostrados"] == [{"posicao": 1, "id": quarto["id"], "titulo": quarto["titulo"]},
                                   {"posicao": 2, "id": segundo["id"], "titulo": segundo["titulo"]}]

    saida = banco.ok("feedback", "--sessao", sessao_id, "--filme", quarto["id"], "--nota", "dono=4")

    assert (saida["escolhido"]["posicao"], saida["escolhido"]["posicao_mostrada"]) == (4, 1)
    frente, _ = _ler(dados / "sessoes" / f"{sessao_id}.md")
    assert (frente["escolhido_na_recomendacao"], frente["escolhido_nos_mostrados"]) == (4, 1)


def test_filme_fora_da_recomendacao_ou_repetido_e_uso_invalido_e_a_sessao_fica_como_estava(banco, dados, tmp_path):
    sessao = banco.ok("recomendar", "--presentes", "dono", "iara", "--quantos", "3")
    sessao_id = sessao["sessao"]["id"]
    primeiro = sessao["filmes"][0]["id"]
    antes = (dados / "sessoes" / f"{sessao_id}.md").read_text(encoding="utf-8")

    for filmes in (f"{primeiro},tt9000701", f"{primeiro},{primeiro}", " , "):
        codigo, saida = banco.rodar("cartaz", "--sessao", sessao_id, "--filmes", filmes,
                                    "--saida", str(tmp_path / "cartaz.html"))
        assert (codigo, saida["erro"]["codigo"]) == (2, "uso_invalido"), filmes
    assert (dados / "sessoes" / f"{sessao_id}.md").read_text(encoding="utf-8") == antes


def test_refazer_leva_os_mostrados_para_a_versao_anterior_e_a_nova_comeca_sem(banco, dados, tmp_path):
    sessao = banco.ok("recomendar", "--presentes", "dono", "iara", "--pedido", "algo bom")
    primeiro = sessao["filmes"][0]
    _cartaz(banco, tmp_path, "2026-11-20-iara", primeiro["id"])

    banco.ok("recomendar", "--presentes", "dono", "iara", "--pedido", "algo curto", "--duracao-max", "100",
             "--sessao", "2026-11-20-iara")

    frente, _ = _ler(dados / "sessoes" / "2026-11-20-iara.md")
    assert "mostrados" not in frente
    [anterior] = frente["versoes"]
    assert anterior["mostrados"] == [{"posicao": 1, "id": primeiro["id"], "titulo": primeiro["titulo"]}]
