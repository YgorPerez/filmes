"""Refazer a Sessão sem o sem repetido (#66, decisão do Dono de 2026-11-24).

Ao refazer com `--sessao`, um filme que a Sessão já mostrou pode voltar. Ficam
de fora da Sessão, até o fim dela, só o que o Dono trocou em alguma versão e o
que algum Presente marcou Já vi nela. Outras Sessões não contam.
"""

from conftest import ler_markdown


def _ids(saida):
    return [f["id"] for f in saida["filmes"]]


def _refazer(banco, sessao_id, *args):
    return banco.ok("recomendar", "--presentes", "dono", "iara", "--quantos", "100", "--sessao", sessao_id, *args)


def _responder(banco, sessao_id, texto):
    return banco.ok("cartaz", "responder", "--sessao", sessao_id, entrada=texto)


def _sessao(banco):
    saida = banco.ok("recomendar", "--presentes", "dono", "iara", "--quantos", "100")
    return saida, saida["sessao"]["id"]


def test_refazer_traz_de_volta_o_que_foi_mostrado_e_nao_trocado_nem_visto(banco):
    primeira, sessao_id = _sessao(banco)

    segunda = _refazer(banco, sessao_id)

    assert _ids(segunda) == _ids(primeira)
    assert segunda["restricoes"]["fora_da_sessao"] == {"trocados": 0, "ja_vistos": 0, "tirados": 0}
    assert "sem_repetido" not in segunda["restricoes"]


def test_trocado_no_cartaz_nao_volta_em_nenhuma_versao_da_sessao(banco, dados):
    primeira, sessao_id = _sessao(banco)
    trocado = primeira["filmes"][3]

    _responder(banco, sessao_id, f"#cartaz {sessao_id} v1\n4 {trocado['id']} · trocar\n")
    segunda = _refazer(banco, sessao_id)
    terceira = _refazer(banco, sessao_id)

    assert trocado["id"] not in _ids(segunda) and trocado["id"] not in _ids(terceira)
    assert terceira["restricoes"]["fora_da_sessao"] == {"trocados": 1, "ja_vistos": 0, "tirados": 1}
    frente, _ = ler_markdown(dados / "sessoes" / f"{sessao_id}.md")
    assert frente["versoes"][0]["trocados"] == [trocado["id"]]


def test_o_que_nao_ficou_num_refazer_com_manter_e_trocado(banco):
    primeira, sessao_id = _sessao(banco)
    f = _ids(primeira)

    _refazer(banco, sessao_id, "--quantos", "2", "--manter", f"{f[0]},{f[1]}")
    terceira = _refazer(banco, sessao_id)

    assert not {f[2], f[3], f[4]} & set(_ids(terceira))
    assert {f[0], f[1]} <= set(_ids(terceira))


def test_ja_vi_de_um_presente_na_sessao_nao_volta_sem_pedir_sem_ja_visto(banco):
    primeira, sessao_id = _sessao(banco)
    visto = primeira["filmes"][0]

    _responder(banco, sessao_id, f"#cartaz {sessao_id} v1\n1 {visto['id']} · já vi: iara\n")
    segunda = _refazer(banco, sessao_id)

    assert visto["id"] not in _ids(segunda)
    assert segunda["restricoes"]["fora_da_sessao"]["ja_vistos"] == 1
    assert "sem_ja_visto" not in segunda["restricoes"]


def test_outra_sessao_nao_conta(banco):
    primeira, sessao_id = _sessao(banco)
    trocado = primeira["filmes"][0]["id"]
    _responder(banco, sessao_id, f"#cartaz {sessao_id} v1\n1 {trocado} · trocar\n")

    outra = banco.ok("recomendar", "--presentes", "dono", "iara", "--quantos", "100")

    assert trocado in _ids(outra)
    assert "fora_da_sessao" not in outra["restricoes"]


def test_o_que_nao_ficou_num_manter_cujos_mantidos_sairam_todos_continua_trocado(banco):
    # O único mantido sai pela duração: a versão fica sem mantidos, mas o Dono escolheu.
    primeira = banco.ok("recomendar", "--presentes", "dono")
    sessao_id, f = primeira["sessao"]["id"], _ids(primeira)
    longo = max(primeira["filmes"], key=lambda filme: filme["duracao_min"])

    segunda = banco.ok("recomendar", "--presentes", "dono", "--sessao", sessao_id, "--manter", longo["id"],
                       "--duracao-max", str(longo["duracao_min"] - 1))
    terceira = banco.ok("recomendar", "--presentes", "dono", "--sessao", sessao_id)

    assert segunda["mantidos"] == []
    assert not (set(f) - {longo["id"]}) & set(_ids(terceira))


def test_trocar_grava_os_filmes_como_trocados_antes_de_refazer(banco, dados):
    primeira, sessao_id = _sessao(banco)
    tela = _ids(primeira)[:5]

    segunda = _refazer(banco, sessao_id, "--trocar", *tela)
    terceira = _refazer(banco, sessao_id)

    assert not set(tela) & set(_ids(segunda))
    assert not set(tela) & set(_ids(terceira))
    assert {s["motivo"] for s in segunda["saidas"] if s["id"] in tela} == {"trocado"}
    frente, _ = ler_markdown(dados / "sessoes" / f"{sessao_id}.md")
    assert frente["versoes"][0]["trocados"] == sorted(tela)


def test_trocar_aceita_virgulas_e_so_vale_com_sessao(banco):
    primeira, sessao_id = _sessao(banco)
    tela = _ids(primeira)[:2]

    segunda = _refazer(banco, sessao_id, "--trocar", ",".join(tela))
    codigo, erro = banco.rodar("recomendar", "--presentes", "dono", "--trocar", tela[0])

    assert not set(tela) & set(_ids(segunda))
    assert codigo == 2 and "--trocar" in erro["erro"]["mensagem"]


def test_o_que_volta_da_tela_anterior_nao_leva_selo_novo(banco):
    primeira, sessao_id = _sessao(banco)

    segunda = _refazer(banco, sessao_id)

    assert not any(f["novo"] for f in segunda["filmes"])


def test_ja_vi_de_quem_chegou_neste_refazer_tira_o_filme(banco):
    primeira = banco.ok("recomendar", "--presentes", "dono")
    sessao_id, visto = primeira["sessao"]["id"], primeira["filmes"][0]["id"]
    banco.ok("pessoa", "visto", "iara", "--filme", visto)

    segunda = banco.ok("recomendar", "--presentes", "dono", "iara", "--quantos", "100", "--sessao", sessao_id)

    assert visto not in _ids(segunda)
    assert segunda["restricoes"]["fora_da_sessao"]["ja_vistos"] == 1
