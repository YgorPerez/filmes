"""Pessoas no repo de dados: criar, ver, declarar, relatar e vetar pela CLI.

O arquivo `pessoas/<slug>.md` é a fonte; `reconstruir` refaz os Fatos a partir dele.
"""

import yaml


def _frontmatter(caminho):
    texto = caminho.read_text(encoding="utf-8")
    assert texto.startswith("---\n")
    return yaml.safe_load(texto[4:texto.index("\n---", 4)])


def test_criar_pessoa_escreve_o_arquivo_com_nome_e_apelidos(cli, dados):
    saida = cli.ok("pessoa", "criar", "Ana Lima", "--apelido", "Ana", "--apelido", "Aninha", "--slug", "ana")

    assert saida["pessoa"] == "ana"
    frente = _frontmatter(dados / "pessoas" / "ana.md")
    assert frente["nome"] == "Ana Lima"
    assert frente["apelidos"] == ["Ana", "Aninha"]
    assert frente["vetos"] == []
    assert "idade" not in frente


def test_ver_pessoa_pelo_apelido(cli):
    cli.ok("pessoa", "criar", "Ana Lima", "--apelido", "Aninha", "--slug", "ana")

    saida = cli.ok("pessoa", "ver", "aninha")

    assert saida["pessoa"] == "ana"
    assert saida["nome"] == "Ana Lima"
    assert saida["apelidos"] == ["Aninha"]
    assert saida["dono"] is False


def test_slug_sai_do_nome_sem_acento(cli, dados):
    saida = cli.ok("pessoa", "criar", "Léo Araújo")

    assert saida["pessoa"] == "leo-araujo"
    assert (dados / "pessoas" / "leo-araujo.md").exists()


def test_criar_pessoa_que_ja_existe_e_erro(cli):
    codigo, saida = cli.rodar("pessoa", "criar", "Outro Bruno", "--slug", "bruno")

    assert codigo == 1
    assert saida["erro"]["codigo"] == "pessoa_existente"


def test_ver_pessoa_desconhecida_e_erro(cli):
    codigo, saida = cli.rodar("pessoa", "ver", "fulano")

    assert codigo == 1
    assert saida["erro"]["codigo"] == "pessoa_desconhecida"


def test_ver_o_dono(cli):
    saida = cli.ok("pessoa", "ver", "dono")

    assert saida["pessoa"] == "bruno"
    assert saida["dono"] is True


# Na fixture: Terror (Q9001801) é o gênero de Porão Escuro, A Casa do Fim e
# Explosão Final; este último tem Evidência contra para o Bruno.
TERROR = "Q9001801"


def _titulos(saida):
    return [f["titulo"] for f in saida["filmes"]]


def test_vetar_grava_o_veto_no_frontmatter(banco, dados):
    banco.ok("pessoa", "criar", "Ana", "--slug", "ana")

    saida = banco.ok("pessoa", "vetar", "ana", "nunca vê terror", "--entidade", TERROR)

    assert saida["veto"]["rotulo"] == "Terror"
    [veto] = _frontmatter(dados / "pessoas" / "ana.md")["vetos"]
    assert veto == {"texto": "nunca vê terror", "alvo": TERROR, "rotulo": "Terror", "data": "2026-11-20"}


def test_veto_tira_os_filmes_quando_a_pessoa_esta_presente(banco):
    banco.ok("pessoa", "criar", "Ana", "--slug", "ana")
    banco.ok("pessoa", "vetar", "ana", "nunca vê terror", "--entidade", TERROR)
    banco.ok("reconstruir")

    com_ana = banco.ok("recomendar", "--presentes", "dono", "ana", "--quantos", "50")
    sem_ana = banco.ok("recomendar", "--presentes", "dono", "--quantos", "50")

    assert "Explosão Final" not in _titulos(com_ana)
    assert "Explosão Final" in _titulos(sem_ana)
    assert com_ana["vetos"] == [{"pessoa": "ana", "texto": "nunca vê terror", "alvo": TERROR,
                                 "rotulo": "Terror", "filmes_tirados": 3}]
    assert sem_ana["vetos"] == []


