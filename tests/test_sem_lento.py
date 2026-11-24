"""Nada lento, Restrição da Sessão (#57, decisão do Dono de 2026-11-22).

`--sem-lento` tira o filme com tag do grupo `lento` de config/vetos_por_tag.toml
(veja o LEIAME da fixture).
"""

from conftest import ler_markdown


def _titulos(saida):
    return [f["titulo"] for f in saida["filmes"]]



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
