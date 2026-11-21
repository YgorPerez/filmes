import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

FIXTURE = Path(__file__).parent / "fixture" / "trakt"


def _export(tmp_path, *nomes):
    destino = tmp_path / "trakt.zip"
    with ZipFile(destino, "w") as zip_:
        for nome in nomes:
            zip_.write(FIXTURE / nome, f"trakt-export/{nome}")
    return destino


def test_importa_notas_e_historico_do_trakt(banco, dados, tmp_path):
    arquivo = _export(tmp_path, "ratings-movies.json", "watched-history-1.json")
    relatorio = banco.ok("importar", "--pessoa", "teo", "--trakt", str(arquivo))
    assert relatorio["resolvidos"] == {"imdb": 1, "tmdb": 1}
    assert relatorio["fatos_novos"] == {"notas": 2, "ja_visto": 1}
    sha = hashlib.sha256(arquivo.read_bytes()).hexdigest()
    assert relatorio["arquivo"] == f"imports/teo/trakt-{sha}.zip"
    assert (dados / relatorio["arquivo"]).read_bytes() == arquivo.read_bytes()

    assert banco.consultar("""
        SELECT filme_id, nota, data, fonte FROM notas WHERE pessoa = 'teo' ORDER BY filme_id
    """) == [
        ["tt9000101", 4.5, "2025-02-05", "Trakt de Teo"],
        ["tt9000102", 0.5, "2025-04-01", "Trakt de Teo"],
    ]
    assert banco.consultar("""
        SELECT filme_id, tipo, data, fonte, sessao FROM ja_visto WHERE pessoa = 'teo'
    """) == [
        ["tt9000101", "declarado", "2025-02-03", "Trakt de Teo", None],
    ]


def test_nota_mais_recente_vale_e_o_banco_pode_ser_reconstruido(banco, tmp_path):
    trakt = _export(tmp_path, "ratings-movies.json", "watched-history-1.json")
    letterboxd = tmp_path / "letterboxd.zip"
    with ZipFile(letterboxd, "w") as zip_:
        zip_.writestr(
            "ratings.csv",
            "Date,Name,Year,Letterboxd URI,Rating\n"
            "2025-02-04,O Farol de Areia,2012,https://boxd.it/9a1,2\n"
            "2025-04-02,Maré Baixa,2015,https://boxd.it/9a2,5\n",
        )
    comando = ("importar", "--pessoa", "teo", "--trakt", str(trakt))
    banco.ok(*comando)
    banco.ok("importar", "--pessoa", "teo", "--letterboxd", str(letterboxd))

    assert banco.consultar("""
        SELECT filme_id, nota, fonte FROM notas_vigentes WHERE pessoa = 'teo' ORDER BY filme_id
    """) == [["tt9000101", 4.5, "Trakt de Teo"], ["tt9000102", 5.0, "Letterboxd de Teo"]]

    def fatos():
        return banco.consultar("""
            SELECT fato_id, fonte FROM notas WHERE pessoa = 'teo'
            UNION ALL SELECT fato_id, fonte FROM ja_visto WHERE pessoa = 'teo'
            ORDER BY fato_id
        """)

    antes = fatos()
    assert len(antes) == 5
    repetido = banco.ok(*comando)
    assert repetido["arquivo_novo"] is False
    assert repetido["fatos_novos"] == {"notas": 0, "ja_visto": 0}
    assert fatos() == antes
    banco.ok("reconstruir")
    assert fatos() == antes


def test_historico_paginado_prevalece_e_filme_fora_do_catalogo_aparece_no_relatorio(banco, tmp_path):
    arquivo = _export(tmp_path, "watched-history-1.json")
    filmes = json.loads((FIXTURE / "watched-history-1.json").read_text())
    outra_sessao = filmes[0] | {"id": 1111111120, "watched_at": "2025-02-03T21:00:00.000Z"}
    fora = {
        "id": 1111111121,
        "watched_at": "2025-02-04T21:00:00.000Z",
        "type": "movie",
        "movie": {"title": "Filme perdido", "ids": {"imdb": "tt9999999", "trakt": 99}},
    }
    with ZipFile(arquivo, "a") as zip_:
        zip_.writestr("watched-history-2.json", json.dumps([outra_sessao, fora]))
        zip_.writestr("watched-movies.json", json.dumps([{
            "plays": 2,
            "last_watched_at": "2025-02-01T21:00:00.000Z",
            "movie": outra_sessao["movie"],
        }]))
    importado = banco.ok("importar", "--pessoa", "teo", "--trakt", str(arquivo))

    assert importado["fatos"] == {"notas": 0, "ja_visto": 2}
    assert importado["sem_resolucao"] == [{"nome": "Filme perdido", "imdb": "tt9999999", "tmdb": None, "trakt": 99}]


def test_export_sem_arquivos_do_trakt_nao_e_guardado(banco, dados, tmp_path):
    arquivo = tmp_path / "outro.zip"
    with ZipFile(arquivo, "w") as zip_:
        zip_.writestr("profile.json", "{}")

    codigo, saida = banco.rodar("importar", "--pessoa", "teo", "--trakt", str(arquivo))
    assert codigo == 1
    assert saida["erro"]["codigo"] == "arquivo_invalido"
    assert not (dados / "imports" / "teo").exists()
