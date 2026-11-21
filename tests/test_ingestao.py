import hashlib
import json
import shutil
from zipfile import ZipFile

import pytest

from conftest import FIXTURE


@pytest.fixture
def catalogo_real(cli, tmp_path):
    catalogo = tmp_path / "dumps"
    versoes = tmp_path / "versoes.json"
    cli.env.update(
        FILMES_CATALOGO=str(catalogo),
        FILMES_VERSOES=str(versoes),
        FILMES_GRAVACOES=str(FIXTURE / "gravacoes"),
    )
    return cli, catalogo, versoes


def test_atualizar_fixa_os_dumps_por_data_e_hash(catalogo_real):
    cli, catalogo, versoes = catalogo_real

    saida = cli.ok("atualizar")

    fixados = json.loads(versoes.read_text())["dumps"]
    assert saida["dumps"] == fixados
    assert set(fixados) == {
        "title.basics.tsv.gz", "title.ratings.tsv.gz", "wikidata-ids.json.gz",
        "wikidata-conteudo.json.gz", "wikidata-elenco.json.gz", "wikidata-rotulos.json.gz",
        "ml-32m.zip", "genome_2021.zip",
    }
    for nome, versao in fixados.items():
        assert versao["data"] == {
            "ml-32m.zip": "2023-10-13", "genome_2021.zip": "2021-12-30",
        }.get(nome, "2026-11-20")
        assert hashlib.sha256((catalogo / versao["sha256"] / nome).read_bytes()).hexdigest() == versao["sha256"]


def test_reconstruir_carrega_so_longas_com_cem_votos(catalogo_real):
    cli, _, _ = catalogo_real
    cli.ok("atualizar")

    cli.ok("reconstruir")

    assert cli.consultar("SELECT id, duracao_min, votos FROM filmes ORDER BY id") == [
        ["tt0000009", 45, 241], ["tt0017839", 60, 100], ["tt0108052", 196, 1614297], ["tt0133093", 136, 2295248],
    ]
    assert cli.consultar("SELECT filme_id, fonte, data FROM adultos") == [["tt0065442", "IMDb", "2026-11-20"]]


def test_reconstruir_liga_o_imdb_ao_grafo_e_converte_as_faixas(catalogo_real):
    cli, _, _ = catalogo_real
    cli.ok("atualizar")
    cli.ok("reconstruir")

    assert cli.consultar("""
        SELECT slug, item, imdb, tmdb, ano FROM slugs_letterboxd
        WHERE item = 'Q483941'
    """) == [["schindlers-list", "Q483941", "tt0108052", "424", 1993]]
    assert cli.consultar("""
        SELECT r.pt, r.en, r.mul, a.fonte, a.data FROM arestas a
        JOIN rotulos_wikidata r ON r.item = a.entidade_id
        WHERE a.filme_id = 'tt0108052' AND a.predicado = 'diretor'
    """) == [["Steven Spielberg", "Steven Spielberg", "Steven Spielberg", "Wikidata", "2026-11-20"]]
    assert cli.consultar("""
        SELECT r.en FROM arestas a JOIN rotulos_wikidata r ON r.item = a.entidade_id
        WHERE a.filme_id = 'tt0108052' AND a.predicado = 'elenco'
    """) == [["Mark Ivanir"]]
    assert cli.consultar("""
        SELECT codigo, rotulo FROM idiomas_originais WHERE filme_id = 'tt0108052'
    """) == [["en", "inglês"]]
    assert cli.consultar("""
        SELECT propriedade, faixa, convertida FROM faixas_etarias
        WHERE filme_id = 'tt0108052' ORDER BY propriedade
    """) == [
        ["P1657", "16", 1], ["P1981", "12", 1], ["P2629", "16", 1],
        ["P2756", "16", 1], ["P3216", "16", 0], ["P5970", "16", 1],
    ]


def test_reconstruir_recusa_dump_diferente_do_que_foi_fixado(catalogo_real):
    cli, catalogo, _ = catalogo_real
    dumps = cli.ok("atualizar")["dumps"]
    cli.ok("reconstruir")
    nome = "title.ratings.tsv.gz"
    (catalogo / dumps[nome]["sha256"] / nome).write_bytes(b"dump mudou")

    codigo, saida = cli.rodar("reconstruir")

    assert codigo == 1
    assert saida["erro"]["codigo"] == "versoes_invalidas"
    assert "SHA-256" in saida["erro"]["mensagem"]
    assert cli.consultar("SELECT titulo FROM filmes WHERE id = 'tt0133093'") == [["The Matrix"]]


def test_atualizar_preserva_o_manifesto_quando_o_zip_da_grouplens_falha(catalogo_real, tmp_path):
    cli, _, versoes = catalogo_real
    cli.ok("atualizar")
    anterior = versoes.read_bytes()
    gravacoes = tmp_path / "gravacoes"
    pasta = gravacoes / "catalogo"
    shutil.copytree(FIXTURE / "gravacoes" / "catalogo", pasta)
    cli.env["FILMES_GRAVACOES"] = str(gravacoes)
    (pasta / "genome_2021.zip").write_bytes(b"zip incompleto")

    codigo, saida = cli.rodar("atualizar")

    assert codigo == 1
    assert saida["erro"]["codigo"] == "atualizacao_falhou"
    assert "genome_2021.zip" in saida["erro"]["mensagem"]
    assert versoes.read_bytes() == anterior


