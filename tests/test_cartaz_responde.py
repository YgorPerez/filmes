"""Cartaz que responde (#60): Já vi, Trocar, estrelas, comentário e acrescentar.

A página não manda nada a lugar nenhum. Os controles montam um texto e o botão
Copiar pro chat o copia; o Dono cola no chat e `cartaz responder` (#61) o lê. O
gerador do texto é a função `textoDoCartaz(estado)` do `<script>` do cartaz: o
teste tira o script do HTML que a CLI gravou e roda a função no node, com um
estado marcado à mão.
"""

import json
import shutil
import subprocess

import pytest

from test_cartaz import arvore


def _cartaz(banco, tmp_path, sessao_id, *extra):
    destino = tmp_path / "cartaz.html"
    banco.ok("cartaz", "--sessao", sessao_id, "--saida", str(destino), *extra)
    return destino.read_text(encoding="utf-8")


def _texto(html, estado):
    node = shutil.which("node")
    if node is None:
        pytest.skip("node não instalado")
    [script] = arvore(html).todos(tag="script")
    programa = f"{script.texto}\nprocess.stdout.write(textoDoCartaz({json.dumps(estado)}));\n"
    feito = subprocess.run([node, "-e", programa], capture_output=True, text=True, check=True)
    return feito.stdout


def _estado(sessao, versao, presentes, acrescentar="", filmes=()):
    base = {"jaVi": [], "nota": None, "achou": "", "trocar": False, "estrelas": 0, "comentario": ""}
    return {"sessao": sessao, "versao": versao, "presentes": presentes, "acrescentar": acrescentar,
            "filmes": [{**base, **f} for f in filmes]}


def test_texto_copiado_tem_cabecalho_acrescentar_e_uma_linha_por_filme_marcado(banco, tmp_path):
    html = _cartaz(banco, tmp_path, banco.ok("recomendar", "--presentes", "dono", "iara")["sessao"]["id"])
    estado = _estado("2026-11-20-iara", 2, ["bruno", "iara"], acrescentar="  chegou a Ana,\n algo leve ", filmes=[
        {"posicao": 1, "id": "tt9000104", "jaVi": ["bruno"], "nota": 8, "estrelas": 4},
        {"posicao": 2, "id": "tt9000105"},
        {"posicao": 3, "id": "tt9000106", "jaVi": ["bruno", "iara"], "nota": 7},
        {"posicao": 4, "id": "tt9000107", "jaVi": ["iara"], "trocar": True,
         "comentario": "lindo,\n mas · longo"},
        {"posicao": 5, "id": "tt9000108", "estrelas": 2},
    ])

    assert _texto(html, estado) == (
        "#cartaz 2026-11-20-iara v2\n"
        "acrescentar: chegou a Ana, algo leve\n"
        "1 tt9000104 · já vi: bruno=8 · estrelas: 4\n"
        "3 tt9000106 · já vi: todos\n"
        "4 tt9000107 · já vi: iara · trocar · comentário: lindo, mas · longo\n"
        "5 tt9000108 · estrelas: 2\n"
    )


def test_ja_vi_de_algumas_pessoas_lista_os_slugs_sem_nota_e_sozinho_nao_vira_todos(banco, tmp_path):
    html = _cartaz(banco, tmp_path, banco.ok("recomendar", "--presentes", "dono", "iara", "teo")["sessao"]["id"])
    tres = _estado("s", 1, ["bruno", "iara", "teo"], filmes=[
        {"posicao": 2, "id": "tt1", "jaVi": ["teo", "bruno"], "nota": 9}])
    sozinho = _estado("s", 1, ["bruno"], filmes=[{"posicao": 1, "id": "tt1", "jaVi": ["bruno"], "nota": 10}])

    assert _texto(html, tres) == "#cartaz s v1\n2 tt1 · já vi: bruno, teo\n"
    assert _texto(html, sozinho) == "#cartaz s v1\n1 tt1 · já vi: bruno=10\n"


def test_ja_vi_de_uma_pessoa_leva_o_que_ela_achou_numa_linha_so(banco, tmp_path):
    html = _cartaz(banco, tmp_path, banco.ok("recomendar", "--presentes", "dono", "iara")["sessao"]["id"])
    estado = _estado("s", 1, ["bruno", "iara"], filmes=[
        {"posicao": 1, "id": "tt1", "jaVi": ["iara"], "nota": 8, "achou": " final lindo ·\n mas longo "},
        {"posicao": 2, "id": "tt2", "jaVi": ["iara"], "achou": "chato", "comentario": "nem pensar"},
        {"posicao": 3, "id": "tt3", "jaVi": ["bruno", "iara"], "achou": "some"},
    ])

    assert _texto(html, estado) == (
        "#cartaz s v1\n"
        "1 tt1 · já vi: iara=8 · achou: final lindo - mas longo\n"
        "2 tt2 · já vi: iara · achou: chato · comentário: nem pensar\n"
        "3 tt3 · já vi: todos\n"
    )


def test_sem_nada_marcado_o_texto_e_so_o_cabecalho(banco, tmp_path):
    html = _cartaz(banco, tmp_path, banco.ok("recomendar", "--presentes", "dono")["sessao"]["id"])

    assert _texto(html, _estado("s", 3, ["bruno"], acrescentar="   ")) == "#cartaz s v3\n"