# Sofia Rangel (Q9000018) dirigiu Porão Escuro, A Casa do Fim e Risos de Domingo.
SOFIA_RANGEL = "Q9000018"
COMEDIA = "Q9001802"       # gênero de Risos de Domingo e Pequenos Milagres
DAVI_COUTO = "Q9001803"    # no elenco de Risos de Domingo e Casa Cheia


def _ana(banco):
    banco.ok("pessoa", "criar", "Ana", "--slug", "ana")


def _filme(saida, titulo):
    [filme] = [f for f in saida["filmes"] if f["titulo"] == titulo]
    return filme


def _da_ana(banco, titulo):
    saida = banco.ok("recomendar", "--presentes", "ana", "--quantos", "50")
    return [e for e in _filme(saida, titulo)["evidencias"]["ana"] if e["tipo"] != "palpite"]


def test_declarado_sobre_diretor_vira_evidencia_forte_nos_filmes_dele(banco, dados):
    _ana(banco)

    banco.ok("pessoa", "declarar", "ana", "adoro os filmes da Sofia Rangel",
             "--entidade", SOFIA_RANGEL, "--reacao", "gosta", "--fonte", "questionário")
    banco.ok("reconstruir")

    assert "- 2026-11-20 · questionário · específico · gosta de Sofia Rangel (Q9000018) · " \
           '"adoro os filmes da Sofia Rangel"' in (dados / "pessoas" / "ana.md").read_text()
    for titulo in ("Porão Escuro", "A Casa do Fim", "Risos de Domingo"):
        [evidencia] = _da_ana(banco, titulo)
        assert evidencia["texto"] == 'disse "adoro os filmes da Sofia Rangel"; dirigido por Sofia Rangel'
        assert evidencia["fonte"] == "questionário"
        assert evidencia["data"] == "2026-11-20"
        assert (evidencia["tipo"], evidencia["forca"]) == ("declarado", "forte")
        assert evidencia["contribuicao"] > 0
        assert evidencia["fato_id"] in [l[0] for l in banco.consultar("SELECT fato_id FROM declarados")]


def test_declarado_sobre_genero_e_generico_e_moderado(banco):
    _ana(banco)

    saida = banco.ok("pessoa", "declarar", "ana", "gosto de comédia", "--entidade", COMEDIA, "--reacao", "gosta")
    banco.ok("reconstruir")

    assert saida["declarado"]["especifico"] is False
    [evidencia] = _da_ana(banco, "Pequenos Milagres")
    assert evidencia["texto"] == 'disse "gosto de comédia"; do gênero Comédia'
    assert (evidencia["tipo"], evidencia["forca"]) == ("declarado", "moderada")


def test_declarado_sobre_ator(banco):
    _ana(banco)

    banco.ok("pessoa", "declarar", "ana", "vejo qualquer coisa com o Davi Couto",
             "--entidade", DAVI_COUTO, "--reacao", "ama")
    banco.ok("reconstruir")

    [evidencia] = _da_ana(banco, "Casa Cheia")
    assert evidencia["texto"] == 'disse "vejo qualquer coisa com o Davi Couto"; com Davi Couto no elenco'
    assert evidencia["forca"] == "forte"


def test_relato_fica_um_nivel_abaixo_e_pesa_contra(banco):
    _ana(banco)

    banco.ok("pessoa", "relatar", "ana", "não suporta os filmes da Sofia Rangel",
             "--entidade", SOFIA_RANGEL, "--reacao", "odeia")
    banco.ok("reconstruir")

    [evidencia] = _da_ana(banco, "Porão Escuro")
    assert evidencia["texto"] == 'segundo o Dono, "não suporta os filmes da Sofia Rangel"; dirigido por Sofia Rangel'
    assert evidencia["fonte"] == "descrição do Dono"
    assert (evidencia["tipo"], evidencia["forca"]) == ("relato", "moderada")
    assert evidencia["contribuicao"] < 0


def test_relato_generico_e_fraco(banco):
    _ana(banco)

    banco.ok("pessoa", "relatar", "ana", "gosta de comédia", "--entidade", COMEDIA, "--reacao", "gosta")
    banco.ok("reconstruir")

    [evidencia] = _da_ana(banco, "Risos de Domingo")
    assert (evidencia["tipo"], evidencia["forca"]) == ("relato", "fraca")


