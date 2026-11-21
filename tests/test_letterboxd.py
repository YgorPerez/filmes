"""Import do Letterboxd: `importar --pessoa <p> --letterboxd <zip>` e a fila manual.

O ZIP da Olga sai de `tests/fixture/letterboxd/olga/` (CSVs no formato do export
real). A P6127 do Wikidata está em `catalogo/slugs_letterboxd.csv` e as respostas
do TMDB em `gravacoes/tmdb/`. O LEIAME da fixture diz o caminho de cada filme.
"""

import shutil
import zipfile
from pathlib import Path

import pytest

from conftest import FIXTURE, ler_markdown

GRAVACOES = FIXTURE / "gravacoes"


@pytest.fixture
def zip_olga(tmp_path):
    return _zipar(FIXTURE / "letterboxd" / "olga", tmp_path / "letterboxd-olga-2026-11-20-utc.zip")


def _zipar(pasta: Path, destino: Path) -> Path:
    with zipfile.ZipFile(destino, "w") as z:
        for arquivo in sorted(pasta.glob("*.csv")):
            z.write(arquivo, arquivo.name)
    return destino


@pytest.fixture
def olga(banco):
    """Banco reconstruído, a Olga criada e o TMDB ligado nas gravações."""
    banco.ok("pessoa", "criar", "Olga")
    banco.env.update(FILMES_TMDB_CHAVE="chave-de-teste", FILMES_GRAVACOES=str(GRAVACOES))
    return banco


def _notas(cli, pessoa="olga"):
    return cli.consultar(
        f"SELECT filme_id, nota, data, fonte FROM notas WHERE pessoa = '{pessoa}' ORDER BY filme_id, data")


def test_notas_resolvidas_pelo_wikidata_viram_notas_da_pessoa(olga, zip_olga):
    saida = olga.ok("importar", "--pessoa", "olga", "--letterboxd", str(zip_olga))

    assert saida["pessoa"] == "olga"
    notas = _notas(olga)
    assert ["tt9000101", 4.5, "2024-01-10", "Letterboxd de Olga"] in notas   # O Farol de Areia, slug do nome
    assert ["tt9000102", 2.0, "2024-02-11", "Letterboxd de Olga"] in notas   # Maré Baixa, slug com -2015
    assert ["tt9000203", 5.0, "2024-09-18", "Letterboxd de Olga"] in notas   # Noite d'Estreia, apóstrofo some


def test_duplicar_zip_e_reconstruir_preserva_os_fatos(olga, zip_olga, dados):
    comando = ("importar", "--pessoa", "olga", "--letterboxd", str(zip_olga))
    primeiro = olga.ok(*comando)
    salvo = dados / primeiro["arquivo"]
    assert salvo.read_bytes() == zip_olga.read_bytes()
    [registro] = ler_markdown(dados / "pessoas" / "olga.md")[0]["imports"]
    assert registro["arquivo"] == primeiro["arquivo"]

    def fatos():
        return olga.consultar("""
            SELECT fato_id, data, fonte FROM notas WHERE pessoa = 'olga'
            UNION ALL SELECT fato_id, data, fonte FROM declarados WHERE pessoa = 'olga'
            UNION ALL SELECT fato_id, data, fonte FROM ja_visto WHERE pessoa = 'olga'
            UNION ALL SELECT fato_id, data, fonte FROM watchlist WHERE pessoa = 'olga'
            ORDER BY fato_id
        """)

    segundo = olga.ok(*comando)
    assert not segundo["arquivo_novo"]
    assert all(n == 0 for n in segundo["fatos_novos"].values())
    antes = fatos()
    assert len(antes) == 14
    salvo_cache = Path(olga.env["FILMES_BANCO"]).with_name("filmes-cache.sqlite")
    salvo_cache.unlink()
    del olga.env["FILMES_TMDB_CHAVE"]
    olga.ok("reconstruir")
    assert fatos() == antes
    assert not salvo_cache.exists()


