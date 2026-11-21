"""`fila reprocessar`: tenta de novo o TMDB para os itens da fila que ele não respondeu.

Usa o ZIP da Olga de `test_letterboxd.py`. Rio Abaixo só resolve pelo TMDB
(`gravacoes/tmdb/`); o LEIAME da fixture diz o caminho de cada filme.
"""

import json
import shutil
import zipfile

import pytest

from conftest import FIXTURE
from test_letterboxd import GRAVACOES, _notas, _zipar

RIO = "Rio Abaixo"


@pytest.fixture
def zip_olga(tmp_path):
    return _zipar(FIXTURE / "letterboxd" / "olga", tmp_path / "letterboxd-olga.zip")


@pytest.fixture
def olga(banco):
    banco.ok("pessoa", "criar", "Olga")
    banco.env.update(FILMES_GRAVACOES=str(GRAVACOES))
    return banco


def _na_fila(cli):
    return {i["nome"] for i in cli.ok("fila", "ver")["itens"]}


def test_reprocessar_resolve_o_que_o_tmdb_nao_consultou_no_import(olga, zip_olga):
    olga.ok("importar", "--pessoa", "olga", "--letterboxd", str(zip_olga))   # sem chave do TMDB
    assert RIO in _na_fila(olga)

    olga.env["FILMES_TMDB_CHAVE"] = "chave-de-teste"
    saida = olga.ok("fila", "reprocessar")

    assert RIO in {i["nome"] for i in saida["resolvidos"]}
    assert RIO not in _na_fila(olga)
    assert "tt9000303" in {n[0] for n in _notas(olga)}
    assert saida["atribuicoes"][0]["fonte"] == "TMDB"


def test_reprocessar_de_uma_pessoa_nao_consulta_a_fila_das_outras(olga, zip_olga, tmp_path):
    olga.ok("pessoa", "criar", "Bia")
    zip_bia = tmp_path / "bia.zip"
    with zipfile.ZipFile(zip_bia, "w") as z:
        z.writestr("watched.csv", "Date,Name,Year,Letterboxd URI\n2024-06-15,Gambito,2020,https://boxd.it/9a6\n")
    olga.ok("importar", "--pessoa", "olga", "--letterboxd", str(zip_olga))
    olga.ok("importar", "--pessoa", "bia", "--letterboxd", str(zip_bia))

    olga.env["FILMES_TMDB_CHAVE"] = "chave-de-teste"
    saida = olga.ok("fila", "reprocessar", "--pessoa", "bia")

    assert saida["pessoas"] == ["bia"]
    assert [i["nome"] for i in saida["descartados"]] == ["Gambito"]   # minissérie pelo TMDB
    assert RIO in _na_fila(olga)


def _gravacoes_com_falha(tmp_path, falha):
    """Cópia das gravações em que a busca de Rio Abaixo em 2014 falha como `falha` diz."""
    copia = tmp_path / "gravacoes"
    shutil.copytree(GRAVACOES, copia)
    (copia / "tmdb" / "filme-rio-abaixo-2014-cb01025b85e0.falha.json").write_text(json.dumps(falha))
    return copia


def test_falha_passageira_do_tmdb_no_meio_do_import_e_tentada_de_novo(olga, zip_olga, tmp_path):
    olga.env.update(FILMES_TMDB_CHAVE="chave-de-teste",
                    FILMES_GRAVACOES=str(_gravacoes_com_falha(tmp_path, {"motivo": "Connection reset by peer", "vezes": 2})))

    saida = olga.ok("importar", "--pessoa", "olga", "--letterboxd", str(zip_olga))

    assert saida["avisos"] == []
    assert RIO not in _na_fila(olga)


def test_tmdb_fora_no_meio_do_import_deixa_a_fila_para_reprocessar(olga, zip_olga, tmp_path):
    gravacoes = _gravacoes_com_falha(tmp_path, {"motivo": "Connection reset by peer"})
    olga.env.update(FILMES_TMDB_CHAVE="chave-de-teste", FILMES_GRAVACOES=str(gravacoes))

    saida = olga.ok("importar", "--pessoa", "olga", "--letterboxd", str(zip_olga))

    [aviso] = saida["avisos"]
    assert "Connection reset by peer" in aviso and "fila reprocessar" in aviso
    assert RIO in _na_fila(olga)

    (gravacoes / "tmdb" / "filme-rio-abaixo-2014-cb01025b85e0.falha.json").unlink()
    assert RIO in {i["nome"] for i in olga.ok("fila", "reprocessar", "--pessoa", "olga")["resolvidos"]}
