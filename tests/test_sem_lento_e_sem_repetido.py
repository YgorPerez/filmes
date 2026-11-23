"""Nada lento e sem repetido, Restrições da Sessão (#57, decisões do Dono de 2026-11-22).

`--sem-lento` tira o filme com tag do grupo `lento` de config/vetos_por_tag.toml
(veja o LEIAME da fixture). Ao refazer com `--sessao`, sai sozinho o que a Sessão
já mostrou: os `mostrados` do cartaz, ou a Recomendação inteira da versão sem eles.
"""

from conftest import ler_markdown


def _titulos(saida):
    return [f["titulo"] for f in saida["filmes"]]


def _ids(saida):
    return [f["id"] for f in saida["filmes"]]


def test_sem_lento_tira_o_filme_com_tag_de_ritmo_de_qualquer_genero(banco):
    antes = set(_titulos(banco.ok("recomendar", "--presentes", "dono", "--quantos", "100")))
    assert {"Piada Pronta", "Riso Contido", "Drama Juvenil"} <= antes

    saida = banco.ok("recomendar", "--presentes", "dono", "--quantos", "100", "--sem-lento")

    titulos = set(_titulos(saida))
    assert "Piada Pronta" not in titulos    # boring, 10 usuários
    assert "Drama Juvenil" not in titulos   # boring 0,8 no Genome, e é drama
    assert "Riso Contido" in titulos        # boring com 9 usuários, abaixo do mínimo
    assert "Silêncio no Lago" not in titulos  # slow 0,9 no Genome, da fixture do #3
    assert saida["restricoes"]["sem_lento"] == {"tirados": 3}


def test_sem_lento_fica_no_pedido_da_sessao(banco, dados):
    saida = banco.ok("recomendar", "--presentes", "dono", "--sem-lento")

    frente, _ = ler_markdown(dados / "sessoes" / f"{saida['sessao']['id']}.md")
    assert frente["contexto"]["restricoes"] == [{"nome": "sem_lento"}]


def test_lento_tambem_e_grupo_para_veto(banco):
    banco.ok("pessoa", "vetar", "bruno", "não aguenta filme lento", "--grupo", "lento")

    assert "Drama Juvenil" not in _titulos(banco.ok("recomendar", "--presentes", "dono", "--quantos", "100"))


def test_refazer_na_sessao_tira_a_recomendacao_inteira_das_versoes_anteriores(banco):
    # Sem `mostrados`, o cartaz mostra a Recomendação inteira: é o que o Dono viu,
    # o mesmo que `--manter` e `cartaz responder` aceitam.
    primeira = banco.ok("recomendar", "--presentes", "dono", "--quantos", "8")
    sessao_id = primeira["sessao"]["id"]

    segunda = banco.ok("recomendar", "--presentes", "dono", "--quantos", "8", "--sessao", sessao_id)

    assert not set(_ids(segunda)) & set(_ids(primeira))
    assert segunda["restricoes"]["sem_repetido"] == {"tirados": 8}

    terceira = banco.ok("recomendar", "--presentes", "dono", "--quantos", "8", "--sessao", sessao_id)
    assert not set(_ids(terceira)) & (set(_ids(primeira)) | set(_ids(segunda)))


def test_com_cartaz_conta_o_que_foi_mostrado_e_nao_a_recomendacao_inteira(banco, tmp_path):
    primeira = banco.ok("recomendar", "--presentes", "dono", "--quantos", "10")
    sessao_id = primeira["sessao"]["id"]
    oitavo, nono = _ids(primeira)[7], _ids(primeira)[8]
    banco.ok("cartaz", "--sessao", sessao_id, "--filmes", f"{oitavo},{nono}", "--saida", str(tmp_path / "c.html"))

    segunda = banco.ok("recomendar", "--presentes", "dono", "--quantos", "10", "--sessao", sessao_id)

    assert oitavo not in _ids(segunda) and nono not in _ids(segunda)
    assert _ids(primeira)[0] in _ids(segunda)


def test_sessao_nova_nao_tira_o_que_outra_sessao_mostrou(banco):
    primeira = banco.ok("recomendar", "--presentes", "dono", "--quantos", "5")

    outra = banco.ok("recomendar", "--presentes", "dono", "--quantos", "5")

    assert _ids(outra) == _ids(primeira)
    assert "sem_repetido" not in outra["restricoes"]