def test_dono_confirma_pelo_tmdb_e_descarta_na_fila(olga, zip_olga):
    importado = olga.ok("importar", "--pessoa", "Olga", "--letterboxd", str(zip_olga))
    assert importado["resolvidos"] == {"wikidata": 5, "tmdb": 1, "manual": 0}
    assert importado["descartados"] == {"wikidata": 1, "tmdb": 1, "manual": 0}
    assert importado["fila"] == 2
    assert {c["fonte"] for c in importado["creditos"]} == {"TMDB"}
    fila = olga.ok("fila", "ver")["itens"]
    por_nome = {item["nome"]: item for item in fila}
    vento = por_nome["Vento Norte"]
    assert [c["tmdb"] for c in vento["candidatos"]] == [9102, 9103]
    olga.ok("fila", "confirmar", vento["id"], "--filme", vento["candidatos"][0]["link"])
    perdido = por_nome["Filme Perdido"]
    olga.ok("fila", "descartar", perdido["id"], "--razao", "ignorar")
    assert olga.ok("fila", "ver")["itens"] == []
    nota = ["tt9000302", 3.5, "2024-07-16", "Letterboxd de Olga"]
    assert nota in _notas(olga)
    olga.ok("reconstruir")
    assert olga.ok("fila", "ver")["itens"] == []
    assert nota in _notas(olga)


def test_reviews_e_tags_continuam_na_pessoa_depois_de_um_declarado(olga, zip_olga):
    olga.ok("importar", "--pessoa", "olga", "--letterboxd", str(zip_olga))
    olga.ok("pessoa", "declarar", "olga", "Adoro musicais")
    ditos = olga.ok("pessoa", "ver", "olga")["declarados"]
    importados = [d for d in ditos if d["fonte"] == "Letterboxd de Olga"]
    assert {d["texto"] for d in importados} == {
        'Lindo, triste e lento. Vi duas vezes, "de novo".',
        "Não gostei. Arrastado & frio, sem graça.",
        "tag: cinema", "tag: chuva",
    }
    assert {d["data"] for d in importados} == {"2024-01-10", "2024-02-11"}
    assert all(d["especifico"] and d["tipo"] == "declarado" for d in importados)
    assert olga.consultar(
        "SELECT filme_id, data FROM watchlist WHERE pessoa = 'olga'"
    ) == [["tt9000301", "2024-10-01"]]


def test_minisserie_do_wikidata_com_tconst_tambem_e_descartada(olga, zip_olga, tmp_path):
    catalogo = tmp_path / "catalogo"
    shutil.copytree(FIXTURE / "catalogo", catalogo)
    slugs = catalogo / "slugs_letterboxd.csv"
    slugs.write_text(slugs.read_text().replace("Q9023006,,,", "Q9023006,tt9023006,,"))
    olga.env["FILMES_CATALOGO"] = str(catalogo)
    olga.ok("reconstruir")
    saida = olga.ok("importar", "--pessoa", "olga", "--letterboxd", str(zip_olga))
    assert saida["descartados"]["wikidata"] == 1
    assert olga.consultar("SELECT filme_id FROM ja_visto WHERE filme_id = 'tt9023006'") == []


def test_fila_distingue_nomes_que_geram_o_mesmo_slug(banco, tmp_path):
    zip_ = tmp_path / "export.zip"
    with zipfile.ZipFile(zip_, "w") as z:
        z.writestr("ratings.csv", "Date,Name,Year,Letterboxd URI,Rating\n"
                   "2024-01-09,冬,2020,https://boxd.it/a,4\n"
                   "2024-01-09,春,2020,https://boxd.it/b,2\n")
    saida = banco.ok("importar", "--pessoa", "iara", "--letterboxd", str(zip_))
    assert saida["fila"] == 2
    assert len(saida["avisos"]) == 1
    itens = banco.ok("fila", "ver")["itens"]
    inverno = next(i for i in itens if i["nome"] == "冬")
    banco.ok("fila", "confirmar", inverno["id"], "--filme", "https://www.imdb.com/title/tt1112223/?ref_=abc")
    [restante] = banco.ok("fila", "ver")["itens"]
    assert restante["nome"] == "春"
    assert ["tt1112223", 4.0, "2024-01-09", "Letterboxd de Iara"] in _notas(banco, "iara")


