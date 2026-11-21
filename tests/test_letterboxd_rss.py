"""Import do RSS público do Letterboxd: `importar --pessoa <p> --letterboxd-rss <usuário>`.

O RSS gravado da Olga está em `gravacoes/letterboxd/rss-olga_farol.xml`. O LEIAME
da fixture diz o que cada entrada exercita.
"""

import zipfile
from pathlib import Path

import pytest

from conftest import FIXTURE, ler_markdown

GRAVACOES = FIXTURE / "gravacoes"
RSS = GRAVACOES / "letterboxd" / "rss-olga_farol.xml"
FONTE = "RSS do Letterboxd de Olga"


@pytest.fixture
def olga(banco):
    banco.ok("pessoa", "criar", "Olga")
    banco.env.update(FILMES_TMDB_CHAVE="chave-de-teste", FILMES_GRAVACOES=str(GRAVACOES))
    return banco


def _importar_rss(cli, usuario="olga_farol"):
    return cli.ok("importar", "--pessoa", "olga", "--letterboxd-rss", usuario)


def _notas(cli):
    return cli.consultar("SELECT filme_id, nota, data, fonte FROM notas WHERE pessoa = 'olga' ORDER BY data")


def _ja_vistos(cli):
    return cli.consultar("SELECT filme_id, data, fonte FROM ja_visto WHERE pessoa = 'olga' ORDER BY data")


def test_rss_vira_diario_e_notas_e_a_copia_fica_no_repo_de_dados(olga, dados):
    saida = _importar_rss(olga)

    assert (dados / saida["arquivo"]).read_bytes() == RSS.read_bytes()
    [registro] = ler_markdown(dados / "pessoas" / "olga.md")[0]["imports"]
    assert registro["tipo"] == "letterboxd-rss"
    assert registro["original"] == "https://letterboxd.com/olga_farol/rss/"
    assert _notas(olga) == [
        ["tt9000101", 4.5, "2024-01-10", FONTE],
        ["tt9000102", 2.0, "2024-02-11", FONTE],
        ["tt9000101", 5.0, "2024-05-05", FONTE],   # a revisão também é Nota
        ["tt9000302", 3.5, "2024-07-16", FONTE],
    ]
    assert len(_ja_vistos(olga)) == 5               # a lista de filmes fica de fora


def test_id_do_tmdb_do_rss_vence_o_slug(olga, dados):
    _importar_rss(olga)

    # Maré Baixa (2014): o slug com -2015 daria tt9000102; o ID 9002 do RSS é o homônimo de 1980.
    assert ["tt9023002", "2024-03-01", FONTE] in _ja_vistos(olga)
    # Vento Norte: o título tem dois candidatos no TMDB, mas o ID 9102 tem tconst.
    assert ["tt9000302", "2024-07-16", FONTE] in _ja_vistos(olga)
    assert olga.ok("fila", "ver")["itens"] == []

    del olga.env["FILMES_TMDB_CHAVE"]
    Path(olga.env["FILMES_BANCO"]).with_name("filmes-cache.sqlite").unlink()
    olga.ok("reconstruir")
    assert ["tt9000302", 3.5, "2024-07-16", FONTE] in _notas(olga)


def test_entrada_sem_data_do_diario_usa_o_dia_da_publicacao_no_fuso_dela(olga):
    _importar_rss(olga)
    # Vento Norte foi publicada em 16/07/2024 às 21h (-03:00), já 17/07 em UTC.
    assert olga.consultar(
        "SELECT data FROM ja_visto WHERE pessoa = 'olga' AND filme_id = 'tt9000302'") == [["2024-07-16"]]


def _zip_olga(tmp_path):
    destino = tmp_path / "letterboxd-olga.zip"
    with zipfile.ZipFile(destino, "w") as z:
        for arquivo in sorted((FIXTURE / "letterboxd" / "olga").glob("*.csv")):
            z.write(arquivo, arquivo.name)
    return destino


def test_reimportar_o_rss_e_importar_o_zip_depois_nao_duplicam_fatos(olga, dados, tmp_path):
    primeiro = _importar_rss(olga)
    assert primeiro["fatos_novos"] == {"notas": 4, "ja_visto": 5, "declarados": 0, "watchlist": 0}
    segundo = _importar_rss(olga)
    assert not segundo["arquivo_novo"]
    assert all(n == 0 for n in segundo["fatos_novos"].values())

    zip_ = olga.ok("importar", "--pessoa", "olga", "--letterboxd", str(_zip_olga(tmp_path)))
    # O ZIP repete Farol (10/01), Maré Baixa (11/02) e Vento Norte (16/07): as Notas e os
    # Já vistos dessas datas já existiam e passam a ter a Fonte do ZIP.
    notas = _notas(olga)
    assert [n for n in notas if n[2] == "2024-01-10"] == [["tt9000101", 4.5, "2024-01-10", "Letterboxd de Olga"]]
    assert [n for n in notas if n[2] == "2024-07-16"] == [["tt9000302", 3.5, "2024-07-16", "Letterboxd de Olga"]]
    assert ["tt9000101", 5.0, "2024-05-05", FONTE] in notas      # a revisão só o RSS tem
    assert zip_["fatos_novos"]["notas"] == 2                      # Rio Abaixo e Noite d'Estreia
    vistos = _ja_vistos(olga)
    assert len(vistos) == len({(f, d) for f, d, _ in vistos})


def test_decisao_do_dono_vale_antes_do_id_do_tmdb(olga, tmp_path):
    olga.ok("importar", "--pessoa", "olga", "--letterboxd", str(_zip_olga(tmp_path)))
    vento = next(i for i in olga.ok("fila", "ver")["itens"] if i["nome"] == "Vento Norte")
    olga.ok("fila", "descartar", vento["id"], "--razao", "não lembro de ter visto")

    _importar_rss(olga)
    assert olga.consultar("SELECT count(*) FROM ja_visto WHERE pessoa = 'olga' AND filme_id = 'tt9000302'") == [[0]]


def test_usuario_sem_rss_nao_registra_nada(olga, dados):
    codigo, saida = olga.rodar("importar", "--pessoa", "olga", "--letterboxd-rss", "ninguem_aqui")
    assert codigo == 1
    assert saida["erro"]["codigo"] == "rss_ausente"
    codigo, saida = olga.rodar("importar", "--pessoa", "olga", "--letterboxd-rss", "../olga")
    assert codigo == 2
    assert olga.ok("pessoa", "ver", "olga")["imports"] == []
    assert not (dados / "imports" / "olga").exists()
