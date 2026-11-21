"""`exportar --formato imdb`: as Notas de uma Pessoa no CSV de avaliações do IMDb,
o único formato que o import do MovieLens aceita.

O Teo não tem Nota na fixture; o teste dá a ele Notas pela conversa e por um
import do Letterboxd com um filme fora do Catálogo.
"""

import csv
import zipfile

CABECALHO = ["Const", "Your Rating", "Date Rated", "Title", "Original Title", "URL", "Title Type",
             "IMDb Rating", "Runtime (mins)", "Year", "Genres", "Num Votes", "Release Date", "Directors"]


def _ler(caminho):
    with open(caminho, newline="", encoding="utf-8") as arquivo:
        linhas = list(csv.reader(arquivo))
    return linhas[0], {linha[0]: dict(zip(linhas[0], linha)) for linha in linhas[1:]}


def test_notas_vigentes_saem_no_csv_do_imdb_com_a_nota_dobrada(banco, tmp_path):
    banco.ok("pessoa", "visto", "teo", "--filme", "tt9000602", "--nota", "3", "--data", "2025-01-05")
    banco.ok("pessoa", "visto", "teo", "--filme", "tt9000602", "--nota", "4,5", "--data", "2026-02-01")
    banco.ok("pessoa", "visto", "teo", "--filme", "tt9000601", "--nota", "0,5", "--data", "2024-07-30")
    banco.ok("pessoa", "visto", "teo", "--filme", "tt9000101", "--data", "2024-07-30")  # sem Nota: fica de fora
    zip_ = tmp_path / "export.zip"
    with zipfile.ZipFile(zip_, "w") as z:
        z.writestr("ratings.csv", "Date,Name,Year,Letterboxd URI,Rating\n2024-01-09,冬,2020,https://boxd.it/a,2\n")
    banco.ok("importar", "--pessoa", "teo", "--letterboxd", str(zip_))
    [item] = banco.ok("fila", "ver")["itens"]
    banco.ok("fila", "confirmar", item["id"], "--filme", "tt1112223")

    saida_csv = tmp_path / "teo.csv"
    saida = banco.ok("exportar", "--pessoa", "Teo", "--formato", "imdb", "--saida", str(saida_csv))

    assert saida == {"pessoa": "teo", "formato": "imdb", "arquivo": str(saida_csv), "notas": 3, "fora_do_catalogo": 1}
    cabecalho, linhas = _ler(saida_csv)
    assert cabecalho == CABECALHO
    assert set(linhas) == {"tt9000602", "tt9000601", "tt1112223"}
    casa = linhas["tt9000602"]
    assert (casa["Your Rating"], casa["Date Rated"], casa["Title"], casa["Year"], casa["Runtime (mins)"],
            casa["Num Votes"], casa["Title Type"], casa["Directors"], casa["URL"]) == (
        "9", "2026-02-01", "Casa Cheia", "2021", "102", "50000", "Movie", "Lia Moura",
        "https://www.imdb.com/title/tt9000602/")
    assert linhas["tt9000601"]["Your Rating"] == "1"
    fora = linhas["tt1112223"]
    assert (fora["Your Rating"], fora["Date Rated"], fora["Title"], fora["URL"]) == (
        "4", "2024-01-09", "", "https://www.imdb.com/title/tt1112223/")


def test_generos_e_nota_do_imdb_vem_do_catalogo(banco, tmp_path):
    saida_csv = tmp_path / "bruno.csv"
    banco.ok("exportar", "--pessoa", "bruno", "--formato", "imdb", "--saida", str(saida_csv))
    _, linhas = _ler(saida_csv)
    [genero] = banco.consultar("SELECT group_concat(genero, ', ') FROM "
                               "(SELECT genero FROM generos_imdb WHERE filme_id = 'tt9000101' ORDER BY ordem)")
    assert linhas["tt9000101"]["Genres"] == genero[0]


def test_pessoa_desconhecida_e_formato_invalido(banco, tmp_path):
    codigo, saida = banco.rodar("exportar", "--pessoa", "ninguem", "--formato", "imdb", "--saida", str(tmp_path / "x.csv"))
    assert codigo == 1 and saida["erro"]["codigo"] == "pessoa_desconhecida"
    codigo, _ = banco.rodar("exportar", "--pessoa", "teo", "--formato", "letterboxd", "--saida", str(tmp_path / "x.csv"))
    assert codigo == 2