def test_atualizar_recupera_ids_por_predicado_quando_o_qlever_entrega_json_incompleto(catalogo_real, tmp_path):
    cli, _, versoes = catalogo_real
    gravacoes = tmp_path / "gravacoes"
    pasta = gravacoes / "catalogo"
    shutil.copytree(FIXTURE / "gravacoes" / "catalogo", pasta)
    cli.env["FILMES_GRAVACOES"] = str(gravacoes)

    original = pasta / "wikidata-ids.json"
    linhas = json.loads(original.read_text())["results"]["bindings"]
    original.write_text('{"results":{"bindings":[')
    for p in ("P345", "P4947", "P6127", "P4983", "P577"):
        bindings = [l for l in linhas if l["p"]["value"].endswith("/" + p)]
        (pasta / f"wikidata-ids-{p}.json").write_text(json.dumps({"results": {"bindings": bindings}}))

    cli.ok("atualizar")
    cli.ok("reconstruir")

    fixados = json.loads(versoes.read_text())["dumps"]
    assert "wikidata-ids.json.gz" not in fixados
    assert [dump["fonte"] for nome, dump in fixados.items() if nome.startswith("wikidata-ids-")] == ["WDQS"] * 5
    assert cli.consultar("SELECT imdb, ano FROM slugs_letterboxd WHERE slug = 'schindlers-list'") == [
        ["tt0108052", 1993],
    ]


def test_recomendacao_do_catalogo_real_da_o_credito_do_imdb(catalogo_real):
    cli, _, _ = catalogo_real
    cli.ok("atualizar")
    cli.ok("reconstruir")

    saida = cli.ok("recomendar", "--presentes", "dono", "--duracao-max", "150")

    assert saida["filmes"][0]["titulo"] == "The Matrix"
    assert {
        "fonte": "IMDb",
        "texto": "Information courtesy of IMDb (https://www.imdb.com). Used with permission.",
    } in saida["creditos"]


def test_reconstruir_conta_vizinhos_direcionais_a_partir_das_notas_quatro_ou_mais(catalogo_real):
    cli, _, _ = catalogo_real
    cli.ok("atualizar")

    cli.ok("reconstruir")

    assert cli.consultar("""
        SELECT filme_id, vizinho_id, base, ambos, fonte, data FROM vizinhos
        ORDER BY filme_id, vizinho_id
    """) == [
        ["tt0108052", "tt0133093", 3, 1, "MovieLens ml-32m", "2023-10-13"],
        ["tt0114709", "tt0133093", 1, 1, "MovieLens ml-32m", "2023-10-13"],
        ["tt0133093", "tt0108052", 2, 1, "MovieLens ml-32m", "2023-10-13"],
        ["tt0133093", "tt0114709", 2, 1, "MovieLens ml-32m", "2023-10-13"],
    ]


def test_reconstruir_limita_a_vizinhanca_e_desempata_por_imdb(catalogo_real, tmp_path):
    cli, _, _ = catalogo_real
    gravacoes = tmp_path / "gravacoes"
    pasta = gravacoes / "catalogo"
    shutil.copytree(FIXTURE / "gravacoes" / "catalogo", pasta)
    cli.env["FILMES_GRAVACOES"] = str(gravacoes)
    with ZipFile(pasta / "ml-32m.zip", "w") as dump:
        dump.writestr("ml-32m/links.csv", "movieId,imdbId,tmdbId\n" + "".join(
            f"{id_},{id_:07d},\n" for id_ in range(1, 54)
        ))
        dump.writestr("ml-32m/ratings.csv", "userId,movieId,rating,timestamp\n" + "".join(
            f"1,{id_},4,1\n" for id_ in range(53, 0, -1)
        ) + "2,1,4,1\n2,53,4,1\n")
        dump.writestr("ml-32m/tags.csv", "userId,movieId,tag,timestamp\n")
    cli.ok("atualizar")

    cli.ok("reconstruir")

    assert cli.consultar("""
        SELECT vizinho_id FROM vizinhos WHERE filme_id = 'tt0000001'
        ORDER BY ambos DESC, vizinho_id
    """) == [["tt0000053"]] + [[f"tt{id_:07d}"] for id_ in range(2, 51)]


def test_reconstruir_agrega_as_tags_normalizadas_por_usuario_distinto(catalogo_real):
    cli, _, _ = catalogo_real
    cli.ok("atualizar")

    cli.ok("reconstruir")

    assert cli.consultar("SELECT filme_id, tag, usuarios, fonte, data FROM tags_movielens") == [
        ["tt0133093", "sci-fi, action", 3, "MovieLens ml-32m", "2023-10-13"],
    ]


def test_reconstruir_liga_o_genoma_ao_imdb_e_preserva_a_precisao_do_escore(catalogo_real):
    cli, _, _ = catalogo_real
    cli.ok("atualizar")
    del cli.env["FILMES_GRAVACOES"]

    cli.ok("reconstruir")

    assert cli.consultar("""
        SELECT filme_id, tag, relevancia, fonte, data FROM genoma ORDER BY filme_id
    """) == [
        ["tt0108052", "funny", 0.599999999999999, "Tag Genome 2021", "2021-12-30"],
        ["tt0133093", "funny", 0.876543210987654, "Tag Genome 2021", "2021-12-30"],
    ]

    saida = cli.ok("recomendar", "--presentes", "dono", "--clima", "pra rir")

    assert any(
        credito["fonte"] == "Tag Genome" and "CC BY-NC 3.0" in credito["texto"]
        for credito in saida["creditos"]
    )
