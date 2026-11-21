from pathlib import Path


def test_avaliar_grava_os_resultados_sem_abrir_sessao(banco, tmp_path):
    banco.env["FILMES_AVALIACOES"] = str(tmp_path / "avaliacoes")
    antes = banco.ok("sessoes-abertas")

    resultado = banco.ok("avaliar")

    assert banco.ok("sessoes-abertas") == antes
    assert resultado["offline"]["pessoas"]["pessoas"] == 3
    assert resultado["offline"]["pessoas"]["retidos_4_mais"] == 4
    assert resultado["offline"]["movielens"]["pessoas"] == 0
    assert resultado["online"]["sessoes"] == 0
    assert resultado["prioridade"] == "offline"
    relatorio = Path(resultado["arquivo"])
    assert relatorio == tmp_path / "avaliacoes" / "2026-11-20.md"
    texto = relatorio.read_text(encoding="utf-8")
    for trecho in ("Recall@50", "Cobertura", "Pesos", "Versões dos dados", "notas.csv"):
        assert trecho in texto


def test_avaliar_usa_so_as_dez_sessoes_mais_recentes_com_feedback(banco, tmp_path):
    banco.env["FILMES_AVALIACOES"] = str(tmp_path / "avaliacoes")
    antiga = banco.ok("recomendar", "--presentes", "dono")
    banco.ok("feedback", "--sessao", antiga["sessao"]["id"], "--filme", antiga["filmes"][0]["id"],
             "--nota", "dono=0.5")

    for dia in range(21, 31):
        banco.env["FILMES_HOJE"] = f"2026-11-{dia}"
        sessao = banco.ok("recomendar", "--presentes", "dono", "--quantos", "6")
        id_ = sessao["sessao"]["id"]
        if dia == 21:
            banco.ok("feedback", "--sessao", id_, "--nada")
        else:
            posicao = 5 if dia == 22 else 0
            banco.ok("feedback", "--sessao", id_, "--filme", sessao["filmes"][posicao]["id"],
                     "--nota", "dono=5")

    banco.ok("recomendar", "--presentes", "dono")
    resultado = banco.ok("avaliar")
    assert resultado["prioridade"] == "online"
    # A Sessão "não vimos nada" conta na janela das 10, mas não no denominador da taxa.
    assert resultado["online"] == {
        "sessoes": 10,
        "com_filme": 9,
        "escolhidos_top_5": 8,
        "taxa_top_5": 8 / 9,
        "reacoes": 9,
        "reacao_media": 1.0,
    }


def test_avaliar_exclui_os_usuarios_sorteados_da_vizinhanca(banco, tmp_path):
    from random import Random
    from shutil import copytree

    catalogo = tmp_path / "catalogo"
    copytree(banco.env["FILMES_CATALOGO"], catalogo)
    (catalogo / "genoma.csv").unlink()
    banco.env.update(FILMES_CATALOGO=str(catalogo), FILMES_AVALIACOES=str(tmp_path / "avaliacoes"))
    with (catalogo / "filmes.csv").open("a", encoding="utf-8") as arquivo:
        for i in range(55):
            arquivo.write(f"tt927{i:04d},Filme popular {i},2020,90,999999\n")
    ml = catalogo / "ml-32m"
    ml.mkdir()
    (ml / "links.csv").write_text(
        "movieId,imdbId,tmdbId\n" + "".join(f"{i},90010{i:02d},{i}\n" for i in range(1, 7)),
        encoding="utf-8",
    )
    # Os 30 usuários fora da amostra só deram 4+ aos filmes 1 e 3.
    # O filme 2 entra no top 50 se as notas retidas vazarem para os vizinhos.
    usuarios = range(1, 1031)
    sorteados = set(Random(27).sample(list(usuarios), 1000))
    with (ml / "ratings.csv").open("w", encoding="utf-8") as arquivo:
        arquivo.write("userId,movieId,rating,timestamp\n")
        for usuario in usuarios:
            arquivo.write(f"{usuario},1,5,1700000000\n")
            if usuario in sorteados:
                for filme in (4, 5, 6):
                    arquivo.write(f"{usuario},{filme},2,1700000000\n")
                arquivo.write(f"{usuario},2,5,1700000001\n")
            arquivo.write(f"{usuario},3,5,1700000002\n")
    banco.ok("reconstruir")

    resultado = banco.ok("avaliar")
    amostra = resultado["offline"]["movielens"]
    assert amostra["pessoas"] == amostra["recuperados"] == 1000
    assert amostra["retidos_4_mais"] == 2000
    assert amostra["cobertura_top_5"] == 0
    assert amostra["recall_50"] == 0.5
    assert "ml-32m/ratings.csv" in resultado["versoes"]