def test_declarado_e_relato_com_mais_de_dois_anos_caem_um_nivel(banco):
    _ana(banco)

    banco.ok("pessoa", "declarar", "ana", "adoro a Sofia Rangel", "--entidade", SOFIA_RANGEL,
             "--reacao", "gosta", "--data", "2024-11-19")
    banco.ok("pessoa", "relatar", "ana", "ama o Davi Couto", "--entidade", DAVI_COUTO,
             "--reacao", "ama", "--data", "2024-11-19")
    banco.ok("pessoa", "declarar", "ana", "gosto de comédia", "--entidade", COMEDIA,
             "--reacao", "gosta", "--data", "2024-11-21")
    banco.ok("reconstruir")

    forca = {(e["tipo"], e["data"]): e["forca"] for e in _da_ana(banco, "Risos de Domingo")}
    assert forca == {("declarado", "2024-11-19"): "moderada",   # específico, 2 anos e 1 dia
                     ("relato", "2024-11-19"): "fraca",         # específico, um abaixo, mais um
                     ("declarado", "2024-11-21"): "moderada"}   # genérico, ainda não fez 2 anos


def test_review_da_propria_pessoa_conta_como_declarado_especifico(banco):
    _ana(banco)

    saida = banco.ok("pessoa", "declarar", "ana", "comédia boa é comédia de constrangimento",
                     "--entidade", COMEDIA, "--reacao", "gosta", "--review", "--fonte", "review no Letterboxd")
    banco.ok("reconstruir")

    assert saida["declarado"]["especifico"] is True
    [evidencia] = _da_ana(banco, "Pequenos Milagres")
    assert (evidencia["tipo"], evidencia["forca"]) == ("declarado", "forte")


# O Farol de Areia (tt9000101) e Barulho (tt9000501) são de Helena Prado e Caio Brandão.
FAROL = "tt9000101"
BARULHO = "tt9000501"


def test_amo_vira_nota_5_declarada_e_semente_do_caminho(banco):
    _ana(banco)

    saida = banco.ok("pessoa", "declarar", "ana", "O Farol de Areia é o meu filme favorito",
                     "--filme", FAROL, "--reacao", "ama", "--fonte", "questionário")
    banco.ok("reconstruir")

    assert saida["declarado"]["especifico"] is True
    assert banco.consultar("SELECT nota, tipo, fonte FROM notas WHERE pessoa = 'ana'") == \
        [[5.0, "declarado", "questionário"]]
    semente = [e for e in _da_ana(banco, "As Horas Lentas") if e["tipo"] == "declarado"]
    assert [(e["texto"], e["forca"], e["fonte"]) for e in semente] == [
        ("disse que ama O Farol de Areia (2012), também de Helena Prado", "forte", "questionário")]
    assert semente[0]["contribuicao"] > 0


def test_odeio_vira_nota_1_declarada_contra(banco):
    _ana(banco)

    banco.ok("pessoa", "declarar", "ana", "Barulho é insuportável", "--filme", BARULHO, "--reacao", "odeia")
    banco.ok("reconstruir")

    assert banco.consultar("SELECT nota, tipo FROM notas WHERE pessoa = 'ana'") == [[1.0, "declarado"]]
    [semente] = _da_ana(banco, "Explosão Final")
    assert semente["texto"] == "disse que odeia Barulho (2013), também de Caio Brandão"
    assert (semente["tipo"], semente["forca"]) == ("declarado", "forte")
    assert semente["contribuicao"] < 0


def test_relato_de_que_ama_um_filme_e_semente_um_nivel_abaixo(banco):
    _ana(banco)

    banco.ok("pessoa", "relatar", "ana", "ama O Farol de Areia", "--filme", FAROL, "--reacao", "ama")
    banco.ok("reconstruir")

    [semente] = [e for e in _da_ana(banco, "As Horas Lentas") if e["tipo"] == "relato"]
    assert semente["texto"] == "segundo o Dono, ama O Farol de Areia (2012), também de Helena Prado"
    assert semente["forca"] == "moderada"


