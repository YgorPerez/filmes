"""O parecido fica na Sessão até o Dono pedir outra coisa (#68, spec #70).

`recomendar --sessao ID --parecido ...` grava as referências na versão, e os
refazeres seguintes da mesma Sessão continuam com o filtro sem repetir
`--parecido`. Um `--parecido` com outras referências substitui as anteriores;
`--sem-parecido` tira o filtro. Pedido de parecido novo troca a lista inteira:
ignora `--manter`, com aviso, e quem sai sem ser Já vi nem trocado pelo Dono sai
pela Restrição `parecido`.
"""

from conftest import sem_o_da_capa

ESCREVER_CARTAS = "tt9006701"
ESTRADA_AFORA = "tt9006702"
PE_NA_ESTRADA = "tt9006713"
MESA_DE_DOMINGO = "tt9006711"


def _ids(saida):
    return [f["id"] for f in saida["filmes"]]


def _abrir(banco, *args):
    saida = banco.ok("recomendar", "--presentes", "dono", "--quantos", "10", *args)
    return saida, saida["sessao"]["id"]


def _refazer(banco, sessao_id, *args):
    return banco.ok("recomendar", "--presentes", "dono", "--quantos", "10", "--sessao", sessao_id, *args)


def _topo(banco, sessao_id, tmp_path):
    destino = tmp_path / "cartaz.html"
    banco.ok("cartaz", "--sessao", sessao_id, "--saida", str(destino))
    html = destino.read_text(encoding="utf-8")
    return html[html.index('<div class="pedido">'):html.index('<div class="legenda">')]


def test_refazer_sem_repetir_parecido_continua_com_o_filtro(banco):
    primeira, sessao_id = _abrir(banco, "--parecido", ESCREVER_CARTAS)

    segunda = _refazer(banco, sessao_id)
    terceira = _refazer(banco, sessao_id, "--manter", primeira["filmes"][0]["id"])

    assert _ids(segunda) == _ids(primeira)
    assert segunda["restricoes"]["parecido"]["filmes"] == [ESCREVER_CARTAS]
    assert terceira["restricoes"]["parecido"]["filmes"] == [ESCREVER_CARTAS]
    assert set(_ids(terceira)) <= set(_ids(primeira))
    assert terceira["mantidos"] == [primeira["filmes"][0]["id"]]


def test_sem_parecido_tira_o_filtro_e_ele_nao_volta(banco):
    primeira, sessao_id = _abrir(banco, "--parecido", ESTRADA_AFORA)

    segunda = _refazer(banco, sessao_id, "--sem-parecido")
    terceira = _refazer(banco, sessao_id)

    assert _ids(primeira) == [PE_NA_ESTRADA]
    assert "parecido" not in segunda["restricoes"] and "parecido" not in terceira["restricoes"]
    assert len(_ids(segunda)) == 10


def test_parecido_com_outra_referencia_substitui_a_anterior(banco):
    _, sessao_id = _abrir(banco, "--parecido", ESCREVER_CARTAS)

    segunda = _refazer(banco, sessao_id, "--parecido", ESTRADA_AFORA)
    terceira = _refazer(banco, sessao_id)

    assert segunda["restricoes"]["parecido"]["filmes"] == [ESTRADA_AFORA]
    assert _ids(segunda) == _ids(terceira) == [PE_NA_ESTRADA]


def test_parecido_novo_troca_a_lista_inteira_e_ignora_manter_com_aviso(banco):
    primeira, sessao_id = _abrir(banco)
    tela = _ids(primeira)

    segunda = _refazer(banco, sessao_id, "--parecido", ESTRADA_AFORA, "--manter", tela[0])

    assert _ids(segunda) == [PE_NA_ESTRADA]
    assert segunda["mantidos"] == []
    assert all(f["novo"] for f in segunda["filmes"])
    assert any("--manter" in a and "parecido" in a for a in sem_o_da_capa(segunda["avisos"]))
    assert [s["id"] for s in segunda["saidas"]] == [f for f in tela if f != PE_NA_ESTRADA]
    assert {(s["motivo"], s["restricao"]) for s in segunda["saidas"]} == {("restricao", "parecido")}
    assert segunda["saidas"][0]["rotulo"] == "parecidos com Estrada Afora"


def test_parecido_novo_nao_conta_como_trocado(banco):
    primeira, sessao_id = _abrir(banco)

    _refazer(banco, sessao_id, "--parecido", ESTRADA_AFORA)
    terceira = _refazer(banco, sessao_id, "--sem-parecido")

    assert _ids(terceira) == _ids(primeira)


def test_repetir_o_mesmo_parecido_nao_e_pedido_novo(banco):
    primeira, sessao_id = _abrir(banco, "--parecido", ESCREVER_CARTAS)
    fica = primeira["filmes"][1]["id"]

    segunda = _refazer(banco, sessao_id, "--parecido", ESCREVER_CARTAS, "--manter", fica)

    assert segunda["mantidos"] == [fica]
    assert not any("--manter" in a for a in sem_o_da_capa(segunda["avisos"]))


def test_topo_do_cartaz_diz_as_referencias_enquanto_o_filtro_vale(banco, tmp_path):
    _, sessao_id = _abrir(banco, "--parecido", ESCREVER_CARTAS, ESTRADA_AFORA)

    _refazer(banco, sessao_id)
    com_filtro = _topo(banco, sessao_id, tmp_path)
    _refazer(banco, sessao_id, "--sem-parecido")
    sem_filtro = _topo(banco, sessao_id, tmp_path)

    assert "parecidos com Escrever Cartas e Estrada Afora" in com_filtro
    assert "parecido" not in sem_filtro


def test_sem_parecido_fora_de_sessao_e_uso_invalido(banco):
    codigo, saida = banco.rodar("recomendar", "--presentes", "dono", "--sem-parecido")

    assert codigo == 2
    assert "--sem-parecido" in saida["erro"]["mensagem"]


def test_parecido_e_sem_parecido_juntos_e_uso_invalido(banco):
    _, sessao_id = _abrir(banco, "--parecido", ESCREVER_CARTAS)

    codigo, _ = banco.rodar("recomendar", "--presentes", "dono", "--sessao", sessao_id,
                            "--parecido", ESTRADA_AFORA, "--sem-parecido")

    assert codigo == 2


def test_parecido_novo_mantem_trocado_o_que_o_dono_trocou_no_cartaz(banco):
    primeira, sessao_id = _abrir(banco)
    trocado = primeira["filmes"][1]["id"]
    banco.ok("cartaz", "responder", "--sessao", sessao_id, entrada=f"#cartaz {sessao_id} v1\n2 {trocado} · trocar\n")

    segunda = _refazer(banco, sessao_id, "--parecido", ESTRADA_AFORA)

    [saiu] = [s for s in segunda["saidas"] if s["id"] == trocado]
    assert saiu["motivo"] == "trocado"


def test_restricao_gravada_que_nao_existe_mais_nao_aparece_no_topo(banco, dados, tmp_path):
    _, sessao_id = _abrir(banco)
    caminho = dados / "sessoes" / f"{sessao_id}.md"
    texto = caminho.read_text(encoding="utf-8")
    caminho.write_text(texto.replace("restricoes: []", "restricoes:\n  - {nome: sem_repetido}"), encoding="utf-8")
    assert "sem_repetido" in caminho.read_text(encoding="utf-8")

    topo = _topo(banco, sessao_id, tmp_path)

    assert "sem_repetido" not in topo
