"""`pessoa visto`: o grupo diz na hora que já viu um filme, com ou sem Nota.

O Teo não tem Nota nenhuma na fixture; Pequenos Milagres e Casa Cheia, de Lia
Moura, só têm palpites para ele.
"""

PEQUENOS_MILAGRES = "tt9000601"
CASA_CHEIA = "tt9000602"


def _ids(saida):
    return [f["id"] for f in saida["filmes"]]


def test_ja_visto_sai_com_sem_ja_visto_sem_reconstruir(banco):
    antes = banco.ok("recomendar", "--presentes", "teo", "--quantos", "50", "--sem-ja-visto")
    assert PEQUENOS_MILAGRES in _ids(antes)

    saida = banco.ok("pessoa", "visto", "teo", "--filme", PEQUENOS_MILAGRES)

    assert saida["pessoa"] == "teo"
    assert saida["novo"] is True
    assert {k: saida["visto"][k] for k in ("filme", "titulo", "nota", "data", "fonte")} == {
        "filme": PEQUENOS_MILAGRES, "titulo": "Pequenos Milagres", "nota": None,
        "data": "2026-11-20", "fonte": "conversa com o Dono"}
    depois = banco.ok("recomendar", "--presentes", "teo", "--quantos", "50", "--sem-ja-visto")
    assert PEQUENOS_MILAGRES not in _ids(depois)
    assert CASA_CHEIA in _ids(depois)


def test_nota_de_1_a_10_vira_nota_na_escala_de_5(banco):
    saida = banco.ok("pessoa", "visto", "teo", "--filme", CASA_CHEIA, "--nota", "8/10", "--fonte", "Sessão de sábado")

    assert saida["visto"]["nota"] == 4.0
    notas = banco.ok("pessoa", "ver", "teo")["notas"]
    assert [(n["filme_id"], n["nota"], n["fonte"], n["data"]) for n in notas] == [
        (CASA_CHEIA, 4.0, "Sessão de sábado", "2026-11-20")]
    filmes = banco.ok("recomendar", "--presentes", "teo", "--quantos", "50")["filmes"]
    [casa] = [f for f in filmes if f["id"] == CASA_CHEIA]
    assert ("já viu", "forte") in [(e["texto"], e["forca"]) for e in casa["evidencias"]["teo"]]


def test_vale_depois_de_reconstruir_igual_ao_sincronizado(banco, dados):
    banco.ok("pessoa", "visto", "teo", "--filme", PEQUENOS_MILAGRES, "--data", "2026-11-19")
    banco.ok("pessoa", "visto", "teo", "--filme", CASA_CHEIA, "--nota", "4,5")
    sql = ("SELECT 'j', fato_id, filme_id, tipo, data, fonte FROM ja_visto WHERE pessoa = 'teo' UNION ALL "
           "SELECT 'n', fato_id, filme_id, nota, data, fonte FROM notas WHERE pessoa = 'teo' ORDER BY 1, 2")
    sincronizado = banco.consultar(sql)

    banco.ok("reconstruir")

    assert banco.consultar(sql) == sincronizado
    assert [linha[2:] for linha in sincronizado] == [
        [PEQUENOS_MILAGRES, "declarado", "2026-11-19", "conversa com o Dono"],
        [CASA_CHEIA, 4.5, "2026-11-20", "conversa com o Dono"]]
    corpo = (dados / "pessoas" / "teo.md").read_text()
    assert "## Já vistos\n\n- 2026-11-19 · conversa com o Dono · Pequenos Milagres (tt9000601)\n" \
           "- 2026-11-20 · conversa com o Dono · Casa Cheia (tt9000602) · nota 4,5\n" in corpo


def test_registrar_de_novo_o_mesmo_nao_duplica(banco, dados):
    banco.ok("pessoa", "visto", "teo", "--filme", PEQUENOS_MILAGRES)

    saida = banco.ok("pessoa", "visto", "teo", "--filme", PEQUENOS_MILAGRES)

    assert saida["novo"] is False
    assert (dados / "pessoas" / "teo.md").read_text().count(PEQUENOS_MILAGRES) == 1


def test_nota_fora_da_escala_e_erro_e_sugere_de_1_a_10(banco, dados):
    codigo, saida = banco.rodar("pessoa", "visto", "teo", "--filme", CASA_CHEIA, "--nota", "8")

    assert codigo == 2
    assert saida["erro"]["codigo"] == "uso_invalido"
    assert '"8/10"' in saida["erro"]["mensagem"]
    assert "Já vistos" not in (dados / "pessoas" / "teo.md").read_text()


def test_filme_fora_do_catalogo_e_erro(banco):
    codigo, saida = banco.rodar("pessoa", "visto", "teo", "--filme", "tt0000001")

    assert saida["erro"]["codigo"] == "alvo_desconhecido"


def test_ver_mostra_os_ja_vistos_da_pessoa(banco):
    banco.ok("pessoa", "visto", "teo", "--filme", PEQUENOS_MILAGRES)
    banco.ok("pessoa", "visto", "teo", "--filme", CASA_CHEIA, "--nota", "7/10")

    saida = banco.ok("pessoa", "ver", "teo")

    assert [(v["filme"], v["titulo"], v["nota"]) for v in saida["vistos"]] == [
        (PEQUENOS_MILAGRES, "Pequenos Milagres", None), (CASA_CHEIA, "Casa Cheia", 3.5)]
