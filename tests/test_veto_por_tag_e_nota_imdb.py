"""Veto a um grupo de tags e bônus da nota do IMDb (#56, decisões do Dono de 2026-11-22).

Na fixture (veja o LEIAME), os filmes `tt90056NN` não têm diretor nem Nota:
- Turma do Recreio: Comédia no IMDb, "teen" 0,9 no Tag Genome;
- Piada Pronta: Comédia, "silly" marcada por 12 usuários no MovieLens;
- Riso Contido: Comédia, "silly" com 9 usuários e 0,69 no Genome, abaixo dos dois mínimos;
- Drama Juvenil: Drama, "teen" 0,95, mas não é comédia;
- Obra-Prima: nota 8,5 no IMDb e só 1.000 votos.

O grupo "comédia boba" de config/vetos_por_tag.toml vale para Comédia, com
relevância 0,7 ou 10 usuários ([vetos_por_tag] em pesos.toml).
"""

from pathlib import Path

from conftest import ler_markdown


def _titulos(saida):
    return [f["titulo"] for f in saida["filmes"]]


def _todos(banco):
    return banco.ok("recomendar", "--presentes", "dono", "--quantos", "100")


def test_veto_ao_grupo_tira_a_comedia_com_a_tag_acima_do_minimo(banco):
    antes = set(_titulos(_todos(banco)))
    assert {"Turma do Recreio", "Piada Pronta", "Riso Contido", "Drama Juvenil"} <= antes

    banco.ok("pessoa", "vetar", "bruno", "não quer comédia boba", "--grupo", "comedia_boba")
    saida = _todos(banco)

    titulos = set(_titulos(saida))
    assert "Turma do Recreio" not in titulos   # Genome 0,9
    assert "Piada Pronta" not in titulos       # 12 usuários
    assert "Riso Contido" in titulos           # abaixo dos dois mínimos
    assert "Drama Juvenil" in titulos          # não é comédia
    assert saida["vetos"] == [{
        "pessoa": "bruno", "texto": "não quer comédia boba", "alvo": "comedia_boba", "rotulo": "comédia boba",
        "filmes_tirados": 2, "por_caminho": {"tags": 2},
    }]


def test_veto_ao_grupo_fica_no_arquivo_e_sai_com_remover(banco):
    saida = banco.ok("pessoa", "vetar", "bruno", "não quer comédia boba", "--grupo", "comedia_boba")
    assert (saida["veto"]["alvo"], saida["veto"]["rotulo"]) == ("comedia_boba", "comédia boba")
    frente, _ = ler_markdown(Path(banco.env["FILMES_DADOS"]) / "pessoas" / "bruno.md")
    assert frente["vetos"][0]["alvo"] == "comedia_boba"

    banco.ok("pessoa", "remover", "bruno", "--veto", "comedia_boba")

    assert "Turma do Recreio" in _titulos(_todos(banco))


def test_grupo_fora_do_vocabulario_e_recusado(banco):
    codigo, saida = banco.rodar("pessoa", "vetar", "bruno", "nunca vê besteirol", "--grupo", "besteirol")

    assert codigo != 0
    assert saida["erro"]["codigo"] == "alvo_desconhecido"


def test_nota_do_imdb_da_bonus_ao_filme_e_a_linha_do_filme(banco):
    saida = _todos(banco)
    [obra] = [f for f in saida["filmes"] if f["titulo"] == "Obra-Prima"]

    # 0,3 × (8,5 − 7) / 3
    assert [(l["texto"], l["fonte"], l["forca"], l["tipo"], l["contribuicao"]) for l in obra["linhas_do_filme"]
            if l["texto"].endswith(" no IMDb")] == [("nota 8,5 no IMDb", "IMDb", "forte", "metadado", 0.15)]


def test_nota_do_imdb_nao_conta_como_fato_mas_puxa_a_ordem_entre_os_palpites(banco):
    saida = _todos(banco)
    so_palpites = [f for f in saida["filmes"] if f["so_palpites"]]
    titulos = [f["titulo"] for f in so_palpites]

    # Obra-Prima tem só 1.000 votos, mas a nota o põe à frente dos palpites mais votados.
    assert "Obra-Prima" in titulos
    assert titulos[0] == "Obra-Prima"


def test_filme_sem_nota_ou_no_limite_nao_ganha_linha(banco):
    saida = _todos(banco)
    [drama] = [f for f in saida["filmes"] if f["titulo"] == "Drama Juvenil"]

    assert not [l for l in drama["linhas_do_filme"] if l["texto"].endswith(" no IMDb")]