def test_gostar_de_um_filme_nao_vira_nota(banco):
    _ana(banco)

    saida = banco.ok("pessoa", "declarar", "ana", "gostei do Farol", "--filme", FAROL, "--reacao", "gosta")
    banco.ok("reconstruir")

    assert saida["declarado"]["nota"] is None
    assert banco.consultar("SELECT count(*) FROM notas WHERE pessoa = 'ana'") == [[0]]


def test_veto_e_declarado_valem_sem_reconstruir(banco):
    _ana(banco)
    banco.ok("pessoa", "vetar", "ana", "nunca vê terror", "--entidade", TERROR)
    banco.ok("pessoa", "declarar", "ana", "gosto de comédia", "--entidade", COMEDIA, "--reacao", "gosta")

    saida = banco.ok("recomendar", "--presentes", "dono", "ana", "--quantos", "50")

    assert "Explosão Final" not in _titulos(saida)
    assert [v["rotulo"] for v in saida["vetos"]] == ["Terror"]
    assert any(e["tipo"] == "declarado" for e in _filme(saida, "Pequenos Milagres")["evidencias"]["ana"])


def test_banco_sincronizado_e_igual_ao_reconstruido(banco):
    _ana(banco)
    banco.ok("pessoa", "declarar", "ana", "amo O Farol", "--filme", FAROL, "--reacao", "ama")
    banco.ok("pessoa", "relatar", "ana", "odeia comédia", "--entidade", COMEDIA, "--reacao", "odeia")
    banco.ok("pessoa", "vetar", "ana", "nunca vê terror", "--entidade", TERROR)
    sql = ("SELECT 'p', slug, nome, dono FROM pessoas UNION ALL SELECT 'v', fato_id, alvo, texto FROM vetos "
           "UNION ALL SELECT 'd', fato_id, alvo, texto FROM declarados UNION ALL SELECT 'r', fato_id, alvo, texto FROM relatos "
           "UNION ALL SELECT 'n', fato_id, filme_id, nota FROM notas ORDER BY 1, 2")
    sincronizado = banco.consultar(sql)

    banco.ok("reconstruir")

    assert banco.consultar(sql) == sincronizado


def test_ver_mostra_tudo_o_que_se_sabe_da_pessoa(banco):
    _ana(banco)
    banco.ok("pessoa", "declarar", "ana", "amo O Farol", "--filme", FAROL, "--reacao", "ama",
             "--fonte", "questionário", "--data", "2026-10-01")
    banco.ok("pessoa", "relatar", "ana", "odeia filme lento")
    banco.ok("pessoa", "vetar", "ana", "nunca vê terror", "--entidade", TERROR)

    saida = banco.ok("pessoa", "ver", "ana")

    assert saida["vetos"] == [{"texto": "nunca vê terror", "alvo": TERROR, "rotulo": "Terror", "data": "2026-11-20"}]
    [declarado] = saida["declarados"]
    assert {k: declarado[k] for k in ("texto", "fonte", "data", "reacao", "alvo", "rotulo", "nota", "tipo", "forca")} == {
        "texto": "amo O Farol", "fonte": "questionário", "data": "2026-10-01", "reacao": "ama", "alvo": FAROL,
        "rotulo": "O Farol de Areia", "nota": 5.0, "tipo": "declarado", "forca": "forte"}
    [relato] = saida["relatos"]
    assert (relato["texto"], relato["especifico"], relato["forca"], relato["alvo"]) == \
        ("odeia filme lento", False, "fraca", None)
    assert [(n["filme_id"], n["nota"], n["tipo"]) for n in saida["notas"]] == [(FAROL, 5.0, "declarado")]


def test_ver_mostra_as_notas_da_pessoa(banco):
    saida = banco.ok("pessoa", "ver", "dono")

    assert len(saida["notas"]) == 11
    assert {"filme_id": "tt9000101", "titulo": "O Farol de Areia", "nota": 5.0, "data": "2025-06-01",
            "fonte": "Letterboxd do Bruno", "tipo": "nota"} in [
        {k: n[k] for k in ("filme_id", "titulo", "nota", "data", "fonte", "tipo")} for n in saida["notas"]]


