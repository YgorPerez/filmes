"""Import do Letterboxd: `importar --pessoa <p> --letterboxd <zip>` e a fila manual.

O ZIP da Olga sai de `tests/fixture/letterboxd/olga/` (CSVs no formato do export
real). A P6127 do Wikidata está em `catalogo/slugs_letterboxd.csv` e as respostas
do TMDB em `gravacoes/tmdb/`. O LEIAME da fixture diz o caminho de cada filme.
"""

import zipfile
from pathlib import Path

import pytest
import yaml

from conftest import FIXTURE

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