def test_grade_testa_tres_valores_por_peso_e_preserva_a_config(banco, tmp_path):
    from shutil import copyfile

    pesos = tmp_path / "pesos.toml"
    copyfile("config/pesos.toml", pesos)
    antes = pesos.read_bytes()
    banco.env.update(FILMES_PESOS=str(pesos), FILMES_AVALIACOES=str(tmp_path / "avaliacoes"))

    resultado = banco.ok("avaliar", "--grade")
    grade = resultado["grade"]
    # 27 conjuntos de multiplicadores; os cinco pesos de aresta variam um de cada vez
    # (1 conjunto atual + 5 × 2 variações).
    assert set(grade["valores"]["caminho.peso"]) == {"diretor", "roteiro", "elenco", "genero", "serie"}
    assert grade["combinacoes"] == 27 * 11
    assert all(len(valores) == 3 for pesos in grade["valores"].values() for valores in pesos.values())
    assert len(grade["melhores"]) == 3
    assert pesos.read_bytes() == antes
    assert banco.ok("sessoes-abertas") == {"sessoes": []}
    texto = Path(resultado["arquivo"]).read_text(encoding="utf-8")
    assert "## Grade de pesos" in texto


def test_avaliar_usa_as_datas_do_diario_quando_o_export_tem_avaliacoes_avulsas(banco, tmp_path):
    from zipfile import ZipFile

    origem = Path(__file__).resolve().parent / "fixture" / "letterboxd" / "olga"
    destino = tmp_path / "letterboxd.zip"
    with ZipFile(destino, "w") as zip_:
        for nome in ("ratings.csv", "diary.csv", "watched.csv"):
            zip_.write(origem / nome, nome)
    banco.env["FILMES_AVALIACOES"] = str(tmp_path / "avaliacoes")
    banco.ok("importar", "--pessoa", "teo", "--letterboxd", str(destino))

    resultado = banco.ok("avaliar")["offline"]["pessoas"]

    # O filme mais recente nas avaliações avulsas recebeu 5. No diário,
    # o mais recente é Maré Baixa, que recebeu 2 e entra só na cobertura.
    assert resultado["pessoas"] == 4
    assert resultado["filmes_top_5"] == 20
    assert resultado["retidos_4_mais"] == 4


def test_relatorio_guarda_o_manifesto_do_catalogo_fixado(cli, tmp_path):
    gravacoes = Path(__file__).resolve().parent / "fixture" / "gravacoes"
    cli.env.update(
        FILMES_CATALOGO=str(tmp_path / "catalogo"),
        FILMES_VERSOES=str(tmp_path / "versoes.json"),
        FILMES_GRAVACOES=str(gravacoes),
        FILMES_AVALIACOES=str(tmp_path / "avaliacoes"),
    )
    fixados = cli.ok("atualizar")["dumps"]
    cli.ok("reconstruir")

    resultado = cli.ok("avaliar")

    assert resultado["versoes"]["manifesto"]["dumps"] == fixados
    assert fixados["title.basics.tsv.gz"]["sha256"] in Path(resultado["arquivo"]).read_text(encoding="utf-8")