ARQUIVO_DA_CAROL = """---
nome: Carol
apelidos: [Carolzinha]
vetos:
- texto: nada da Sofia Rangel
  alvo: Q9000018
  rotulo: Sofia Rangel
  data: 2026-01-05
imports: []
---
Amiga da faculdade.

## Declarados

- 2025-03-01 · questionário · genérico · gosta de Comédia (Q9001802) · "comédia sempre"
- 2026-02-02 · questionário · específico · ama Barulho (tt9000501) · "Barulho é o melhor"

## Relatos

- 2026-04-04 · descrição do Dono · específico · não gosta de Davi Couto (Q9001803) · "acha o Davi Couto canastrão"
"""


def test_reconstruir_le_declarados_relatos_e_vetos_do_arquivo(cli, dados):
    (dados / "pessoas" / "carol.md").write_text(ARQUIVO_DA_CAROL, encoding="utf-8")

    cli.ok("reconstruir")

    assert cli.consultar("SELECT reacao, alvo, especifico, texto FROM declarados ORDER BY data") == [
        ["gosta", COMEDIA, 0, "comédia sempre"], ["ama", BARULHO, 1, "Barulho é o melhor"]]
    assert cli.consultar("SELECT reacao, alvo, texto FROM relatos") == [
        ["nao_gosta", DAVI_COUTO, "acha o Davi Couto canastrão"]]
    assert cli.consultar("SELECT nota, tipo FROM notas WHERE pessoa = 'carol'") == [[5.0, "declarado"]]
    assert cli.consultar("SELECT alvo, data FROM vetos") == [[SOFIA_RANGEL, "2026-01-05"]]
    saida = cli.ok("recomendar", "--presentes", "Carolzinha", "--quantos", "50")
    assert not {"Porão Escuro", "A Casa do Fim", "Risos de Domingo"} & set(_titulos(saida))


def test_escrever_no_arquivo_preserva_o_texto_livre(cli, dados):
    (dados / "pessoas" / "carol.md").write_text(ARQUIVO_DA_CAROL, encoding="utf-8")

    cli.ok("pessoa", "relatar", "carol", "odeia filme lento")

    texto = (dados / "pessoas" / "carol.md").read_text(encoding="utf-8")
    assert "Amiga da faculdade." in texto
    assert texto.index("canastrão") < texto.index('"odeia filme lento"')
    assert texto.count("## Relatos") == 1


def test_linha_fora_do_formato_e_erro_com_o_arquivo_e_a_linha(cli, dados):
    (dados / "pessoas" / "carol.md").write_text(
        ARQUIVO_DA_CAROL.replace("2025-03-01 · questionário", "ontem, no questionário"), encoding="utf-8")

    codigo, saida = cli.rodar("reconstruir")

    assert codigo == 1
    assert saida["erro"]["codigo"] == "dados_invalidos"
    assert "carol.md" in saida["erro"]["mensagem"]
    assert "ontem, no questionário" in saida["erro"]["mensagem"]


def test_alvo_fora_do_catalogo_e_erro_e_nada_e_gravado(banco, dados):
    _ana(banco)
    antes = (dados / "pessoas" / "ana.md").read_text(encoding="utf-8")

    codigo, saida = banco.rodar("pessoa", "vetar", "ana", "nunca vê isso", "--entidade", "Q1")

    assert codigo == 1
    assert saida["erro"]["codigo"] == "alvo_desconhecido"
    assert (dados / "pessoas" / "ana.md").read_text(encoding="utf-8") == antes


def test_relato_sobre_o_dono_e_erro(banco):
    codigo, saida = banco.rodar("pessoa", "relatar", "dono", "gosta de comédia")

    assert codigo == 2
    assert saida["erro"]["codigo"] == "uso_invalido"


def test_reacao_sem_alvo_e_erro(banco):
    _ana(banco)

    codigo, saida = banco.rodar("pessoa", "declarar", "ana", "odeio filme lento", "--reacao", "odeia")

    assert codigo == 2
    assert saida["erro"]["codigo"] == "uso_invalido"


def test_vetar_de_novo_o_mesmo_alvo_nao_duplica(banco):
    _ana(banco)
    banco.ok("pessoa", "vetar", "ana", "nunca vê terror", "--entidade", TERROR)

    saida = banco.ok("pessoa", "vetar", "ana", "terror nem pensar", "--entidade", TERROR)

    assert saida["novo"] is False
    assert len(banco.ok("pessoa", "ver", "ana")["vetos"]) == 1
