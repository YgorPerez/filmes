"""`pessoa remover`: desfaz um Declarado, Relato, Veto ou Já visto registrado por engano.

O Teo começa sem nada no arquivo; os testes registram pela CLI e removem pelo
`fato_id` que `pessoa ver` mostra, ou pelo alvo.
"""

from conftest import ler_markdown

FAROL = "tt9000101"


def _declarados_no_banco(cli):
    return cli.consultar("SELECT fato_id FROM declarados WHERE pessoa = 'teo'")


def test_remove_o_declarado_pelo_fato_id_do_arquivo_e_do_banco(banco, dados):
    banco.ok("pessoa", "declarar", "teo", "adoro esse", "--filme", FAROL, "--reacao", "ama")
    fica = banco.ok("pessoa", "declarar", "teo", "gosto de comédia")["declarado"]
    [errado, _] = banco.ok("pessoa", "ver", "teo")["declarados"]

    saida = banco.ok("pessoa", "remover", "teo", "--declarado", errado["fato_id"])

    assert saida["pessoa"] == "teo"
    assert saida["removido"]["fato_id"] == errado["fato_id"]
    assert saida["removido"]["texto"] == "adoro esse"
    assert [d["fato_id"] for d in banco.ok("pessoa", "ver", "teo")["declarados"]] == [fica["fato_id"]]
    assert _declarados_no_banco(banco) == [[fica["fato_id"]]]
    assert banco.consultar(f"SELECT count(*) FROM notas WHERE pessoa = 'teo' AND filme_id = '{FAROL}'") == [[0]]
    assert "adoro esse" not in ler_markdown(dados / "pessoas" / "teo.md")[1]


TERROR = "Q9001801"


def _titulos(cli):
    return [f["titulo"] for f in cli.ok("recomendar", "--presentes", "dono", "teo", "--quantos", "50")["filmes"]]


def test_remover_o_veto_pelo_alvo_devolve_o_filme_a_recomendacao(banco, dados):
    vetado = banco.ok("pessoa", "vetar", "teo", "nunca vê terror", "--entidade", TERROR)["veto"]
    assert "Explosão Final" not in _titulos(banco)

    saida = banco.ok("pessoa", "remover", "teo", "--veto", TERROR)

    assert saida["removido"]["fato_id"] == vetado["fato_id"]
    assert ler_markdown(dados / "pessoas" / "teo.md")[0]["vetos"] == []
    assert banco.ok("pessoa", "ver", "teo")["vetos"] == []
    assert "Explosão Final" in _titulos(banco)


COMEDIA = "Q9001802"


def test_alvo_com_mais_de_um_relato_pede_o_fato_id(banco):
    um = banco.ok("pessoa", "relatar", "teo", "gosta de comédia", "--entidade", COMEDIA, "--reacao", "gosta")["relato"]
    outro = banco.ok("pessoa", "relatar", "teo", "ri à toa com comédia", "--entidade", COMEDIA,
                     "--reacao", "ama")["relato"]

    codigo, saida = banco.rodar("pessoa", "remover", "teo", "--relato", COMEDIA)

    assert codigo == 1
    assert saida["erro"]["codigo"] == "relato_ambiguo"
    assert um["fato_id"] in saida["erro"]["mensagem"] and outro["fato_id"] in saida["erro"]["mensagem"]

    banco.ok("pessoa", "remover", "teo", "--relato", outro["fato_id"])

    assert [r["texto"] for r in banco.ok("pessoa", "ver", "teo")["relatos"]] == ["gosta de comédia"]
    assert banco.consultar("SELECT texto FROM relatos WHERE pessoa = 'teo'") == [["gosta de comédia"]]


def test_item_que_nao_esta_no_arquivo_e_erro_e_nada_muda(banco, dados):
    banco.ok("pessoa", "declarar", "teo", "gosto de comédia")
    antes = (dados / "pessoas" / "teo.md").read_text()

    codigo, saida = banco.rodar("pessoa", "remover", "teo", "--declarado", "declarados:nao-existe")

    assert codigo == 1
    assert saida["erro"]["codigo"] == "declarado_desconhecido"
    assert (dados / "pessoas" / "teo.md").read_text() == antes


def test_ja_visto_removido_volta_a_sair_com_sem_ja_visto_e_reconstruir_concorda(banco, dados):
    visto = banco.ok("pessoa", "visto", "teo", "--filme", "tt9000601", "--nota", "8/10")["visto"]
    fica = banco.ok("pessoa", "visto", "teo", "--filme", "tt9000602")["visto"]

    saida = banco.ok("pessoa", "remover", "teo", "--visto", visto["fato_id"])

    assert saida["removido"]["filme"] == "tt9000601"
    filmes = banco.ok("recomendar", "--presentes", "teo", "--quantos", "50", "--sem-ja-visto")["filmes"]
    assert "tt9000601" in [f["id"] for f in filmes]
    sql = ("SELECT fato_id FROM ja_visto WHERE pessoa = 'teo' UNION ALL "
           "SELECT fato_id FROM notas WHERE pessoa = 'teo' ORDER BY 1")
    assert banco.consultar(sql) == [[fica["fato_id"]]]
    banco.ok("reconstruir")
    assert banco.consultar(sql) == [[fica["fato_id"]]]
    assert "## Já vistos\n\n- 2026-11-20 · conversa com o Dono · Casa Cheia (tt9000602)\n" in \
        ler_markdown(dados / "pessoas" / "teo.md")[1]


def test_todo_item_de_pessoa_ver_tem_fato_id(banco):
    banco.ok("pessoa", "vetar", "teo", "nunca vê terror", "--entidade", TERROR)
    banco.ok("pessoa", "declarar", "teo", "gosto de comédia")
    banco.ok("pessoa", "relatar", "teo", "gosta de comédia", "--entidade", COMEDIA)
    banco.ok("pessoa", "visto", "teo", "--filme", "tt9000601")

    ver = banco.ok("pessoa", "ver", "teo")

    for chave in ("vetos", "declarados", "relatos", "vistos"):
        assert ver[chave] and all(item["fato_id"] for item in ver[chave]), chave


def test_declarado_de_import_aponta_para_importar_remover(banco):
    codigo, saida = banco.rodar("pessoa", "remover", "teo", "--declarado", "letterboxd:0123abcd")

    assert codigo == 1
    assert "importar --remover" in saida["erro"]["mensagem"]