def test_candidatos_do_tmdb_expiram_e_podem_ser_consultados_de_novo(olga, zip_olga, dados, tmp_path):
    comando = ("importar", "--pessoa", "olga", "--letterboxd", str(zip_olga))
    olga.ok(*comando)
    assert "Nordwind" not in (dados / "imports" / "letterboxd.md").read_text()
    grava = tmp_path / "gravacoes" / "tmdb"
    grava.mkdir(parents=True)
    (grava / "filme-vento-norte-2020-30b34b9227c5.json").write_text(
        '{"results":[{"id":9102,"title":"Vento Norte","release_date":"2020-02-01"}]}'
    )
    (grava / "externos-9102.json").write_text('{"imdb_id":"tt9000302"}')
    olga.env["FILMES_GRAVACOES"] = str(grava.parent)
    olga.env["FILMES_HOJE"] = "2027-05-20"  # 181 dias
    assert olga.ok(*comando)["fila"] == 2
    olga.env["FILMES_HOJE"] = "2027-05-21"  # 182 dias
    vento = next(i for i in olga.ok("fila", "ver")["itens"] if i["nome"] == "Vento Norte")
    assert vento["candidatos"] == []
    assert olga.ok(*comando)["resolvidos"]["tmdb"] == 2  # Rio Abaixo e Vento Norte


def test_slug_com_id_de_filme_tmdb_resolve_mesmo_sem_p345(olga, zip_olga, tmp_path):
    catalogo = tmp_path / "catalogo"
    shutil.copytree(FIXTURE / "catalogo", catalogo)
    slugs = catalogo / "slugs_letterboxd.csv"
    slugs.write_text(slugs.read_text().replace("tt9000101,9001", ",9101"))
    olga.env["FILMES_CATALOGO"] = str(catalogo)
    olga.ok("reconstruir")
    olga.ok("importar", "--pessoa", "olga", "--letterboxd", str(zip_olga))
    assert ["tt9000303", 4.5, "2024-01-10", "Letterboxd de Olga"] in _notas(olga)


def test_sem_ja_visto_tira_filme_do_watched_sem_nota(olga, zip_olga):
    olga.ok("importar", "--pessoa", "olga", "--letterboxd", str(zip_olga))
    comando = ("recomendar", "--presentes", "olga", "--quantos", "50")
    assert "Cidade de Vidro" in {f["titulo"] for f in olga.ok(*comando)["filmes"]}
    filtrado = olga.ok(*comando, "--sem-ja-visto")
    assert "Cidade de Vidro" not in {f["titulo"] for f in filtrado["filmes"]}
    assert "Jardim Suspenso" in {f["titulo"] for f in filtrado["filmes"]}


def test_csv_invalido_nao_registra_o_zip(olga, tmp_path, dados):
    zip_ = tmp_path / "export.zip"
    with zipfile.ZipFile(zip_, "w") as z:
        z.writestr("export/reviews.csv", 'Date,Name,Year,Review\n2024-01-09,Filme,2020,"aspas abertas\n')
    codigo, saida = olga.rodar("importar", "--pessoa", "olga", "--letterboxd", str(zip_))
    assert codigo == 1
    assert saida["erro"]["codigo"] == "arquivo_invalido"
    assert not list((dados / "imports").rglob("*.zip"))
    assert olga.ok("pessoa", "ver", "olga")["imports"] == []


def test_cache_do_tmdb_ainda_resolve_depois_de_um_item_sem_resposta(olga, tmp_path, dados):
    zip_ = tmp_path / "rio.zip"
    cabecalho = "Date,Name,Year,Letterboxd URI\n"
    rio = "2024-04-13,Rio Abaixo,2014,https://boxd.it/9a4\n"
    with zipfile.ZipFile(zip_, "w") as z:
        z.writestr("watched.csv", cabecalho + rio)
    comando = ("importar", "--pessoa", "olga", "--letterboxd")
    assert olga.ok(*comando, str(zip_))["resolvidos"]["tmdb"] == 1
    (dados / "imports" / "letterboxd.md").unlink()
    olga.ok("reconstruir")
    del olga.env["FILMES_TMDB_CHAVE"]

    novo = tmp_path / "export.zip"
    with zipfile.ZipFile(novo, "w") as z:
        z.writestr("watched.csv", cabecalho + "2024-01-01,Sem Resposta,2020,https://boxd.it/z\n" + rio)
    saida = olga.ok(*comando, str(novo))
    assert len(saida["avisos"]) == 1
    assert saida["fila"] == 1
    assert saida["resolvidos"]["tmdb"] == 1