def test_cada_card_tem_ja_vi_por_presente_e_todos_nota_trocar_estrelas_e_comentario(banco, tmp_path):
    sessao = banco.ok("recomendar", "--presentes", "dono", "iara")
    html = _cartaz(banco, tmp_path, sessao["sessao"]["id"])
    raiz = arvore(html).um("cartaz")

    assert (raiz.attrs["data-sessao"], raiz.attrs["data-versao"], raiz.attrs["data-presentes"]) == (
        sessao["sessao"]["id"], "1", "bruno iara")
    cards = list(raiz.todos("card"))
    assert [(c.attrs["data-posicao"], c.attrs["data-id"]) for c in cards] == [
        (str(f["posicao"]), f["id"]) for f in sessao["filmes"]]
    responde = cards[0].um("responde")
    assert [(i.attrs["value"], i.pai.texto) for i in responde.todos("javi", tag="input")] == [
        ("bruno", "Você"), ("iara", "Iara")]
    assert responde.um("javi-todos", tag="input").pai.texto == "Todos"
    nota = responde.um("nota", tag="input")
    assert (nota.attrs["type"], nota.attrs["min"], nota.attrs["max"]) == ("number", "1", "10")
    assert responde.um("achou").tag == "textarea"
    assert responde.um("trocar", tag="input").pai.texto == "Trocar"
    assert sorted(i.attrs["value"] for i in responde.um("estrelas").todos(tag="input")) == ["1", "2", "3", "4", "5"]
    assert responde.um("comentario").tag == "textarea"


def test_com_um_presente_nao_ha_chip_todos(banco, tmp_path):
    html = _cartaz(banco, tmp_path, banco.ok("recomendar", "--presentes", "dono")["sessao"]["id"])
    card = next(arvore(html).todos("card"))

    assert [i.pai.texto for i in card.todos("javi", tag="input")] == ["Você"]
    assert list(card.todos("javi-todos")) == []


def test_topo_tem_acrescentar_e_um_botao_so_de_copiar_pro_chat(banco, tmp_path):
    html = _cartaz(banco, tmp_path, banco.ok("recomendar", "--presentes", "dono")["sessao"]["id"])
    raiz = arvore(html).um("cartaz")

    assert raiz.um("acrescentar").tag == "textarea"
    [botao] = raiz.todos(tag="button")
    assert (botao.classes, botao.texto) == (["copiar"], "Copiar pro chat")
    assert raiz.um("saida").tag == "textarea" and "hidden" in raiz.um("saida").attrs


def test_cartaz_com_filmes_numera_os_cards_pela_tela(banco, tmp_path):
    sessao = banco.ok("recomendar", "--presentes", "dono")
    quarto = sessao["filmes"][3]["id"]
    html = _cartaz(banco, tmp_path, sessao["sessao"]["id"], "--filmes", quarto)

    [card] = arvore(html).todos("card")
    assert (card.attrs["data-posicao"], card.attrs["data-id"]) == ("1", quarto)


def test_versao_refeita_traz_o_selo_novo_e_a_linha_do_que_saiu_e_por_que(banco, tmp_path):
    primeira = banco.ok("recomendar", "--presentes", "dono", "iara")
    sessao_id, f = primeira["sessao"]["id"], primeira["filmes"]
    banco.ok("pessoa", "visto", "dono", "--filme", f[1]["id"], "--nota", "8/10")
    refeita = banco.ok("recomendar", "--presentes", "dono", "iara", "--sessao", sessao_id,
                       "--manter", f"{f[0]['id']},{f[2]['id']}")

    raiz = arvore(_cartaz(banco, tmp_path, sessao_id)).um("cartaz")

    assert raiz.attrs["data-versao"] == "2"
    cards = {c.attrs["data-id"]: c for c in raiz.todos("card")}
    assert {i: [s.texto for s in c.todos("novo")] for i, c in cards.items()} == {
        g["id"]: (["novo"] if g["novo"] else []) for g in refeita["filmes"]}
    assert raiz.um("saiu").texto == (
        f"Saiu: 2 {f[1]['titulo']} (você já viu) · 4 {f[3]['titulo']} (trocado) · 5 {f[4]['titulo']} (trocado)")


def test_saida_por_restricao_ou_veto_diz_qual(banco, tmp_path):
    primeira = banco.ok("recomendar", "--presentes", "dono")
    sessao_id, f = primeira["sessao"]["id"], primeira["filmes"]
    banco.ok("pessoa", "vetar", "dono", "não vejo esse", "--filme", f[0]["id"])
    banco.ok("recomendar", "--presentes", "dono", "--sessao", sessao_id, "--duracao-max", "110",
             "--manter", ",".join(g["id"] for g in f))

    saiu = arvore(_cartaz(banco, tmp_path, sessao_id)).um("saiu").texto

    assert f"1 {f[0]['titulo']} (seu Veto: “não vejo esse”)" in saiu
    assert f"2 {f[1]['titulo']} (até 1h50)" in saiu


def test_primeira_versao_nao_tem_selo_novo_nem_linha_do_que_saiu(banco, tmp_path):
    raiz = arvore(_cartaz(banco, tmp_path, banco.ok("recomendar", "--presentes", "dono")["sessao"]["id"])).um("cartaz")

    assert list(raiz.todos("novo")) == [] and list(raiz.todos("saiu")) == []
