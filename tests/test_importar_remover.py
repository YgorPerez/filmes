"""`importar --remover <arquivo>`: tira um import da Pessoa, o arquivo guardado e os Fatos dele.

Usa o RSS e o ZIP da Olga (veja `test_letterboxd_rss.py`) e o export do Teo no Trakt.
"""

import zipfile

import pytest

from conftest import FIXTURE, ler_markdown

GRAVACOES = FIXTURE / "gravacoes"
DO_ZIP = "Letterboxd de Olga"
DO_RSS = "RSS do Letterboxd de Olga"


@pytest.fixture
def olga(banco):
    banco.ok("pessoa", "criar", "Olga")
    banco.env.update(FILMES_TMDB_CHAVE="chave-de-teste", FILMES_GRAVACOES=str(GRAVACOES))
    return banco


def _zip_olga(tmp_path):
    destino = tmp_path / "letterboxd-olga.zip"
    with zipfile.ZipFile(destino, "w") as z:
        for arquivo in sorted((FIXTURE / "letterboxd" / "olga").glob("*.csv")):
            z.write(arquivo, arquivo.name)
    return destino


def _notas(cli):
    return cli.consultar("SELECT filme_id, data, fonte FROM notas WHERE pessoa = 'olga' ORDER BY data, filme_id")


def test_remover_o_rss_deixa_so_os_fatos_do_zip(olga, dados, tmp_path):
    rss = olga.ok("importar", "--pessoa", "olga", "--letterboxd-rss", "olga_farol")["arquivo"]
    zip_ = olga.ok("importar", "--pessoa", "olga", "--letterboxd", str(_zip_olga(tmp_path)))["arquivo"]
    assert ["tt9000101", "2024-05-05", DO_RSS] in _notas(olga)

    saida = olga.ok("importar", "--remover", rss)

    assert saida["pessoa"] == "olga"
    assert saida["removido"]["arquivo"] == rss
    assert saida["removido"]["tipo"] == "letterboxd-rss"
    assert saida["fatos_removidos"]["notas"] >= 1
    assert not (dados / rss).exists()
    assert (dados / zip_).exists()
    assert [i["arquivo"] for i in ler_markdown(dados / "pessoas" / "olga.md")[0]["imports"]] == [zip_]
    assert {fonte for _, _, fonte in _notas(olga)} == {DO_ZIP}
    sql = ("SELECT fato_id FROM notas WHERE pessoa = 'olga' UNION ALL "
           "SELECT fato_id FROM ja_visto WHERE pessoa = 'olga' ORDER BY 1")
    depois = olga.consultar(sql)
    olga.ok("reconstruir")
    assert olga.consultar(sql) == depois


def _export_trakt(tmp_path):
    destino = tmp_path / "trakt.zip"
    with zipfile.ZipFile(destino, "w") as z:
        for nome in ("ratings-movies.json", "watched-history-1.json"):
            z.write(FIXTURE / "trakt" / nome, f"trakt-export/{nome}")
    return destino


def test_remover_o_ultimo_import_do_trakt_tira_todos_os_fatos_dele(banco, dados, tmp_path):
    arquivo = banco.ok("importar", "--pessoa", "teo", "--trakt", str(_export_trakt(tmp_path)))["arquivo"]
    banco.ok("pessoa", "visto", "teo", "--filme", "tt9000601")

    saida = banco.ok("importar", "--pessoa", "teo", "--remover", arquivo.rsplit("/", 1)[1])

    assert saida["fatos_removidos"] == {"notas": 2, "ja_visto": 1, "declarados": 0, "watchlist": 0}
    assert banco.ok("pessoa", "ver", "teo")["imports"] == []
    assert not (dados / arquivo).exists()
    assert banco.consultar("SELECT filme_id, fonte FROM ja_visto WHERE pessoa = 'teo' UNION ALL "
                           "SELECT filme_id, fonte FROM notas WHERE pessoa = 'teo'") == [
        ["tt9000601", "conversa com o Dono"]]


def test_arquivo_que_nao_e_import_da_pessoa_e_erro(banco, dados, tmp_path):
    arquivo = banco.ok("importar", "--pessoa", "teo", "--trakt", str(_export_trakt(tmp_path)))["arquivo"]

    codigo, saida = banco.rodar("importar", "--pessoa", "iara", "--remover", arquivo)

    assert codigo == 1
    assert saida["erro"]["codigo"] == "import_desconhecido"
    assert (dados / arquivo).exists()
    assert len(banco.ok("pessoa", "ver", "teo")["imports"]) == 1


def test_importar_sem_pessoa_so_vale_para_remover(banco, tmp_path):
    codigo, saida = banco.rodar("importar", "--trakt", str(_export_trakt(tmp_path)))

    assert codigo == 2
    assert saida["erro"]["codigo"] == "uso_invalido"
