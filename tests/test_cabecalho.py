"""Cabeçalho de cada filme da Recomendação: link do IMDb, gêneros e capa.

São campos de apresentação, fora das Evidências: não são Motivo nem têm Força.
Na fixture, o top 5 do Bruno é As Horas Lentas, Sal e Ferrugem, Noite de
Estreia, Cidade de Vidro e A Volta do Mar.
"""

from conftest import FIXTURE

GRAVACOES = FIXTURE / "gravacoes"


def _recomendar(banco, *args):
    return banco.ok("recomendar", "--presentes", "dono", *args)


def _filme(saida, titulo):
    [filme] = [f for f in saida["filmes"] if f["titulo"] == titulo]
    return filme


def test_cada_filme_traz_o_link_do_imdb(banco):
    filme = _filme(_recomendar(banco), "As Horas Lentas")

    assert filme["imdb"] == "https://www.imdb.com/title/tt9000104/"


def test_generos_do_imdb_saem_em_portugues_na_ordem_do_imdb(banco):
    saida = _recomendar(banco)

    assert _filme(saida, "As Horas Lentas")["generos"] == ["Drama", "Mistério"]
    assert _filme(saida, "Sal e Ferrugem")["generos"] == ["Aventura", "Ficção científica", "Suspense"]


def test_filme_sem_genero_no_imdb_sai_com_lista_vazia(banco):
    assert _filme(_recomendar(banco), "Noite de Estreia")["generos"] == []


def _com_tmdb(banco):
    banco.env.update(FILMES_TMDB_CHAVE="x", FILMES_GRAVACOES=str(GRAVACOES))
    return banco


def test_capa_e_o_poster_do_tmdb_em_w92(banco):
    filme = _filme(_recomendar(_com_tmdb(banco)), "As Horas Lentas")

    assert filme["capa"] == "https://image.tmdb.org/t/p/w92/hOrAsLeNtAs9104.jpg"


def test_filme_sem_poster_ou_que_o_tmdb_nao_acha_sai_sem_capa_e_sem_aviso(banco):
    saida = _recomendar(_com_tmdb(banco))

    assert _filme(saida, "Sal e Ferrugem")["capa"] is None      # o TMDB acha, mas sem pôster
    assert _filme(saida, "Cidade de Vidro")["capa"] is None     # o TMDB não acha
    assert saida["avisos"] == []


def test_sem_chave_do_tmdb_a_capa_sai_nula_com_um_aviso_e_o_resto_nao_muda(banco):
    banco.env["FILMES_GRAVACOES"] = str(GRAVACOES)
    sem_chave = _recomendar(banco)
    com_chave = _recomendar(_com_tmdb(banco))

    assert all(f["capa"] is None for f in sem_chave["filmes"])
    [aviso] = sem_chave["avisos"]
    assert "TMDB" in aviso and "FILMES_TMDB_CHAVE" in aviso and "sem capa" in aviso
    sem_capas = [{**f, "capa": None} for f in com_chave["filmes"]]
    assert [{**f, "capa": None} for f in sem_chave["filmes"]] == sem_capas
    assert sem_chave["atribuicoes"] == [a for a in com_chave["atribuicoes"] if a["fonte"] != "TMDB"]


def test_com_capa_a_atribuicao_do_tmdb_entra_na_saida(banco):
    _com_tmdb(banco)
    com_capa = _recomendar(banco)
    sem_capa = _recomendar(banco, "--duracao-max", "100")   # nenhum dos que cabem tem pôster gravado

    assert all(f["capa"] is None for f in sem_capa["filmes"])
    assert [a["fonte"] for a in sem_capa["atribuicoes"]] == ["IMDb"]
    assert {
        "fonte": "TMDB",
        "texto": "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    } in com_capa["atribuicoes"]


def test_capa_fica_seis_meses_em_cache_e_sobrevive_a_reconstrucao(banco, tmp_path):
    _recomendar(_com_tmdb(banco))
    banco.env.pop("FILMES_TMDB_CHAVE")
    banco.env["FILMES_GRAVACOES"] = str(tmp_path / "sem-gravacoes")
    banco.ok("reconstruir")

    banco.env["FILMES_HOJE"] = "2027-05-20"
    assert _filme(_recomendar(banco), "As Horas Lentas")["capa"] == "https://image.tmdb.org/t/p/w92/hOrAsLeNtAs9104.jpg"
    banco.env["FILMES_HOJE"] = "2027-05-21"   # 182 dias depois
    assert _filme(_recomendar(banco), "As Horas Lentas")["capa"] is None
